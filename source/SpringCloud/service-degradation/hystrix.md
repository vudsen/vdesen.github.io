---
title: Hystrix
date: 2023-03-07 22:45:12
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "服务降级", path: "/SpringCloud/service-degradation"}
---

<font color="red">Hystrix目前已经进入维护模式</font>

# 基本使用

导入依赖：

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-hystrix</artifactId>
</dependency>
```

配置文件和基础的服务提供者一样。
