---
title: Sentinel
date: 2023-03-07 22:45:12
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "服务降级", path: "/SpringCloud/service-degradation"}
---

[quick-start | Sentinel (sentinelguard.io)](https://sentinelguard.io/zh-cn/docs/quick-start.html)

[Spring Cloud Alibaba Reference Documentation (spring-cloud-alibaba-group.github.io)](https://spring-cloud-alibaba-group.github.io/github-pages/2021/en-us/index.html#_spring_cloud_alibaba_sentinel)

[Releases · alibaba/Sentinel (github.com)](https://github.com/alibaba/Sentinel/releases)

# 基本使用

首先安装Sentinel Dashboard然后启动。

导入依赖：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.csp</groupId>
    <artifactId>sentinel-datasource-nacos</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
</dependency>
```

添加配置：

```yaml
server:
  port: 8401

spring:
  application:
    name: cloudalibaba-sentinel-service
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
    sentinel:
      transport:
        dashboard: localhost:8080
        # sentinel后台监控服务使用的端口号
        port: 8719

management:
  endpoint:
    web:
      exposure:
        include: "*"

```

如果启动时出现循环依赖导致启动失败，可以参考这里：[版本说明 · alibaba/spring-cloud-alibaba Wiki (github.com)](https://github.com/alibaba/spring-cloud-alibaba/wiki/版本说明)