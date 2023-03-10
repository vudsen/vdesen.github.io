---
title: synchronized与锁升级
date: 2023-03-09 23:11:15
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'JVM', path: "/2023/03/05/java-source#JVM"}
---

首先我们都知道，synchronized对应了四种锁：

无锁态 -> 偏向锁 -> 轻量级锁 -> 重量级锁

其中偏向锁在java15中移除，原因是CAS等无锁操作的运用，导致偏向锁带来的收益已不如过去那么明显，而且在当下多线程应用越来越普遍的情况下，偏向锁带来的锁升级操作反而会影响应用的性能。

[JEP 374: Deprecate and Disable Biased Locking (openjdk.org)](https://openjdk.org/jeps/374)

这里就分别讲一下这四种锁。

# 无锁态

首先这里需要注意一点：<font color=red>无锁态只能升级为轻量级锁，不能升级为偏向锁</font>。

听起来很扯淡，不过我们用代码验证一下。

我们都知道Java会默认在4秒后启动偏向锁，这个可以用`BiasedLockingStartupDelay`参数控制，那么在4秒前的锁，在释放后，一定会是无锁态，这时候我们再尝试加锁，看看结果会怎样：

```java
public class JavaObjectDemo {

    static final Object lock = new Object();

    public static void main(String[] args) throws InterruptedException {
        new Thread(() -> {
           synchronized (lock) {
               System.out.println(ClassLayout.parseInstance(lock).toPrintable());
               System.out.println("hello");
           }
           System.out.println(ClassLayout.parseInstance(lock).toPrintable());
        }).start();

        Thread.sleep(10000);
		
        // 因为有锁批量重偏向，如果偏向锁还有用，在第20次获取锁时就会进行批量重偏向，偏向后指向main线程
        for (int i = 0; i < 40; i++) {
            synchronized (lock) {
                System.out.println(ClassLayout.parseInstance(lock).toPrintable());
            }
        }
    }

}
```

运行后查看输出，可以发现全部都是轻量级锁，并没有发送锁的重偏向(重偏向在后面讲，这里你只需要知道偏向锁若升级次数过多就会偏向为另外一个新线程)。