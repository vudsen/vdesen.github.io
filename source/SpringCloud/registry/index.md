---
layout: 注册中心
title: 注册中心
date: 2023-03-02 11:59:20
tags:
---

- [Eureka](/SpringCloud/registry/eureka)
- [Zookeeper](/SpringCloud/zookeeper)
- [Consul](/SpringCloud/registry/consul)

三种注册中心的异同：

| 组件名    | 语言 | CAP  | 服务健康检查 | 对外暴露接口 |
| --------- | ---- | ---- | ------------ | ------------ |
| Eureka    | Java | AP   | 可配支持     | HTTP         |
| Consul    | Go   | CP   | 支持         | HTTP/DNS     |
| Zookeeper | Java | CP   | 支持         | 客户端       |

[一文看懂｜分布式系统之CAP理论 - 腾讯云开发者社区-腾讯云 (tencent.com)](https://cloud.tencent.com/developer/article/1860632)

CAP在注册中心的具体实现之一就是：

- 若保证A，则在服务器宕机后不会立刻删除节点
- 若报错C，则在服务器宕机后立刻删除节点
