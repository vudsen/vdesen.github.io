---
title: 镜像底层存储原理
date: 2024-03-03 16:09:11
categories:
  data:
    - { name: "Docker", path: "/2023/04/20/docker/" }
---

# 镜像存储

查看镜像信息：
```bash
docker inspect nginx:latest
```

可以发现这段数据：
```json
{

    // ......

    "GraphDriver": {
        "Data": {
                "LowerDir": "/var/lib/docker/overlay2/9dbe4e72af5122d82424060a7e5c584cd4e0d033ffe18d2c48195bb464ebc7d3/diff:/var/lib/docker/overlay2/e7835eb584a204c5865ea76005304d92675246c288df7bd5a93128c5a5f12328/diff:/var/lib/docker/overlay2/0fa5641bd040128a82e7438f2d798e564352a2e79d58c38676e48e64d15d39fe/diff:/var/lib/docker/overlay2/c3c620c3b71957982ff4032db14bcfe5bc96fc0c401c6d56421402e98e14bb17/diff:/var/lib/docker/overlay2/f5f4757bc9d8c8bb7245b11f625e755442603b87f46eb1fcb2556801b4921b98/diff",
                "MergedDir": "/var/lib/docker/overlay2/5bd32a9a280aabb65f1ea0cf24a5d075383aa768fb9d83ba9a4e2568f2effddd/merged",
                "UpperDir": "/var/lib/docker/overlay2/5bd32a9a280aabb65f1ea0cf24a5d075383aa768fb9d83ba9a4e2568f2effddd/diff",
                "WorkDir": "/var/lib/docker/overlay2/5bd32a9a280aabb65f1ea0cf24a5d075383aa768fb9d83ba9a4e2568f2effddd/work"
            },
        },
        "Name": "overlay2"
    }

    // ......
}
```

该数据指示了镜像是怎么存的：

## 底层目录：LowerDir

以冒号分割每个路径：
- /var/lib/docker/overlay2/9dbe4e72af5122d82424060a7e5c584cd4e0d033ffe18d2c48195bb464ebc7d3/diff
- /var/lib/docker/overlay2/e7835eb584a204c5865ea76005304d92675246c288df7bd5a93128c5a5f12328/diff
- /var/lib/docker/overlay2/0fa5641bd040128a82e7438f2d798e564352a2e79d58c38676e48e64d15d39fe/diff
- /var/lib/docker/overlay2/c3c620c3b71957982ff4032db14bcfe5bc96fc0c401c6d56421402e98e14bb17/diff
- /var/lib/docker/overlay2/f5f4757bc9d8c8bb7245b11f625e755442603b87f46eb1fcb2556801b4921b98/diff

进入第一个目录查看：
```bash
[root@my diff]# cd /var/lib/docker/overlay2/9dbe4e72af5122d82424060a7e5c584cd4e0d033ffe18d2c48195bb464ebc7d3/diff
[root@my diff]# ls
docker-entrypoint.d
```

这里没有什么特别的，继续进第二个查看：
```bash
[root@my diff]# cd /var/lib/docker/overlay2/e7835eb584a204c5865ea76005304d92675246c288df7bd5a93128c5a5f12328/diff
[root@my diff]# ls
docker-entrypoint.d
```

直到第四个目录：
```bash
[root@my diff]# cd /var/lib/docker/overlay2/c3c620c3b71957982ff4032db14bcfe5bc96fc0c401c6d56421402e98e14bb17/diff
[root@my diff]# ls
docker-entrypoint.d  etc  lib  tmp  usr  var
[root@my diff]# cd etc/
[root@my etc]# ls
apt                   default  group-    init.d       logrotate.d  passwd-  rc2.d  rc5.d   shadow-  ucf.conf
ca-certificates       fonts    gshadow   inputrc      nginx        rc0.d    rc3.d  rc6.d   ssl
ca-certificates.conf  group    gshadow-  ld.so.cache  passwd       rc1.d    rc4.d  shadow  systemd
[root@my etc]# cd nginx/
[root@my nginx]# ls
conf.d  fastcgi_params  mime.types  modules  nginx.conf  scgi_params  uwsgi_params
```

可以发现nginx的软件包已经在里面了。

最后再来看最后一个文件夹：
```bash
[root@my nginx]# cd /var/lib/docker/overlay2/f5f4757bc9d8c8bb7245b11f625e755442603b87f46eb1fcb2556801b4921b98/diff
[root@my diff]# ls
bin  boot  dev  etc  home  lib  lib64  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
```

可以发现这就是一个基础Linux系统的文件目录。

---

综合上面的结果，我们可以得知，LowerDir需要倒着看，并且LowerDir中的内容**只记录了变化**，也就是说把文件夹的内容倒着合并，就能得到我们最终的镜像。

### 验证

我们进入最底层的操作系统目录：
```bash
[root@my ~]# cd /var/lib/docker/overlay2/f5f4757bc9d8c8bb7245b11f625e755442603b87f46eb1fcb2556801b4921b98/diff
[root@my diff]# ls -i
  529307 bin   50966209 etc   16785303 lib64    530840 opt   50966638 run   50966640 sys  50968228 var
17404669 boot  50966510 home  33662264 media  16785305 proc  16785306 sbin    530842 tmp
33658094 dev     529586 lib   50966637 mnt    33662265 root  33662268 srv   17396824 usr
```

使用`ls -i`可以打印出文件的 inode 值，这个值是唯一的，如果两个文件的 inode 值一样，则表示它们是同一个文件。

> 省略掉测试过程，实际容器启动后的 inode 值是完全一样的。

### 文件删除如何表现？


## 合并目录：MergedDir

## 上层目录：UpperDir

### 镜像中的上层目录

测试如下Dockerfile：
```bash
FROM centos:centos7

RUN echo "eeee" > /home/a.txt
RUN rm -f /home/a.txt

CMD /bin/bash
```

构建后 inspect 镜像：
```json
{
    "GraphDriver": {
        "Data": {
            "LowerDir": "/var/lib/docker/overlay2/moall4wjc9i62uwepefru630o/diff:/var/lib/docker/overlay2/0121c8265441df30c90ff0f2f5e35135b521e4919810cd3bd777e9f51cd0b883/diff",
            "MergedDir": "/var/lib/docker/overlay2/wh9e0f3n3dq3r4rgm8sllc2b2/merged",
            "UpperDir": "/var/lib/docker/overlay2/wh9e0f3n3dq3r4rgm8sllc2b2/diff",
            "WorkDir": "/var/lib/docker/overlay2/wh9e0f3n3dq3r4rgm8sllc2b2/work"
        },
        "Name": "overlay2"
    },
}
```
可以发现 LowerDir 只有两层了, 最后一层是我们的 centos，进入第一层看看：

```bash
[root@my diff]# cd /var/lib/docker/overlay2/moall4wjc9i62uwepefru630o/diff
[root@my diff]# ls
etc  home
[root@my diff]# ls home/
a.txt
[root@my diff]# cat home/a.txt 
eeee
```

可以发现文件仍然存在，但是启动容器后文件消失，那么就可以推断，文件删除并不是在 LowerDir 中做的。

---

搜索其它文件夹，可以发现在上层目录中有这样的东西：
```bash
[root@my wh9e0f3n3dq3r4rgm8sllc2b2]# cd /var/lib/docker/overlay2/wh9e0f3n3dq3r4rgm8sllc2b2/diff
[root@my diff]# ls
etc  home
[root@my diff]# cd home/
[root@my home]# ls
a.txt
[root@my home]# ll
总用量 0
c---------. 1 root root 0, 0 3月   3 16:35 a.txt
```

可以发现`a.txt`被标记为了字符设备文件来表示这个文件被删除(我猜的)。

---

如果有多个删除呢：
```Dockerfile
FROM centos:centos7

RUN echo "eeee" > /home/a.txt
RUN rm -f /home/a.txt
RUN mkdir /home/test
RUN echo "eeee111" > /home/test/b.txt
RUN rm -f /home/test/b.txt

CMD /bin/bash
```
inspect一下：
```json
{
    "GraphDriver": {
        "Data": {
                "LowerDir": "/var/lib/docker/overlay2/x4g07210p4f4l01ak85q2s6e4/diff:/var/lib/docker/overlay2/qo1amtaglj2r0klq946qrts65/diff:/var/lib/docker/overlay2/wh9e0f3n3dq3r4rgm8sllc2b2/diff:/var/lib/docker/overlay2/moall4wjc9i62uwepefru630o/diff:/var/lib/docker/overlay2/0121c8265441df30c90ff0f2f5e35135b521e4919810cd3bd777e9f51cd0b883/diff",
                "MergedDir": "/var/lib/docker/overlay2/xxgrx14wij07venjjp168aod1/merged",
                "UpperDir": "/var/lib/docker/overlay2/xxgrx14wij07venjjp168aod1/diff",
                "WorkDir": "/var/lib/docker/overlay2/xxgrx14wij07venjjp168aod1/work"
        },
        "Name": "overlay2"
    }
}
```

可以发现`a.txt`已经被删除，但是`b.txt`仍然在最上层的 LowerDir 中，并且在 UpperDir 中，`b.txt`同样被标识为 字符设备文件。

### 容器中的上层目录

进入运行中的nginx容器，修改其配置文件：
```bash
cd /etc/nginx
echo "#111" >> nginx.conf 
```

inspect容器：
```json
{
    "GraphDriver": {
    "Data": {
        "LowerDir": "/var/lib/docker/overlay2/a50ef32231b6680d8ba9b0f709fba69faa40b504dfe6b1d283765d88e16e9755-init/diff:/var/lib/docker/overlay2/5bd32a9a280aabb65f1ea0cf24a5d075383aa768fb9d83ba9a4e2568f2effddd/diff:/var/lib/docker/overlay2/9dbe4e72af5122d82424060a7e5c584cd4e0d033ffe18d2c48195bb464ebc7d3/diff:/var/lib/docker/overlay2/e7835eb584a204c5865ea76005304d92675246c288df7bd5a93128c5a5f12328/diff:/var/lib/docker/overlay2/0fa5641bd040128a82e7438f2d798e564352a2e79d58c38676e48e64d15d39fe/diff:/var/lib/docker/overlay2/c3c620c3b71957982ff4032db14bcfe5bc96fc0c401c6d56421402e98e14bb17/diff:/var/lib/docker/overlay2/f5f4757bc9d8c8bb7245b11f625e755442603b87f46eb1fcb2556801b4921b98/diff",
        "MergedDir": "/var/lib/docker/overlay2/a50ef32231b6680d8ba9b0f709fba69faa40b504dfe6b1d283765d88e16e9755/merged",
        "UpperDir": "/var/lib/docker/overlay2/a50ef32231b6680d8ba9b0f709fba69faa40b504dfe6b1d283765d88e16e9755/diff",
        "WorkDir": "/var/lib/docker/overlay2/a50ef32231b6680d8ba9b0f709fba69faa40b504dfe6b1d283765d88e16e9755/work"
    },
    "Name": "overlay2"
},
}
```

同样查看其上层目录中的`nginx.conf`，可以发现我们追加的内容。

如果我们再进容器，再修改某个文件，再来看上层目录，可以发现上层目录是会跟着变的。

> 写时复制技术：如果在需要修改底层目录中的内容，Docker会先把对应的文件复制到UpperDir，然后再修改。如果是读，则优先读UpperDir，如果没有，则去读 LowerDir，此时并不会复制。


## 合并目录: MergeDir

看名字就知道，合并目录是将所有东西整合起来后的目录，所以这里也不多说啥了。