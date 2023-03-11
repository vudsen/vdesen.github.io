---
title: Nacos服务注册和配置中心
date: 2023-03-11 15:18:25
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
---

# 下载安装

[Releases · alibaba/nacos (github.com)](https://github.com/alibaba/nacos/releases)

下载后进入bin目录下，使用如下指令启动：

```shell
# 使用单机模式
startup.cmd -m standalone
```

新版本需要手动配置密匙，否则启动会失败，打开`conf/application.properties`，配置下面的内容：

```properties
### The default token (Base64 String):
nacos.core.auth.plugin.nacos.token.secret.key=VGhpc0lzTXlDdXN0b21TZWNyZXRLZXkwMTIzNDU2Nzg=
```

之后就可以在网页登录了，默认账号和密码都是`nacos`

Nacos同时支持CP和AP模式的切换。

# 服务注册与发现

## 服务注册

导入依赖：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

添加配置：

```yaml
server:
  port: 9001

spring:
  application:
    name: nacos-payment-provider
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848

management:
  endpoint:
    web:
      exposure:
        include: "*"
```

主启动类添加`@EnableDiscoveryClient`，启动后即可完成服务注册。

## 服务消费

导入同样的依赖：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

配置：

```yaml
spring:
  application:
    name: nacos-order-consumer
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848

# 下面为可选
service-url:
  nacos-user-service: http://nacos-payment-provider
```

主启动类还是只需要添加`@EnableDiscoveryClient`即可。

配置类：

```java
@Configuration
public class ApplicationContextConfig {

    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

}
```

业务类：

```java
@RestController
public class OrderNacosController {

    private RestTemplate restTemplate;

    @Autowired
    public void setRestTemplate(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Value("${service-url.nacos-user-service}")
    private String serverUrl;

    @GetMapping("/consumer/payment/nacos/{id}")
    public String paymentInfo(@PathVariable Integer id) {
        return restTemplate.getForObject(serverUrl + "/payment/nacos/" + id, String.class);
    }

}
```

# 配置中心

[Nacos config · alibaba/spring-cloud-alibaba Wiki (github.com)](https://github.com/alibaba/spring-cloud-alibaba/wiki/Nacos-config)

## 基础配置

导入配置：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-config</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bootstrap</artifactId>
</dependency>
```

Nacos同SpringCloud Config一样，在项目初始化时，要保证先从配置中心进行配置拉取，拉取配置之后才能保证项目的正常启动。

`bootstrap.yaml`:

```yaml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
      config:
        server-addr: localhost:8848
        file-extension: yaml
        shared-configs:
          # 开启刷新
          - data-id: nacos-config-client-dev.yaml
            refresh: true
```

`application.yaml`:

```yaml
spring:
  profiles:
  	# 指示导入dev配置
    active: dev
```

在运行后，Nacos会去获取指定`dataId`的配置文件。

在 Nacos Spring Cloud 中，`dataId` 的完整格式如下：

```plain
${prefix}-${spring.profiles.active}.${file-extension}
```

- `prefix` 默认为 `spring.application.name` 的值，也可以通过配置项 `spring.cloud.nacos.config.prefix`来配置。
- `spring.profiles.active` 即为当前环境对应的 profile，详情可以参考 [Spring Boot文档](https://docs.spring.io/spring-boot/docs/current/reference/html/boot-features-profiles.html#boot-features-profiles)。 **注意：当 `spring.profiles.active` 为空时，对应的连接符 `-` 也将不存在，dataId 的拼接格式变成 `${prefix}.${file-extension}`**
- `file-exetension` 为配置内容的数据格式，可以通过配置项 `spring.cloud.nacos.config.file-extension` 来配置。目前只支持 `properties` 和 `yaml` 类型。



在上面的配置中，`dataId`即为：`nacos-config-client-dev`，不需要配置后面的`.yaml`后缀。

最后，在需要动态刷新的类上添加`@RefreshScope`即可完成配置中心客户端。

在web控制界面修改值，客户端能自动进行修改，不需要额外配置消息队列。

# 集群以及持久化配置

## 持久化配置

默认Nacos使用嵌入式数据库`derby`实现数据的存储。所以，如果启动多个默认配置下的Nacos节点，数据存储是存在一致性问题的。为了解决这个问题，Nacos采用了集中式存储的方式来支持集群化的部署，目前只支持MySQL。

首先找到`conf/mysql-schema.sql`，在数据库中运行，创建相关的表。

之后打开`conf/application.properties`，设置如下参数：

```properties
### If use MySQL as datasource:
spring.datasource.platform=mysql

### Count of DB:
db.num=1

### Connect URL of DB:
db.url.0=jdbc:mysql://127.0.0.1:3306/cloud?characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true&useUnicode=true&useSSL=false&serverTimezone=UTC
db.user.0=root
db.password.0=abc123
```

重启，即可使用mysql做持久化。

## 集群部署

首先每个集群需要配置持久化为MySql，之后需要配置`cluster.conf`。

在`conf`下创建一个`cluster.conf`，官方提供了一个`cluster.conf.example`：

```text
192.168.16.101:3333
192.168.16.102:4444
192.168.16.103:5555
```

这里不能写`127.0.0.1`，否则会报错。

之后通过Nginx来进行负载均衡：

```nginx
upstream cluster {
    server 127.0.0.1:3333
    server 127.0.0.1:4444
    server 127.0.0.1:5555
}

server {
    listen 80;
    server_name localhost;
    
    location / {
        proxy_pass http://cluster
    }
}
```

之后在客户端直接配置连接1111端口即可。