---
title: Webpack 迁移至 Vite
date: 2024-07-01 09:51:51
categories: "web"
---

# 已有环境

目前是有一套 webpack 的 vue2 环境，打生产包需要 2 ~ 3 分钟左右，开发启动需要 1 分钟左右。

迁移后，打生产包仅需 1 分钟，开发启动 10 秒左右。

**注意，由于 vite v5 版本需要 node18 或者 node20+，所以一般只能升级到 v4，等稳定后再升 v5**：[从 v4 迁移](https://cn.vitejs.dev/guide/migration)

vite v4 版本只需要 node14 就可以了，我自己目前的环境是 node12，可以直接升级，不会有很多坑。

# 准备迁移

## 安装依赖

安装下面的依赖：

```sh
npm install @vitejs/plugin-vue2 vite vite-plugin-html -D
```

## 修改配置文件

在项目根目录创建 `vite-config` 目录，然后依次创建下面的文件：

```typescript
// config.ts
import { UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import { createHtmlPlugin } from 'vite-plugin-html'
import { resolve } from 'path'

export const env = {
  // 页面 context path
  base: process.env.NODE_ENV === 'production' ? '/app' : ''
}


const config: UserConfig = {
  plugins: [
    vue(),
    createHtmlPlugin({
      entry: 'src/main.js',
      template: 'index.html',
      inject: {
        data: {
          base: env.base
        }
      }
    })
  ],
  publicDir: 'static',
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
      '~@': resolve(__dirname, '../src')
    },
    extensions: ['.mjs', '.js', '.ts', '.vue']
  }
}

export default config
```

```typescript
// dev.config.js
import { defineConfig } from 'vite'
import baseConfig, { env } from './config'

const PROXY_TARGET = 'https://abc.com'

export default defineConfig({
  ...baseConfig,
  base: env.base,
  define: {
    'process.env': {
      NODE_ENV: 'development',
      BASE_API: '/app-api'
    }
  },
  server: {
    port: 1002,
    proxy: {
      '/app-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: {
          host: new URL(PROXY_TARGET).host,
          Referer: `${PROXY_TARGET}/app-api/`,
          Origin: PROXY_TARGET
        }
      }
    }
  },
})
```

```typescript
// prod.config.ts
import { defineConfig } from 'vite'
import baseConfig, { env } from './config'

export default defineConfig({
  ...baseConfig,
  base: env.base,
  define: {
    'process.env': {
      NODE_ENV: 'production',
      BASE_API: '/app-api'
    }
  },
  esbuild: {
    drop: ['debugger']
  },
  build: {
    outDir: "app",
    assetsDir: 'static',
    cssCodeSplit: true,
    emptyOutDir: true,
  }
})
```

不用多说，既然都来搞 vite 升级，肯定都能一眼看懂。

之后修改 pakcage.json 的启动配置：

```json
{

    // snip

    "scripts": {
        "dev": "vite --config vite-config/dev.config.ts",
        "start": "npm run dev",
        "build": "vite --config vite-config/prod.config.ts build",
        "lint": "eslint --fix --ext .js --ext .vue src/"
    },

    // snip

}
```

## 配置入口文件

主要是修改 vue 创建的方式：

```javascript
new Vue({
  router,
  store,
  i18n,
  render: h => h(App)
}).$mount('#app')
```

然后修改我们的入口 html 文件：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>App</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="renderer" content="webkit">
  <meta http-equiv="X-UA-Compatible" content="ie=edge,chrome=1">
  <link rel="stylesheet" type="text/css" href="/css/reset.css">
</head>

<body>
<div id="app"></div>
<script>
  // 可以注入属性.
  window.base = '<%- base %>'
</script>
</body>
</html>
```

至此理论上就可以直接启动了，启动后就可以根据编译的报错一个一个改了，后面就讲一下我碰到的坑。

## 迁移碰到的坑

### 静态资源获取

首先 vite 专门有个静态资源目录，如果你用的是我上面的配置，那么静态资源目录就在项目根目录下的 `static` 目录中。

假设有这样一个文件 `static/img/hello.png`，如果想要使用，直接使用根路径引用即可：

```html
<img src="/img/hello.png">
```

而不是：

```html
<img src="/static/img/hello.png">
<img src="<context path>/static/img/hello.png">
<img src="<context path>/img/hello.png">
```

上面几种写法均为错误写法!

对于第一种和第二种，不需要加上静态资源目录的名称，对于第三种，不需要加上 `<context path>`，**在打生产包时，如果你在配置文件中配置了 `base` 属性，vite 会自动给你加上！**

此外下面的写法会让 vite 的自动添加路径失效：

```
<div style="background-image: url('/img/hello.png')"></div>
```

这里直接将文件路径写在了 style 中，**如果在生产模式下配置了 base，就会导致生产模式无法读取到图片，对于这种写法必须要以 `css` 的形式写，不能用内联样式！**

### 'require' is not defined

这里 webpack 有两种用途：

- 导入 nodejs 模块
- 使用 `require.context` 动态导入模块或文件

对于前者，**我建议赶快把 nodejs 模块全都换掉，别想着适配了**，一般这种情况经常会出现在一些加密算法的库里，直接找到一个适合前端的库替换就行了。

而对于后者，就比较麻烦了...

---

我的项目里是这样的一个操作：

```js
const requireAll = requireContext => requireContext.keys().map(requireContext)
const req = require.context('./svg', false, /\.svg$/)
requireAll(req)
```

上面的代码，会将 `svg` 目录下的所有文件注册为一个组件，然后放在页面上，然后使用 svg 的 use 来引用：

```html
<svg>
    <use :xlink:href="iconName"></use>
</svg>
```

这里建议直接改造，将图片直接封装成组件使用：

```js
import { defineAsyncComponent } from 'vue'

const components = {}
{
  const files = import.meta.glob('./svg/*.svg', {
    query: 'component'
  })

  for (const filesKey in files) {
    // remove prefix './svg/' and suffix '.svg'
    const key = filesKey.substring(6, filesKey.length - 4)
    components[key] = defineAsyncComponent(files[filesKey])
  }
}

const getIcon = (name) => {
  const entity = components[name]
  if (!entity) {
    console.warn('Icon not found: ' + name)
  }
  return entity
}

export default getIcon
```

这里很容易理解，就是 `getIcon` 方法只需要传入文件的名称就会返回一个异步组件，然后在外部直接使用就可以了。

然后另外一个问题就来了，`defineAsyncComponent` 是 vue3 的 API (如果报错了，请把你的 vue2 升级到 2 的最后一个版本)，那么我使用也得使用 vue3 的写法 (至少我是没找到怎么用 vue2 的写法来渲染这个组件的...)：

```vue
<template>
  <div
    :class="svgClass"
    aria-hidden="true"
  >
    <Icon
      width="100%"
      height="100%"
    />
  </div>
</template>

<script setup>
import getIcon from './index'

const props = defineProps({
  iconClass: {
    type: String,
    required: true
  },
  className: {
    type: String,
    default: undefined
  }
})

const Icon = getIcon(props.iconClass)
const svgClass = props.className ? 'svg-icon ' + props.className : 'svg-icon'
</script>
```

### vue3 写法 eslint 报错

如果直接用 vue3 setup 写法，eslint 可能会报错，但是仍然能够通过编译并使用，这里也需要一起升级一下 eslint。

安装/更新依赖：

```sh
npm i eslint@^8 eslint-plugin-vue@^9 vue-eslint-parser@^9 -D
```

修改 eslint 配置：

```js
module.exports = {
  root: true,
  parser: 'vue-eslint-parser',
  parserOptions: {
    sourceType: 'module'
  },
  env: {
    browser: true,
    node: true,
    es6: true
  },
  extends: ['eslint:recommended', 'plugin:vue/recommended'],
  rules: {
    // snip
  }
}
```

主要是注意 parser 那个配置，别的根据自己的需求修改。

### 以 base64 导入文件

虽然是个很奇葩的需求，但是还是写一下。这里要求以 base64 格式导入 `src` (非静态资源目录)下的某个文件，默认情况下 vite 肯定是做不到的，这里要求我们自己定义插件：

```ts
// base64Loader.ts
import type { Plugin } from 'rollup'
import * as fs from 'fs'

const base64Loader: Plugin = {
  name: 'base64-loader',
  transform(_: any, id: string) {
    const [path, query] = id.split('?')
    if (query !== 'base64') return null

    const data = fs.readFileSync(path)
    const base64 = data.toString('base64')

    return `export default '${base64}';`
  }
}

export default base64Loader
```

这段代码的作用是，如果在导入一个模块时加上了 `?base`，则会以 base 格式进行导入。

然后在 vite 配置文件中配置：

```ts
// vite.config.ts
import base64Loader from './base64Loader'

const config: UserConfig = {
  plugins: [

    // snip

    base64Loader
  ]
  // snip
}
```
