---
title: Ribbon
date: 2023-03-05 15:40
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "负载均衡", path: "/SpringCloud/loadbalance"}
---

Spring Cloud Ribbon是基于Netflix Ribbon实现的一套<font color="red">客户端负载均衡的工具</font>。

简单的说，Ribbon是Netflix发布的开源项目，主要功能是提供<font color="red">客户端的软件负载均衡算法和服务调用</font>。Ribbon客户端组件提供一系列完善的配置项如连接超时重试等。简单的说，就是在配置文件中列出Load Balancer(简称LB)后面所有的机器，Ribbon会自动的基于某种规则(如简单轮询，随机连接等)去连接这些机器。

<font color="red">Ribbon目前已经进入维护模式(即只修Bug，不出新东西): [Netflix/ribbon(github.com)](https://github.com/Netflix/ribbon)</font>

- [SpringCloudLoadbalancer](/SpringCloud/loadbalance/spring-cloud-loadbalancer.md)

**负载均衡:**

​	将用户的请求平摊地分配到多个服务商，从而达到系统的HA(高可用)。常见的负载均衡软件有Nginx，LVS，硬件F5等。

**Ribbon VS Nginx**：

​	Nginx是服务器负载均衡，客户端所有请求都会交给Nginx，然后由Nginx实现转发请求。即负载均衡是由服务端实现的，可以叫做`集中式LB`。

​	Ribbon本地负载均衡，在调用微服务接口时，会在注册中心获取注册的服务器列表后缓存到本地，从而在本地实现RPC远程服务调用技术，可以叫做`进程内LB`。

## 简单使用

导入依赖

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-ribbon</artifactId>
</dependency>
```

之后添加配置类：

```java
import org.springframework.cloud.client.loadbalancer.LoadBalanced;

@Configuration
public class ApplicationConextConfig {

    @Bean
    // 添加负载均衡
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

}
```

默认的策略是轮询方法，将域名替换成服务名即可进行调用。

## 替换负载均衡算法(已经失效)

> 旧版中spring-cloud-starter-netflix-eureka-client自带ribbon相关依赖，但是新版本(3.x)已经没有了，并且官方推荐使用spring-cloud-loadbalancer，<font color="red">在新版本中使用ribbon可能(一定)会有兼容性问题</font>

负载均衡算法主要由`AbstractLoadBalancerRule`子类实现：

![impl](https://selfb.asia/public/SpringCloud/2023-2-0-d06ac3b8-44b8-479d-8ab6-de9bad94c485.png)

- <font color="skyblue">RoundRobinRule</font>: 轮询
- <font color="skyblue">RandomRule</font>: 随机
- <font color="skyblue">RetryRule</font>: 先按照RoundRobinRule策略获取服务，如果获取服务失败则在指定时间内会进行重试，获取可用的服务
- <font color="skyblue">WeightedResponseTimeRule</font>: 对RoundRobinRule的扩展，服务的权重越大，越容易被选中
- <font color="skyblue">BestAvailableRule</font>: 会先过滤掉由于多次访问故障的服务，然后选中一个并发量最小的服务
- <font color="skyblue">AvailabilityFilteringRule</font>: 先过滤掉故障实例，再选中并发较小的实例
- <font color="skyblue">ZoneAvoidanceRule</font>: 默认规则，复合判断Server所在区域的性能和Server的可用性来选择服务器

在文档里说过，配置类不应在启动类所在的包里：[Spring Cloud Dalston 中文文档 参考手册 中文版](https://www.springcloud.cc/spring-cloud-dalston.html#spring-cloud-ribbon)(想找Spring官方文档，结果没找到)

之后直接配置既可：

```java
package pers.xds.lbrule;

@Configuration
public class MySelfRule {

    @Bean
    public IRule myRule() {
        return new RandomRule();
    }

}
```

之后在主类配置：

```java
package pers.xds.springcloud;

@SpringBootApplication
@EnableEurekaClient
// 这里代表客户端要访问的服务，必须大写
@RibbonClient(name = "CLOUD-PAYMENT-SERVICE", configuration = MySelfRule.class)
public class OrderMain80 {

    public static void main(String[] args) {
        SpringApplication.run(OrderMain80.class, args);
    }
}
```
