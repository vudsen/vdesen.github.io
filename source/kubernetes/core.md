---
title: 核心
date: 2024-02-12 21:25:40
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---

# Namespace

命名空间用来隔离资源。默认只隔离资源，不隔离网络。

```bash
kubectl create ns hello
kubectl delete ns hello
```

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: hello
```

# Pod

Pod是运行中的一组容器，Pod是kubernets中应用的最小单位。

```bash
kubectl run mynginx --image=nginx

# 查看default名称空间的Pod
kubectl get pod 
# 描述
kubectl describe pod 你自己的Pod名字
# 删除
kubectl delete pod Pod名字
# 查看Pod的运行日志
kubectl logs Pod名字

# 每个Pod - k8s都会分配一个ip
kubectl get pod -owide
# 使用Pod的ip+pod里面运行容器的端口
curl 192.168.169.136

# 集群中的任意一个机器以及任意的应用都能通过Pod分配的ip来访问这个Pod
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: myapp
  name: myapp
spec:
  containers:
  - image: nginx
    name: nginx
  - image: tomcat:8.5.68
    name: tomcat
```

# Deployment

控制Pod，使Pod拥有多副本，自愈，扩缩容等能力。

```bash
# 创建含有3个副本的tomcat
kubectl create deployment my-dep --image=tomcat:8.5.68 --replicas=3
```

由 Deployment 创建的 Pod，在被手动删除后会自动重新创建一个新的 Pod。

![k8s工作负载](https://5j9g3t.site/images/2024/02/k8s-workload.webp)

## 扩缩容

```bash
kubectl scale --replicas=5 deployment/my-dep
```

也可以手动修改yaml来进行扩缩容：
```bash
kubectl edit deploy my-dep
```

修改`spec.replicas`的值即可进行扩缩容。

## 滚动更新

滚动更新能够做到不停机更新，在服务更新的同时也能提供服务。在一个新版本的 pod 启动完成后会删除旧版本的 pod，然后接着操作下一个旧版本 pod，直到所有的全部更新完毕。

```bash
kubectl set image deployment/my-dep tomcat=tomcat:latest --record
```

其中`tomcat=xxx`左边的`tomcat`，代表的是容器名，而不是镜像名。

## 版本回退

```bash
#历史记录
kubectl rollout history deployment/my-dep

#查看某个历史详情
kubectl rollout history deployment/my-dep --revision=2

#回滚(回到上次)
kubectl rollout undo deployment/my-dep

#回滚(回到指定版本)
kubectl rollout undo deployment/my-dep --to-revision=2
```

# Service


将一组 Pods 公开为网络服务的抽象方法。客户端只需要访问 Service，就能够访问到各个 Pod 上的服务。

![k8s-svc](https://5j9g3t.site/images/2024/02/k8s-svc.webp)

## ClusterIP

ClusterIp 类型的服务只能在集群内访问，在外网无法访问。

```bash
# 暴露Deploy，暴露 pod 的 80 端口，直接访问服务的8000端口即可间接访问 Pod。
kubectl expose deployment my-dep --port=8000 --target-port=80

#使用标签检索Pod
kubectl get pod -l app=my-dep
```

> 使用`my-dep.default.svc:8000`(`服务名.命名空间.svc:服务端口`)也可以访问到服务。**但是只能在容器内访问，在容器外无法使用**。


或者使用yaml创建：
```yaml
apiVersion: v1
kind: Service
metadata:
  labels: 
    app: my-dep
  name: my-dep
spec:
  selector:
    app: my-dep
  ports:
    - port: 8080
      protocol: TCP
      targetPort: 80
```

## NodePort

如果想要把服务暴露给外网，则需要使用 NodePort。

NodePort 也叫节点端口，意思是在每个 Pod 上都暴露一个端口给公网，暴露后可以通过任意节点Ip + 端口访问。

```bash
# 注意需要添加 `--type=NodePort` 来指定服务类型。
kubectl expose deploy my-dep --port=8000 --target-port=80 --type=NodePort
```

使用yaml：
```yaml
apiVersion: v1
kind: Service
metadata:
  labels:
    app: my-dep
  name: my-dep
spec:
  ports:
  - port: 8000
    protocol: TCP
    targetPort: 80
  selector:
    app: my-dep
  type: NodePort
```

> NodePort范围在 30000 - 32767 之间

# Ingress

Ingress 翻译为'入口'，意思为 k8s 希望使用 Ingress 来作为我们的服务统一网关入口来为外网服务。

![ingress](https://5j9g3t.site/images/2024/02/ingress.webp)

## 安装Ingress-Nginx

[安装文档](https://kubernetes.github.io/ingress-nginx/deploy/)

```bash
curl -O https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
```

打开后需要修改镜像，使用阿里云镜像`registry.aliyuncs.com/google_containers`。

然后镜像名称按照下面的修改，改完只留版本号，后面的`@sha256`一长串删掉：

- `/ingress-nginx/controller` -> `nginx-ingress-controller`
- `/ingress-nginx/kube-webhook-certgen` -> `kube-webhook-certgen`
- `/ingress-nginx/kube-webhook-certgen` -> `kube-webhook-certgen`

这里是我最终用的镜像：

- `registry.aliyuncs.com/google_containers/nginx-ingress-controller:v1.8.1`
- `registry.aliyuncs.com/google_containers/kube-webhook-certgen:v20230407`


### 修改服务类型

新版本的 Igress-Nginx 会默认创建一个 LoadBancler 的服务：

```bash
NAMESPACE              NAME                                 TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
ingress-nginx          ingress-nginx-controller             LoadBalancer   10.96.228.236   <pending>     80:31635/TCP,443:31243/TCP   3h44m
```

启动后可以发现我们的 EXTERNAL-IP 这一列一直是 pending，也正因为如此，我们现在是访问不了服务的，我们需要把 LoadBalancer 改成 NodePort 才行。

来看一下创建 Service的配置，照着我的注释删就行了：
```yaml
apiVersion: v1
kind: Service
metadata:
  labels:
    app.kubernetes.io/component: controller
    app.kubernetes.io/instance: ingress-nginx
    app.kubernetes.io/name: ingress-nginx
    app.kubernetes.io/part-of: ingress-nginx
    app.kubernetes.io/version: 1.8.1
  name: ingress-nginx-controller
  namespace: ingress-nginx
spec:
  # 这里是关键，改成 NodePort 必须删除，否则只能使用对应 pod 所在的节点iP进行访问
  externalTrafficPolicy: Local
  ipFamilies:
  - IPv4
  ipFamilyPolicy: SingleStack
  ports:
  - appProtocol: http
    name: http
    port: 80
    protocol: TCP
    targetPort: http
  - appProtocol: https
    name: https
    port: 443
    protocol: TCP
    targetPort: https
  selector:
    app.kubernetes.io/component: controller
    app.kubernetes.io/instance: ingress-nginx
    app.kubernetes.io/name: ingress-nginx
  # 把这里改成 NodePort
  type: LoadBalancer
```

改完后删除原有服务，创建一个新的，就能访问了。

## 测试Ingress

应用如下yaml：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello-server
spec:
  replicas: 2
  selector:
    matchLabels:
      app: hello-server
  template:
    metadata:
      labels:
        app: hello-server
    spec:
      containers:
      - name: hello-server
        image: registry.cn-hangzhou.aliyuncs.com/lfy_k8s_images/hello-server
        ports:
        - containerPort: 9000
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: nginx-demo
  name: nginx-demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx-demo
  template:
    metadata:
      labels:
        app: nginx-demo
    spec:
      containers:
      - image: nginx
        name: nginx
---
apiVersion: v1
kind: Service
metadata:
  labels:
    app: nginx-demo
  name: nginx-demo
spec:
  selector:
    app: nginx-demo
  ports:
  - port: 8000
    protocol: TCP
    targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  labels:
    app: hello-server
  name: hello-server
spec:
  selector:
    app: hello-server
  ports:
  - port: 8000
    protocol: TCP
    targetPort: 9000
```

### 创建 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress  
metadata:
  name: ingress-host-bar
spec:
  ingressClassName: nginx
  rules:
  - host: "hello.atguigu.com"
    http:
      paths:
      - pathType: Prefix
        path: "/"
        backend:
          service:
            name: hello-server
            port:
              number: 8000
  - host: "demo.atguigu.com"
    http:
      paths:
      - pathType: Prefix
        path: "/nginx"  # 把请求会转给下面的服务，下面的服务一定要能处理这个路径，不能处理就是404
        backend:
          service:
            name: nginx-demo  ## java，比如使用路径重写，去掉前缀nginx
            port:
              number: 8000
```

创建完后修改本地host，将域名指定到任意节点ip，配置完后直接使用 域名 + 节点端口访问。

在访问`demo.atguigu.com:port/nginx`时，也会返回一个404，但是这其实是我们自己的 nginx pod 返回的，相当于我们在该 pod 下的访问路径是`/nginx`，导致我们看到了404页面，而不是 nginx 欢迎首页。

> 如果碰到x509证书过期，运行该命令([origin](https://blog.csdn.net/yeyslspi59/article/details/123281240))：`kubectl delete -A ValidatingWebhookConfiguration ingress-nginx-admission`

> 如果请求头含有`_`，则默认会被忽略掉，需要向config map添加`enable-underscores-in-headers: "true"`属性才可以允许此类请求头。

### 路径重写

[Rewrite](https://kubernetes.github.io/ingress-nginx/examples/rewrite/)

在上面的例子中，如果我们访问`/nginx`时，希望访问的是 pod 上的`/`路径，则需要使用到路径重写：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress  
metadata:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
  name: ingress-host-bar
spec:
  ingressClassName: nginx
  rules:
  - host: "hello.atguigu.com"
    http:
      paths:
      - pathType: Prefix
        path: "/"
        backend:
          service:
            name: hello-server
            port:
              number: 8000
  - host: "demo.atguigu.com"
    http:
      paths:
      - pathType: Prefix
        path: "/nginx(/|$)(.*)"  # 把请求会转给下面的服务，下面的服务一定要能处理这个路径，不能处理就是404
        backend:
          service:
            name: nginx-demo  ## java，比如使用路径重写，去掉前缀nginx
            port:
              number: 8000
```

# 存储抽象

## 安装nfs

```bash
# 在每个机器。
yum install -y nfs-utils


# 在master 执行以下命令 
echo "/nfs/data/ *(insecure,rw,sync,no_root_squash)" > /etc/exports


# 执行以下命令，启动 nfs 服务;创建共享目录
mkdir -p /nfs/data


# 在master执行
systemctl enable rpcbind
systemctl enable nfs-server
systemctl start rpcbind
systemctl start nfs-server

# 使配置生效
exportfs -r


#检查配置是否生效
exportfs
```

### 配置默认存储

```yaml
## 创建了一个存储类
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-storage
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: k8s-sigs.io/nfs-subdir-external-provisioner
parameters:
  archiveOnDelete: "true"  ## 删除pv的时候，pv的内容是否要备份

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
          image: registry.cn-hangzhou.aliyuncs.com/lfy_k8s_images/nfs-subdir-external-provisioner:v4.0.2
          # resources:
          #    limits:
          #      cpu: 10m
          #    requests:
          #      cpu: 10m
          volumeMounts:
            - name: nfs-client-root
              mountPath: /persistentvolumes
          env:
            - name: PROVISIONER_NAME
              value: k8s-sigs.io/nfs-subdir-external-provisioner
            - name: NFS_SERVER
              value: 172.31.0.4 ## 指定自己nfs服务器地址
            - name: NFS_PATH  
              value: /nfs/data  ## nfs服务器共享的目录
      volumes:
        - name: nfs-client-root
          nfs:
            server: 172.31.0.4
            path: /nfs/data
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nfs-client-provisioner
  # replace with namespace where provisioner is deployed
  namespace: default
---
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: nfs-client-provisioner-runner
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["persistentvolumes"]
    verbs: ["get", "list", "watch", "create", "delete"]
  - apiGroups: [""]
    resources: ["persistentvolumeclaims"]
    verbs: ["get", "list", "watch", "update"]
  - apiGroups: ["storage.k8s.io"]
    resources: ["storageclasses"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["events"]
    verbs: ["create", "update", "patch"]
---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: run-nfs-client-provisioner
subjects:
  - kind: ServiceAccount
    name: nfs-client-provisioner
    # replace with namespace where provisioner is deployed
    namespace: default
roleRef:
  kind: ClusterRole
  name: nfs-client-provisioner-runner
  apiGroup: rbac.authorization.k8s.io
---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: leader-locking-nfs-client-provisioner
  # replace with namespace where provisioner is deployed
  namespace: default
rules:
  - apiGroups: [""]
    resources: ["endpoints"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
---
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: leader-locking-nfs-client-provisioner
  # replace with namespace where provisioner is deployed
  namespace: default
subjects:
  - kind: ServiceAccount
    name: nfs-client-provisioner
    # replace with namespace where provisioner is deployed
    namespace: default
roleRef:
  kind: Role
  name: leader-locking-nfs-client-provisioner
  apiGroup: rbac.authorization.k8s.io
```

## 原生方式挂载

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: nginx-pv-demo
  name: nginx-pv-demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx-pv-demo
  template:
    metadata:
      labels:
        app: nginx-pv-demo
    spec:
      containers:
      - image: nginx
        name: nginx
        volumeMounts:
        - name: html
          mountPath: /usr/share/nginx/html
      volumes:
        - name: html
          nfs:
            server: 172.31.0.4
            path: /nfs/data/nginx-pv
```

## PV & PVC 

PV: 持久卷 (Persistent Volume)，将应用需要持久化的数据保存到指定位置。
PVC：持久卷声明（PersistentVolumeClaim）申明需要使用的持久卷规格。

### 创建PV

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv01-10m
spec:
  capacity:
    storage: 10M
  accessModes:
    - ReadWriteMany
  storageClassName: nfs
  nfs:
    path: /nfs/data/01
    server: 172.31.0.4
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv02-1gi
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteMany
  storageClassName: nfs
  nfs:
    path: /nfs/data/02
    server: 172.31.0.4
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv03-3gi
spec:
  capacity:
    storage: 3Gi
  accessModes:
    - ReadWriteMany
  storageClassName: nfs
  nfs:
    path: /nfs/data/03
    server: 172.31.0.4
```

### PVC创建与绑定

此处为静态创建，动态创建：https://zhuanlan.zhihu.com/p/655923057


创建PVC：
```yaml
kind: PersistentVolumeClaim
apiVersion: v1
metadata:
  name: nginx-pvc
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 200Mi
  storageClassName: nfs
```

创建Pod绑定PVC:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: nginx-deploy-pvc
  name: nginx-deploy-pvc
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx-deploy-pvc
  template:
    metadata:
      labels:
        app: nginx-deploy-pvc
    spec:
      containers:
      - image: nginx
        name: nginx
        volumeMounts:
        - name: html
          mountPath: /usr/share/nginx/html
      volumes:
        - name: html
          persistentVolumeClaim:
            claimName: nginx-pvc
```