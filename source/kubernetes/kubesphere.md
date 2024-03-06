---
title: Kubesphere
date: 2024-02-26 22:23:12
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
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

## 安装nfs

[安装nfs](/kubernets)

# 安装kubesphere

注意机器配置，我自己使用VMWare，两台虚拟机2核4G是跑不起Kubesphere的，CPU一定要多给一点。

**不要一上来就开所有功能，不然配置不够直接给你集群弄炸**，反正我自己跟着视频一上来直接开了所有功能，然后CPU直接100%，各种Pod起不来，然后就把集群重置了。

[文档](https://www.kubesphere.io/zh/docs/v3.4/quick-start/minimal-kubesphere-on-k8s/)

**再提醒一下，不要一上来就开所有功能！！！！**

> 我自己两个8核6G的虚拟机，默认配置文件很快就能启动，但是开devOps功能后服务器直接卡死，节点重启后才恢复正常。

# 应用部署

## 部署mysql

使用Docker启动mysql时的命令：
```bash
docker run -p 3306:3306 --name mysql-01 \
  -v /mydata/mysql/log:/var/log/mysql \
  -v /mydata/mysql/data:/var/lib/mysql \
  -v /mydata/mysql/conf:/etc/mysql/conf.d \
  -e MYSQL_ROOT_PASSWORD=root \
  --restart=always \
  -d mysql:5.7 
```