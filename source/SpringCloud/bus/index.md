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

**什么是总线**

​	在微服务架构的系统中，通常会使用<font color=red>轻量级的消息代理</font>来构建一个<font color=red>共用的消息主题</font>，并让系统中所有微服务实例都连接上来。由于该<font color=red>主题中产生的消息会被所有实例监听和消费</font>，所以称它为消息总线。在总线上的各个实例，都可以方便地广播─些需要让其他连接在该主题上的实例都知道的消息。

---

[SpringCloud Bus](springcloud-bus)

