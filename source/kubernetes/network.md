---
title: K8s网络
date: 2024-04-08 19:59:15
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---


# Service

负载均衡服务。让一组 Pod 可以被别人进行服务发现。

Service 可以选中一组 Pod，访问 Pod 只需要访问 Service。Service 还会基于 Pod 的探针机制 (ReadinessProbe) 完成 Pod 的自动剔除和上线。

## 常用配置

> kubectl explain svc.spec

```yaml
spec:
  # 服务类型.
  # ClusterIP(默认): 集群ip，仅集群内可以访问.
  # NodePort: 节点端口，在每个节点上打通一个端口给外部访问
  # LoadBalancer: 负载均衡，由云服务厂商提供
  # ExternalName：将该服务指向另外一个域名(返回一个CNAME记录)
  type: <string>

  # 外部访问策略.
  # Cluster(默认): 外部访问时，将随机路由到所有端点，但是会丢失客户端源 IP 地址
  # Local：外部访问时，只路由到对应节点上的端点，如果没有，则访问失败，可以客户端保留源 IP 地址，但是失去了部分负载均衡功能.
  externalTrafficPolicy: <string>

  # 该服务选中哪些 Pod
  selector: <map[string]string>

  # 是否发布未就绪的 Pod, 默认为 false
  publishNotReadyAddresses: <boolean>

  # 服务和 Pod 的端口
  ports: <[]ServicePort>

  # 使用负载均衡时，允许哪些客户端 IP 访问
  loadBalancerSourceRanges: <[]string>

  # 是否允许负载均衡服务的节点端口分配，默认为 true
  # https://kubernetes.io/zh-cn/docs/concepts/services-networking/service/#load-balancer-nodeport-allocation
  allocateLoadBalancerNodePorts: <boolean>

  # 负载均衡 ip
  loadBalancerIP: <string>

  # 负载均衡的实现类
  loadBalancerClass: <string>

  # 指定服务的健康检查端口，仅在使用 LoadBalancer，并且 externalTrafficPolicy 为 Local 时有效.
  healthCheckNodePort: <integer>

  # 双栈协议 https://kubernetes.io/zh-cn/docs/concepts/services-networking/dual-stack/
  ipFamilyPolicy: <string>    

  # IPFamilies. 可选 IPv4 和 IPv6 
  ipFamilies: <[]string>

  # 内部通信策略
  # Cluster(默认): Pod 访问 Service 时将随机路由到所有端点
  # Local：Pod 访问 Service 时只会路由到当前节点的端点，如果没有，则无法访问
  internalTrafficPolicy: <string>

  # 指定 CNAME 的值，仅在 type 为 ExternalName 时有效
  externalName: <string>

  # 允许哪些 IP 地址可以访问
  externalIPs: <[]string>

  # 当前服务被分配的 IP 地址
  clusterIP: <string>

  # 当前服务被分配的 IP 地址, 第一个 IP 地址的值必须和 clusterIP 相同.
  clusterIPs: <[]string>

  # 见下面 #[Service 会话保持]
  sessionAffinityConfig: 
  sessionAffinity: <string>
```

## Service 会话保持

当 Service 下拥有多个端点时，使用会话保持技术，可以让某个客户端的流量尽量只发送到指定的某一个端点上。

使用 `spec.sessionAffinity: ClientIP` 以开启会话保持，该配置下将以客户端的IP 作为用户标识。

可用配置如下：

```yaml
spec:
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: <integer>
```

- `timeoutSeconds`: 每个会话最多保持多久(单位：秒)，默认为 3 小时，即 3 小时内如果没有访问，则清空对应的会话状态。

## Pod 的 DNS


```yaml
apiVersion: v1
kind: Service
metadata: 
  name: default-subdomain
spec:
  selector:
    name: busybox
  clusterIP: None
  ports:
  - name: foo
    port: 1234
    targetPort: 1234
---
apiVersion: v1
kind: Pod
metadata:
  name: busybox1
  labels:
    name: busybox
  spec:
    hostname: busybox-1 ### 每个 Pod 指定主机名
    subdomain: default-subdomain ### subdomain 为对应 Service 的名称
    containers:
      - image: busybox: 1.28
        command:
          - sleep
          - "3600"
        name: busybox
---
apiVersion: v1
kind: Pod
metadata:
  name: busybox2
  labels:
    name: busybox
  spec:
    hostname: busybox-2
    subdomain: default-subdomain
    containers:
      - image: busybox: 1.28
        command:
          - sleep
          - "3600"
        name: busybox
```

- 访问 busybox-1.*default-subdomain*.default.svc.cluster.local 可以访问到 busybox-1。
- 访问 Service
  - 同名称空间
    - 使用 `service-name`
  - 不同命名空间
    - 使用 `service-name.namespace`
- 访问 Pod
  - 同命名空间
    - 使用 `pod-host-name.service-name`
  - 不同命名空间
    - 使用 `pod-host-name.service-name.namespace`