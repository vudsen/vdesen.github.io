---
title: SpringCloud Sleuth
date: 2023-03-11 15:18:25
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
---

在微服务框架中，一个由客户端发起的请求在后端系统中会经过多个不同的服务节点调用来协同产生最后请求的结果，每一个前段请求都会形成一条复杂的分布式服务调用链路，链路中的任何一环出现高延迟或错误时都会引起整个请求最后的失败。

在使用前需要下载zipkin，这是一个可视化图像界面，可以将Sleuth的结果展示出来：

https://search.maven.org/remote_content?g=io.zipkin&a=zipkin-server&v=LATEST&c=exec



在Sleuth中，每条请求链路，都有一个唯一的TraceId、Span标识，每个Span通过parent id关联起来。

![链路图](https://5j9g3t.site/public/SpringCloud/2023-2-6-3f34fa6b-ab82-43ea-b82d-207cbe47ded2.webp)

# 简单使用

添加配置：

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-sleuth</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-sleuth-zipkin</artifactId>
</dependency>
```

配置文件添加：

```yaml
spring:
  zipkin:
    base-url: http://localhost:9411
  sleuth:
    sampler:
      # 采样率. 介于0到1，使用1则是全部采集
      probability: 1
```

之后进行请求，就可以在zipkin上看到了。