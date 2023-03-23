---
title: springboot源码
date: 2023-03-23 21:19:36
tags:
---

# 1. 基础

通过`AnnotationConfigApplicationContext`可以创建一个Spring容器：

```java
public class MySpringApplication {

    public static void main(String[] args) {
        AnnotationConfigApplicationContext applicationContext = new AnnotationConfigApplicationContext(AppConfig.class);

        UserService userService = (UserService) applicationContext.getBean("userService");
        userService.test();
    }

}

@ComponentScan("pers.xds.springboot")
public class AppConfig {
}

```

## 1.1 生命周期

可以在`AbstractAutowireCapableBeanFactory#doCreateBean`中看到完整的bean生成流程。

构造方法 -> 普通对象 -> 依赖注入 -> 初始化(afterPropertiesSet) -> 初始化后(AOP) -> 代理对象 -> 放入容器
