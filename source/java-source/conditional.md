---
title: "@Conditional注解"
date: 2023-03-05 23:27:12
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'SpringBoot', path: "/2023/03/05/java-source#Spring-Boot"}
---

`@Conditional`的作用可以理解为满足一定条件就进行注入。

# 1. 简介

其源码如下：

```java
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Conditional {

	/**
	 * All {@link Condition} classes that must {@linkplain Condition#matches match}
	 * in order for the component to be registered.
	 */
	Class<? extends Condition>[] value();

}
```

在使用时只需传入Condition接口的实现类即可。

在Condition接口中，只有一个`matches`方法：

```java
@FunctionalInterface
public interface Condition {

	/**
	 * Determine if the condition matches.
	 * @param context the condition context
	 * @param metadata the metadata of the {@link org.springframework.core.type.AnnotationMetadata class}
	 * or {@link org.springframework.core.type.MethodMetadata method} being checked
	 * @return {@code true} if the condition matches and the component can be registered,
	 * or {@code false} to veto the annotated component's registration
	 */
	boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata);

}
```

当matches返回true时，将会进行注册。

# 2. SpringBootCondition

SpringBootCondition可以配合日志系统，帮助我们查看加载了哪些类。

我们只需要实现一个方法即可：

```java
/**
 * Determine the outcome of the match along with suitable log output.
 * @param context the condition context
 * @param metadata the annotation metadata
 * @return the condition outcome
 */
public abstract ConditionOutcome getMatchOutcome(ConditionContext context, AnnotatedTypeMetadata metadata);
```

如果匹配，则直接返回`ConditionOutcome.matches`。或者在不匹配时调用`ConditionOutcome.noMatch`。

# 3. 拓展

**@ConditionalOnBean**：仅仅在当前上下文中存在某个对象时，才会实例化一个Bean。
**@ConditionalOnClass**：某个class位于类路径上，才会实例化一个Bean。
**@ConditionalOnExpression**：当表达式为true的时候，才会实例化一个Bean。
**@ConditionalOnMissingBean**：仅仅在当前上下文中不存在某个对象时，才会实例化一个Bean。
**@ConditionalOnMissingClass**：某个class类路径上不存在的时候，才会实例化一个Bean。
**@ConditionalOnNotWebApplication**：不是web应用，才会实例化一个Bean。
**@ConditionalOnBean**：当容器中有指定Bean的条件下进行实例化。
**@ConditionalOnMissingBean**：当容器里没有指定Bean的条件下进行实例化。
**@ConditionalOnClass**：当classpath类路径下有指定类的条件下进行实例化。
**@ConditionalOnMissingClass**：当类路径下没有指定类的条件下进行实例化。
**@ConditionalOnWebApplication**：当项目是一个Web项目时进行实例化。
**@ConditionalOnNotWebApplication**：当项目不是一个Web项目时进行实例化。
**@ConditionalOnProperty**：当指定的属性有指定的值时进行实例化。
**@ConditionalOnExpression**：基于SpEL表达式的条件判断。
**@ConditionalOnJava**：当JVM版本为指定的版本范围时触发实例化。
**@ConditionalOnResource**：当类路径下有指定的资源时触发实例化。
**@ConditionalOnJndi**：在JNDI存在的条件下触发实例化。
**@ConditionalOnSingleCandidate**：当指定的Bean在容器中只有一个，或者有多个但是指定了首选的Bean时触发实例化。

# 4. 疑问

在看源码时，经常会发现一些`Conditional`的注解顶在一个静态类上，比如下面的：

```java
private static class RetryMissingOrDisabledCondition extends AnyNestedCondition {

    RetryMissingOrDisabledCondition() {
        super(ConfigurationPhase.REGISTER_BEAN);
    }

    @ConditionalOnMissingClass("org.springframework.retry.support.RetryTemplate")
    static class RetryTemplateMissing {

    }

    @ConditionalOnProperty(value = "spring.cloud.loadbalancer.retry.enabled", havingValue = "false")
    static class RetryDisabled {

    }

}
```

网上查了一下没找到，所以自己打算测试一下这是干什么的。

首先我猜测的话：如果这个Condition为false，后面在外部的注册请求都会被拒绝。

首先我们写一个测试类：

```java
// 这个condition肯定是false
@ConditionalOnProperty(value = "xxx", havingValue = "xxx")
public class TestClass {

    public TestClass() {
        System.out.println("被实例化了");
    }
}
```

然后在主类注册：

```java
@SpringBootApplication
public class TestApplication {
    
    @Bean
    public TestClass testClass() {
        return new TestClass();
    }

    public static void main(String[] args) {
        SpringApplication.run(TestApplication.class, args);
    }
}
```

运行后发现这个类还是被实例化了。

猜测可能是需要在Condition类里使用：

```java
public class MyCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return true;
    }

    @ConditionalOnProperty(value = "true", havingValue = "false")
    public static class Test {
        public Test() {
            System.out.println("被实例化了");
        }
    }

}
```

最后发现`Test`类还是会被注入。

emmm就先这样吧，如果以后发现有什么用了就再来补坑。
