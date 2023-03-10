---
title: 服务总线
date: 2023-03-10 15:10:00
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "服务总线", path: "/SpringCloud/bus"}
---

在配置中心中，在配置被修改后，需要手动重启或者对客户端发送POST请求才能将配置刷新，这种操作粒度太大，几乎一次改动都要涉及到所有服务器。

通过服务总线，可以实现配置的自动刷新。

[SpringCloud Bus](springcloud-bus)

