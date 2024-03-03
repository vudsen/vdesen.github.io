---
title: DevOps
date: 2024-03-03 15:17:32
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---

# 1. 基本理念

```
CODE -> BUILD -> INTEGRATE -> TEST -> DELIVER -> DEPLOY
|                                   |          |      |
<------Continuous Integration------->          |      |
|                                              |      |
<--------------Continuous Delivery------------->      |
|                                                     |
<---------------Continuous Deployment----------------->
```

[什么是 CI/CD？](https://www.redhat.com/zh/topics/devops/what-is-ci-cd)

# 2. 安装

[安装Jenkins](https://www.jenkins.io/zh/doc/book/installing/)


`/var/jenkins_home`为jenkins的所有配置和数据，需要注意备份。

启动：
```bash
docker run \
  -u root \
  --rm \  
  -d \ 
  -p 8080:8080 \ 
  -p 50000:50000 \ 
  -v jenkins-data:/var/jenkins_home \ 
  -v /var/run/docker.sock:/var/run/docker.sock \ 
  jenkinsci/blueocean 
```