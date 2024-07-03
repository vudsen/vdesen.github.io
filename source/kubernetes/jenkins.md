---
title: Jenkins
date: 2024-06-24 15:55:18
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---

# 碰到的坑

## 慎用 Docker 安装

使用 docker 安装最大的一个坑：如果容器删掉了，即使挂载了 jenkins_home 的数据，再重新创建容器，jenkins 版本会直接回退到镜像对应的版本，即使之前升级过了。

这里是因为 jenkins 的 war 包没有被挂载，而 jenkins 的入门教程中，并没有提到怎么挂载 war 包。

这个问题会直接导致，如果你的镜像中 jenkins 版本较低，而插件要求的 jenkins 版本较高，就会导致无法进入控制台。

所以如果要升级jenkins，优先使用升级 docker 镜像的方式升级 jenkins，或者挂载 war 包目录后再升级。

但是这种方法太麻烦了，而且对于 blueocean 这种好几年没更新的镜像，根本没办法升级。

所以推荐直接部署在机器上，而不是使用 docker 启动。

这里是我的启动脚本：

```sh
#/bin/bash

export JENKINS_HOME=/home/jenkins/data
JAVA_HOME=/home/jenkins/openlogic-openjdk-jre-17.0.11+9-linux-x64
JENKINS_OPTS="--httpPort=8888 --javaHome=$JAVA_HOME"

nohup $JAVA_HOME/bin/java -jar jenkins-2.452.2.war $JENKINS_OPTS &
```

可以随意替换 war 包进行升级，并且相比之下也更灵活。

### 系统恢复

如果真的碰到了重新创建镜像导致控制台无法打开，可以使用下面的方式修复：

1. 删除(备份) jenkins-home 下的 `config.xml`
2. 重启 jenkins
3. 此时 jenkins 虽然安装了之前的插件，但全部处于禁用状态
4. 升级 jenkins，重启
5. 将之前的 `config.xml` 恢复，重启

# K8s 集成

## 创建服务账号与 K8s 集成

创建服务账号：


```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dev-ops-account
  namespace: {{ .Release.Namespace }}
  annotations:
    role: ci-cd
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: {{ .Release.Namespace }}
  name: dev-ops-role
rules:
  - apiGroups:
      - "apps"
    resources:
      - "deployment"
    verbs:
      - "get"
      - "list"
      - "update"
      - "patch"
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-ops-role-bind
  namespace: {{ .Release.Namespace }}
subjects:
  - kind: ServiceAccount
    name: dev-ops-account
roleRef:
  kind: Role
  name: dev-ops-role
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: Secret
metadata:
  name: dev-ops-token
  namespace: {{ .Release.Namespace }}
  annotations:
    kubernetes.io/service-account.name: dev-ops-account
type: kubernetes.io/service-account-token
```

获取 token:

```sh
kubectl get secret dev-ops-token -n {{ .Release.Namespace }} -o jsonpath='{.data.token}' | base64 --decode
```

调用 Api：[Deployment API](https://kubernetes.io/zh-cn/docs/reference/kubernetes-api/workload-resources/deployment-v1/)

认证方式是`Bearer Token`, 需要添加一个 `Authorization` 请求头，格式为: `Bearer <token>`.

推荐使用 `PATCH` 来更新资源，可用的格式可以在这里看 [更新现有资源](https://kubernetes.io/zh-cn/docs/reference/using-api/api-concepts/#patch-and-apply)


# 常用插件

## 响应式单选/多选插件

[Active Choices](https://plugins.jenkins.io/uno-choice/)

这个插件可以提供单选/多选的输入表单，并且它还可以提供根据之前的选项，限制下一个表单展示的内容。

例如第一个单选框是 `水果/牛奶`：

- 当选择**水果**时，第二个表单提供：苹果、香蕉、葡萄。
- 当选择**牛奶**时，第二个表单提供：纯牛奶、酸奶。

上面的需求用代码实现就是：

```groovy
parameters {
  activeChoice choiceType: 'PT_SINGLE_SELECT',
   filterLength: 1, 
   filterable: false, 
   name: 'FoodType', 
   randomName: 'choice-parameter-2439957027861799', 
   script: groovyScript(
    fallbackScript: [classpath: [], oldScript: '', sandbox: false, script: ''], 
    script: [
        classpath: [], 
        oldScript: '', 
        sandbox: false, 
        script: 'return [\'水果\', \'牛奶\']']
    )
  reactiveChoice choiceType: 'PT_SINGLE_SELECT',
   filterLength: 1, 
   filterable: false, 
   name: 'FoodName', 
   randomName: 'choice-parameter-2439957031262488', 
   referencedParameters: 'FoodType ', 
   script: groovyScript(
    fallbackScript: [classpath: [], oldScript: '', sandbox: false, script: ''], 
    script: [
        classpath: [], 
        oldScript: '', 
        sandbox: false, 
        script: '''
        if (FoodType == \'水果\') {
            return [\'苹果\', \'香蕉\', \'葡萄\']
        } else if (foodType == \'牛奶\') {
            return [\'纯牛奶\', \'酸奶\']
        }
        return []
    ''']
    )
  }
```


