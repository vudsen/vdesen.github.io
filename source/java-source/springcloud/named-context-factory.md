---
title: NamedContextFactory使用与源码解读
date: 2023-03-07 19:54:11
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'SpringCloud', path: "/2023/03/05/java-source#Spring-Cloud"}
---

在OpenFeign中，我们可能用过如下配置:

```yaml
feign:
  client:
    config:
      # 为每个服务单独配置超时时间
      CLOUD-PAYMENT-SERVICE:
        connect-timeout: 1
        read-timeout: 1
      CLOUD-QUERY-SERVICE:
		connect-timeout: 5
        read-timeout: 5

```

我们为了给每个服务单独配置超时时间等设置，需要在配置文件里这样配置。

而这个东西的实现，和`NamedContextFactory`有脱不开的关系



这个东西你可以先暂时这样理解：

​	根据提供的服务名选择一个IOC容器，在这里就是每个服务都提供一个了IOC容器，然后我们在就可在各个容器里注册功能相同，但具体实现不同的类了。

这么做的好处：

- 子容器之间数据隔离。比如feign中每个Loadbalancer只管理自己的服务实例
- 子容器之间配置隔离。比如我们上面分别配置了超时时间

# 简单使用

下面的代码中，我们就实现了`service1`和`service2`两个容器：

```java
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.context.named.NamedContextFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.List;

@Component
@Slf4j
public class NamedContextTest {

    @PostConstruct
    public void init() {
        // 创建根context
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
		// 注册一个基础配置，后面每个容器都能访问到
        context.register(BaseConfig.class);
		// 可以看做初始化的方法
        context.refresh();
		
        // 这里我们自己实现的NamedContextFactory
        MyNamedContextFactory client = new MyNamedContextFactory(ClientCommonConfig.class);

        // 创建两个子容器, 第二个参数可以为子容器添加单独的配置
        MySpecification service1 = new MySpecification("service1", new Class[0]);
        MySpecification service2 = new MySpecification("service2", new Class[0]);
        
        // 设置根context
        client.setApplicationContext(context);
        // 把子容器加进去
        client.setConfigurations(List.of(service1, service2));

        BaseBean baseBean1 = client.getInstance("service1", BaseBean.class);
        BaseBean baseBean2 = client.getInstance("service2", BaseBean.class);
        log.info((baseBean1 == baseBean2) + "\t" + baseBean1 + "\t" + baseBean2);

        ClientCommonBean commonBean1 = client.getInstance("service1", ClientCommonBean.class);
        ClientCommonBean commonBean2 = client.getInstance("service2", ClientCommonBean.class);
        log.info((commonBean1 == commonBean2) + "\t" + commonBean1 + "\t" + commonBean2);
    }

    static class BaseConfig {

        @Bean
        BaseBean baseBean() {
            return new BaseBean();
        }

    }

    static class ClientCommonConfig {

        @Bean
        ClientCommonBean clientCommonBean(Environment environment, BaseBean baseBean) {
            return new ClientCommonBean(environment.getProperty(MyNamedContextFactory.PROPERTY_NAME), baseBean);
        }

    }

    public static class ClientCommonBean {
        private final String name;
        private final BaseBean baseBean;

        ClientCommonBean(String name, BaseBean baseBean) {
            this.name = name;
            this.baseBean = baseBean;
        }

        @Override
        public String toString() {
            return "ClientCommonBean{" +
                    "name='" + name + '\'' +
                    ", baseBean=" + baseBean +
                    '}';
        }
    }

    static class BaseBean {}

    static class MySpecification implements NamedContextFactory.Specification {

        private final String name;

        private final Class<?>[] configurations;

        public MySpecification(String name, Class<?>[] configurations) {
            this.name = name;
            this.configurations = configurations;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public Class<?>[] getConfiguration() {
            return configurations;
        }
    }


    static class MyNamedContextFactory extends NamedContextFactory<MySpecification> {
        private static final String PROPERTY_NAME = "test.context.name";

        public MyNamedContextFactory(Class defaultConfigType) {
            // 第一个参数也是为每个子容器提供相同的配置类，第二个就是一个名称
            // 第三个代表每个容器的名字应该从哪个属性找
            super(defaultConfigType, "myNamedContextFactory", PROPERTY_NAME);
        }
    }

}
```

运行后输出：

```plainText
2023-03-07 20:08:18.238  INFO 20596 --- [           main] p.xds.springcloud.test.NamedContextTest  : true	pers.xds.springcloud.test.NamedContextTest$BaseBean@2571066a	pers.xds.springcloud.test.NamedContextTest$BaseBean@2571066a
2023-03-07 20:08:18.242  INFO 20596 --- [           main] p.xds.springcloud.test.NamedContextTest  : false	ClientCommonBean{name='service1', baseBean=pers.xds.springcloud.test.NamedContextTest$BaseBean@2571066a}	ClientCommonBean{name='service2', baseBean=pers.xds.springcloud.test.NamedContextTest$BaseBean@2571066a}
```

可以发现给`context`注册的配置每个子容器都是一样的，给`client`声明的配置则是每个子容器独享的。

可以发现我们的配置类是<font color="red">不需要</font>被注册进IOC容器里的，比如`BaseConfig`我们就没有注册(没有加`@Component`什么的)，正常情况下里面的bean是拿不到的。



那么关于怎么去实现配置隔离呢？其实就可以直接在我们的`ClientCommonConfig`下手，可以发现我们能够在`Environment`拿到当前容器的名字，我们也可以根据名字拿到对应的配置(自动注入配置类)，然后单独设置对应的`ClientCommonConfig`！

# 源码分析

## 1. getInstance

其中一个比较重要的就是`getInstance`方法了:

```java
public <T> T getInstance(String name, Class<T> type) {
    AnnotationConfigApplicationContext context = this.getContext(name);

    try {
        return context.getBean(type);
    } catch (NoSuchBeanDefinitionException var5) {
        return null;
    }
}

protected AnnotationConfigApplicationContext getContext(String name) {
    if (!this.contexts.containsKey(name)) {
        synchronized(this.contexts) {
            if (!this.contexts.containsKey(name)) {
                this.contexts.put(name, this.createContext(name));
            }
        }
    }
	// this.context是一个ConcurrentHashMap
    return (AnnotationConfigApplicationContext)this.contexts.get(name);
}
```

这个很简单，就是根据`name`到Map中尝试获取对应的`Context`，然后再尝试获取对应的bean

## 2. 配置类是怎么被注入的

我们在前面，会给容器注册一个`BaseConfig`，以及后面我们给`client`，以及每个子容器添加配置类时，都会发现这些类上并没有被加上`@Compnoent`或`@Configuration`这些类，但最后这些类还是被注入了，这里来研究一下是怎么实现的。

先来看`AnnotationConfigApplicationContext#register`方法：

```java
@Override
public void register(Class<?>... componentClasses) {
    Assert.notEmpty(componentClasses, "At least one component class must be specified");
    StartupStep registerComponentClass = this.getApplicationStartup().start("spring.context.component-classes.register")
    .tag("classes", () -> Arrays.toString(componentClasses));
    this.reader.register(componentClasses);
    registerComponentClass.end();
}
```

可以发现比较重要的一句是`this.reader.register(componentClasses)`，而这个render则是`AnnotatedBeanDefinitionReader`类，打开文档说明：

> Convenient adapter for programmatic registration of bean classes.
> This is an alternative to ClassPathBeanDefinitionScanner, applying the same resolution of annotations but for explicitly registered classes only.

大致意思就是方便我们用编程的方式注册bean。

同样，后面的配置类也都是靠这个类来注册的，至于这个类怎么用：[待补坑](/)

