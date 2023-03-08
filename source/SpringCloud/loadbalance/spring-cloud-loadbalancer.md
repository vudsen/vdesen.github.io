---
title: SpringCloudLoadbalancer
date: 2023-03-06 19:11:10
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "负载均衡", path: "/SpringCloud/loadbalance"}
---

Spring Cloud 2020版本以后，默认移除了对Netflix的依赖，其中就包括[Ribbon](https://so.csdn.net/so/search?q=Ribbon&spm=1001.2101.3001.7020)，官方默认推荐使用Spring Cloud Loadbalancer正式替换Ribbon，并成为了Spring Cloud负载均衡器的唯一实现。

导入依赖:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

# 基本原理

其基本原理如下：

### 1. RestTemplate

`RestTemplate`提供了一个`setInterceptors`方法，用于设置拦截器。

```JAVA
/**
 * Set the request interceptors that this accessor should use.
 * <p>The interceptors will get immediately sorted according to their
 * {@linkplain AnnotationAwareOrderComparator#sort(List) order}.
 * @see #getRequestFactory()
 * @see AnnotationAwareOrderComparator
 */
public void setInterceptors(List<ClientHttpRequestInterceptor> interceptors) {
    Assert.noNullElements(interceptors, "'interceptors' must not contain null elements");
    // Take getInterceptors() List as-is when passed in here
    if (this.interceptors != interceptors) {
        this.interceptors.clear();
        this.interceptors.addAll(interceptors);
        AnnotationAwareOrderComparator.sort(this.interceptors);
    }
}
```

### 2. LoadBalancerAutoConfiguration

在这里进行拦截器的注入：

```java
@Configuration(proxyBeanMethods = false)
@Conditional(RetryMissingOrDisabledCondition.class)
static class LoadBalancerInterceptorConfig {

   @Bean
   // LoadBalancerInterceptor是实现了ClientHttpRequestInterceptor接口的实现类
   public LoadBalancerInterceptor loadBalancerInterceptor(LoadBalancerClient loadBalancerClient,
         LoadBalancerRequestFactory requestFactory) {
      return new LoadBalancerInterceptor(loadBalancerClient, requestFactory);
   }

   @Bean
   @ConditionalOnMissingBean
   public RestTemplateCustomizer restTemplateCustomizer(final LoadBalancerInterceptor loadBalancerInterceptor) {
      return restTemplate -> {
         List<ClientHttpRequestInterceptor> list = new ArrayList<>(restTemplate.getInterceptors());
         list.add(loadBalancerInterceptor);
         restTemplate.setInterceptors(list);
      };
   }

}
```

其中`LoadBalancerInterceptor`是实现了`ClientHttpRequestInterceptor`接口的实现类，主要由该类进行请求的负载均衡

其中这个类在实例化时需要提供一个`LoadBalancerClient`，表示负载均衡客户端，用于处理负载均衡的具体逻辑，Spring只提供了一个`BlockingLoadBalancerClient`类。

## 3. LoadBalancerClient

这是`BlockingLoadBalancerClient`实现的接口，它还继承了`ServiceInstanceChooser`

```java
public interface LoadBalancerClient extends ServiceInstanceChooser {
    
    // 执行请求
	<T> T execute(String serviceId, LoadBalancerRequest<T> request) throws IOException;

    // 执行请求
	<T> T execute(String serviceId, ServiceInstance serviceInstance, LoadBalancerRequest<T> request) throws IOException;
	
    // 这里方法主要是将我们的服务名替换为域名
	URI reconstructURI(ServiceInstance instance, URI original);
}

public interface ServiceInstanceChooser {

	// 从服务中选择一个服务实例
	ServiceInstance choose(String serviceId);

	// 从服务中为指定的request选择一个服务实例
	<T> ServiceInstance choose(String serviceId, Request<T> request);

}
```

从`BlockingLoadBalancerClient`的`execute`方法进来，一路追到`choose`方法发现它最终是调用`ReactiveLoadBalancer`的实现类来实现复杂均衡算法的。

```java
@Override
public <T> ServiceInstance choose(String serviceId, Request<T> request) {
    // 获取负载均衡算法
    ReactiveLoadBalancer<ServiceInstance> loadBalancer = loadBalancerClientFactory.getInstance(serviceId);
    if (loadBalancer == null) {
        return null;
    }
    // 调用choose方法进行负载均衡
    Response<ServiceInstance> loadBalancerResponse = Mono.from(loadBalancer.choose(request)).block();
    if (loadBalancerResponse == null) {
        return null;
    }
    return loadBalancerResponse.getServer();
}
```

![实现类](https://xds.asia/public/SpringCloud/2023-2-1-2c6ce8dd-954a-4c32-8fa6-beb3892a95fd.webp)

可以发现有两个实现类

- RandomLoadBalancer：随机访问
- RoundRobinLoadBalancer：轮询

来看一下`getInstance`的具体实现：

```java
// LoadBalancerClientFactory
@Override
public ReactiveLoadBalancer<ServiceInstance> getInstance(String serviceId) {
    return getInstance(serviceId, ReactorServiceInstanceLoadBalancer.class);
}

// NamendContextFactory
// getInstance：根据名称和类型获取bean
public <T> T getInstance(String name, Class<T> type) {
    AnnotationConfigApplicationContext context = this.getContext(name);

    try {
        return context.getBean(type);
    } catch (NoSuchBeanDefinitionException var5) {
        return null;
    }
}
```

如果要了解更多，请先查阅：[NamendContextFactory的使用与源码](/java-source/named-context-factory)

# 自定义负载均衡配置

只需要通过注解`@LoadBalancerClient`或`@LoadBalancerClients`就可以轻松实现配置不同的负载均衡策略。
