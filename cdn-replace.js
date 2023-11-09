const fs = require("fs")

const oldCdn = 'https://xds.asia'
const newCdn = ''
const blackDirectory = new Set()

blackDirectory.add('node_modules')
// replace source file

function replaceFile(path) {
    const content = fs.readFileSync(path, {encoding: 'utf8'})
    fs.writeFileSync(path, content.replaceAll(oldCdn, newCdn), {encoding:true})
}

function replaceDir(path) {
    const files = fs.readdirSync(path, {withFileTypes: true})
    files.forEach((val) => {
        if (val.isDirectory()) {
            replaceDir(val.path)
        } else {
            replaceFile(val.path)
        }
    })
}


replaceDir('./source')
replaceFile('_config.yml')
replaceFile('themes/particlex/_config.yml')
replaceFile('themes/particlex/layout/loading.ejs')
replaceFile('themes/particlex-my/layout/import.ejs')
replaceFile('themes/particlex-my/source/static/fonts.min.css')
