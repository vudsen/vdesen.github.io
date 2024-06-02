---
title: 存储
date: 2024-05-28 21:58:12
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---

# 配置

[配置最佳实践](https://kubernetes.io/zh-cn/docs/concepts/configuration/overview/)

## Secret

`Secret` 对象类型用来保存敏感信息，例如密码、OAuth 令牌和 SSH 密钥。将这些信息放在 `Secret` 中会更加的灵活和安全。

k8s可以创建三种类型的 `Secret`:

```bash
$ kubectl create secret --help

Available Commands:
  docker-registry   创建一个给 Docker registry 使用的 Secret
  generic           Create a secret from a local file, directory, or literal value
  tls               创建一个 TLS secret
```

### docker-registry

创建一个 docker 镜像的拉取秘钥。

用法：

```bash
$ kubectl create secret docker-registry NAME --docker-username=user --docker-password=password --docker-email=email \
    [--docker-server=string] [--from-file=[key=]source] [--dry-run=server|client|none] [options]
```

一般只需要提供如下参数：

- `docker-username`: 用户名
- `docker-password`： 密码
- `docker-server`：私有仓库服务器

创建完成后，可以直接在 Pod 的 `spec.imagePullSecrets` 中使用：

```yaml
kind: Pod
spec:
    imagePullSecrets:
        - name: secret-name1
        - name: secret-name2
```

### generic

`generic` 的 `secret` 一般有下面的几种类型：

| 内置类型                        | 用法                                 |
| ----------------------------------- | -------------------------------------- |
| Opaque                              | 用户定义的任意数据            |
| kubernetes.io/service-account-token | 服务账号令牌                     |
| kubernetes.io/dockercfg             | ~/.dockercfg文件的序列化形式   |
| kubernetes.io/dockerconfigjson      | ~/.docker/config.json 文件的序列化形式 |
| kubernetes.io/basic-auth            | 用于基本身份认证的凭据      |
| kubernetes.io/ssh-auth              | 用于SSH身份认证的凭据         |
| kubernetes.io/tls                   | 用于TLS客户端或者服务器端的数据 |
| bootstrap.kubernetes.io/token       | 启动引导令牌数据               |

常见用例：

```bash
kubectl create secret generic dev-db-secret --from-literal=username=devuser --from-iteral=password=abc123

## 生成如下的yaml
apiVersion: v1
kind: Secret
metadata: 
  name dev-db-secret
data:
  password: <base64: devuser>
  username: <base64: abc123>
```

### 使用Secret

可以通过环境变量使用 Secret:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod-secret
spec:
  containers:
    - name: pod-secret
      image: busybox
      command: ["sh", "echo", "$MY_SECRET_ENV"]
      env:
        # 通过环境变量使用Secret
        - name: MY_SECRET_ENV
          valueFrom:
            secretKeyRef:
              name: <secret-name>
              key: <secret-key>
```

## 引用配置

使用`kubectl explain pod.spec.containers.env.valueFrom`既可查看所有能够引用的类型。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod-test
spec:
  containers:
    - name: pod-test
      image: busybox
      resources:
        limits:
          cpu: 5m
      env:
        - name: SECRET_REF
          valueFrom:
            # 引用一个 Secret
            secretKeyRef:
              name: <secret-name>
              key: <secret-key>
        - name: FIELD_REF
          valueFrom:
            # 引用一个属性
            fieldRef:
              fieldPath: metadata.name
        - name: RESOURCE_REF
          valueFrom:
            # 引用一个资源
            resourceFieldRef:
              containerName: pod-test
              resource: limit.cpu
```

- filedRef可用值：metadata.name, metadata.namespace, `metadata.labels['<KEY>']`, `metadata.annotations['<KEY>']`, spec.nodeName, spec.serviceAccountName, status.hostIP, status.podIP, status.podIPs
- resourceFieldRef可用值: limits.cpu, limits.memory, limits.ephemeral-storage, requests.cpu, requests.memory and requests.ephemeral-storage

> 环境变量引用的方式不会被自动更新