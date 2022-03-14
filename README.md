# Webpack Code Dependencies Analysis Plugin
This plugin can analyze code dependency and generate tree structure to help you quickly review code dependency structure

Collection file dependency when `import` and `importCall` hooks is triggered.


# Usage
```
npm install webpack-code-dependency-analysis-plugin
```

Enable the plugin in webpack.config.js:
```
const WebpackCodeDependencyAnalysis = require('webpack-code-dependency-analysis-plugin');

module.exports = {
  ...,
  plugins: [
    ...,
    new WebpackCodeDependencyAnalysis(),
  ],
}
```

![image](http://jxqdh.91sam.com/img/WechatIMG80.png)


# Tips
- Only webpack@4 and webpack@5 is supported.
- The plugin is for analyze the dependencies in the business code. It only supports the code analysis start with the @ of alias path and relative path, excluding node_modules dependencies.

