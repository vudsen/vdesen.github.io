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

![对象内存布局]( https://5j9g3t.site/public/java-source/2023-2-2-de291360-1965-4703-9a79-4d02de57fb6e.webp)

# 1.四种锁

## 1.1 无锁态

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

运行后查看输出，可以发现全部都是轻量级锁，并没有发送锁的重偏向(重偏向在后面讲，这里只需要知道偏向锁若升级次数过多就会偏向为另外一个新线程)。

## 1.2 偏向锁

偏向锁就很简单了，当偏向锁的执向不是当前线程时，锁就会升级为轻量级锁。

具体可以看我的这篇笔记，里面有介绍了批量重偏向和批量撤销：https://www.notion.so/Synchronized-7b9e882385ae43a8b8cd5b7d512ba0a1?pvs=4

关于epoch的作用：[BiasedLocking模式下markOop中位域epoch的根本作用是什么？ - 知乎 (zhihu.com)](https://www.zhihu.com/question/56582060)

大致作用就是在类的Class对象里和每个实例里都维护一个epoch字段，只有当实例里的epoch等于Class里的epoch时，这个偏向锁才有效。

如果发生了批量重偏向，需要将Class对象的epoch值加一，并且也要将所有线程有对应实例对象的epoch字段加一

## 1.3 轻量级锁

[不可不说的Java“锁”事 - 美团技术团队 (meituan.com)](https://tech.meituan.com/2018/11/15/java-lock.html)

> 是指当锁是偏向锁的时候，被另外的线程所访问，偏向锁就会升级为轻量级锁，其他线程会通过自旋的形式尝试获取锁，不会阻塞，从而提高性能。
>
> 在代码进入同步块的时候，如果同步对象锁状态为无锁状态（锁标志位为“01”状态，是否为偏向锁为“0”），虚拟机首先将在当前线程的栈帧中建立一个名为锁记录（Lock Record）的空间，用于存储锁对象目前的Mark Word的拷贝，然后拷贝对象头中的Mark Word复制到锁记录中。
>
> 拷贝成功后，虚拟机将使用CAS操作尝试将对象的Mark Word更新为指向Lock Record的指针，并将Lock Record里的owner指针指向对象的Mark Word。
>
> 如果这个更新动作成功了，那么这个线程就拥有了该对象的锁，并且对象Mark Word的锁标志位设置为“00”，表示此对象处于轻量级锁定状态。
>
> 如果轻量级锁的更新操作失败了，虚拟机首先会检查对象的Mark Word是否指向当前线程的栈帧，如果是就说明当前线程已经拥有了这个对象的锁，那就可以直接进入同步块继续执行，否则说明多个线程竞争锁。
>
> 若当前只有一个等待线程，则该线程通过自旋进行等待。但是当自旋超过一定的次数，或者一个线程在持有锁，一个在自旋，又有第三个来访时，轻量级锁升级为重量级锁。

# 1.4 重量级锁

[Java Synchronized 重量级锁原理深入剖析上(互斥篇) - 掘金 (juejin.cn)](https://juejin.cn/post/7008026031550365704)