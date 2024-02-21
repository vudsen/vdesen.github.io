---
title: 核心
date: 2024-02-12 21:25:40
categories: 
  data:
    - { name: "k8s", path: "/2024/02/k8s" }
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

![k8s工作负载](https://selfb.asia/images/2024/02/k8s-workload.webp)

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

![k8s-svc](https://selfb.asia/images/2024/02/k8s-svc.webp)

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

![ingress](https://selfb.asia/images/2024/02/ingress.webp)