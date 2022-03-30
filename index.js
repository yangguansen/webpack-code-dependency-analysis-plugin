const fs = require('fs');
const http = require('http');
const opener = require('opener');
const path = require('path');
const resolve = require("enhanced-resolve");

let myResolve;

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

const transformArrayToTree = (array) => {
  if (!array || array?.length === 0) return null;

  array.forEach(v => {
    (v.children || []).forEach(k => {
      const childDep = array.find(l => l.resource === k.resource);
      childDep && (k.children = childDep.children);
    })
  })
  return array[0];
};

/**
 * 通过source获取真实文件路径
 * @param parser
 * @param source
 */
function getResource(parser, source){
  if(!myResolve){
    myResolve = resolve.create.sync(parser.state.options.resolve);
  }
  return myResolve(parser.state.current.context,source);
}

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
        const { rawRequest, resource } = parser.state.current;
        if (resource !== this.currentFile) {
          this.currentFile = resource;
          this.files.push({
            name: rawRequest,
            resource,
            children: []
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
            const resource = getResource(parser, value);
            this.files[this.files.length - 1].children.push({
              name: value,
              resource
            });
          }
        })
        parser.hooks.import.tap(this.pluginName, (statement, source) => {
          if (parser.state.current.resource.includes('node_modules')
          ) {
            return;
          }
          collectFile(parser);
          this.files[this.files.length - 1].children.push({
            name: source,
            resource: getResource(parser, source)
          });
        });
      }

      normalModuleFactory.hooks.parser
        .for("javascript/auto")
        .tap(this.pluginName, handler);
    });


    compiler.hooks.make.tap(this.pluginName, (compilation) => {
      compilation.hooks.finishModules.tap(this.pluginName, (modules) => {
        // const tree = transformArrayToTree(this.files);
        startServer(JSON.stringify(this.files));
      });
    });
  }
}

module.exports = WebpackCodeDependenciesAnalysis;
