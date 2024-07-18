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

### 配置 kube-apiserver

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

在执行前需要节点中准备签发 apiserver 证书的 CA 证书：

```sh
ssh k8s-node-1 "mkdir -p /etc/kubernetes/pki"
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
    --token=cdbe50bd844b6952cd197899bac486d9,kubelet-bootstrap,10001,"system:bootstrappers" 

KUBECONFIG=$kube kubectl config use-context default-auth@kubernetes
```