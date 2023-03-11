---
title: SpringCloud Bus
date: 2023-03-10 15:10:00
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "服务总线", path: "/SpringCloud/bus"}
---

![原理图](https://xds.asia/public/SpringCloud/2023-2-5-f88c2338-89d9-40e7-bea8-d927ad536f34.webp)

在第三步中，只需要通知一个APP，就可以自动通过总线通知其它APP进行更新。<font color=red>实际上也可以去通知配置中心，然后再由配置中心发送通知</font>。

SpringCloud Config-Client实例都监听MQ中同一个topic(默认为`springCloudBus`)。当一个服务刷新数据的时候，它会把这个信息放入到Topic中，这样其它监听同一个Topic的服务就能得到通知，然后去更新自身的配置。

SpringCloud Bus目前仅支持RabbitMQ和Kafaka。

# 1. 简单使用

## 1.1 配置

### 1.1.1 配置中心配置

添加依赖：

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bus-amqp</artifactId>
</dependency>
```

配置文件添加配置：

```yaml
server:
  port: 3344

spring:
  application:
    name: cloud-config-center
  cloud:
    config:
      server:
        git:
          uri: https://gitee.com/hupeng333/springcloud-config.git
          search-paths:
            - springcloud-config
          default-label: master
      label: master
  # rabbitmq配置    
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest

eureka:
  client:
    service-url:
      defaultZone: http://localhost:7001/eureka

management:
  endpoint:
    web:
      exposure:
        # 暴露bus刷新配置的端点
        include: 'busrefresh'
```

### 1.1.2 客户端配置

同样添加相同的依赖:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bus-amqp</artifactId>
</dependency>
```

添加rabbitmq支持：

```yaml
spring:
	rabbitmq:
        host: localhost
        port: 5672
        username: guest
        password: guest
```

## 1.2 全局更新配置

对配置中心发送如下请求即可进行自动更新：

```shell
curl -X POST "http://localhost:3344/actuator/busrefresh"
```

## 1.3 定点通知

定点通知即指定某一个具体的实例刷新配置，而不是全部的实例。

使用如下请求进行定点通知：

```shell
http://配置中心host/actuator/busrefresh/{destination}
```

例如某个实例的`spring.application.name`为`config-client`，并且端口为3355，使用如下指令进行刷新：

```shell
http://配置中心host/actuator/busrefresh/config-client:3355
```

