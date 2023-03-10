---
title: 配置中心
date: 2023-03-01 11:56
categories:
  data:
    - { name: "SpringCloud", path: "/2023/03/04/SpringCloud/" }
tags:
  data:
    - { name: "配置中心", path: "/SpringCloud/config-center"}
---

配置中心的作用：

- 集中管理配置文件
- 不同环境不同配置，动态化的配置更新，分环境部署。
- 运行期间动态调整配置，不再需要在每个服务部署的机器上编写配置文件，服务会向配置中心统一拉取配置信息
- 当配置发生变动时，服务不需要重启即可感知到配置的变化并应用新的配置
- 将配置信息以REST接口的形式暴露

[SpringCloud Config](springcloud-config)

[Nacos](nacos)

