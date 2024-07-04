---
title: K3s 安装
date: 2024-07-04 20:37:52
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---



# 系统需求

> K3s 是一个轻量级 K8s，当你的节点数较少时，应该优先考虑使用 K3s，直接使用 K8s 有点过于大材小用。
>
> 例如你的公司有一套软件可以使用 helm 进行分发，但是一般客户只会提供资源有限的节点，直接安装 K8s 是不太现实的，此时 K3s 就是最好的选择。


[Requirements](https://docs.k3s.io/zh/installation/requirements?os=debian)

K3s 至少需要如下资源才能被安装：

- CPU：最低 1 核，推荐 2 核
- RAM：最低 512MB，推荐 1GB

相比与另外一个轻量级 K8s：[minikube](https://minikube.sigs.k8s.io/docs/)，K3s 的优势是**能够用于生产模式**，而 minukube 仅用于学习 K8s，下面引用[官方原话](https://minikube.sigs.k8s.io/docs/faq/)：

```text
minikube’s primary goal is to quickly set up local Kubernetes clusters, and therefore we strongly discourage using minikube in production or for listening to remote traffic. By design, minikube is meant to only listen on the local network.
```

同时还有个 issue：[Running minikube in production is [not] stupid?](https://github.com/kubernetes/minikube/issues/10097)

# 准备配置文件

为了避免后面又重启啥的，所以建议一次性把配置文件准备好，创建文件 `/etc/rancher/k3s/config.yaml`.

## 内嵌镜像仓库


[Embedded Registry Mirror](https://docs.k3s.io/zh/installation/registry-mirror)

K3s 提供了内建镜像仓库，可以直接在节点间共享镜像，**默认是关闭的**，如果不需要开启，则可以直接跳过这节。

开启内嵌镜像仓库：

```yaml
embedded-registry: true 
```

内嵌镜像仓库不能直接通过 push 上传镜像，必须使用 `ctr -n k8s.io import` 或者 `ctr -n k8s.io load` 来导入。

## 配置镜像源

[Private Registry Configuration](https://docs.k3s.io/zh/installation/private-registry)

在**每个节点**创建文件：`/etc/rancher/k3s/registries.yaml`，这个文件仅对单个节点有效。

添加镜像源：

```yaml
mirrors:
  docker.io:
    endpoint:
      - "https://registry.example.com:5000"
```

如果需要配置认证，请自行查阅官方文档。

## 准备安装

首先非常蛋疼的是和 K8s 一样，你要是完全跟着官方步骤走，是肯定搞不了的，资源要么在 GitHub 上，要么就是被墙了。

但是有大佬已经为我们准备了镜像源：[使用国内资源安装K3s](https://forums.rancher.cn/t/k3s/1416)。

你可以直接照着上面的步骤走，也可以看我自己是怎么搞的。

---

下载脚本：

```sh
curl -O https://rancher-mirror.rancher.cn/k3s/k3s-install.sh > k3s-install.sh
```

添加镜像文件：

```sh
cat > /etc/rancher/k3s/registries.yaml <<EOF
mirrors:
  docker.io:
    endpoint:
      - "https://registry.cn-hangzhou.aliyuncs.com/"
      - "https://mirror.ccs.tencentyun.com"
  quay.io:
    endpoint:
      - "https://quay.tencentcloudcr.com/"
  registry.k8s.io:
    endpoint:
      - "https://registry.aliyuncs.com/v2/google_containers"
  gcr.io:
    endpoint:
      - "https://gcr.m.daocloud.io/"
  k8s.gcr.io:
    endpoint:
      - "https://registry.aliyuncs.com/google_containers"
  ghcr.io:
    endpoint:
      - "https://ghcr.m.daocloud.io/"
EOF
```

指定安装版本(具体有哪些版本可以从 [Releases](https://github.com/k3s-io/k3s/releases) 列表看)：

```sh
INSTALL_K3S_MIRROR=cn INSTALL_K3S_VERSION=v1.28.11+k3s2 sh k3s-install.sh --system-default-registry="registry.cn-hangzhou.aliyuncs.com"
```

如果碰到安装 `docker-ce` 失败，执行下面的命令添加镜像：

```sh
yum install yum-utils
yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```

如果 kubectl 没有正确配置，使用下面的配置重新设置配置文件：

```sh
echo "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml" >> /etc/profile
source /etc/profile
```

