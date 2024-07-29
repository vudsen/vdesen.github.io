---
title: 高可用集群 P2
date: 2024-07-18 23:09:15
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---


# TLS 与引导启动原理

[TLS 启动引导](https://kubernetes.io/zh-cn/docs/reference/access-authn-authz/kubelet-tls-bootstrapping/)

在 K8s 中，为了简化证书的生成，kubelet 可以主动请求 api-server 来为自己颁发证书。

> 官网讲的比我更详细，建议跟着官网走，这里仅供参考。

## 配置 kube-apiserver

### 配置令牌认证文件

需要生成一个令牌，令牌可以为任意数据，但推荐使用下面的命令生成：

```sh
head -c 16 /dev/urandom | od -An -t x | tr -d ' '
```

上面的命令会生成类似于 `cdbe50bd844b6952cd197899bac486d9` 的令牌，之后组装成令牌文件：

```text
cdbe50bd844b6952cd197899bac486d9,kubelet-bootstrap,10001,"system:bootstrappers"
```

> 具体格式为：令牌，用户名，用户UID，用户组(多个使用双引号括起来)

之后修改 kube-apiserver 参数，添加 `--token-auth-file=FILENAME` 标志，然后重启：

```sh
systemctl daemon-reload && systemctl restart kube-apiserver && systemctl status kube-apiserver
```

### 给授权用户组

配置好 kubectl 命令的认证文件后(`~/.kube/config`，可以直接复制 `/etc/kubernetes/admin.conf`)，应用下面的 yaml：

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: create-csrs-for-bootstrapping
subjects:
- kind: Group
  name: system:bootstrappers
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: system:node-bootstrapper
  apiGroup: rbac.authorization.k8s.io
```

即使没有任何节点，这个文件也是可以直接应用的。

## 配置 kube-controller-manager

由于签发证书是 `kube-controller-manager` 实现的，所以必须保证启动时配置了合法的 `--cluster-signing-cert-file` 和 `--cluster-signing-key-file`。

应用下面的 yaml，第一个是允许新节点自动生成新的证书：

```yaml
# 批复 "system:bootstrappers" 组的所有 CSR
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: auto-approve-csrs-for-group
subjects:
- kind: Group
  name: system:bootstrappers
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: system:certificates.k8s.io:certificatesigningrequests:nodeclient
  apiGroup: rbac.authorization.k8s.io
```

这个是允许节点对证书进行续期：

```yaml
# 批复 "system:nodes" 组的 CSR 续约请求
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: auto-approve-renewals-for-nodes
subjects:
- kind: Group
  name: system:nodes
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: system:certificates.k8s.io:certificatesigningrequests:selfnodeclient
  apiGroup: rbac.authorization.k8s.io
```

## kubelet 配置

[kubelet](https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kubelet/)

在执行前需要节点中准备签发 apiserver 证书的 CA 证书：

```sh
ssh k8s-node-1 "mkdir -p /etc/kubernetes/pki; mkdir -p /etc/kubernetes/manifests"
scp /etc/kubernetes/pki/ca.crt root@k8s-node-1:/etc/kubernetes/pki/ca.crt
```


创建一个 `kubelet context`：

```sh
kube=/etc/kubernetes/bootstrap-kubeconfig
KUBECONFIG=$kube kubectl config set-context default-auth@kubernetes --cluster=kubernetes --user=default-auth

# 注意 server 配负载均衡地址
KUBECONFIG=$kube kubectl config set-cluster kubernetes \
    --certificate-authority=/etc/kubernetes/pki/ca.crt \
    --embed-certs=true \
    --server=https://192.168.1.34:6443 

KUBECONFIG=$kube kubectl config set-credentials default-auth \
    --cluster=kubernetes \
    --token=cdbe50bd844b6952cd197899bac486d9

KUBECONFIG=$kube kubectl config use-context default-auth@kubernetes
```

在启动 kubelet 前，要准备好 containerd 的配置，因为默认这个东西是禁用 cri 的：

```sh
containerd config default > /etc/containerd/config.toml
```

然后修改 `sandbox_image` 为 `registry.cn-hangzhou.aliyuncs.com/google_containers/pause:<your_version>`。

创建 kubelet 配置文件(`/etc/kubernetes/kubelet-conf.yaml`)：

```yaml
# clusterDNS 为 service 网络的第 10 个 ip 值，如 10.96.0.10
cat << EOF > /etc/kubernetes/kubelet-conf.yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
address: 0.0.0.0
port: 10250
readOnlyPort: 10255
serializeImagePulls: false
authentication:
  anonymous:
    enabled: false
  webhook:
    cacheTTL: 2m0s
    enabled: true
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt
authorization:
  mode: Webhook
  webhook:
    cacheAuthorizedTTL: 5m0s
    cacheUnauthorizedTTL: 30s
cgroupDriver: systemd
clusterDNS:
  - 10.96.0.0
clusterDomain: cluster.local
staticPodPath: /etc/kubernetes/manifests
EOF
```

所有的配置文档可以在这里找到：[KubeletConfiguration](https://kubernetes.io/zh-cn/docs/reference/config-api/kubelet-config.v1beta1/#kubelet-config-k8s-io-v1beta1-KubeletConfiguration)。




创建 kubelet 服务并启动：

```sh
cat << EOF > /usr/lib/systemd/system/kubelet.service
[Unit]
Description=Kubernetes Kubelet
Documentation=
After=containerd.service
Requires=containerd.server

[Service]
ExecStart=/usr/local/bin/kubelet  \\
  --bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubeconfig \\
  --kubeconfig=/etc/kubernetes/kubeconfig \\
  --config=/etc/kubernetes/kubelet-conf.yaml

Restart=on-failure
RestartSec=10s
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now kubelet

systemctl status kubelet
```

`--kubeconfig` 所指向的文件并不需要存在，只需要它是一个合法的路径即可，这个文件会被自动生成。

所有节点执行完成后，就可以看到节点状态了：

```sh
[root@k8s-master-1 kubernetes]# kubectl get nodes
NAME           STATUS     ROLES    AGE     VERSION
k8s-master-1   NotReady   <none>   92s     v1.29.6
k8s-master-2   NotReady   <none>   3m18s   v1.29.6
k8s-master-3   NotReady   <none>   2m28s   v1.29.6
k8s-node-1     NotReady   <none>   46m     v1.29.6
k8s-node-2     NotReady   <none>   7m8s    v1.29.6
k8s-node-3     NotReady   <none>   4m31s   v1.29.6
```

# kube-proxy 启动

## 生成 kube-proxy.conf

在主节点执行：

```bash
# 创建 kube-proxy 的服务账号
kubectl -n kube-system create serviceaccount kube-proxy

# 创建角色绑定
kubectl create clusterrolebinding system:kube-proxy \
  --clusterrole system:node-proxier \
  --serviceaccount kube-system:kube-proxy

# 创建长效 API 令牌
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: kube-proxy-secret
  namespace: kube-system
  annotations:
    kubernetes.io/service-account.name: kube-proxy
type: kubernetes.io/service-account-token
EOF

# 导出为变量，方便后续使用
JWT_TOKEN=$(kubectl get -n kube-system secret/kube-proxy-secret --output=jsonpath='{.data.token}' | base64 --decode)
KUBECONFIG=/etc/kubernetes/kube-proxy.conf

# 创建配置文件
kubectl config set-context kube-proxy@kubernetes \
  --cluster=kubernetes \
  --user=kube-proxy \
  --kubeconfig=$KUBECONFIG

kubectl config set-cluster kubernetes \
  --certificate-authority=/etc/kubernetes/pki/ca.crt \
  --embed-certs=true \
  --server=https://192.168.1.34:6443 \
  --kubeconfig=$KUBECONFIG

kubectl config set-credentials kube-proxy \
  --token=$JWT_TOKEN \
  --kubeconfig=$KUBECONFIG

kubectl config use-context kube-proxy@kubernetes --kubeconfig=$KUBECONFIG
```


创建配置文件([kube-proxy 配置 (v1alpha1) 资源类型](https://kubernetes.io/zh-cn/docs/reference/config-api/kube-proxy-config.v1alpha1/))：

```yaml
cat << EOF > /etc/kubernetes/kube-proxy.yaml
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration
mode: ipvs
bindAddress: 0.0.0.0
oomScoreAdj: -999

clientConnection:
  contentType: application/vnd.kubernetes.protobuf
  kubeconfig: /etc/kubernetes/kube-proxy.conf
clusterCIDR: 196.16.0.0/16 # Pod cidr
configSyncPeriod: 15m0s
conntrack:
  min: 131072
  tcpEstablishedTimeout: 30m0s
  tcpCloseWaitTimeout: 2m0s
ipvs:
  syncPeriod: 30s
  scheduler: rr
  minSyncPeriod: 5s
EOF
```

创建完后，将 `/etc/kubernetes/kube-proxy.conf` 和 `/etc/kubernetes/kube-proxy.yaml` 发送给所有节点。



## 创建服务

创建服务： 

```bash
cat << EOF > /usr/lib/systemd/system/kube-proxy.service
[Unit]
Description=Kubernetes Kube Proxy
Documentation=https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-proxy/
After=network.target

[Service]
ExecStart=/usr/local/bin/kube-proxy \
  --config=/etc/kubernetes/kube-proxy.yaml \
  --master=https://192.168.1.34:6443 \
  --v=2

Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now kube-proxy

systemctl status kube-proxy
```

如果现在使用 `kubectl describe` 来查看节点，可以发现：

```log
Conditions:
  Type             Status  LastHeartbeatTime                 LastTransitionTime                Reason                       Message
  ----             ------  -----------------                 ------------------                ------                       -------
  MemoryPressure   False   Tue, 23 Jul 2024 00:01:28 +0800   Fri, 19 Jul 2024 23:34:16 +0800   KubeletHasSufficientMemory   kubelet has sufficient memory available
  DiskPressure     False   Tue, 23 Jul 2024 00:01:28 +0800   Fri, 19 Jul 2024 23:34:16 +0800   KubeletHasNoDiskPressure     kubelet has no disk pressure
  PIDPressure      False   Tue, 23 Jul 2024 00:01:28 +0800   Fri, 19 Jul 2024 23:34:16 +0800   KubeletHasSufficientPID      kubelet has sufficient PID available
  Ready            False   Tue, 23 Jul 2024 00:01:28 +0800   Fri, 19 Jul 2024 23:34:16 +0800   KubeletNotReady              container runtime network not ready: NetworkReady=false reason:NetworkPluginNo
```

至此集群已经搭建完毕，下一步则是安装网络插件。

