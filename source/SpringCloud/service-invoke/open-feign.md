---
title: OpenFeign
date: 2023-03-06 22:52:25
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "服务调用", path: "/SpringCloud/service-invoke"}
---

[Spring Cloud OpenFeign(官方文档)](https://spring.io/projects/spring-cloud-openfeign)

Feign是一个声明式的Web服务客户端，让编写Web服务客户端变得更加容易，只需创建一个接口并在接口上添加注解即可。

## 基本使用

依赖：

```xml
<dependency>
	<groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
```

在消费者端，直接在接口上添加`@FeignClient`注解，然后再填上服务提供者的调用接口：

```java
@Service
@FeignClient("CLOUD-PAYMENT-SERVICE")
public interface PaymentFeignService {

    @GetMapping("/payment/get/{id}")
    CommonResult<Payment> getPaymentById(@PathVariable("id") Long id);

}
```

之后直接注入后使用即可：

```java
@RestController
public class OrderFeignController {

    private PaymentFeignService paymentFeignService;

    @Autowired
    public void setPaymentFeignService(PaymentFeignService paymentFeignService) {
        this.paymentFeignService = paymentFeignService;
    }


    @GetMapping("/payment/{id}")
    public CommonResult<Payment> queryPayment(@PathVariable Long id) {
        return paymentFeignService.getPaymentById(id);
    }


}
```

## 超时控制

若调用远程服务时间过长，则会抛出一个`java.net.SocketTimeoutException: Read timed out`表示请求超时。默认是5秒超时。

### 在配置文件中修改超时控制

```yaml
feign:
  client:
    config:
      # 服务名
      CLOUD-PAYMENT-SERVICE:
      	# 日志级别
      	logger-level: NONE
      	# 连接超时 默认2秒
        connect-timeout: 1
        # 请求处理超时，默认5秒
        read-timeout: 1
```

### 全局配置超时时间

```java
@Configuration
public class FeignConfig {
    
    @Bean
    public Request.Options options() {
        return new Request.Options(1, TimeUnit.SECONDS, 1, TimeUnit.SECONDS, true);
    }
    
}
```

# 日志增强

Feign提供了日志打印功能，我们可以通过配置来调整日志级别，从而了解Feign中Http请求的细节。可以对Fegin的调用情况进行监控。

**Feign日志级别：**

- <font color="skyblue">NONE</font>: 默认的，不显示任何日志
- <font color="skyblue">BASIC</font>：仅记录请求方法、URL、响应状态码及执行时间
- <font color="skyblue">HEADERS</font>：除了BASIC中定义的信息之外，还有请求和响应的头信息
- <font color="skyblue">FULL</font>：除了HEADERS中订单的信息之外，还有请求和响应的正文以及元数据

可以通过配置文件配置，也可以通过Spring配置：

```java
@Configuration
public class FeignConfig {

    @Bean
    Logger.Level feignLoggerLevel() {
        return Logger.Level.FULL;
    }

}
```

