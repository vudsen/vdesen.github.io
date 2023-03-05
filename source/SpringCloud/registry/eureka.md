---

title: Eureka
date: 2023-03-04 22:17:12
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }

---

## 服务治理

Spring Cloud 封装了 Netflix 公司开发的 Eureka 模块来实现服务治理

在传统的 RPC 远程调用框架中，管理每个服务与服务之间的依赖关系比较复杂，所以需要使用服务治理，管理服务与服务之间的依赖关系，可以实现服务调用、负载均衡、容错等，实现服务的发现与注册。

## 服务注册与发现

Eureka 采用了 CS 的设计架构，Eureka Server 作为服务注册功能的服务器，它是服务注册中心。而系统中的其他微服务，使用 Eureka的客户端连接到 Eureka sever 并维持心跳连接。这样系统的维护人员就可以通过 Eureka Server 来监控系统中各个微服务是否正常运行。

在服务注册与发现中，有一个注册中心。当服务器启动的时候，会把当前自己服务器的信息比如服务地址通讯地址等以别名方式注册到注册中心上。另一方(消费者服务提供者)，以该别名的方式去注册中心上获取到实际的服务通讯地址，然后再实现本地RPC调用RPC远程调用框架核心设计思想:在于注册中心，因为使用注册中心管理每个服务与服务之间的一个依赖关系(服务治理概念)。在任何rpc远程框架中，都会有一个注册中心(存放服务地址相关信息(接口地址)

![Untitled](https://xds.asia/public/SpringCloud/2023-2-6-2835c218-af01-4593-8b3f-d27ad4d9e7ac.png)

## Eureka的两个组件

### Eureka Server

Eureka Server 提供服务注册服务。各个微服务节点通过配置启动后，会在EurekaServer中进行注册，这样 EurekaServer 中的服务注册将会存储所有可用服务节点的信息，服务节点的信息可用在界面中直观地看到

### Eureka Client

EurekaClient通过注册中心进行访问。EurekaClient是一个Java客户端，用于简化与 Eureka Server 的交互，客户端同时也具备一个内置的、使用轮询（round-robin）负载算法的负载均衡器。在启动应用后，将会向 Eureka Server 发送心跳（默认周期为30秒）。如果 Eureka Server 在多个心跳周期内没有收到某个节点的心跳，EurekaServer将会从服务注册表中把这个服务节点移除

## 构建Eureka

https://www.notion.so/Eureka-26db79932eb64e48922a80d0cef5296b

## 服务发现Discovery

```java
@AutoWired
private DiscoveryClient discoveryClinet;
```

可以使用 DiscoveryClient 来查看已经注册的服务信息，在使用前还需要给主类添加 `@EnableDiscoveryClient`注解



