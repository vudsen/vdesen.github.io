---
title: Argo Workflow 入门
date: 2024-09-04 17:05:48
categories: 
  - k8s
seo:
  title: Argo Workflow 快速入门
  description: Argo Workflow 快速入门，安装，工作流部署
  keyword: 
    - ArgoWorkflow
    - 快速入门
    - 工作流部署
---

# 安装

> [!NOTE]
> [Installation](https://argo-workflows.readthedocs.io/en/latest/installation/) 



## 配置 Base Href

> [!NOTE]
> [Ingress](https://argo-workflows.readthedocs.io/en/stable/argo-server/#ingress) 配置

由于我想用 Ingress 暴露服务，所以需要配置 `base href`。

修改配置部署清单文件(这里我用的 kustomization)：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: argo-server
  namespace: argo
spec:
  template:
    spec:
      containers:
        - name: argo-server
          args:
            - server
            - "--secure=false"
            - "--basehref=/ci/"
          readinessProbe:
            httpGet:
              scheme: HTTP
```

通过 `--basehref` 就可以设置 Base Href。同时由于 argo workflow 默认使用 https 访问，这里可以顺手关掉，当然不关也可以，可以在 Ingress 那边开启 https 转发。

这里是我 treafik 的配置：

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: argo-stripprefix
  namespace: argo-workflow
spec:
  replacePathRegex:
    regex: ^/ci/(.*)
    replacement: /$1
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: ingressroute
  namespace: argo-workflow
spec:
  routes:
    - match: PathPrefix(`/ci`)
      kind: Rule
      services:
        - name: argo-server
          port: 2746
      middlewares:
        - name: argo-stripprefix
```

实际就是一个路径重写。

## 配置权限

首先需要给内部的一个服务账号权限：

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: executor
  namespace: argo-workflow
rules:
  - apiGroups:
      - argoproj.io
    resources:
      - workflowtaskresults
    verbs:
      - create
      - patch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: argo-executor
  namespace: argo-workflow
subjects:
  - kind: ServiceAccount
    name: default
roleRef:
  kind: Role
  name: executor
  apiGroup: rbac.authorization.k8s.io
```

这是[最小的权限](https://argo-workflows.readthedocs.io/en/stable/workflow-rbac/)，只能使用一些基础功能，部分功能是无法使用的。
完整的权限可以看这里：[Security](https://argo-workflows.readthedocs.io/en/stable/security/)

同时创建一个服务账号的 Token(这里我可能用错了，仅供参考，这个账号是 argo workflow 自己创建的)：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: argo-server-token
  namespace: argo-workflow
  annotations:
    kubernetes.io/service-account.name: argo-server
type: kubernetes.io/service-account-token
```
生成 Token：

```bash
ARGO_TOKEN="Bearer $(kubectl get secret argo-server-token -n argo-workflow -o=jsonpath='{.data.token}' | base64 --decode)"
echo $ARGO_TOKEN
```

之后使用这个 Token 登录就可以了。


# 创建工作流

首先来看个例子([Argo Workflow Catalog](https://argoproj-labs.github.io/argo-workflows-catalog/))：

```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  annotations:
    workflows.argoproj.io/description: |
      Checkout out from Git, build and test a Golang application.
    workflows.argoproj.io/maintainer: '@alexec'
    workflows.argoproj.io/tags: golang, git
    workflows.argoproj.io/version: '>= 2.9.0'
  name: go-build
spec:
  entrypoint: main
  arguments:
    parameters:
      - name: repo
        value: https://github.com/argoproj-labs/argo-workflows-catalog.git
      - name: branch
        value: master
      - name: output
        value: argo-workflows-catalog
  templates:
    - name: main
      steps:
        - - name: checkout
            template: checkout
        - - name: build
            template: build
        - - name: test
            template: test
    - name: checkout
      script:
        image: golang:1.14
        workingDir: /work
        args:
          - sh
        # use --depth 1 and --single-branch for fastest possible checkout
        source: git clone --depth 1 --single-branch --branch {{workflow.parameters.branch}} {{workflow.parameters.repo}} .
        volumeMounts:
          - mountPath: /work
            name: work
    - name: build
      script:
        image: golang:1.14
        workingDir: /work
        args:
          - sh
        source: go build -o {{workflow.parameters.output}} -v ./...
        volumeMounts:
          - mountPath: /work
            name: work
    - name: test
      script:
        image: golang:1.14
        workingDir: /work
        args:
          - sh
        source: go test -v ./...
        volumeMounts:
          - mountPath: /work
            name: work
  volumeClaimTemplates:
    # A shared work volume.
    - name: work
      metadata:
        name: work
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 64Mi
```

这是一段用于 GoLang 打包的工作流，不用多说，基本都能看懂，这里也就是先了解一个工作流大体结构。

## 核心概念

> [!NOTE]
> 原文: [Template Definitions](https://argo-workflows.readthedocs.io/en/stable/workflow-concepts/#template-definitions)

在上面的例子中，我们使用 `script` 来进行具体的命令执行，除了这个之外，还有如下几种常用的配置：

- `container`: 指定容器

    Example:

    ```yaml
    - name: whalesay
      container:
        image: docker/whalesay
        command: [cowsay]
        args: ["hello world"]
    ```

- `script`: 类似于 `container`，但是能够通过 `{{tasks.<NAME>.outputs.result}}` 或者 `{{steps.<NAME>.outputs.result}}` 来获取命令的输出
- `resource`: 用于创建 K8s 资源

    Example:

    ```yaml
    - name: k8s-owner-reference
      resource:
      action: create
      manifest: |
        apiVersion: v1
        kind: ConfigMap
        metadata:
        generateName: owned-eg-
        data:
        some: value
    ```
- `suspend`: 挂起模板，允许等待指定时间后再执行

## 模板输入

> [!NOTE]
> 所有的字段在这里找: [Field Reference](https://argo-workflows.readthedocs.io/en/latest/fields/)


我们在打包前都需要去拉取代码，在上面的代码中，我们使用了 PVC 声明持久卷来存放代码，但实际会有更优雅的代码：


```yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: build-maven
  namespace: argo-workflow
spec:
  entrypoint: checkout-and-build
  templates:
    - name: checkout-and-build
      inputs:
        artifacts:
          - name: checkout-source
            path: /source
            git:
              repo: ssh://git@xxx
              branch: develop
              depth: 1
              singleBranch: true
              insecureIgnoreHostKey: true
              sshPrivateKeySecret:
                name: id-rsa
                key: ssh-privatekey
      script:
        image: docker.io/maven:3.9.1-amazoncorretto-17
        imagePullPolicy: IfNotPresent
        command: [sh]
        source: mvn clean install -DskipTests
```

这里我们直接将 `input` 和 `script` 写在一个模板中，这样就不用去声明 PVC 来专门为代码准备位置了。

当然，在执行前需要创建对应的 secret：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: id-rsa
  namespace: argo-workflow
type: kubernetes.io/ssh-auth
data:
  ssh-privatekey: <Base64 encoded ssh private key>
```

## 指定服务账号

还记得在上面我们给 [服务账号配置权限](#配置权限) 吗？我们给服务账号 `default` 赋予了 patch 和 create 权限。

在生产模式下则不这么推荐，因为 default 是默认的服务账号。

TODO，SEE [Security](https://argo-workflows.readthedocs.io/en/stable/security/)
