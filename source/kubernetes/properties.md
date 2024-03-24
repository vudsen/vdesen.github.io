---
title: 常用yaml属性
date: 2024-03-14 22:34:21
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---

本篇只讲`spec`下的属性用法。

# Deployment

## revisionHistoryLimit

旧的ReplicaSet的最大保存数量，默认是 10

## progressDeadlineSeconds

[进度期限秒数](https://kubernetes.io/zh-cn/docs/concepts/workloads/controllers/deployment/#progress-deadline-seconds)

部署的最终期限，如果一次部署超过该时间，则会直接失败，同时会在失败原因中添加 ProgressDeadlineExceeded，如果部署由于某些原因导致容器崩溃，deployment也会在该时间内不断重试，直到时间结束，时间结束后，部署就会停止，默认是 600 秒。


## paused

暂停部署，被暂停的部署不会主动产生RS。

可以使用命令暂停一个部署：
```bash
kubectl rollout pause <deployment>
```

## minReadySeconds

[最短就绪时间](https://kubernetes.io/zh-cn/docs/concepts/workloads/controllers/deployment/#min-ready-seconds)

最短就绪时间(单位：秒)，Pod在创建后并经过该秒数后才会被认定为**可用**(是可用，而不是就绪，就绪靠容器探针来决定)，默认是0。

## strategy

指定新Pod如何来替换旧Pod的策略。

```yaml
spec:
    strategy:
        // 使用重新创建(一口气全部删了重创) / 滚动更新(每次只删一部分) 
        type: Recreate / RollingUpdate
        // 如果使用滚动更新，则可以使用该参数进行更详细的配置
        rollingUpdate: 
            // 一次最多新创几个Pod，可以写具体的数量，也可以写百分比，例如 20%
            maxSurge: <IntOrString>

            // 最大不可用数量，同样也可以写具体的数量或者百分比
            // 例如有 100 个副本，最大不可用为 30%，
            // 即算上新创的和旧的 Pod 一起，最少得有 70 个副本在集群中
            // 即一口气最多杀 30 个 Pod
            maxUnavailable: <IntOrString>

```

# Pod

## containers

### lifecycle

容器的声明周期钩子，可以在容器启动后(`postStart`)和容器停止前(`preStop`)来进行相关操作。

两种所能用的参数相同，都是`LifecycleHandler`。

```yaml
spec:
    containers:
        - lifecycle:
            postStart:
                // 执行一连串指令，指令只会被简单执行，无法使用管道符等特殊符号
                // 如果有特殊需求，需要自己调用shell脚本来使用
                exec: 
                    command: <string[]>

                // 发送一个 GET 请求
                httpGet:
                    // 要连接的host，默认是当前 Pod 的 ip，一般不用填
                    host: <string>
                    // 请求头
                    httpHeaders: <[]HTTPHeader>
                        - name: Accept
                        - value: application/json
                    // 请求路径
                    path: <string>
                    // 端口号，也可以直接使用服务的名称
                    port: <IntOrString>
                    // 协议
                    scheme: <'HTTP' | 'HTTPS'>

                // 新版本已经标记为废弃，未来将会移除
                tcpSocket: <TCPSocketAction>
                
```

### probe

[容器探针](https://kubernetes.io/zh-cn/docs/concepts/workloads/pods/pod-lifecycle/#container-probes)

探针有三种：
- `startupProbe`：启动探针

    指示容器中的应用是否已经启动。如果提供了启动探针，则所有其他探针都会被 禁用，直到此探针成功为止。如果启动探测失败，kubelet 将杀死容器， 而容器依其重启策略进行重启。 如果容器没有提供启动探测，则默认状态为 Success。

- `readinessProbe`：就绪探针

    指示容器是否准备好为请求提供服务。如果就绪态探测失败， 端点控制器将从与 Pod 匹配的所有服务的端点列表中删除该 Pod 的 IP 地址。 初始延迟之前的就绪态的状态值默认为 Failure。 如果容器不提供就绪态探针，则默认状态为 Success。

- `livenessProbe`：存活探针

    指示容器是否正在运行。如果存活态探测失败，则 kubelet 会杀死容器， 并且容器将根据其重启策略决定未来。如果容器不提供存活探针， 则默认状态为 Success。


三者能使用的参数相同，都是`Probe`。

```yaml
spec:
    containers:
        - startupProbe:
            // 执行一连串指令，如果指令返回码为 0，则代表成功
            exec:
                command: <string[]>

            // 当失败多少次后，标记当前探针探测失败，默认是 3
            failureThreshold: <integer>

            // 调用一个 grpc 接口
            grpc: <GRPCAction>
                // 端口
                port: <integer>
                // 服务名称 
                // https://github.com/grpc/grpc/blob/master/doc/health-checking.md
                service: <string>

            httpGet: 
                // 要连接的host，默认是当前 Pod 的 ip
                host: <string>
                // 请求头
                httpHeaders: <[]HTTPHeader>
                    - name: Accept
                    - value: application/json
                // 请求路径
                path: <string>
                // 端口号，也可以直接使用服务的名称
                port: <IntOrString>
                // 协议
                scheme: <'HTTP' | 'HTTPS'>

            // 容器启动后多少秒才开始检测
            initialDelaySeconds: <integer>

            // 每多少秒探测一次，默认是 1
            periodSeconds: <integer>

            // 探测到几次成功后才算真正的成功，默认是 1
            successThreshold: <integer>

            tcpSocket:
                // 端口，可以指定为服务名称
                port: <IntOrString>
                // 要访问的host，默认是当前pod ip
                host: <string>

            // Pod最长停止时间，如果超过该时间，Pod将会被强制杀死，默认是 1
            terminationGracePeriodSeconds: <integer>

            // 探针每次执行的超时时间，默认是 1
            timeoutSeconds: <integer>
```

# StatefulSet

Deployment 可用的，StatefulSet 也都可以使用。

## podManagementPolicy

Pod 管理策略，用于控制 Pod 创建以及扩缩容策略。

可以使用下面两个值：
- `OrderedReady`：默认，从pod-0开始创建，然后pod-1、pod-2、... (删除时则是倒着删除)。
- `Parallel`：并行创建，所有 Pod 一口气创建。

## updateStrategy

更新策略。

```yaml
spec:
    updateStrategy:
        # 可选值: `RollingUpdate` 滚动更新(默认)或者 `OnDelete`
        type: <string>

        # 如果使用滚动更新，则可以使用下面的配置
        rollingUpdate:
            # 分区升级，例如该值为 2，则更新时只会更新索引值大于等于 2 的 pod
            partition: <integer>
            # 最大不可用
            maxUnavailable: <IntOrString>

```