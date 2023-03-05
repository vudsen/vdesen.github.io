---

title: Electron体积压缩
date: 2023-03-05 12:03:12
tags:

---

打包前的体积有148MB。

## 删除多余的语言文件

在程序安装后，目录下有一个`locales`文件夹，可以发现里面有很多`.pak`语言文件，总体积达到了20多MB，很明显我们只需要中文的语言，即`zh-CN.pak`。

在网上查了一下，可以通过添加一个hook函数[afterpack](https://www.electron.build/configuration/configuration#afterpack)来删除打包后的文件，具体配置如下：

```json
{
  "productName": "xxx",
    ...
  "afterPack": "./build/hooks/afterPack.js"
}

```

如果你不知道配置文件里可以写什么，你可以打开`node_modules/app-builder-lib/out/configuration.d.ts`，里面的`Configuration`接口就是可以填的东西。

`afterPack.js`的内容为：

```js
//build/hooks/afterPack.js
//参考 https://www.electron.build/configuration/configuration#afterpack
exports.default = async function(context) {
  //console.log(context)
  const fs = require('fs')
  const localeDir = context.appOutDir + '/locales/'

  fs.readdir(localeDir, function(err, files) {
    if (!(files && files.length)) return
    for (let i = 0, len = files.length; i < len; i++) {
      const match = files[i].match(/zh-CN\.pak/) //只保留中文
      if (match === null) {
        fs.unlinkSync(localeDir + files[i])
      }
    }
  })
}
```

重新打包，体积减少了5MB左右。

---

目前就只找到这些方法，Electron的体积还是有点坑的。。。