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

# PVC

[持久卷](https://kubernetes.io/zh-cn/docs/concepts/storage/persistent-volumes)

PVC 用于抽象存储，当 Pod 需要使用一块空间时只需要申请就可以了，并不需要关心这块存储是如何实现的，只需提供自己所需要的空间，K8s就能够自动进行分配。

## 申请一块存储空间

> kubectl explain pod.spec.volumes.persistentVolumeClaim

```yaml
apiVerson: v1
kind: Pod
spec:
  volumes:
    - name: pvc
      # 申请一个持久卷，关联一个PV(PersistentVolume)
      persistentVolumeClaim:  
        # 指定一份申请书 (PVC)
        claimName: my-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  storageClassName: <storage-class-name>
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      # 申请 50 MB
      storage: 50m
```

## 创建 PV 池

### 静态供应

PV 池可以提前被创建好，使用下面的 yaml 就可以创建一个 PV:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec: 
  # 可以填任意名称
  storageClassName: my-storage-class-name
  capacity:
    # 存储空间
    storage: 10m
  accessModes:
    - ReadWriteOnce
  # 使用 hostPath 存储
  hostPath:
    path: "/mnt/data"
  # 或者使用 nfs 存储
  nfs:
    server: 10.0.0.1
    path: /nfs/data/abc
```

`storageClassName` 用于分组，一个 `storageClassName` 下可以创建多个 PV。

### 动态供应

动态供应，则是把应该由运维手动创建的 PV 转交给 provisioner(供应商) 来进行创建。

---

使用 nfs 进行供应：[文档](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner)

使用手动部署方式，进入仓库的 `/deploy` 文件夹，里面的 `class.yaml`、`deployment.yaml` 和 `rbac.yaml`.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-client
provisioner: k8s-sigs.io/nfs-subdir-external-provisioner # or choose another name, must match deployment's env PROVISIONER_NAME'
parameters:
  archiveOnDelete: "false"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nfs-client-provisioner
  labels:
    app: nfs-client-provisioner
  # replace with namespace where provisioner is deployed
  namespace: default
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: nfs-client-provisioner
  template:
    metadata:
      labels:
        app: nfs-client-provisioner
    spec:
      serviceAccountName: nfs-client-provisioner
      containers:
        - name: nfs-client-provisioner
          image: registry.k8s.io/sig-storage/nfs-subdir-external-provisioner:v4.0.2
          volumeMounts:
            - name: nfs-client-root
              mountPath: /persistentvolumes
          env:
            # 和上面的 StorageClass 的 provisioner 值对应
            - name: PROVISIONER_NAME
              value: k8s-sigs.io/nfs-subdir-external-provisioner
            - name: NFS_SERVER
              value: 10.3.243.101
            - name: NFS_PATH
              value: /ifs/kubernetes
      volumes:
        - name: nfs-client-root
          nfs:
            server: 10.3.243.101
            path: /ifs/kubernetes
---
#
# rbac.yaml 中的内容
#
```

创建完成后，PVC 的 `spec.storageClassName` 只需要填上指定的 StorageClass 就可以实现动态供应了。

## PV 的回收策略

当存在一个 PVC 时，当时没有对应的可用组员，它会先处于 Pending 状态。当有合适的 PV 时，PVC 会自动绑定。

当 PVC 绑定了一个 PV 后，当这个 PVC 被删除后，默认情况下这个 PVC 所绑定的 PV 不会被释放。

每个持久卷会处于以下阶段（Phase）之一：

- Available: 卷是一个空闲资源，尚未绑定到任何申领
- Bound: 该卷已经绑定到某申领
- Released: 所绑定的申领已被删除，但是关联存储资源尚未被集群回收
- Failed: 卷的自动回收操作失败

### 保留 (Retain)

当 PVC 被删除后仍然保留 PV，即用户需要手动回收资源，此时卷的状态为 `RELEASED`。

```bash
[docker@VM-12-7-opencloudos pvc]$ kubectl get pv
NAME       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM                STORAGECLASS            VOLUMEATTRIBUTESCLASS   REASON   AGE
my-pv10m   10m        RWO            Retain           Available                        my-storage-class-name   <unset>                          11m
my-pv50m   50m        RWO            Retain           Released    default/my-pvc-40m   my-storage-class-name   <unset>                          10m
```

可以通过下面的步骤来手动回收：

1. 删除 PV 对象。删除 PV 对象并不会删除其对应的文件夹中的资源。
2. 根据需要手动清除 PV 对应的文件夹上的资源
3. 删除对应的关联存储资产
4. 如果需要，重新创建 PV

### 删除 (Delete)

K8s 会直接将 PV 删除，同时删除对应的关联资源。

**使用 Delete 必须要求对应的存储实现提供相关的删除插件**，否则会删除失败。例如 AWS EBS、GCE PD等.

### 回收 (Recycle)

回收会直接清除 PV 对应目录上的数据(会执行 `rm -rf`)。执行完成后，该 PV 将允许重新使用。