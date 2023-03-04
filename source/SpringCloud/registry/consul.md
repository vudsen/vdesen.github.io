---

title: Eureka
date: 2023-03-04 22:17:12
tags: 

---

[Consul by HashiCorp](https://www.consul.io/)

Consul是一套开源的分布式服务发现和配置管理系统，由HashiCorp公司用Go语言开发。

下载：[Downloads | Consul by HashiCorp](https://www.consul.io/downloads)

下载后是一个exe，在控制台中打开即可。

## 1. 服务提供者

使用如下指令启动：

```bash
consul agent -dev
```

启动后可以通过http://localhost:8500来访问首页

### 1.1 导入依赖

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-consul-discovery</artifactId>
</dependency>
```

### 1.2 添加配置

```yaml
application:
	name: consul-provider-payment
spring:
	cloud:
		consul:
			host: localhost
			port: 8500
			discovery:
				service-name: ${spring.application.name}
```

主类添加`@EnableDiscoveryClient`注解

### 1.3 控制器

```java
@RestController
@Slf4j
public class PaymentController {

    @Value("${server.port}")
    private String serverPort;

    @RequestMapping("/payment/consul")
    public String paymentConsul() {
        return "springcloud with consul: " + serverPort + "\\t" + UUID.randomUUID();
    }

}
```

## 2. 服务消费者

消费者的依赖和提供者一致，主类也一样要提供`@EnableDiscoveryClient`注解。

跟zookeeper一样，先写一个配置类：

```java
@Configuration
public class ApplicationConextConfig {

    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

}
```

### 2.1 远程调用

```java
@RestController
public class OrderConsulController {

    public static final String URL = "<http://consul-provider-payment>";

    private RestTemplate restTemplate;

    @Autowired
    public void setRestTemplate(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @GetMapping("/consumer/payment/consul")
    public String getOrder() {
        return restTemplate.getForObject(URL + "/payment/consul", String.class);
    }

}
```