---
title: SpringCloud Config
date: 2023-03-01 11:56
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "配置中心", path: "/SpringCloud/config-center"}
---

[官方文档：Spring Cloud Config](https://spring.io/projects/spring-cloud-config)

SpringCloud Config为微服务架构中的微服务提供集中化的外部配置支持，配置服务器为<font color=red>各个不同微服务应用</font>的所有环境提供了一个<font color=red>中心化的外部配置</font>。

# 1. 简单使用

## 1.1 服务端

导入配置：

```yaml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-config-server</artifactId>
</dependency>
```

添加配置：

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
		  # 如果是私有库则添加下面的内容
          username: xxxxxx
          password: xxxxxx
          skip-ssl-validation: true
      label: master
eureka:
  client:
    service-url:
      defaultZone: http://localhost:7001/eureka

```

在启动类上添加`@EnableConfigServer`注解

### 1.1.1 配置文件读取

| 格式                                 | 说明                               | 示例                        |
| ------------------------------------ | ---------------------------------- | --------------------------- |
| /{label}/{application}-{profile}.yml | 读取label分支下对应的配置文件      | /master/application-dev.yml |
| /{application}-{profile}.yml         | 读取主分支下相关配置文件           | /application.yml            |
| /{application}/{profile}/[{label}]   | 使用该模式将会以json的格式读取配置 | /application/dev/master     |

- label：分支名
- application(在配置文件中叫name)：服务名
- profiles：环境(dev/test/prod)

## 1.2 客户端

添加依赖:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-config</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bootstrap</artifactId>
</dependency>
```

添加配置文件`bootstrap.yml`。

`bootstrap.yml`是系统级的，优先级更高，`application.yaml`是用户级别的资源配置项。

Spring Cloud会创建一个“Bootstrap Context”，作为Spring应用的Application Context的父上下文。初始化的时候，BootstrapContext负责从外部源加载配置属性并解析配置。这两个上下文共享一个从外部获取的Environment。

Bootstrap')属性有高优先级，默认情况下，它们不会被本地配置覆盖。`Bootstrap context`和`Application Context`有着不同的约定，所以新增了一个`bootstrap.yml`文件，保证``Bootstrap Context`和`Application Context`配置的分离。

要将Client模块下的application.yml文件改为bootstrap.yml,这是很关键的，因为bootstrap.yml是比application.yml先加载的。bootstrap.yml优先级高于application.ym

```yaml
server:
  port: 3355

spring:
  application:
    name: config-client
  cloud:
    config:
      label: master
      name: config
      profile: dev
      uri: http://localhost:3344
    # 这条可能需要在application.yaml里写
    bootstrap:
      enabled: true

eureka:
  client:
    service-url:
      defaultZone: http://localhost:7001/eureka



```

主启动类以及业务类：

```java
@EnableEurekaClient
@SpringBootApplication
public class CloudConfigClient3355 {

    public static void main(String[] args) {
        SpringApplication.run(CloudConfigClient3355.class, args);
    }
}

@RestController
public class ConfigClientController {

    @Value("${config.info}")
    private String configInfo;


    @GetMapping("/configInfo")
    public String getConfigInfo() {
        return configInfo;
    }

}
```

### 1.2.1 客户端动态刷新问题

在仓库修改配置后，配置中心能够及时的感应到变化，而在客户端则只能重启才能拿到最新的值。

导入配置：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

添加配置：

```yaml
# 需要写在application.yaml里
management:
  endpoint:
    web:
      exposure:
		# 暴露所有的监控指标
        include: *
```

添加`@RefreshScope`注解:

```java
@RestController
@RefreshScope
public class ConfigClientController {

    @Value("${config.info}")
    private String configInfo;


    @GetMapping("/configInfo")
    public String getConfigInfo() {
        return configInfo;
    }

}
```

之后需要往客户端发送一个POST请求，就可以手动刷新配置：

```shell
curl -X POST "http://localhost:3355/actuator/refresh"
```

