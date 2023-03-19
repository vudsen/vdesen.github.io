/**
 * element[TO_TOP_HEIGHT] = {
 *  value: 123
 *  version: 1
 * }
 */
const TO_TOP_HEIGHT = '$toTopHeight'
let globalVersion = 0
const IMAGE_URL_FILED = 'lazy'


window.addEventListener('load', () => {
    const elements = fakeArrayToArray(document.getElementsByTagName("img"))
    console.log(`图片懒加载: 一共找到了${elements.length}张图片`)
    window.addEventListener('scroll', () => {
        for (let i = 0, len = elements.length; i < len; ++i) {
            const e = elements[i]
            if (isVisible(e)) {
                console.log('已经加载图片: ', e)
                loadImage(e)
                elements.splice(i, 1)
            }
        }
    })
})

window.addEventListener('resize', () => {
    globalVersion++
    console.log('resize')
})

function loadImage(imageElement) {
    const url = imageElement.getAttribute(IMAGE_URL_FILED)
    if (url) {
        imageElement.setAttribute('src', url)
        imageElement.removeAttribute(IMAGE_URL_FILED)
    }
}

function isVisible(element) {
    if (!element) {
        return false
    }
    const toTop = getDisToTop(element)
    return document.documentElement.scrollTop + document.documentElement.clientHeight >= toTop
}

function fakeArrayToArray(fakeArray) {
    if (Array.isArray(fakeArray)) {
        return fakeArray
    } else if (typeof fakeArray === 'object') {
        const result = []
        for (let i = 0, len = fakeArray.length; i < len; ++i) {
            result[i] = fakeArray[i]
        }
        return result
    } else {
        throw new Error('传入的参数不是一个伪数组')
    }
}

function getDisToTop(element) {
    const t = element[TO_TOP_HEIGHT]
    if (t && t.version === globalVersion) {
        return element[TO_TOP_HEIGHT].value
    }
    let temp = element
    let sum = 0
    do {

        sum += temp.offsetTop
        temp = temp.offsetParent
    } while(!!temp)
    element[TO_TOP_HEIGHT] = {
        value: sum,
        version: globalVersion
    }
    return sum
}