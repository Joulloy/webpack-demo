const fs = require ('fs') //Node.js内置的fs模块就是文件系统模块，负责读写文件。
const path = require('path') //Node.js path模块提供了一些用于处理文件路径的小工具
const parser = require('@babel/parser') //解析输入源码，创建AST
const traverse = require('@babel/traverse').default //遍历操作AST
const babel = require('@babel/core') //babel的核心包以编程方式来使用Babel

//利用babel完成代码转换,并生成单个文件的依赖
function stepOne(filename) {
    //读入文件
    const content = fs.readFileSync(filename, 'utf-8') //同步方法的版本，且文件编码为utf-8,得到当前文件的代码
    // console.log(content)
    const ast = parser.parse(content, {
        sourceType: 'module' //babel官方规定必须加这个参数，不然无法识别ES Module
    })
    // console.log(ast)
    const dependencies = {}
    //遍历AST抽象语法树
    traverse(ast, {
        //获取通过import引入的模块
        ImportDeclaration({node}) {
            // console.log(node)
            const dirname = path.dirname(filename)//返回路径中代表文件夹的部分
            const newFile = './' + path.join(dirname, node.source.value)//用于连接路径。该方法的主要用途在于，会正确使用当前系统的路径分隔符，Unix系统是"/"，Windows系统是"\"
            //保留所依赖的模块
            dependencies[node.source.value] = newFile
        }
    })
    //通过@babel/core和@babel/preset-env进行代码的转换
    const {code} = babel.transformFromAst(ast, null, {
        presets: ["@babel/preset-env"]
    })
    // console.log(dependencies)
    // console.log(code)
    return {
        filename, //该文件名
        dependencies, //该文件所依赖的模块集合(键值对存储)
        code //转换后的代码
    }
}

//生成依赖图谱
function stepTwo(entry) {
    const entryModule = stepOne(entry)
    const graphArray = [entryModule]
    for(let i = 0; i < graphArray.length; i++) {
        const item = graphArray[i]
        const {dependencies} = item
        // console.log(dependencies)
        for(let j in dependencies) {
            graphArray.push(
                stepOne(dependencies[j])
            )
        }
    }
    // console.log(graphArray)
    //接下来生成图谱
    const graph = {}
    graphArray.forEach(item => {
        graph[item.filename] = {
            dependencies: item.dependencies,
            code: item.code
        }
    })
    return graph

}

//生成最后打包代码
function stepThree(entry){
    //要先把对象转换为字符串，不然在下面的模板字符串中会默认调取对象的toString方法，参数变成[Object object],显然不行
    const graph = JSON.stringify(stepTwo(entry))
    return `
        (function(graph) {
            //require函数的本质是执行一个模块的代码，然后将相应变量挂载到exports对象上
            function require(module) {
                //localRequire的本质是拿到依赖包的exports变量
                function localRequire(relativePath) {
                    return require(graph[module].dependencies[relativePath]);
                }
                var exports = {};
                (function(require, exports, code) {
                    eval(code);
                })(localRequire, exports, graph[module].code);
                return exports;//函数返回指向局部变量，形成闭包，exports变量在函数执行后不会被摧毁
            }
            require('${entry}')
        })(${graph})`
}

// console.log(stepOne('./src/index.js'))
// console.log(stepTwo('./src/index.js'))
console.log(stepThree('./src/index.js'))