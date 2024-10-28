---
title: DockerFile
date: 2023-04-25 14:12:25
categories:
  data:
    - { name: "Docker", path: "/2023/04/20/docker/" }
---

# 1. 基础

Dockerfile是用来构建Docker镜像的文本文件，是由一条条构建镜像所需的指令和参数构成的脚本。

[Dockerfile reference | Docker Documentation](https://docs.docker.com/engine/reference/builder/)

## 1.1 DockerFile执行流程

1. docker从基础镜像运行一个容器
2. 执行一条指令并对容器作出修改
3. 执行类似`docker commit`的操作提交一个新的镜像层
4. docker再基于刚提交的镜像运行一个新容器
5. 执行dockerfile中的下一条指令直到所有指令都执行完成

## 1.2 DockerFile常用保留字

- FROM：基础镜像，当前新镜像是基于哪个镜像的，指定一个已经存在的镜像作为基础镜像
- MAINTAINER：镜像维护者的姓名和邮箱地址

- RUN：容器构建时需要执行的命令
  - Shell格式：`RUN 命令`
  - Exec格式：`RUN [可执行文件, 参数1, 参数2, ...]`
    - 例如：`RUN ['test.sh', 'dev', 'offline']`等价于`RUN test.sh dev offline`

- EXPOSE：容器对外暴露的端口
- WORKDIR：指定在创建容器后，终端默认登陆进来的工作目录(登陆终端后的默认路径)

- USER：指定该镜像以什么样的用户去执行，默认为ROOT

- ENV：用来在构建过程中设置环境变量

- VOLUME：指定容器数据卷

- ADD：将宿主机目录下的文件拷贝进镜像（会自动处理URL和解压tar压缩包）

- COPY：拷贝文件和目录到镜像中

- CMD：指定容器启动后要干的事情，<font color=red>若有多个CMD，则只有最后一个生效，并且CMD会被`docker run`之后的参数替换</font>。

  - 例如Tomcat配置文件的CMD命令如下：

    ```shell
    CMD ["catalina.sh", "run"]
    ```

    我们使用如下指令启动容器：

    ```shell
    docker run -it -p 8080:8080 [TOMCAT镜像ID] /bin/bash
    ```

    则命令会被替换成这样：

    ```shell
    CMD ["/bin/bash", "run"]
    ```

    此时TOMCAT也将启动失败

- ENTRYPOINT：指定一个容器启动时要执行的命令，类似于CMD，但区别是ENTRYPOINT不会被`docker run`后面的命令覆盖，<font color=red>而且后面的参数会被送给ENTRYPOINT指令所运行的指令。</font>

  ENTRYPOINT可以和CMD一起使用，一般是变参才会使用CMD，这里的CMD等于是在给ENTRYPOINT传参。

  当指定了ENTRYPOINT后，CMD的含义就发生了变化，不再是直接运行其命令，而是将CMD的内容作为参数传递给ENTRYPOINT指令。

  例如通过Dockerfile构建Nginx：

  ```shell
  FROM nginx
  
  ENTRYPOINT ["nginx", "-c"]
  CMD ["/etc/nginx/nginx.conf"]
  ```

  `docker run nginx -c /etc/nginx/new.conf`最终会运行：`nginx -c /etc/nginx/new.conf`

## 1.3 自定义镜像案例

自定义一个centos镜像，并且具备vim+ifconfig+jdk11。

在Linux下创建一个`Dockerfile`文件：

```shell
vim Dockerfile
```

添加内容：

```dockerfile
FROM centos
MAINTAINER xds<2237803016@qq.com>

ENV MYPATH /usr/local
WORKDIR $MYPATH

# centos需要执行下面的命令，否则yum可能会报错。或者将FROM换成centos7
RUN sed -i 's/mirrorlist/#mirrorlist/g' /etc/yum.repos.d/CentOS-*
RUN sed -i 's|#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' /etc/yum.repos.d/CentOS-*
RUN yum makecache

# 安装vim
RUN yum -y install vim

# 安装ifconfig
RUN yum -y install net-tools

# 安装java8
RUN yum -y install glibc.i686
RUN mkdir /usr/local/java

# 添加java文件，必须和Dockerfile在同一目录
ADD jdk-11.0.19.tar.gz /usr/local/java
# 设置java环境变量
# 这里后面的文件名就是上面压缩包的文件名，ADD指令会自动为我们解压
ENV JAVA_HOME /usr/local/java/jdk-11.0.19
ENV JRE_HOME $JAVA_HOME/jre
ENV CLASSPATH $JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar:$JRE_HOME/lib:$CLASSPATH
ENV PATH $JAVA_HOME/bin:$PATH

EXPOSE 80
CMD echo $MYPATH
CMD echo "success--------ok"
CMD /bin/bash
```

打包制作镜像（注意后面有个点）：

```shell
docker build -t [镜像名]:[TAG] .
```

## 1.4 镜像中添加字体库

需要首先安装 `fontconfig`，下载所有依赖：

- [freetype-2.11.0-1.rpm](https://5j9g3t.site/static/linux/freetype-2.11.0-1.rpm)
- [fontconfig-2.13.94-1.rpm](https://5j9g3t.site/static/linux/fontconfig-2.13.94-1.rpm)
- [harfbuzz-2.8.2-1.oe2203.x86_64.rpm](https://5j9g3t.site/static/linux/harfbuzz-2.8.2-1.oe2203.x86_64.rpm)
- [graphite2-1.3.14-5.oe2203.x86_64.rpm](https://5j9g3t.site/static/linux/graphite2-1.3.14-5.oe2203.x86_64.rpm)


```sh
rpm -Uvh --force --nodeps freetype-2.11.0-1.rpm && \
rpm -Uvh --force --nodeps fontconfig-2.13.94-1.rpm && \
rpm -Uvh --force --nodeps iputils-20210722-4.rpm && \
rpm -Uvh --force --nodeps harfbuzz-2.8.2-1.oe2203.x86_64.rpm && \
rpm -Uvh --force --nodeps graphite2-1.3.14-5.oe2203.x86_64.rpm && \
```

之后下载字体库：[dejavu-fonts-2.37-1.oe2203.noarch.rpm](https://5j9g3t.site/static/linux/dejavu-fonts-2.37-1.oe2203.noarch.rpm)

然后安装：

```sh
rpm -Uvh --force --nodeps dejavu-fonts-2.37-1.oe2203.noarch.rpm
```


# 2. 虚悬镜像

如果在build的时候没有指定镜像名和TAG，在build后出来的镜像名和TAG都会为<none>

在某些情况下由于docker的错误也会产生虚悬镜像。

使用如下指令查看所有虚悬镜像：

```shell
docker images ls -f dangling=true
```

虚悬镜像没有存在的意义，可以直接删除：

```shell
docker image prune
```

