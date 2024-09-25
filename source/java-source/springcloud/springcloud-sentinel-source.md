---
title: SpringCloud Sentinel 排队等待和Warm Up限流源码
date: 2023-03-07 19:54:11
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'SpringCloud', path: "/2023/03/05/java-source#Spring-Cloud"}
---

# WarmUp

WarmUp的原理是<font color=red>基于</font>令牌桶算法，该算法存在一个"桶"来存放令牌，系统每一段时间就会往桶中存放一定数量的令牌。每一个请求会消耗一定数量的令牌，如果令牌足够，则该请求直接通过并消耗对应的令牌，否则则会拒绝该请求或者进行排队等待。

WarmUp的源码在`com.alibaba.csp.sentinel.slots.block.flow.controller.WarmUpController`。

<font color=red>但直接看源码可能会很懵逼，可以先看一下这篇博客</font>：[Sentinel中的冷启动限流算法 - 掘金 (juejin.cn)](https://juejin.cn/post/6856034352943104008)

根据这篇博客，我们可以知道WarmUp的基本原理：

- 令牌产生速度与桶中的令牌数量成反比。也就是消耗越快，产生越快。
- 在一开始，会把令牌桶赛满，之后请求通过后消耗令牌，并同时加快令牌生产速度。

这里有个问题，如果一个请求需要消耗大量令牌，那么不是可以瞬间导致令牌生产速度拉满？那么这里就是Sentinel的相关改进了。



首先通过构造器我们需要记住如下几个重要参数：

| 名称              | 说明               |
| ----------------- | ------------------ |
| count             | 在控制台设置的QPS  |
| coldFactor        | 冷加载因子         |
| warningToken      | 预警令牌数量       |
| maxToken          | 令牌桶最大令牌数量 |
| slope             | 某个函数的斜率     |
| warmUpPeriodInSec | 预热时间           |

有些写的很模糊，但是别急，我们先来看`syncToken`方法，这个方法是由`canPass`调用的：

```java
protected void syncToken(long passQps) {
    // 获取当前时间
    long currentTime = TimeUtil.currentTimeMillis();
    // 将毫秒位设置为0
    currentTime = currentTime - currentTime % 1000;
    // 获取上一次填充令牌桶的时间
    long oldLastFillTime = lastFilledTime.get();
    // 如果已经被别人改过了，就直接退出
    if (currentTime <= oldLastFillTime) {
        return;
    }
	// 获取现有的令牌数量
    long oldValue = storedTokens.get();
    // 计算新的令牌数量
    long newValue = coolDownTokens(currentTime, passQps);

    if (storedTokens.compareAndSet(oldValue, newValue)) {
        long currentValue = storedTokens.addAndGet(0 - passQps);
        if (currentValue < 0) {
            storedTokens.set(0L);
        }
        lastFilledTime.set(currentTime);
    }

}

private long coolDownTokens(long currentTime, long passQps) {
    // 获取现有的令牌数量
    long oldValue = storedTokens.get();
    long newValue = oldValue;

    // 当令牌的消耗程度远远低于警戒线的时候
    // newValue = (已有令牌数量 + (时间间隔多少毫秒) * 每毫秒产生令牌的数量)
    if (oldValue < warningToken) {
        newValue = (long)(oldValue + (currentTime - lastFilledTime.get()) * count / 1000);
    } else if (oldValue > warningToken) {
        // 到这里，说明还是冷启动阶段
        if (passQps < (int)count / coldFactor) {
            newValue = (long)(oldValue + (currentTime - lastFilledTime.get()) * count / 1000);
        }
    }
    return Math.min(newValue, maxToken);
}
```







