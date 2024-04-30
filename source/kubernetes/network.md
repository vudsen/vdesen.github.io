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

## 无头服务

无头服务除了可以给有状态副本集使用外，还有一些其它的用处。

> [无头服务](https://kubernetes.io/zh-cn/docs/concepts/services-networking/service/#headless-services)

### 配置外部资源

由于数据库等对性能等要求比较高的中间件，一般都不会容器化部署，而且一般会有很多服务使用同一个数据库。

虽然可以直接在配置文件中直接指定数据库的 Ip 地址，但是一旦发生变动，每个服务都需要跟着改动。

此时就可以使用无头服务，**每个配置文件只需要配置成服务的名称就可以访问数据库，而不需要关心数据库具体是哪个 Ip 地址**。

创建一个无头服务：

```yaml
apiVersion: v1
kind: Service
metadata: 
  name: db-svc
spec:
  clusterIP: None
  ports:
  - name: foo
    port: 10000

---
kind: Endpoints
apiVersion: v1
metadata:
  name: db-svc
subsets:
  - addresses:
      - ip: 192.168.11.13 # 任意外网地址
    ports:
      - port: 3306 # 端口
```

> `Endpoints` 和 `Service` 名字和命名空间必须相同。

使用 `Endpoints` 搭配 `Service` 使用，即可完成我们的需求。

而且相比于直接配置 `Service` 的 `externalName`，这里可以配置多个 Ip，并且自带负载均衡。

# Ingress

为什么需要 Ingress：

- Service 可以使用 NodePort 暴露集群外访问端口，但是性能低下不安全
- 缺少在 *应用层* 的统一访问入口

> Ingress目前已停止更新。新的功能正在集成至[网关 API](https://kubernetes.io/zh-cn/docs/concepts/services-networking/gateway/) 中。

![架构图](https://selfb.asia/images/2024/04/k8s-ingress.webp)


## 安装 Ingress Nginx

[Ingress Nginx 文档](https://kubernetes.io/zh-cn/docs/concepts/services-networking/gateway/)

`Ingress Nginx` 是由 K8s 官方团队制作的，专门用于适配 Nginx 的组件。

还有一款产品叫 `Nginx Ingress`，它是 Nginx 官方做的，分为开源版和 `Nginx Plus` 版(**收费**)。

打开文档，下载 yaml 并编辑：https://kubernetes.github.io/ingress-nginx/deploy/#bare-metal-clusters

需要做如下修改：

- 将名称为`ingress-nginx-controller`的服务的类型(spec.type)改为 `ClusterIp`。
- 将名称为`ingress-nginx-controller`的部署的类型(kind)从 `Deploy` 改为 `DaemonSet`，并且将网络模式改为主机模式(`spec.template.spec.hostNetwork` = `true`)。
- 修改镜像连接：
  - `registry.aliyuncs.com/google_containers/nginx-ingress-controller:v1.8.1`
  - `registry.aliyuncs.com/google_containers/kube-webhook-certgen:v20230407`

> 实际有很多种部署方式，可以按需求使用：[裸金属服务器部署建议](https://kubernetes.github.io/ingress-nginx/deploy/baremetal)
> 一般有下面几种：
> - 使用 MetalLB 做 LoadBalancer
> - Pod 使用主机网络模式
> - 使用 NodePort 暴露 nginx-controller 服务
> - 使用 NodePort 暴露业务服务，然后使用某个能够对外暴露的负载均衡器进行负载均衡

## Ingress 配置

`Ingress Nginx` 安装完后，它会自动监听我们的 Ingress 配置并实时应用，我们只需要配置 Ingress 就可以了。

> 可以声明多个 Ingress，每个 Ingress 会合并，而不是覆盖。

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress  
spec:
  # 如果只需要暴露一个http和https端口，直接填默认的 `nginx` 就行，如果需要配置多个端口，则需要特殊处理
  ingressClassName: <string>

  # 默认后端服务, 如果没有路径匹配，则使用默认服务
  defaultBackend: IngressBackend

  # 定义转发规则
  rules: 
    # 访问域名
    - host: <string>
      http: 
        # 定义具体访问路径
        paths: <[]HTTPIngressPath>
        
          # 指定后端
          backend: <IngressBackend>
            # 使用后端服务
            service:
              # 服务名称
              name: <string>
              port: 
                # 名称，不填使用端口号作为名称
                name: <string>
                # 使用服务的哪个端口
                number: <number> 

            # 使用后端资源
            resource: <TypedLocalObjectReference>

          # 精确匹配/自定义匹配(由ingress-class实现)/前缀匹配
          pathType: Exact/ImplementationSpecific/Prefix

          # 访问路径
          path: <string>
          

  # 定义安全链接
  tls: IngressTLS[]
```

## 添加注解

[Annotations](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations)

在 Ingress 的 `metadata.annotations` 中可以配置一系列注解，可以通过注解开启一些高级功能。

```yaml
kind: Ingress
metadata:
  name: my-ingress
  annotations:
    # 限制每秒最多只能处理一个请求
    nginx.ingress.kubernetes.io/limit-rps: "1"
```

注意文档中虽然有些注解要求的是 `number` 类型，**但是在配置文件中，仍然要写成字符串**。

## 常用文档

- [全局配置文件](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/)
- [添加请求头](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/)

# 网关 API

[文档](https://gateway-api.sigs.k8s.io/guides/)

根据文件应用一个 yaml 后，将会创建 4 个自定义资源：

```shell
[root@k8s-main api-gateway]# kubectl apply -f standard-install.yaml 
customresourcedefinition.apiextensions.k8s.io/gatewayclasses.gateway.networking.k8s.io created
customresourcedefinition.apiextensions.k8s.io/gateways.gateway.networking.k8s.io created
customresourcedefinition.apiextensions.k8s.io/httproutes.gateway.networking.k8s.io created
customresourcedefinition.apiextensions.k8s.io/referencegrants.gateway.networking.k8s.io created
```

之后需要选择 API 网关的实现类，可以在这里找到：[implementations](https://gateway-api.sigs.k8s.io/implementations)

这里我用的是 [nginx-gateway-fabric](https://docs.nginx.com/nginx-gateway-fabric)

照着文档直接部署即可，后面会有一个 deploy 里面，有两个镜像都用了 ghcr.io 里面的，这个域名国内是访问不到的，我这里是搭梯子拉下来然后推送到私有仓库里面了。