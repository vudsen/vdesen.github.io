---
title: SpringCloud Stream
date: 2023-03-12 22:11:25
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
---

当业务的逻辑涉及到多个服务时，每个服务内部的数据一致性只能由本地事务来保证，但是全局的数据一致性没法保证。

Seata是一款开源的分布式事务解决方案，致力于在微服务架构下提供高性能和简单易用的分布式事务服务。

Seata中有如下三个重要组件：

- TC (Transaction Coordinator) - 事务协调者

​	维护全局和分支事务的状态，驱动全局事务提交或回滚。

- TM (Transaction Manager) - 事务管理器

​	定义全局事务的范围：开始全局事务、提交或回滚全局事务。

- RM (Resource Manager) - 资源管理器

​	管理分支事务处理的资源，与TC交谈以注册分支事务和报告分支事务的状态，并驱动分支事务提交或回滚。

基于这三个，每个事务还有一个全局唯一的事务ID