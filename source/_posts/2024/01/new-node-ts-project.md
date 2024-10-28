---
title: 从0创建一个nodejs + Typescript项目
date: 2024-01-19 22:28:48
seo:
  description: 使用 node18 或者 node20 创建一个 webpack + Typescript 项目，集成 eslint 和 ts-jest，支持 WebStorm 打断点测试。
  keywords: 
    - nodejs
    - webpack
    - typescript
    - eslint
    - ts-jest
---


因为踩了很多坑，所以记录一下这个项目是怎么搭的。

最后用了这些东西：
- Typescript
- Webpack(打生产的包)
- Eslint

因为是nodejs项目，所以这边我还研究了很久怎么在 ts 文件上打断点进行debug，在开发环境下是不会用到 webpack 的。

nodejs版本：18。

# 1. 初始化项目

先`npm init`创建一个`package.json`文件，然后安装所需的依赖：
```shell
yarn add eslint @typescript-eslint/parser --dev
yarn add typescript ts-loader ts-node tsconfig-paths --dev
yarn add webpack webpack-cli source-map-support --dev
```

之后在`package.json`里添加`"type": "module"`的属性，这样就可以直接在项目里直接使用ESModules了，这个东西在webpack里天生支持按需导入，不需要额外配置(要了解更多的话可以去搜`Tree Sharking`)。


# 2. 配置eslint

这步比较简单，就直接过了，基本没有什么坑。

```javascript
// .eslintrc.cjs
module.exports = {
  // 下面这行必须加
  parser: '@typescript-eslint/parser',
  rules: {
    // 这些是我常用的一些规则
    quotes: ["error", 'single'],
    'key-spacing': ["error", { "beforeColon": false }],
    semi: [2, 'never'],
    'block-spacing': 'error',
    'object-curly-spacing': ["error", "always"],
    indent: ['error', 2]
  },
  // 这里也要加，不然用import会报错
  parserOptions: {
    "ecmaVersion": 7,
    "sourceType": "module"
  }
};
```

# 3. 配置Typescript

这里的配置都是可以直接用的，碰到的坑在后面说。

```json
// tsconfig.json
{
  "include": ["src/**/*.ts"],
  "compilerOptions": {
    "module": "esnext",
    "lib": ["ES2022"],
    "isolatedModules": true,
    "esModuleInterop": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "target": "ESNext",
    "strict": true,
    "allowJs": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "sourceMap": true,
    "outDir": "dist/dev",
    "paths": {
      // 记住这个别名，待会要考
      "~/*": ["./src/*"]
    }
  },
  "ts-node": {
    "experimentalSpecifierResolution": "node",
    "esm": true,
    "transpileOnly": true
  }
}
```

## 后缀问题

这里碰到的第一个坑，就是后缀问题。

这个问题只有在 nodejs + esm 才会有，什么意思呢，来看下面的代码：
```javascript
// ------------------------------------------
// util.ts
export default "hello world"

// ------------------------------------------
// index.ts
import util from './util'

console.log(util)
```

看上去没有什么问题，然后我们用ts-node执行一下：
```shell
 throw new ERR_MODULE_NOT_FOUND(
          ^
CustomError: Cannot find module 'xx\src\util' imported from xx\src\index.ts
```

如果这个时候你去网上搜，你基本碰到的回答都是让你加上`js`后缀：
```javascript
// index.ts
import util from './util.js'

console.log(util)
```

首先不说这个**丑的一批**，而且我后面还发现这玩意还会导致另外一个bug：在用webpack打包的时候，如果你加了`js`后缀，webpack会直接提醒你找不到`xx/src/util.js`，坑爹呢这不是！

所以肯定是不能加后缀的，然后我也是在网上翻了好久，才找到这个参数：`experimentalSpecifierResolution`，虽然前面带了个`experimental`，但其实已经很稳定了，直接在`tsconfig.json`中添加配置：
```json
{
    // ...
    "ts-node": {
        // 把值改为node
        "experimentalSpecifierResolution": "node",
        // 这个忘了当时为啥要加了，不加好像也不会报错
        "esm": true
    }
}
```

或者使用命令行参数：`--experimental-specifier-resolution=node`。

加完之后，不带文件后缀也可以成功运行，webpack打包也不会有任何影响。

## 别名问题


可以看到我开头提供的`tsconfig.json`里面有个这样的配置：
```json
{
    "paths": {
      // 记住这个别名，待会要考
      "~/*": ["./src/*"]
    }
}
```

例如我们有这样的目录结构：
```text
src
├── util
│   └── StringUtils.ts
└── index.ts
```

我们在`index.ts`里面导入`StringUtils`就可以这样写：
```ts
import StringUtils from '~/util/StringUtils'
```

这个功能其实可有可无，但是我就是有强迫症，就是不想用相对路径！


首先啥都不加，直接ts-node运行，居然还报错了：
```shell
throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base));
        ^
CustomError: Cannot find package '~' imported from 'xxx/src/index.ts'
```

好好好，这都能报错，去查了一下，才知道这玩意是给`webpack`那些玩意提供声明的：
```javascript
// webpack.config.cjs
module.exports = {
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        alias: {
            '~': path.resolve(__dirname, 'src')
        }
    },
}
```

在这里，你只写webpack的别名配置，在 ts 里是会报错的，因为ts才不会管你webpack的配置，所以才需要我们的`tsconfig.json`来提供一个声明。

行，报错了我就去搜，几下就搜到了，不就是加个`tsconfig-paths`吗，加上命令行参数：`-r tsconfig-paths/register`，开跑！

结果万万没想到，又爆了相同的错。。。。

然后又翻了很久的Github（真的很久），终于被我找到了：[ESM loader that handles TypeScript path mapping](https://github.com/TypeStrong/ts-node/discussions/1450)。


复制里面的`loader.js`，然后修改启动命令为：`node --loader ./scripts/loader.js src/index.ts`，就可以正常使用别名了。


## 使用WebStorm调试代码

因为我们是nodejs项目，肯定是不能少了打断点调试的。

我们可以直接用tsc编译项目为js代码后，直接用Webstorm进行Debug。

因为Webstorm运行js文件基本不需要配置，直接右键点几下就跑起来了。

但是这样很傻批，我们还要分两步进行，而且 ts 文件的变动可能会导致我们在 js 文件上打的断点消失。

---

谢天谢地，Webstorm是真的很聪明(牛逼)，我们只需要简单配置几下就可以直接在 ts 上打断点运行了。

![run configuration](https://5j9g3t.site/blog/20240119235935.png)

配完后，直接在ts文件上断点就可以停住。

# 4. 配置Webpack

至于为什么要用 Webpack，是因为我最后不想带着`node_modules`这个累赘来上生产，最后直接打包成一个文件多爽，直接`node xxx.js`就跑起来了。

这里是我最后用到的配置：
```javascript
// webpack.config.cjs
const path = require('path');
const webpack = require('webpack')

module.exports = function (env, args) {
    return {
        entry: './src/index.js',
        target: 'node',
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            alias: {
                '~': path.resolve(__dirname, 'src')
            }
        },
        output: {
            filename: (pathData) => {
                return pathData.chunk.name === 'main' ? 'main.cjs' : 'libs.cjs';
            },
        },
        plugins: [
            new webpack.SourceMapDevToolPlugin({
                exclude: ['libs.cjs']
            })
        ],
        optimization: {
            splitChunks: {
                chunks: 'all'
            },
        },
    };
}
```

注意文件后缀是cjs，不然用`module.exports`会报错。


打包时直接用`webpack --mode=production`就可以了。

## 配置sourcemap

在Webpack打包后，我们的所有代码都被压缩到一行了，而且变量名都变得六亲不认了，想象一下，假如运行过程中报一个错，你能定位到问题发生在哪吗。。。

所以这个时候我们需要用到 sourcemap 来对我们的代码进行索引。

直接使用 sourcemap 文件是不行的，因为这玩意是给浏览器用到，我们需要导入依赖 [source-map-support](https://www.npmjs.com/package/source-map-support) 来加载sourcemap。

这里你可以把 sourcemap 分离成一个单独的文件，也可以让它内嵌到代码里面。

这里我推荐内嵌到代码里面，便于后面代码分发，没必要分出来。

在 Webpack 添加配置`devtool: 'inline-source-map'`。

还没完，也要在`tsconfig.json`里面添加`"sourceMap": true`的配置，如果少了这一步，最终生成的 sourcemap 行数会对不上，因为这个时候 Webpack 只会对编译后的 js 文件来构建索引，而 ts 编译后的文件中，空行(一行什么内容都没有的)会被删除，因此导致行数对不上。

最后在代码入口添加加载的代码：
```typescript
import sourceMapSupport from 'source-map-support'

sourceMapSupport.install()
```

### 进一步压缩

如果你观察生成的文件，会发现生成 sourcemap 会导致文件变得**非常大**，基本会变大 5 ~ 6 倍左右。

如果你把 sourcemap 分成单独的文件，然后打开开一下，会发现 Webpack 也给 `node_modules` 里面的代码生成了 sourcemap！

作为一个强迫症患者，我是绝对不能忍受这种情况的！

我们肯定是想给自己的代码生成精准的 sourcemap，而第三方库，可以考虑不生成，或者只使用简单的 sourcemap。

翻了一下 Webpack 文档，发现有个 [SourceMapDevToolPlugin](https://webpack.js.org/plugins/source-map-dev-tool-plugin/) 插件可以指定/排除为哪些模块生成 sourcemap。


试了一下，在`exclude`属性里面不管怎么填，都无法忽略掉`node_modules`。

在查了一下午的文档以及翻看了源码之后，终于知到怎么配了：
```javascript
// webpack.config.cjs
module.exports = {
  output: {
    filename: (pathData) => {
      return pathData.chunk.name === 'main' ? 'main.cjs' : 'libs.cjs';
    },
  },
  plugins: [
    new webpack.SourceMapDevToolPlugin({
        exclude: ['libs.cjs']
    })
  ],
  optimization: {
    splitChunks: {
        chunks: 'all'
    },
  },
}
```

加上上面的配置，就可以做到把`node_modules`里面的代码全部打到`libs.cjs`中，而我们的业务代码全部打到`main.cjs`中，同时配置我们的`SourceMapDevToolPlugin`不为`libs.cjs`生成 sourcemap。


# DLC：node20版本

之前导入模块我们为了省略后缀，在配置中添加了`experimentalSpecifierResolution: node`参数，在node20上，这个参数仍然可用，但是已经有了更好的替代。

文档：[Loaders](https://nodejs.org/api/esm.html#loaders)

并且官方也给了一个样例来代替上面的启动参数：[commonjs-extension-resolution-loader](https://github.com/nodejs/loaders-test/tree/main/commonjs-extension-resolution-loader)。

这里直接摆上我用的代码：
```javascript
// extension-loader.js
/**
 * 处理ts-node导入时必须加后缀
 */
// https://github.com/nodejs/loaders-test/blob/main/commonjs-extension-resolution-loader/loader.js
import { isBuiltin } from 'node:module'
import { dirname } from 'node:path'
import { cwd } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import resolveCallback from 'resolve/async.js'

const resolveAsync = promisify(resolveCallback)

const baseURL = pathToFileURL(cwd() + '/').href


export async function resolve(specifier, context, next) {
  const { parentURL = baseURL } = context

  if (isBuiltin(specifier)) {
    return next(specifier, context)
  }

  // `resolveAsync` works with paths, not URLs
  if (specifier.startsWith('file://')) {
    specifier = fileURLToPath(specifier)
  }
  const parentPath = fileURLToPath(parentURL)

  let url
  try {
    const resolution = await resolveAsync(specifier, {
      basedir: dirname(parentPath),
      // For whatever reason, --experimental-specifier-resolution=node doesn't search for .mjs extensions
      // but it does search for index.mjs files within directories
      extensions: ['.js', '.json', '.node', '.mjs', '.ts'],
    })
    url = pathToFileURL(resolution).href
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      // Match Node's error code
      error.code = 'ERR_MODULE_NOT_FOUND'
    }
    throw error
  }

  return next(url, context)
}
```

```javascript
// path-loader.js
/**
 * 处理ts路径别名报错
 */
import { resolve as resolveTs } from 'ts-node/esm'
import * as tsConfigPaths from 'tsconfig-paths'
import { pathToFileURL } from 'url'

const { absoluteBaseUrl, paths } = tsConfigPaths.loadConfig()
const matchPath = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths)

export async function resolve (specifier, ctx, defaultResolve) {
  const match = matchPath(specifier)
  let realPath
  if (match) {
    realPath = pathToFileURL(`${match}`).href
  } else {
    realPath = specifier
  }
  const r = await defaultResolve(realPath, ctx)
  return resolveTs(r.url, ctx, defaultResolve)
}

export { load, transformSource } from 'ts-node/esm'
```

```javascript
// register-hooks.js
import { register } from 'node:module'

register('./extension-loader.js', import.meta.url)
register('./path-loader.js', import.meta.url)

```

然后把我们的启动命令换成：`node --import register-hooks.js src/index.ts`。

移除掉`tsconfig.json`里的`experimentalSpecifierResolution`，然后就可以正常启动了。