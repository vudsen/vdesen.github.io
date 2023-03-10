---
title: SpringCloud Gateway
date: 2023-03-04 22:17:12
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "服务网关", path: "/SpringCloud/gateway/"}
---

[Spring Cloud Gateway](https://spring.io/projects/spring-cloud-gateway#overview)

SpringCloud Gateway作为Spring Cloud生态系统中的网关，目标是替代Zuul，在Spring Cloud 2.0以上版本中，没有对新版本的Zuul 2.0以上最新高性能版本进行集成，仍然还是使用的Zuul 1.x非Reactor模式的老版本。而为了提升网关的性能，SpringCloud Gateway是基于WebFlux框架实现的，而WebFlux框架底层则使用了高性能的Reactor模式通信框架Netty

# 核心概念

Spring Cloud Gateway主要由三部分组成：

- Route(路由)：路由是构建网关的基本模块，它由ID，目标URI，一系列的断言和过滤器组成。

- Predicate(断言)：参考`java.util.function.Predicate`，开发人员可以匹配HTTP请求中的所有内容，如果请求与断言相匹配则进行路由。
- Filter(过滤)：指的是Spring框架中GatewayFilter的实例，使用过滤器，可以在请求被路由前或路由后进行修改。

web请求，通过一些匹配条件，定位到真正的服务节点。并在这个转发过程的前后，进行一些精细化控制。 

predicate就是我们的匹配条件。而Filter，就可以理解为一个无所不能的拦截器。有了这两个元素，再加上目标URI，就可以实现一个具体的路由了.

# 基本使用

导入依赖：

```java
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
```

注意不能导入`spring-boot-starter-web`，否则会报错。

主启动类：

```java
@SpringBootApplication
@EnableDiscoveryClient
public class GatewayMain9527 {

    public static void main(String[] args) {
        SpringApplication.run(GatewayMain9527.class, args);
    }

}
```

## 配置文件配置网关

配置文件：

```yaml
server:
  port: 9527
spring:
  application:
    name: cloud-gateway
  cloud:
    gateway:
      routes:
        - id: payment_routh # 路由的id
          uri: http://localhost:8001 # 匹配后提供服务的路由地址
          predicates:
            - Path=/payment/get/** # 断言
        - id: payment_routh2
          uri: http://localhost:8001
          predicates:
            - Path=/payment/lb/**

eureka:
  instance:
    hostname: cloud-gateway-service
  client:
    service-url:
      register-with-eureka: true
      fetch-registry: true
      defaultZone: http://localhost:7001/eureka
```

之后就可以通过网络来访问相关的服务了，这个功能类似于Nginx。

## 代码配置网关

除了使用配置文件，还可以通过代码的方式配置网关。

```java
@SpringBootApplication
public class DemogatewayApplication {
	@Bean
	public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
		return builder.routes()
			.route("path_route", r -> r.path("/get")
				.uri("http://httpbin.org"))
			.route("host_route", r -> r.host("*.myhost.org")
				.uri("http://httpbin.org"))
			.route("rewrite_route", r -> r.host("*.rewrite.org")
				.filters(f -> f.rewritePath("/foo/(?<segment>.*)", "/${segment}"))
				.uri("http://httpbin.org"))
			.route("hystrix_route", r -> r.host("*.hystrix.org")
				.filters(f -> f.hystrix(c -> c.setName("slowcmd")))
				.uri("http://httpbin.org"))
			.route("hystrix_fallback_route", r -> r.host("*.hystrixfallback.org")
				.filters(f -> f.hystrix(c -> c.setName("slowcmd").setFallbackUri("forward:/hystrixfallback")))
				.uri("http://httpbin.org"))
			.route("limit_route", r -> r
				.host("*.limited.org").and().path("/anything/**")
				.filters(f -> f.requestRateLimiter(c -> c.setRateLimiter(redisRateLimiter())))
				.uri("http://httpbin.org"))
			.build();
	}
}
```

# 动态路由

默认情况下Gateway会根据注册中心注册的服务列表，以注册中心上的微服务名为路径创建动态路由进行转发，从而实现动态路由的过程。

修改配置文件为：

```yaml
server:
  port: 9527
spring:
  application:
    name: cloud-gateway
  cloud:
    gateway:
      discovery:
        locator:
          # 开启从注册中心动态创建路由的过程
          enabled: true
      routes:
        - id: payment_routh # 路由的id
          uri: lb://cloud-payment-service # 匹配后提供服务的路由地址
          predicates:
            - Path=/payment/get/** # 断言
        - id: payment_routh2
          uri: lb://cloud-payment-service
          predicates:
            - Path=/payment/lb/**

eureka:
  instance:
    hostname: cloud-gateway-service
  client:
    service-url:
      register-with-eureka: true
      fetch-registry: true
      defaultZone: http://localhost:7001/eureka
```

之后再正常方法，可以正常使用负载均衡，而且不用配置相关服务器URI

# 常用断言(Predicate)

[Spring Cloud Gateway - Route Predicate Factories](https://docs.spring.io/spring-cloud-gateway/docs/current/reference/html/#gateway-request-predicates-factories)

| 名称   | 说明                                                         | 示例                                                  |
| ------ | ------------------------------------------------------------ | ----------------------------------------------------- |
| After  | 要求访问时间在指定日期之后. 可以通过ZonedDateTime类获取，同样的还有Before，Between | \- After=2017-01-20T17:42:47.789-07:00[Asia/Shanghai] |
| Cookie | 限制用户的Cookie必须包含指定的K-V才能访问，Value可以使用正则表达式 | \- Cookie=chocolate, .+                               |
| Header | 限制用户的请求头必须包含指定的K-V才能访问，Value可以使用正则表达式 | -Header=X-Request-Id, \d+                             |

# 过滤器的使用

[`GatewayFilter` Factories](https://docs.spring.io/spring-cloud-gateway/docs/current/reference/html/#gatewayfilter-factories)

使用过滤器可以在请求被发送之前或请求发送之后都请求数据进行修改。

## 使用预设的请求头

```yaml
spring:
	cloud:
		routes:
			- id: xxx
			  filters:
			  	# 过滤器工厂会在匹配的请求头上添加下面的键值对
			  	- AddRequestHeader=X-Request-Id,1024
```

## 配置自定义的全局拦截器

```java
@Component
@Order(0)
@Slf4j
public class MyLogGatewayFilter implements GlobalFilter {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        log.info("*******come in, log is here");
        return chain.filter(exchange);
    }


}
```

