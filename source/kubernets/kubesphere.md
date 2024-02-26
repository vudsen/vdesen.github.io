---
title: Kubesphere
date: 2024-02-26 22:23:12
categories: 
  data:
    - { name: "k8s", path: "/2024/02/k8s" }
---


# 前置准备

## 安装监控服务

[metrics-server](https://github.com/kubernetes-sigs/metrics-server)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

由于没找到好用的镜像（貌似可以用`egistry.cn-hangzhou.aliyuncs.com/google_containers`），所以直接给docker配置了代理硬拉下来了：
```bash
vi /etc/docker/daemon.json
# 添加代理(clash开允许局域网)
"proxies": {
    "http-proxy": "http://192.168.0.111:7890",
    "https-proxy": "http://192.168.0.111:7890"
}

# 修改完后
docker pull registry.k8s.io/metrics-server/metrics-server:v0.7.0
# 导出
docker save -o metrics-server.tar registry.k8s.io/metrics-server/metrics-server:v0.7.0
# 导入
ctr -n=k8s.io image import metrics-server.tar
```

注意导入时需要导入到每个工作节点。或者这边可以直接重新打个tag然后推到自己的私有镜像仓库里面去。

部署后发现pod仍然是0/1，但状态已经是Running了，翻了下文档发现需要在启动参数中配置忽略ssl：`--kubelet-insecure-tls`，或者也可以直接提供证书。

> 发现一篇好文章：[一文带你彻底厘清 Kubernetes 中的证书工作机制](https://zhuanlan.zhihu.com/p/142990931)