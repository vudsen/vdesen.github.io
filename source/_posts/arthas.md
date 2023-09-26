---
title: Arthas诊断线上问题
date: 2023-09-04 16:16:53
categories: 线上问题排查
  
---

# 1. 安装arthas

如果没有用docker，直接从官网下载然后丢服务器就行了，如果用的是docker那么就麻烦一点，这里我整了一个脚本来一键安装：
```sh
if [ -z $1 ];then
	echo -e "\e[32m用法: install-arthas.sh [容器名|容器ID] [用户名(可选，默认xxx，必须和启动tomcat的用户一致)]\e[0m"
        exit 0
fi
if [ -z $2 ];then
	$user=xxx
else
	$user=$2
fi

echo "installing arthas..."
# 这里把jdk换成你自己的，因为docker里面可能装的jre，如果装的jdk则可以不塞jdk进去
docker cp jdk-8u381-linux-x64.tar.gz $1:/opt/jdk.tar.gz
docker cp arthas-packaging-3.7.1-bin.zip $1:/opt/arthas.zip
# 用root用户给所有人权限
docker exec -it -u root $1 chmod 777 /opt/jdk.tar.gz
docker exec -it -u root $1 chmod 777 /opt/arthas.zip
# 这里一定不要让root用户解压，不然会没权限
docker exec -it -u $user $1 tar zxvf /opt/jdk.tar.gz
docker exec -it -u root $1 mkdir /opt/arthas
docker exec -it -u root $1 chown hcs /opt/arthas
docker exec -it -u $user $1 unzip /opt/arthas.zip -d /opt/arthas
docker exec -it -u $user $1 echo "/opt/jdk/jdk1.8.0_381/bin/java -jar /opt/arthas/arthas-boot.jar" > /opt/arthas.sh
docker exec -it -u $user $1 chmod 777 /opt/arthas.sh
echo "install arthas success!"
```

也可以在外面创建一个启动脚本：
```sh
if [ -z $1 ];then
	echo -e "\e[32m用法: arthas.sh [容器名|容器ID] [用户名(可选，默认hcs，必须和启动tomcat的用户一致)]\e[0m"
        exit 0
fi

if [ -z $2 ];then
	$user=hcs
else
	$user=$2
fi
docker exec -it -u $user $1 /opt/jdk/jdk1.8.0_381/bin/java -jar /opt/arthas/arthas-boot.jar
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