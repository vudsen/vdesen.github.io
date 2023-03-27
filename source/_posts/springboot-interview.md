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

Spring在注入的时候先根据类型去找，若找到多个，再根据名称去筛选。

## 1.2 AOP

常见的动态代理有两种：

- JDK动态代理：基于Java反射机制实现，必须要实现了接口的业务类才生成代理对象。

- CGLIB动态代理：基于ASM机制实现，通过生成业务类的子类作为代理类。

JDK Proxy的优势：

​	最小化依赖关系、代码实现简单、简化开发和维护、JDK原生支持，比CGLIB更加可靠，随JDK版本平滑升级。而字节码类库通常需要进行更新以保证在新版Java上能够使用。

CGLIB的优势：

​	无需实现接口，达到代理类无侵入，只操作关心的类，而不必为其他相关类增加工作量。高性能。

[Java动态代理之一CGLIB详解 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/115744594)

## 1.3 事务

[可能是最漂亮的Spring事务管理详解 - 掘金 (juejin.cn)](https://juejin.cn/post/6844903608224333838)
