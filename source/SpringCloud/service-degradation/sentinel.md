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

启动后发送请求，就可以在dashboard中看到相关数据。

# 流控规则

![添加流控规则](https://selfb.asia/public/SpringCloud/2023-2-6-49f558a5-65bc-4017-8058-89e2e6a932fa.webp)

- 资源名：唯一名称，默认请求路径

- 针对来源：Sentinel可以针对堆调用者进行限流，填写微服务名，默认default，即不区分来源

- 阈值类型/单机阈值：
  - QPS(每秒钟的请求数量)：当调用该API的QPS达到阈值的时候，进行限流
  - 线程数：当调用该API的线程数达到阈值时，进行限流
  
- 是否集群

- 流控模式：
  - 直接：api达到限流条件时，直接限流
  - 关联：当管理的资源达到阈值时，就限流自己
    - 如A与B关联，B被限流时，A也会跟着被限流
  - 链路：只记录指定链路上的流量(指定资源从入口资源进来的流量，如果达到阈值，就进行限流。API级别的针对来源)
  
- 流控效果
  - 快速失败：直接失败，抛出`FlowException`异常
  
  - [Warm Up](https://github.com/alibaba/Sentinel/wiki/%E9%99%90%E6%B5%81---%E5%86%B7%E5%90%AF%E5%8A%A8)：即预热/冷启动方式。当系统长期处于低水位的情况下，当流量突然增加时，直接把系统拉升到高水位可能瞬间把系统压垮。通过"冷启动"，让通过的流量缓慢增加，在一定时间内逐渐增加到阈值上限，给冷系统一个预热的时间，避免冷系统被压垮
  
    具体的实现在`WarmUpController`里
  
  - [排队等待](https://github.com/alibaba/Sentinel/wiki/%E6%B5%81%E9%87%8F%E6%8E%A7%E5%88%B6-%E5%8C%80%E9%80%9F%E6%8E%92%E9%98%9F%E6%A8%A1%E5%BC%8F)：严格控制请求通过的间隔时间，也即是让请求以均匀的速度通过，对应的是漏桶算法。
    - [令牌桶算法(Token Bucket)和漏桶算法(Leaky Bucket)-阿里云开发者社区 (aliyun.com)](https://developer.aliyun.com/article/701279)
  
    具体实现在`RateLimitController`里

# 熔断降级

[circuit-breaking | Sentinel (sentinelguard.io)](https://sentinelguard.io/zh-cn/docs/circuit-breaking.html)

Sentinel熔断降级会在调用链路中某个资源出现不稳定状态时对这个资源的调用进行限制，让请求快速失败，避免影响到其它的资源而导致级联错误。

当资源被降级后，在接下来的降级时间窗口之内，对该资源的调用都自动熔断(默认抛出`DegradeException`)

Sentinel 提供以下几种熔断策略：

- 慢调用比例 (`SLOW_REQUEST_RATIO`)：选择以慢调用比例作为阈值，需要设置允许的慢调用 RT（即最大的响应时间），请求的响应时间大于该值则统计为慢调用。当单位统计时长（`statIntervalMs`）内请求数目大于设置的最小请求数目，并且慢调用的比例大于阈值，则接下来的熔断时长内请求会自动被熔断。经过熔断时长后熔断器会进入探测恢复状态（HALF-OPEN 状态），若接下来的一个请求响应时间小于设置的慢调用 RT 则结束熔断，若大于设置的慢调用 RT 则会再次被熔断。
- 异常比例 (`ERROR_RATIO`)：当单位统计时长（`statIntervalMs`）内请求数目大于设置的最小请求数目，并且异常的比例大于阈值，则接下来的熔断时长内请求会自动被熔断。经过熔断时长后熔断器会进入探测恢复状态（HALF-OPEN 状态），若接下来的一个请求成功完成（没有错误）则结束熔断，否则会再次被熔断。异常比率的阈值范围是 `[0.0, 1.0]`，代表 0% - 100%。
- 异常数 (`ERROR_COUNT`)：当单位统计时长内的异常数目超过阈值之后会自动进行熔断。经过熔断时长后熔断器会进入探测恢复状态（HALF-OPEN 状态），若接下来的一个请求成功完成（没有错误）则结束熔断，否则会再次被熔断。

使用`@SentinelResource`可以设置fallback：

```java
@GetMapping("/hotkey")
@SentinelResource(value = "hotkey", blockHandler = "dealTestHotkey")
public String testHotkey(@RequestParam(value = "p1", required = false) String p1,
                         @RequestParam(value = "p2", required = false) String p2) {
    return "----test Hotkey: " + p1 + p2;
}

public String dealTestHotkey(String p1, String p2, BlockException e) {
    return "fallback: " + p1 + p2 + e;
}
```

<font color=red>若在方法中出现异常，则不会执行fallback方法。@SentinelResource只管配置出错</font>

# 热点限流

[热点参数限流 · alibaba/Sentinel Wiki (github.com)](https://github.com/alibaba/Sentinel/wiki/热点参数限流)

要使用热点限流，需要先设置`@SentinelResource`，资源名就是该注解设置的值，索引值即为参数对应的位置，从0开始。

## 高级选项

假设我们希望某个参数在等于某个值时，它能够有特定的QPS限制。

在高级选项中添加例外项，即可进行针对性限流。

# @SentinelResource

[注解支持 · alibaba/Sentinel Wiki (github.com)](https://github.com/alibaba/Sentinel/wiki/注解支持)

# 规则持久化

[在生产环境中使用 Sentinel · alibaba/Sentinel Wiki (github.com)](https://github.com/alibaba/Sentinel/wiki/在生产环境中使用-Sentinel)

导入依赖：

```xml
<dependency>
    <groupId>com.alibaba.csp</groupId>
    <artifactId>sentinel-datasource-nacos</artifactId>
</dependency>
```

添加配置：

```yaml
spring:
  application:
    name: cloudalibaba-sentinel-service
  cloud:
    sentinel:
      datasource:
        ds1:
          nacos:
            server-addr: localhost:8848
            data-id: cloudalibaba-sentinel-service
            data-type: json
            rule-type: flow
```

在nacos添加配置，名称即为服务名，类型选择json，初始内容可选为空数组。

这里需要注意sentinel的配置只能在nacos配置了，<font color=red>sentinel里配置的不会被同步到nacos</font>！

[Sentinel配置规则持久化至Nacos_sentinel持久化到nacos_小脑斧学技术的博客-CSDN博客](https://blog.csdn.net/weixin_42270645/article/details/123399569)

[Sentinel 控制台（集群流控管理） · alibaba/Sentinel Wiki (github.com)](https://github.com/alibaba/Sentinel/wiki/Sentinel-控制台（集群流控管理）#规则配置)

经过我自己实践后发现，其实只需要将这个文件[Sentinel/FlowRuleNacosPublisher.java at master · alibaba/Sentinel · GitHub](https://github.com/alibaba/Sentinel/blob/master/sentinel-dashboard/src/test/java/com/alibaba/csp/sentinel/dashboard/rule/nacos/FlowRuleNacosPublisher.java)搬到main代码里，然后再修改[Sentinel/FlowControllerV2.java at master · alibaba/Sentinel · GitHub](https://github.com/alibaba/Sentinel/blob/master/sentinel-dashboard/src/main/java/com/alibaba/csp/sentinel/dashboard/controller/v2/FlowControllerV2.java)：

```java
// 原来的
@Autowired
@Qualifier("flowRuleDefaultPublisher")
private DynamicRulePublisher<List<FlowRuleEntity>> rulePublisher;

// 改为
@Autowired
@Qualifier("flowRuleNacosPublisher")
private DynamicRulePublisher<List<FlowRuleEntity>> rulePublisher;
```



