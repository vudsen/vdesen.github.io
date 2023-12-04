---
title: Docker Network
date: 2023-04-25 21:24:32
categories:
  data:
    - { name: "Docker", path: "/2023/04/20/docker/" }
---

# 1. 基础

Docker网络的作用：

- 容器间的互联和通信以及端口映射
- 容器IP变动时可以通过服务名直接进行网络通信，不会造成实际的影响

在docker启动后，会创建一个名为docker0的虚拟网桥：

```shell
[root@localhost ~]# ifconfig
docker0: flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500
        inet 172.17.0.1  netmask 255.255.0.0  broadcast 172.17.255.255
        ether 02:42:5c:ee:2d:f9  txqueuelen 0  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 0  bytes 0 (0.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
        
		...
```

默认会创建3大网络模式：

```shell
[root@localhost ~]# docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
669ce7bca3dc   bridge    bridge    local
488ca754e88f   host      host      local
7a933f50d749   none      null      local
```

常用命令：

- 查看网络：`docker network ls`
- 查看网络源数据：`docker network inspect 网络名`
- 删除网络：`docker network rm 网络名`

Dokcer的网络模式有如下几种：

| 网络模式  | 间接                                                         |
| --------- | ------------------------------------------------------------ |
| bridge    | 为每一个容器分配、设置IP等，并将容器连接到一个docker0虚拟网桥。默认为该模式 |
| host      | 容器将不会虚拟出自己的网卡，配置自己的IP等，而是使用宿主机的IP和端口 |
| none      | 容器有独立的Network Namespace，但并没有对其进行任何网络设置，如分配veth pair和网桥连接、IP等 |
| container | 新创建的容器不会创建自己的网卡和配置自己的IP，而是和一个指定的容器共享IP、端口范围等 |

## 1.1 bridge

![bride](https://selfb.asia/public/docker/2023-3-3-06313489-0426-4ddd-905e-909d6f44bcf1.webp)

