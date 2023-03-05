---

title: Zookeeper
date: 2023-03-04 22:17:12
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }

---

Zookeeper用法与Eureka相似。

## 服务提供者

### 导入依赖

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-zookeeper-discovery</artifactId>
</dependency>
```

### 添加配置

```yaml
spring:
  application:
    name: cloud-payment-service
  cloud:
    zookeeper:
      connect-string: localhost:2181
```

在主类添加`@EnableDiscoveryClient`注解

### 使用

```java
@Configuration
public class ApplicationContextConfig {

    @Bean
    // 这里是ribbon提供的负载均衡
    @LoadBanalce
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

}
```

直接用服务名代替域名即可，大致流程和Eureka一样，只不过注册中心变为了Zookeeper了。