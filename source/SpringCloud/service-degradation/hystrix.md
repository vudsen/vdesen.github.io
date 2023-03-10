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

[Netflix/Hystrix (github.com)](https://github.com/Netflix/Hystrix)

# 入门使用

导入依赖：

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-hystrix</artifactId>
</dependency>
```

配置文件和基础的服务提供者一样。

主启动类添加注解：`@EnableCircuitBreaker`

之后在服务类中添加相关注解：

```java
@HystrixCommand(fallbackMethod = "paymentInfoTimeout_TimeoutHandler", commandProperties = {
    	// 设置3秒超时
        @HystrixProperty(name = "execution.isolation.thread.timeoutInMilliseconds", value = "3000")
})
public String paymentInfoTimeout(Integer id) {
    final int timeout = 5000;
    try {
        Thread.sleep(timeout);
    } catch (InterruptedException e) {
        throw new RuntimeException(e);
    }
    return "线程池:   " + Thread.currentThread().getName() + " paymentInfoTimeout, id: " + id + "\ttimeout = " + timeout;
}

// fallback
public String paymentInfoTimeout_TimeoutHandler(Integer id) {
    return "paymentInfoTimeout_TimeoutHandler: " + id;
}
```

不管是超时还是出现异常，都会调用`fallback`指定的方法。

这个设置在客户端或服务端都是一样的。

# 全局配置fallback

一般在如下情况会触发降级：

- 程序运行异常
- 超时
- 服务熔断触发服务降级
- 并发量过高(线程池/信号量是否用完)

给某个类配置：

```java
import com.netflix.hystrix.contrib.javanica.annotation.DefaultProperties;

@RestController
@Slf4j
@DefaultProperties(defaultFallback = "paymentFallback")
public class PaymentHystrixController {
    
    public String paymentFallback() {
        return "服务运行异常，请稍后再试";
    }
	
    // ...
    
}
```

还有更加优雅的配置方法：

```java
@Service
@FeignClient(value = "CLOUD-PROVIDER-HYSTRIX-PAYMENT", fallback = PaymentServiceFallback.class)
public interface PaymentHystrixService {

    @GetMapping("/payment/hystrix/ok/{id}")
    String paymentInfoSuccess(@PathVariable Integer id);


    @GetMapping("/payment/hystrix/timeout/{id}")
    String paymentInfoTimeout(@PathVariable Integer id);

}


public class PaymentServiceFallback implements PaymentHystrixService {
    @Override
    public String paymentInfoSuccess(Integer id) {
        return "paymentInfoSuccess_fallback";
    }

    @Override
    public String paymentInfoTimeout(Integer id) {
        return "paymentInfoTimeout_fallback";
    }
}
```

这样就不用把业务代码和异常代码混合在一起了。

但是在使用前必须要添加配置：

```yaml
feign:
  circuitbreaker:
    enabled: true
```

# 服务熔断

在触发服务熔断后，服务器会拒绝所有请求，然后使用服务降级的方法返回友好提示。

熔断机制是应对雪崩效应的一种微服务链路保护机制。当扇出链路的某个微服务出错不可用或者响应时间太长时，会进行服务的降级，进而熔断该节点微服务的调用，快速返回错误的响应信息。

当检测到该节点微服务调用响应正常后，恢复调用链路。

```java
@HystrixCommand(fallbackMethod = "paymentCircuitBreaker_fallback", commandProperties = {
    // 是否开启断路器
    @HystrixProperty(name = HystrixPropertiesManager.CIRCUIT_BREAKER_ENABLED, value = "true"),
    // 请求次数阈值
    @HystrixProperty(name = "circuitBreaker.requestVolumeThreshold", value = "10"),
    // 时间窗口期, 在触发熔断后，多久恢复HALF_OPEN状态，之后会放行一个请求，根据执行结果决定是否恢复正常
    @HystrixProperty(name = "circuitBreaker.sleepWindowInMilliseconds", value = "1000000"),
    // 失败率达到多少后熔断
    @HystrixProperty(name = "circuitBreaker.errorThresholdPercentage", value = "60"),
})
public String paymentCircuitBreaker(Integer id) {
    if (id < 0) {
        throw new RuntimeException("id 不能为负数");
    }
    return Thread.currentThread().getName() + "\t调用成功，流水号: " + UUID.randomUUID();
}

public String paymentCircuitBreaker_fallback(Integer id) {
    return "paymentCircuitBreaker_fallback, id: " + id;
}
```

具体的配置列表：https://github.com/Netflix/Hystrix/wiki/Configuration

在触发熔断后，服务参数即使正确，也会一直返回降级的内容。

熔断类型：

- **CLOSE**：熔断关闭，不会对服务进行熔断
- **OPEN**：请求不再进行当前服务的调用，直接进行服务降级，在经过一定时间后转换为HALF_OPEN状态
- **HALF_OPEN**：此时放行部分请求，根据返回结果绝定是否继续开启熔断

常用参数：

| 配置名称                                 | 说明                                       |
| ---------------------------------------- | ------------------------------------------ |
| circuitBreaker.requestVolumeThreshold    | 在一个时间窗口内，至少失败多少次会触发熔断 |
| circuitBreaker.sleepWindowInMilliseconds | 在熔断后，恢复为HALF_OPEN的时间            |
| circuitBreaker.errorThresholdPercentage  | 当错误百分比高于该值时，应触发熔断         |

# HystrixDashboard

导入依赖：

```xml
<dependency>
	<groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-hystrix-dashboard</artifactId>
</dependency>
```

