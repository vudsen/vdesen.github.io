---
title: Arthas诊断线上问题
date: 2023-09-04 16:16:53
categories: 线上问题排查
  
---

# 0. Links

- [ognl特殊用法](https://github.com/alibaba/arthas/issues/71)
- [获取SpringContext](https://github.com/alibaba/arthas/issues/482)

# 1. 安装arthas

如果没有用docker，直接从官网下载然后丢服务器就行了，如果用的是docker那么就麻烦一点，这里我整了一个脚本来一键安装/启动：
```sh
#!/bin/bash
workdir="/opt/arthas-dev"
user=user
container=$1
if [ -z $container ];then
	echo -e "\e[32m用法: arthas-launcher.sh [容器名|容器ID] [用户名(可选，必须和启动应用的用户一致)]\e[0m"
	exit 0
fi
if [ ! -z $2 ];then
	user=$2
fi

function installArthas() {
	echo "开始安装arthas..."
	docker exec -u $user $container mkdir $workdir/arthas
	docker cp jdk-8u381-linux-x64.tar.gz $container:$workdir/jdk.tar.gz
	docker cp arthas-packaging-3.7.1-bin.zip $container:$workdir/arthas/arthas.zip
	docker exec -u root $container chmod 777 $workdir/jdk.tar.gz
	docker exec -u root $container chmod 777 $workdir/arthas/arthas.zip
	docker exec -u $user $container tar zxvf $workdir/jdk.tar.gz -C $workdir
	docker exec -u $user $container unzip $workdir/arthas/arthas.zip -d $workdir/arthas
	docker exec -u $user $container touch $workdir/installedMark
	echo "安装成功!"
}
# --------------main--------------
docker exec -u $user $container test -d $workdir
if [ ! $? -eq 0 ];then
	docker exec -u root $container mkdir $workdir
	docker exec -u root $container chown $user $workdir
	installArthas
fi

docker exec -u $user $container test -e $workdir/installedMark
if [ $? -eq 0 ];then
	docker exec -it -u $user $container $workdir/jdk1.8.0_381/bin/java -jar $workdir/arthas/arthas-boot.jar
else 
	echo "文件完整性校验失败! 重新尝试安装arthas."
	installArthas
fi
```

# 2. watch

## 2.1 基本使用

例如有一个Encoder的encrypt方法我们想要观察，但是由于每次请求这个方法都会被调用很多次，如果不加限制，每次会爆出很多不相干的信息。

watch提供了一个condition-express选项来帮助我们过滤输出：
```sh
watch xxx.Encoder encrypt {returnObj} 'params[0]=="P@ssw0rd"'
```

上面这条指令则是让arthas在第一个参数是`P@ssw0rd`的时候输出调用的返回值

## 2.2 观察异常抛出

有些时候，代码抛出了异常，但是又被另外一个异常包了一层抛出去了，例如`throw new RuntimeException(e)`，甚至有的时候
没有被抛出：`log.error(e.getMessage())`，导致我们不能看到我们想要的调用栈。

而watch也提供了观察异常抛出的功能。假如有一个Encoder的encrypt方法抛出了一个ExceptionA，但是没有打印栈信息，我们可以用
如下指令：
```sh
watch xxx.Encoder encrypt {throwExp} -e -x 2
```

`-e`表示抛出异常才触发。
`-x`表示输出属性的遍历深度，这个是啥意思呢，例如-x的值为1的时候，watch输出的结果可能就只是对象的toString，而-x的值为2的时候，watch也会输出这个对象里面属性的toString，如果等于3，则是对象里面的属性的属性的toString...


---

随缘更新。。