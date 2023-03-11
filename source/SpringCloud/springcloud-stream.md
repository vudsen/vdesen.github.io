---
title: SpringCloud Stream
date: 2023-03-10 21:54:25
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
---

[Spring Cloud Stream官方文档](https://spring.io/projects/spring-cloud-stream)

SpringCloud Stream是一个构建消息驱动微服务的框架。

应用程序通过input或output来与SpringCloud Stream中Binder对象交互。

通过我们的配置来binding(绑定)，而SpringCloud Stream的Binder对象负责与消息中间件交互。

所以，我们只需要搞清楚如何与SpringCloud Stream交互，就可方便地使用消息驱动的方式。



例如有些时候，系统使用了RabbitMQ和Kafaka这两种消息中间件，这些中间件的差异性导致我们实际项目开发给我们造成了一定的困扰，我们如果用了两个消息队列的其中一种，后面的业务需求，我想往另外一种消息队列进行迁移，这时候无疑就是一个灾难性的，<font color=red>一大堆东西都要重新推倒重新做</font>，因为它跟我们的系统耦合了，这时候SpringCloud Stream给我们提供了—种解耦合的方式。

![原理图](https://xds.asia/public/SpringCloud/2023-2-5-5cd6b4a3-9c77-4f90-bdf9-fe668bc030fa.webp)

通过定义绑定区Binder作为中间层，实现了应用程序与消息中间件细节之间的隔离。

# 基本使用

如果你在网上看到的还是用`@EnableBinding`注解的，那么<font color=red>说明这个教程已经过时了</font>！！

我自己在这里研究了一下新版是怎么玩的。

## 单个消费者

### 消费者配置

导入依赖

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-stream-rabbit</artifactId>
</dependency>
```

消费者非常简单，直接注入一个`Functional`接口即可：

```java
@Component
public class ReceiveMessageController {

    @Bean
    public Consumer<Message<String>> sendMsg() {
        return stringMessage -> {
            System.out.println(stringMessage.getPayload());
            System.out.println("收到消息");
        };
    }

}
```

启动之后查看RabbitMQ上的交换机：

![交换机列表](https://xds.asia/public/SpringCloud/2023-2-6-130e3b65-2843-4b38-b1f2-c5a381c75d06.webp)

可以发现多出了一个`sendMsg-in-0`交换机，同时该主题下同时也拥有一个匿名队列，里面有一个消费者，就是我们刚才启动的消费者。

### 生产者

生产者同样十分简单，只需要注入`StreamBridge`然后发送消息即可：

```java
@Component
public class IMessageProviderImpl implements IMessageProvider {

    private StreamBridge streamBridge;

    @Autowired
    public void setStreamBridge(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }


    @Override
    public String send() {
        String uuid = UUID.randomUUID().toString();
        streamBridge.send("sendMsg-in-0", uuid);
        return uuid;
    }


}
```

之后发送消息，消费者端能够成功接收到消息。

## 消费者集群

如果开启多个消费者，可以发现每个消费者都会单独开一个队列，但大部分情况下我们希望是多个消费者共用一个队列。

这里必须要配置`group`属性：[文档](https://docs.spring.io/spring-cloud-stream/docs/current/reference/html/spring-cloud-stream.html#_configuration_options)

需要注意的时，配置的时候必须是这样的：

```yaml
spring:
  cloud:
    stream:
      bindings:
      	# 这里后面必须加上in-0
        sendMsg-in-0:
          group: 'testGroup'
```

关于这里的`in-0`是什么，我们后面再讲。

重启之后登录RabbitMQ控制台查看：

![控制台](https://xds.asia/public/SpringCloud/2023-2-6-fdfb00cf-1328-44d3-aadc-05d77230677c.webp)

可以发现两个消费者都成功地放在了同一个队列里。

## 配置多个消费者

我们在代码中肯定不可能只配置一个消费者，在配置多个消费者之前，我们来看一下之前`sendMsg-in-0`后面的`in-0`是什么。

[官方文档](https://docs.spring.io/spring-cloud-stream/docs/current/reference/html/spring-cloud-stream.html#_functional_binding_names)

在官方文档说明了，每个`Function`都会被分作如下两种名称

- input - `<functionName> + -in- + <index>`
- output - `<functionName> + -out- + <index>`

在只有单个input/output function时，index永远为0(~~这不废话~~)

首先我们尝试注入两个`Functional`进去：

```java
@Component
public class ReceiveMessageController {

    @Bean
    public Consumer<Message<String>> sendMsg() {
        return stringMessage -> {
            System.out.println(stringMessage.getPayload());
            System.out.println("收到消息");
        };
    }

    @Bean
    public Consumer<Message<String>> consumeMessage() {
        return stringMessage -> {
            System.out.println("******consume message:" + stringMessage.getPayload());
        };
    }

}
```

启动后发现，不仅原来的`sendMsg`寄了，而且新的`consumeMessage`也没有生效。

仔细翻了一下[文档](https://docs.spring.io/spring-cloud-stream/docs/current/reference/html/spring-cloud-stream.html#_multiple_functions_in_a_single_application)，发现如果有多个`Functional`接口被注入了，则必须要在配置文件中指明哪些是用作SpringCloud Stream的。

因此添加如下配置：

```yaml
spring:
  cloud:
    function:
      definition: sendMsg;consumeMessage
```

注意每个名称之间用分号分隔。

之后再次启动，发现两个交换机都出现了，但两个交换机后面的索引还是为0。。。

但是众所周知，Spring里不会出现同名的bean，那么这个索引有什么用就暂时不是很清楚了。。

## 手动应答

若要开启手动应答，需要如下配置：

```yaml
spring:
  cloud:
    stream:
      rabbit:
        bindings:
          sendMsg-in-0:
            consumer:
              # 手动ack
              acknowledge-mode: manual
```

之后在代码中进行手动应答：

```java
@Bean
public Consumer<Message<String>> sendMsg() {
    return stringMessage -> {
        MessageHeaders headers = stringMessage.getHeaders();
        Channel channel = headers.get(AmqpHeaders.CHANNEL, Channel.class);
        if (channel == null) {
            System.out.println("channel is null");
            throw new IllegalArgumentException("channel is null");
        }
        Long deliveryTag = headers.get(AmqpHeaders.DELIVERY_TAG, Long.class);
        if (deliveryTag == null) {
            throw new IllegalArgumentException("deliveryTag is null");
        }
        try {
            int v = (int) (Math.random() * 2);
            System.out.println("收到消息: " + stringMessage.getPayload());
            if (v == 0) {
                System.out.println("**********取消");
                channel.basicReject(deliveryTag, true);
            } else {
                System.out.println("**********确认");
                channel.basicAck(deliveryTag, false);
            }
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    };
}
```

# 配置

## 消费者配置

下面的配置需要在``spring.cloud.stream.rabbit.bindings.<channelName>.consumer.``处设置

更多请查阅[官方文档](https://docs.spring.io/spring-cloud-stream/docs/current/reference/html/spring-cloud-stream-binder-rabbit.html#_rabbitmq_consumer_properties)，这里只讲一些常用的

| 名称                | 说明                        |
| ------------------- | --------------------------- |
| *acknowledgeMode*   | 应答模式，默认为 `AUTO`     |
| *bindingRoutingKey* | 设置绑定时的路由，默认为`#` |
