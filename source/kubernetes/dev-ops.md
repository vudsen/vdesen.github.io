---
title: DevOps
date: 2024-03-03 15:17:32
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---

# 1. 基本理念

```
CODE -> BUILD -> INTEGRATE -> TEST -> DELIVER -> DEPLOY
|                                   |          |      |
<------Continuous Integration------->          |      |
|                                              |      |
<--------------Continuous Delivery------------->      |
|                                                     |
<---------------Continuous Deployment----------------->
```

[什么是 CI/CD？](https://www.redhat.com/zh/topics/devops/what-is-ci-cd)

# 2. 安装

[安装Jenkins](https://www.jenkins.io/zh/doc/book/installing/)


`/var/jenkins_home`为jenkins的所有配置和数据，需要注意备份。

启动：
```bash
docker run \
  -u root \
  -d \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins-data:/var/jenkins_home \
  -v /etc/localtime:/etc/localtime:ro \
  -v /var/run/docker.sock:/var/run/docker.sock \
  jenkinsci/blueocean
```

启动后需要升级到最新版本，点击右上角的通知，会提示你有最新版本可用，然后直接让它自动更新，重启就行了。

或者自己用 Dockerfile 重新打镜像，把最新版本的 war 包丢到`/usr/share/jenkins/jenkins.war`。

## 测试使用

在项目根目录创建`Jenkinsfile`文件，添加如下内容：
```grovvy
pipeline {

    // 任何一个代理可用就可以执行
    agent any

    // 定义流水线的加工流程
    stages {
        // 流水线的所有阶段
        // 1. 编译
        stage('编译') {
            steps {
                echo "编译"
            }
        }

        stage('测试') {
            steps {
                echo "测试"
            }
        }

        stage('打包') {
            steps {
                echo "打包"
            }
        }

        stage('部署') {
            steps {
                echo "部署"
            }
        }

    }
}
```

之后直接在jenkins控制台进行打包，即可看到完整结果。

## 修改时区

虽然启动时修改了容器时区，但是 jenkins 默认还是会用其它的时区，这时候需要我们手动改一下。

打开系统管理 -> 脚本命令行 ，输入如下内容然后执行：
```groovy
System.setProperty('org.apache.commons.jelly.tags.fmt.timeZone', 'Asia/Shanghai')
```

# 3. 插件推荐

## 自定义执行环境(Docker Pipeline)

[在流水线中使用Docker](https://www.jenkins.io/zh/doc/book/pipeline/docker/)

安装`Docker Pipeline`插件后，就可以使用 Docker 镜像作为某个 stage 的执行环境：
```groovy
pipeline {
    // 如果 agent 为 none，则所有 stage 必须手动指定 agent
    agent none
    stages {
        stage('Back-end') {
            agent {
                docker { 
                    image 'maven:3-alpine'
                    // 挂载数据
                    args '-v $HOME/.m2:/root/.m2'
                }
            }
            steps {
                sh 'mvn --version'
            }
        }
        stage('Front-end') {
            agent {
                docker { image 'node:7-alpine' }
            }
            steps {
                sh 'node --version'
            }
        }
    }
}
```

### 挂载配置文件

由 jenkins 启动的 docker 容器，是可以读取到 jenkins-data 目录的。所以我们可以把所有配置文件放到 jenkins-data 目录：
```bash
[root@my ~]# docker volume inspect jenkins-data
[
    {
        "CreatedAt": "2024-03-03T21:15:07+08:00",
        "Driver": "local",
        "Labels": null,
        "Mountpoint": "/var/lib/docker/volumes/jenkins-data/_data",
        "Name": "jenkins-data",
        "Options": null,
        "Scope": "local"
    }
]
[root@my ~]# cd /var/lib/docker/volumes/jenkins-data/_data
[root@my _data]# mkdir -r appconfig/maven
[root@my _data]# cd appconfig/maven
[root@my maven]# vi settings.xml 
```

之后在打包时手动指定配置文件位置：
```groovy
stage('Maven打包') {

    agent {
        docker {
            image 'maven:3.8.8-amazoncorretto-17'
            // 注意这里是/var/jenkins_home，实际上在宿主机也能看到
            args '-v /var/jenkins_home/appconfig/maven/.m2:/root/.m2'
        }
    }

    steps {
        // 打包
        sh 'mvn clean package -DskipTests -s "/var/jenkins_home/appconfig/maven/settings.xml"'
    }
}
```

## SSH执行远程命令

[SSH Pipeline Steps](https://plugins.jenkins.io/ssh-steps/)

使用方式：
```groovy
stage('Run remote command') {

    environment {
        K8S_MAIN_NODE = credentials('test-k8s-main')
    }

    steps {
        script {
            def remote = [
                    name: 'k8s-main',
                    host: '10.10.10.10',
                    user: K8S_MAIN_NODE_USR,
                    password: K8S_MAIN_NODE_PSW,
                    allowAnyHosts: true
            ]
            echo "Restarting server."
            sshCommand remote:remote, command: '~/restart.sh'
        }
    }
}
```

## 缓存node_modules

直接写了一个函数：
```groovy
def resolveLastBuildVersion(String name) {
    dir("buildVersion") {
        result = sh encoding: 'UTF-8', returnStdout: true, script: "if [ -f \"${name}\" ];then cat ${name}; fi"
        return result
    }
}

def writeLastBuildVersion(String name, String hash) {
    writeFile encoding: 'UTF-8', file: "buildVersion/${name}", text: hash
}

def buildWebProject(String project) {
    checkoutRepo(project)
    dir(project) {
        String buildVersionKey = "${project}-build"
        String depVersionKey = "${project}-dep"
        String currentVersion = sh encoding: 'UTF-8', returnStdout: true, script: 'git rev-parse HEAD'
        String lastBuildVersion = resolveLastBuildVersion(buildVersionKey)
        echo "Current version is ${currentVersion}, last build version is ${lastBuildVersion}"
        if (currentVersion == lastBuildVersion) {
            int status = sh encoding: 'UTF-8', returnStatus: true, script: 'test -d dist'
            int status2 = sh encoding: 'UTF-8', returnStatus: true, script: 'test -f dist/index.html'
            if (status == 0 && status2 == 0) {
                echo "No changes found, skip build."
                return
            }
        } else {
            echo "Changes found, starting build web project."
        }

        String currentDepVersion = sh encoding: 'UTF-8', returnStdout: true, script: 'sha256sum package.json'
        String lastDepVersion = resolveLastBuildVersion(depVersionKey)
        echo "Current package.json sha256 is ${currentDepVersion}, last sha256 is ${lastDepVersion}"
        if (currentDepVersion != lastDepVersion) {
            echo "Changes found, reinstall node_modules."
            sh "npm i"
            writeLastBuildVersion(depVersionKey, currentDepVersion)
        } else {
            echo "No dependency changes found, skip install dependency."
        }
        sh "npm run build"
        writeLastBuildVersion(buildVersionKey, currentVersion)
    }
}
```


