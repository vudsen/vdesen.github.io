---
title: Docker常用启动参数
date: 2023-09-04 16:16:53
categories: Docker
  
---

不定时更新...

# 达梦8
```shell
docker run -d -p 5236:5236 --restart=always --name dm8_01 --privileged=true -e PAGE_SIZE=16 -e LD_LIBRARY_PATH=/opt/dmdbms/bin -e INSTANCE_NAME=dm8_01 -v /data/dm8_01:/opt/dmdbms/data dm8_single:v8.1.2.128_ent_x86_64_ctm_pack4
```

# 人大金仓
```shell
docker run -d -it --privileged=true -p 54321:54321 -v /opt/docker/kingbase-latest/opt/:/opt --name kingbase-latest godmeowicesun/kingbase:latest
```

- 端口: 54321

- 用户名: SYSTEM

- 密码: 123456

- 默认数据库: TEST

# mysql
```shell
docker run --name mysql -p 3307:3306 -e MYSQL_ROOT_PASSWORD=123456 --privileged -v /home/vagrant/mysql5.7/data:/var/lib/mysql -d mysql:5.7.42
```

# opengauss5.0.0
```shell
docker run --hostname=fcdea04e2440 --env=GS_PASSWORD=P@ssw0rd --env=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin --env=EXEC_GOSU=gosu-amd64 --env=GOSU_VERSION=1.12 --env=PGDATA=/var/lib/opengauss/data --volume=/var/lib/opengauss/data:/var/lib/opengauss/data --privileged --workdir=/ -p 5432:5432 --restart=no --label='CREATE_DATE=2022-10' --label='GAUSS_SERVER=openGauss-5.0.0' --label='MAIL=heguofeng@huawei.com' --runtime=runc -d opengauss/opengauss:5.0.0
```

# opengauss2.1.0
```shell
docker run --name opengauss2.1.0 --privileged=true -d -e GS_PASSWORD=P@ssw0rd -u root -p 5432:5432 enmotech/opengauss:2.1.0
```

# oracel
```shell
docker run -d --name oracle-db -p 1521:1521 --privileged -e ORACLE_PWD=123456 -e ORACLE_CHARACTERSET=utf8mb4 -v /opt/oracle/oradata container-registry.oracle.com/database/free:latest
```

[文档](https://container-registry.oracle.com/ords/f?p=113:4:13054629146525:::4:P4_REPOSITORY,AI_REPOSITORY,AI_REPOSITORY_NAME,P4_REPOSITORY_NAME,P4_EULA_ID,P4_BUSINESS_AREA_ID:1863,1863,Oracle%20Database%20Free,Oracle%20Database%20Free,1,0&cs=3AJX-e6QGdNtweUNwoM_S6Bx1QBnHxTQChj06uKkm5-wObbTXatpBsvWpkNOZlJJdiGb7W-BEXdATDDaCQn1gOw)

# redis

```shell
docker run -d --name redis --net host --privileged=true -v /data/redis/share/redis-node-1:/data redis --requirepass 123456 --appendonly yes --port 6381
```