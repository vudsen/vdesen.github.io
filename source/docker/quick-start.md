---
title: 快速入门
date: 2023-04-20 20:27:25
categories:
  data:
    - { name: "Docker", path: "/2023/03/04/SpringCloud/" }
---

# 1. 安装和启动

[Install Docker Engine | Docker Documentation](https://docs.docker.com/engine/install/)

启动命令：

```shell
systemctl start docker
```

这个指令类似于启动了一个windows上的后台服务。

关闭命令：

```shell
systemctl stop docker
```

# 2. 常用命令

## 2.1 帮助启动类命令

- 启动：`systemctl start docker`
- 停止：`systemctl stop docker`
- 重启：`systemctl restart docker`

- 查看状态：`systemctl status docker`
- 开机启动：`systemctl enable docker`
- 查看概要信息：`docker info`
- 查看帮助文档：`docker --help`

## 2.2 镜像命令

### 2.2.1 列出本地主机上的镜像

```shell
docker images
```

该命令第一行为5个固定值：

- REPOSITORY：镜像的仓库源
- TAG：镜像的标签版本号
- IMAGE ID：镜像ID
- CREATED：创建时间
- SIZE：镜像大小

一般使用`RESPOSITORY:TAG`来定义不同的镜像，如果不指定TAG，默认为`RESPOSITORY:latest`。

选项：

- -a：列出本地所有的镜像(含历史映像层)
- -q：只显示镜像ID

### 2.2.2 其它

- 搜索某个镜像：`docker search [REPOSITORY]`
- 拉取某个镜像：`docker pull [REPOSITORY]:[TAG]`

- 查看镜像/容器/数据卷所占用的空间：`docker system df`

- 删除镜像：`docker rmi [IMAGE ID | RESPOSITORY]`

- <font color=red>删除所有镜像</font>：`docker rmi -f $(docker images -q)`

## 2.3 容器命令

### 2.3.1 启动容器

```shell
docker run [OPTIONS] IMAGE [COMMAND][ARG...]
```

常用OPTIONS：

- 指定容器名称：`--name=[NAME]`
- 后台运行容器并返回容器ID：`-d`
- 以交互模式运行容器：`-i`
- 为容器重新分配一个伪输入终端，通常与`-i`同时使用：`-t`

- 指定容器的端口号：`-p [hostPort]:[containerPort]`

例如运行一个Ubuntu：

```shell
docker run -it ubuntu /bin/bash
```

启动一个已经停止运行的容器：

```shell
docker start [容器ID]
```

重启容器：

```shell
docker restart [容器ID]
```

停止容器：

```shell
docker stop [容器ID]
```

强制停止容器：

```shell
docker kill [容器ID]
```

删除已经停止的容器：

```shell
docker rm [容器ID]
```

### 2.3.2 列出容器

查看正在运行的容器：

```shell
docker ps
```

可用参数：

- 列出所有正在运行的以及历史运行过的容器：`-a`
- 显示最近创建的容器：`-l`
- 显示最近n个创建的容器：`-n`
- 静默模式，只显示容器编号：`-q`

### 2.3.3 其它命令

- 查看容器日志：`docker logs [容器ID]`
- 查看容器进程占用：`docker top`

- 重新进入正在运行的容器：

  - `docker exec -it [容器ID]`
  - `docker attach [容器ID]`

  attach直接进入容器启动命令的终端，不会启动新的进程，用exit退出，会导致容器停止

  exec是在容器中打开新的终端，并且可以启动新的进程，用exit退出，不会导致容器的停止

- 从容器拷贝文件到主机上：`docker cp [容器ID]:[容器内路径] [目的主机路径]`

- 导出容器：`docker export [容器ID]`
  - `docker export [容器ID] > xxx.tar`
- 导入容器：`docker import`
  - `cat xxx.tar | docker import [镜像用户/镜像名]:[版本号]`

# 3. Docker镜像

镜像是一种轻量级、可执行的独立软件包，它包含运行某个软件所需的所有内容，我们把应用程序和配置依赖打包好形成一个可交付的运行环境(包括代码、运行时所需要的库、环境变量和配置文件等)，这个打包好的运行环境就是image镜像文件。

## 3.1 联合文件系统

UnionFS（联合文件系统)：Union文件系统（UnionFS）是一种分层、轻量级并且高性能的文件系统，它支持对<font color=red>文件系统的修改作为一次提交来一层层的叠加</font>，同时可以将不同目录挂载到同一个虚拟文件系统下(unite several directories into a single virtual filesystem)。Union文件系统是Docker镜像的基础。镜像可以通过分层来进行继承，基于基础镜像（毅有父镜像)，可以制作各种具体的应用镜像。

特性：一次同时加载多个文件系统，但是从外面看起来，只能看到一个文件系统，联合加载会把各层文件系统叠加起来，这样最终的文件系统会包含所有底层的文件和目录。

## 3.2 制作镜像

提交一个容器副本：

```shell
docker commit -m=[描述信息] -a=[作者] [容器ID] [要创建的镜像名]:[TAG]
```

这个命令会基于某个镜像的基础上创建一个副本。

例如在Ubuntu镜像上安装vim后并制作镜像：

```shell
# 更新包管理工具
$container: apt-get update
# 安装vim
$container: apt-get -y install vim
# 提交
$docker: docker commit -m="add vim cmd" -a="xds" 5838857cbbc3 myubuntu:1.1
# 查看制作的镜像
$docker: docker images
```

# 4. 容器数据卷

容器数据卷类似于让容器将数据保存到宿主机，以防止容器内的数据丢失（例如容器被误删除）。

卷就是目录或文件，存在于一个或多个容器中，由docker挂载到容器，但不属于联合文件系统，因此能够绕过Union File System提供一些用于持续存储或共享数据的特性:

卷的设计目的就是<font color=red>数据的持久化</font>，完全独立于容器的生存周期，因此Docker不会在容器删除时删除其挂载的数据卷

使用容器数据卷：

```shell
docker run -it --privileged=true -v /宿主机绝对路径目录:/容器内目录 镜像名
```

