---
title: 高级
date: 2024-03-18 22:24:10
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---


# DaemonSet

DaemonSet 控制器确保所有 (或一部分，默认主节点除外) 的节点都运行了一个指定的 Pod 副本。

- 每当向集群中添加一个节点时，指定的 Pod 副本也将添加到该节点上
- 当节点从集群中移除时，Pod也就被垃圾回收了
- 删除一个 DaemonSet 可以清理所有由其创建的 Pod

典型使用场景有：

- 在每个节点上运行集群的存储守护进程，例如glusterd、ceph
- 在每个节点上运行日志收集守护进程，例如fluentd、logstash
- 在每个节点上运行监控守护进程，例如PrometheusNodeExporter、SysdigAgent、collectd、DynatraceOneAgent、APPDynamics Agent、Datadog agent、New Relic agent、Ganglia gmond、Instana Agent 等

> DaemonSet 简称 ds

```bash
[root@k8s-main dashboard]# kubectl explain ds.spec
GROUP:      apps
KIND:       DaemonSet
VERSION:    v1

FIELD: spec <DaemonSetSpec>

DESCRIPTION:
    The desired behavior of this daemon set. More info:
    https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status
    DaemonSetSpec is the specification of a daemon set.
    
FIELDS:
  minReadySeconds       <integer>
    The minimum number of seconds for which a newly created DaemonSet pod should
    be ready without any of its container crashing, for it to be considered
    available. Defaults to 0 (pod will be considered available as soon as it is
    ready).

  revisionHistoryLimit  <integer>
    The number of old history to retain to allow rollback. This is a pointer to
    distinguish between explicit zero and not specified. Defaults to 10.

  selector      <LabelSelector> -required-
    A label query over pods that are managed by the daemon set. Must match in
    order to be controlled. It must match the pod template's labels. More info:
    https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors

  template      <PodTemplateSpec> -required-
    An object that describes the pod that will be created. The DaemonSet will
    create exactly one copy of this pod on every node that matches the
    template's node selector (or on every node if no node selector is
    specified). The only allowed template.spec.restartPolicy value is "Always".
    More info:
    https://kubernetes.io/docs/concepts/workloads/controllers/replicationcontroller#pod-template

  updateStrategy        <DaemonSetUpdateStrategy>
    An update strategy to replace existing DaemonSet pods with new pods.
```

`spec`下所有的属性都和 Deployment 可用的属性一样，但是不能指定副本数量，因为默认会为每个 Node 部署一个。

# StatefulSet

有状态副本集。

> 无状态应用：网络可能会变(ip)，存储可能会变，顺序可能会变(例如三个Mysql，一个主节点，要求主节点必须先启动，但无状态应会随机启动)
> 
> 有状态应用：网络不变，存储不变，顺序不变

有如下需求的应用程序，StatefulSet 非常适用：

- 稳定、唯一的网络标识（dnsname)
    - StatefulSet 通过与其相关的无头服务为每个pod提供DNS解析条目。假如无头服务的DNS条目为：`$(service name).$(namespace).svc.cluster.local`,那么pod的解析条目就是`$(pod name).$(service name).$(namespace).svc.cluster.local`，每个pod name也是唯一的。
- 稳定的、持久的存储：【每个Pod始终对应各自的存储路径（PersistantVolumeClaimTemplate）】
- 有序的、优雅的部署和缩放。【按顺序地增加副本、减少副本，并在减少副本时执行清理】
- 有序的、自动的滚动更新。【按顺序自动地执行滚动更新】


## 创建 StatefulSet

使用下面的 yaml 创建 StatefulSet：
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: stateful-nginx
  namespace: default
spec:
  selector:
    matchLabels:
      app: ss-nginx 
  # 指定加入到哪一个网络中
  serviceName: "nginx"
  replicas: 3 
  template:
    metadata:
      labels:
        app: ss-nginx 
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
          name: web 
---
apiVersion: v1
kind: Service
metadata:
  name: nginx
  namespace: default
spec:
  selector:
    app: ss-nginx
  type: ClusterIP
  # 指定为无头服务
  clusterIP: None
  ports:
  - name: nginx
    protocol: TCP
    port: 80
    targetPort: 80
```

启动完成后查看 Pod：
```bash
[root@k8s-main statefulSet]# kubectl get pods -owide
NAME                                      READY   STATUS    RESTARTS        AGE     IP               NODE        NOMINATED NODE   READINESS GATES
stateful-nginx-0                          1/1     Running   0               6m13s   172.16.36.122    k8s-node1   <none>           <none>
stateful-nginx-1                          1/1     Running   0               5m53s   172.16.169.143   k8s-node2   <none>           <none>
stateful-nginx-2                          1/1     Running   0               5m35s   172.16.36.104    k8s-node1   <none>           <none>
```

可以发现如下几点：
- StatefulSet 创建的 Pod，名称都是有规律的从 0 开始递增，并且在创建时，也会先从 0 开始创建。
- StatefulSet 创建的 Pod 虽然有自己的 Ip，**但并不是固定的**，删除 Pod 后会发现 Ip会变化。

之后使用 `nslookup` 解析域名：

```bash
[root@k8s-main yum.repos.d]# nslookup nginx.default.svc.cluster.local 10.96.0.10
Server:         10.96.0.10
Address:        10.96.0.10#53

Name:   nginx.default.svc.cluster.local
Address: 172.16.36.122
Name:   nginx.default.svc.cluster.local
Address: 172.16.169.143
Name:   nginx.default.svc.cluster.local
Address: 172.16.36.104
```

可以发现，当我们不指定 Pod 名称时，此时会通过 DNS 做负载均衡，客户端会随机访问一个 Pod，并且把解析结果缓存。

当指定 Pod 后：
```bash
[root@k8s-main yum.repos.d]# nslookup stateful-nginx-1.nginx.default.svc.cluster.local 10.96.0.10
Server:         10.96.0.10
Address:        10.96.0.10#53

Name:   stateful-nginx-1.nginx.default.svc.cluster.local
Address: 172.16.169.143
```

## Headless Service

[无头服务](https://kubernetes.io/zh-cn/docs/concepts/services-networking/service/#headless-services)


当服务不需要负载均衡，也不需要单独的 Service IP时，可以通过显式设置集群 IP (spec.clusterIP) 的值为 "None" 来创建无头服务(Headless Service)。

无头服务的作用是为 Pod 提供一个固定的地址，应用场景：

- 希望直接在应用侧做负载均衡，而不是通过 kube-proxy 实现负载均衡。
- 数据库主从部署，要求主节点 Ip 必须固定。

指定无头服务后，可以通过全地址访问：`$(podName).$(serviceName).$(namespace).svc.cluster.local`

# Job

Kubernetes 中的 Job 对象将创建一个或多个 Pod，并确保指定数量的 Pod 可以成功执行到进程正常结束：

- 当 Job 创建的 Pod 执行成功并正常结束时，Job 将记录成功结束的 Pod 数量。
- 当成功结束的 Pod 达到指定的数量时，Job 将完成执行。
- 删除 Job 对象时，将清理掉由 Job 创建的 Pod。

创建一个Job：

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: job-01
  namespace: default
  labels:
    app: job-01
spec:
  template: # Pod 模板
    metadata: 
      name: pod-job-test
      labels:
        app: job-01
    spec:
      restartPolicy: Never
      containers:
      - name: job-01
        image: busybox
        command: ['sh', '-c', '"sleep 5s;echo \"done\""']
  # 最大失败次数
  backoffLimit: 4
  # Pod 最大执行时间
  activeDeadlineSeconds: 100
  # Pod 运行成功几次才算成功
  completions: 4
  # Pod 并行数
  parallelism: 2
  ttlSecondsAfterFinished:
    # 在job执行完成后多久，自动删除Pod, 单位为妙，设置为0时将会理解删除
    ttlSecondsAfterFinished: 0
```

