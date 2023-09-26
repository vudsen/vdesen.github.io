hexo.extend.filter.register('after_post_render', function(data){
    if (data.content && data.content.replaceAll) {
        data.content = data.content.replaceAll('&lt;', '&amp;lt;')
        data.content = data.content.replaceAll('&gt;', '&amp;gt;')
    }
})