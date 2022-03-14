const fs = require('fs');
const http = require('http');
const opener = require('opener');
const path = require('path');

function getDependencies(file, array) {
  const item = array.find(v => v.rawRequest === file);
  return item?.dependencies || [];
}

function walk(dependencies, array) {
  dependencies.forEach(v => {
    v.name = v.source;
    if (v.source.slice(0, 1) === '@' || v.source.slice(0, 1) === '.') {
      v.children = getDependencies(v.source, array);
      walk(v.children, array);
    }
  });
}

function renderViewer(jsonString) {
  return new Promise((resolve) => {
    fs.readFile(path.resolve(__dirname, './dependencies.html'), 'utf-8', (err, data) => {
      if (err) throw err;
      const html = data.replace(/<%=(\w+)%>/g, (match, $1) => jsonString);
      resolve(html);
    });
  });
}

function openBrowser(url, info) {
  try {
    opener(url);
    console.log(info);
  } catch (err) {
    console.error(`Opener failed to open "${url}":\n${err}`);
  }
}

async function startServer(jsonString) {
  const port = 8888;
  const host = '127.0.0.1';
  const isOpenBrowser = true;
  const html = await renderViewer(jsonString);
  http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else {
      res.end('blank page');
    }
  }).listen(port, host, () => {
    const url = `http://${host}:${port}`;

    const logInfo = (
      `Webpack Source Code Dependencies Analyzer is started at ${(url)}\n`
      + `Use ${('Ctrl+C')} to close it`
    );

    if (isOpenBrowser) {
      openBrowser(url, logInfo);
    }
  });
}

function generateToJSON(string) {
  fs.writeFile('./treeJSON', string, 'utf-8', (err) => {
    if (err) throw Error(err);
    startServer(string);
  });
}

const transformArrayToTree = (array) => {
  if (!array || array?.length === 0) return null;
  const tree = {};
  //  默认第一个触发import钩子的文件是入口，作为树的根节点
  tree.name = array[0].rawRequest;
  tree.children = array[0].dependencies;
  walk(tree.children, array);

  return tree;
};

class WebpackCodeDependenciesAnalysis {
  constructor() {
    this.pluginName = 'WebpackCodeDependenciesAnalysisPlugin';

    //  文件数组
    this.files = [];

    //  当前编译的文件
    this.currentFile = null;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(this.pluginName, (compilation, { normalModuleFactory }) => {
      const collectFile = (parser) => {
        const { rawRequest: fileName, resource: filePath } = parser.state.current;
        if (filePath !== this.currentFile) {
          this.currentFile = filePath;
          this.files.push({
            rawRequest: fileName,
            dependencies: []
          });
        }
      }
      const handler = (parser, options) => {
        parser.hooks.importCall.tap(this.pluginName, (expr) => {

          // 跳过node_modules
          if (parser.state.current.resource.includes('node_modules')) {
            return;
          }
          collectFile(parser);

          let ast = {};
          const isWebpack5 = "webpack" in compiler;
          // webpack@5 has webpack property, webpack@4 don't have the property
          if(isWebpack5){
            // webpack@5
            ast = expr.source;
          } else {
            //webpack@4
            const { arguments: arg } = expr;
            ast = arg[0];
          }
          const { type, value } = ast;
          if (type === 'Literal') {
            this.files[this.files.length - 1].dependencies.push({ source: value });
          }
        })
        parser.hooks.import.tap(this.pluginName, (statement, source) => {
          if (parser.state.current.resource.includes('node_modules') || source.includes('node_modules')) {
            return;
          }
          collectFile(parser);
          this.files[this.files.length - 1].dependencies.push({ source });
        });
      }

      normalModuleFactory.hooks.parser
        .for("javascript/auto")
        .tap(this.pluginName, handler);
      normalModuleFactory.hooks.parser
        .for("javascript/dynamic")
        .tap(this.pluginName, handler);
      normalModuleFactory.hooks.parser
        .for("javascript/esm")
        .tap(this.pluginName, handler);
    });


    compiler.hooks.make.tap(this.pluginName, (compilation) => {
      compilation.hooks.finishModules.tap(this.pluginName, (modules) => {
        const tree = transformArrayToTree(this.files);
        generateToJSON(JSON.stringify(tree));
      });
    });
  }
}

module.exports = WebpackCodeDependenciesAnalysis;
