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

![架构图](https://5j9g3t.site/images/2024/04/k8s-ingress.webp)


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

## 测试

使用下面的 `yaml` 创建测试应用：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-app-1
  labels:
    app: nginx-app
spec:
  containers:
  - name: my-container
    image: nginx:stable-alpine3.19
---

apiVersion: v1
kind: Pod
metadata:
  name: nginx-app-2
  labels:
    app: nginx-app
spec:
  containers:
  - name: my-container
    image: nginx:stable-alpine3.19

---
apiVersion: v1
kind: Pod
metadata:
  name: nginx-app-3
  labels:
    app: nginx-app
spec:
  containers:
  - name: my-container
    image: nginx:stable-alpine3.19
---
apiVersion: v1
kind: Service
metadata: 
  name: nginx-app-svc
spec:
  selector:
    app: nginx-app
  ports:
  - name: foo
    port: 10000
    targetPort: 80
```

创建完 nginx 后建议进入容器修改首页内容，好查看负载均衡效果。

创建 ingress：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nginx-app-ingress
spec:
  ingressClassName: nginx
  rules:
    - host: nginx-app.local.test
      http:
        paths:
          - backend:
              service:
                name: nginx-app-svc
                port:
                  number: 10000
            pathType: Prefix
            path: '/'
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

### 路径重写

[rewrite](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#rewrite)

现有如下场景：

- 访问路径以 `/api` 开头时，将请求转发到后端服务器。
- 如果以其它路径开头，将请求转发到前端服务器。

使用下面的配置即可实现：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/use-regex: "true"
    nginx.ingress.kubernetes.io/rewrite-target: /$2
  name: rewrite
  namespace: default
spec:
  ingressClassName: nginx
  rules:
  - host: rewrite.bar.com
    http:
      paths:
      - path: /api(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: http-svc
            port: 
              number: 80
```

## L4 代理传递真实IP

一般情况下，在 Ingress 的外层，还会存在一个 L4 代理，如果不做任何配置，此时获取的客户端 IP 将会是 L4 代理的 IP。

如果需要获取用户真实 IP，需要使用 Proxy Protocol。这里 L4 代理使用 nginx 做演示。

L4 代理配置：

```conf
worker_processes  1;
events {
    worker_connections  1024;
}
# 注意这里是 stream
stream {

  upstream backend {
    hash $remote_addr consistent;                            
    server 10.77.0.36:443;
    server 10.77.0.35:443;
  }

  server {
    listen 30844 so_keepalive=on;                           
    proxy_connect_timeout 10s;                              
    proxy_timeout 300s;                                            
    proxy_pass backend;
    proxy_protocol on;  # 开启 Proxy Protocol
  }

  server {
    listen 30843 so_keepalive=on;                              
    proxy_connect_timeout 10s;                                 
    proxy_timeout 300s;                                             
    proxy_pass backend;
    proxy_protocol on;  # 开启 Proxy Protocol
  }

}
```

此时需要同时配置 Ingress，也让它开启 Proxy Protocol。这个协议要么用，要么不用，接受者和使用者都不会去猜测你是否使用了 Proxy Protocol，如果两者的协议不一致，连接一般会被直接重置(Connection Reset).

之后打开 ingress-nginx 的配置，添加下面的内容：

```json
{
  # 设置你 L4 代理的 Ip Cdir
	"proxy-real-ip-cidr": "10.77.0.0/24",
  # 设置额外的 携带IP的 请求头 (命名空间/ConfigMap名称)
	"proxy-set-headers": "ingress-nginx/proxy-protocol-custom-headers",
  # 开启 Proxy Protocol
	"use-proxy-protocol": "true"
}
```
之后在创建一个和 `proxy-set-headers` 对应的 ConfigMap，使用下面的配置：

```json
{
	"X-Forwarded-For": "$proxy_protocol_addr"
}
```

这里的参数是用了 [realip_module](https://nginx.org/en/docs/http/ngx_http_realip_module.html)

在业务中，直接获取 `X-Forwarded-For` 请求头就可以获取客户端真实 ip 了。

### 会话保持-Session亲和性

[session-affinity](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#session-affinity)

当客户端第一次访问时，ingress-nginx 会返回给浏览器一个 Cookie，之后浏览器只需要带着 Cookie 就可以保证后面的访问的 Pod 都是同一个。

只需要在 yaml 中添加一个注解即可实现：
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: session-affinity
  namespace: default
  annotations: 
    nginx.ingress.kubernetes.io/affinity: "cookie"
```

默认会在客户端创建一个名称为 `INGRESSCOOKIE` 的 Cookie，可以通过注解 `nginx.ingress.kubernetes.io/session-cookie-name` 修改。

## 配置SSL

Ingress 可以非常简单的配置 SSL。

首先使用 `Secret` 保存 SSL 证书：
```bash
kubectl create secret tls ssl-name --key your-key.key --cert your-cert.cert
```

之后在 Ingress 配置中使用证书：
```yaml
spec:
  tls:
    - hosts:
      - yourhost.com
      secretName: ssl-name
```


## 常用文档

- [全局配置文件](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/)
- [添加请求头](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/)
- [金丝雀部署](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#canary)

# 网络策略

[网络策略](https://kubernetes.io/zh-cn/docs/concepts/services-networking/network-policies/)

Pod 之间互通，是通过如下三个标识符的组合来辨识的：

1. 其它被允许的Pods（例外：Pod无法阻塞对自身的访问）
2. 被允许的名称空间
3. IP组块（例外：与Pod运行所在的节点的通信总是被允许的，无论Pod或节点的IP地址）

![Pod网络策略](https://5j9g3t.site/images/2024/05/QQ%E6%88%AA%E5%9B%BE20240521225315.webp)

默认情况下，Pod网络都是非隔离的（non-isolated），可以接受来自任何请求方的网络请求。如果一个 `NetworkPolicy` 的标签选择器选中了某个 `Pod`，则该 `Pod` 将变成隔离的（isolated），并将拒绝任何不被 `NetworkPolicy`许可的网络连接。

`NetworkPolicy` 是每个命名空间独有的。

下面一个创建网络策略的例子：

```yaml
apiVersion: v1
kind: Ingress
metadata:
  name: networkpol
  namespace: default
spec:
  # pod 选择器，必填
  podSelector: 
    matchLabels:
      name: busybox
  # 策略类型
  policyTypes:
    # 入站规则
    - "Ingress"
    # 出站规则
    - "Egress"
  # 入站白名单
  ingress:
    # 哪些资源可以访问
    from: 
      # 哪些命名空间可以访问，不填为所有命名空间
      - namespaceSelector: <LabelSelector>
      # 只有选中的Pod才能访问，如果指定了namespaceSelector，只会选中对应名称空间的Pod，否则则是当前命名空间的Pod
      - podSelector: <LabelSelector>
    # 可以访问Pod的哪些端口
    ports:
      - 80
  # 出站白名单
  egress:
    # 同spec.ingress.from
    to: <[]NetworkPolicyPeer>
    ports:
      # 限制出流量能够访问的端口，例如这里配的80，则只能访问外网服务的80端口
      - port: 80
```

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

可以用我的镜像学习用一下：

- `ccr.ccs.tencentyun.com/icebing-repo/nginxinc-nginx-gateway-fabric:1.2.0`
- `ccr.ccs.tencentyun.com/icebing-repo/nginxinc-nginx-gateway-fabric-nginx:1.2.0`

