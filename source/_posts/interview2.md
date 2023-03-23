---
title: 面试题记录2
date: 2023-03-19 19:13:28
tags:
---

- [第一期](/2023/03/14/interview/)

# 1. 简单说一下InnoDB事务实现原理

事务ACID：

| 名称            | 别名   | 说明                                                         |
| --------------- | ------ | ------------------------------------------------------------ |
| **Atomicity**   | 原子性 | 原子性是指事务是一个不可分割的工作单位，事务中的操作要么都发生，要么都不发生 |
| **Consistency** | 一致性 | 事务前后数据的完整性必须保持一致                             |
| **Isolation**   | 隔离性 | 事务的隔离性是多个用户并发访问数据库时，数据库为每一个用户开启的事务，不能被其他事务的操作数据所干扰，多个并发事务之间要相互隔离 |
| **Durability**  | 持久性 | 持久性是指一个事务一旦被提交，它对数据库中数据的改变就是永久性的，接下来即使数据库发生故障也不应该对其有任何影响 |

[一文了解InnoDB事务实现原理 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/48327345)

上面那个比较深入，下面这个比较好理解一些：

[图解InnoDB事务实现原理｜Redo Log&Undo Log - 掘金 (juejin.cn)](https://juejin.cn/post/7012937835967692808)

# 2. Redis的内存淘汰算法

[Redis 内存淘汰策略 （史上最全）_redis内存淘汰策略_40岁资深老架构师尼恩的博客-CSDN博客](https://blog.csdn.net/crazymakercircle/article/details/115360829)

# 3. Redis主从复制

[Redis（主从复制、哨兵模式、集群）的讲解_redis集哨兵模式哪个节点负责读取数据_五条悟的小迷妹的博客-CSDN博客](https://blog.csdn.net/Bilson99/article/details/118732296)

# 4. Redis的持久化方式

[Redis有哪几种持久化方式？优缺点是什么_Listener_code的博客-CSDN博客](https://blog.csdn.net/Violet_201903027/article/details/100145168)

# 5. Redis常见的性能问题和解决方案

[Redis 常见性能问题和解决方案 - 掘金 (juejin.cn)](https://juejin.cn/post/7207406497541455929)
