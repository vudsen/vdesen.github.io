---
title: 使用 Docker 搭建 Mysql 测试集群
date: 2024-12-02 19:16:12
categories:
  - mysql
seo:
  description: 使用 Docker 搭建 Mysql 测试集群，从零开始一步一步搭建，用于学习了解 Mysql 集群。
---

# 一主二从

> [!NOTE]
> 参考: https://blog.csdn.net/qq_41786285/article/details/109304126


## 准备配置

```shell
mkdir -p /data/mysql/
mkdir /data/mysql/mysql20001
mkdir /data/mysql/mysql20002
mkdir /data/mysql/mysql20003
```

`mysql20001` 是两个主服务器，`mysql20002` 和 `mysql20003` 是从服务器。

修改主节点配置文件(`/data/mysql/my1.cnf`):

```cnf
[client]
default-character-set=utf8mb4
 
[mysql]
default-character-set=utf8mb4
 
[mysqld]
init_connect='SET collation_connection = utf8mb4_unicode_ci'
init_connect='SET NAMES utf8mb4'
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
skip-character-set-client-handshake
lower_case_table_names = 1

log_bin = mysql-bin
binlog_format = mixed
log-slave-updates = true

server-id = 1

```

修改从节点配置(`/data/mysql/my2.cnf`)：

```cnf
[client]
default-character-set=utf8mb4
 
[mysql]
default-character-set=utf8mb4
 
[mysqld]
init_connect='SET collation_connection = utf8mb4_unicode_ci'
init_connect='SET NAMES utf8mb4'
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
skip-character-set-client-handshake
lower_case_table_names = 1

relay-log = relay-log-bin
relay-log-index = slave-relay-bin.index 

server-id = 2

# 不备份系统库
binlog_ignore_db=information_schema
binlog_ignore_db=performance_schema
binlog_ignore_db=mysql
binlog_ignore_db=sys
```


最后修改目录权限：

```shell
useradd mysql
groupadd mysql
chown -R mysql /data/mysql
chgrp -R mysql /data/mysql
```

## 启动容器

```shell
ID=1
docker run --name mysql2000$ID -u 27:27 -p 2000$ID:3306 -e MYSQL_ROOT_PASSWORD=123456 -v /data/mysql/mysql2000${ID}/:/var/lib/mysql/ -v /data/mysql/my${ID}.cnf:/etc/mysql/my.cnf -d mysql:5.7.42
```

注意参数中的 `-u 27:27`，这里是使用了 `uid:gid` 的格式，使用其它格式会导致权限不足：

```log
2024-12-03 14:36:24+00:00 [Note] [Entrypoint]: Entrypoint script for MySQL Server 5.7.42-1.el7 started.
2024-12-03 14:36:24+00:00 [Note] [Entrypoint]: Initializing database files
mysqld: Can't create directory '/var/lib/mysql/' (Errcode: 17 - File exists)
2024-12-03T14:36:24.891299Z 0 [Warning] TIMESTAMP with implicit DEFAULT value is deprecated. Please use --explicit_defaults_for_timestamp server option (see documentation for more details).
2024-12-03T14:36:24.893084Z 0 [ERROR] Aborting
```

查看 `uid` 和 `gid`: 

```shell
[root@localhost mysql]# id mysql
uid=27(mysql) gid=27(mysql) groups=27(mysql)
```

同样的方式启动另外两台从节点，记住配置文件不要搞错了。

## 从节点加入集群

登录主节点执行: 

```sql
grant replication slave on *.* to 'myslave'@'172.17.0.%' identified by '123456';
flush privileges;

show master status;
```

注意这里的 `ip` 地址，容器默认情况下是桥接模式，容器的 `ip` 不是宿主机的 `ip`，具体 ip 网段可以用下面的命令看：

```shell
docker inspect mysql20002 | grep Networks -A 16
```

找到 `Gateway` 字段，单独使用这个 `ip` 或者直接使用对应的网段。

---


![主节点状态](https://5j9g3t.site/images/2024/12/mysql-master-status.webp)

这里需要记住上面的 `File` 和 `Position`，完成后在从节点中加入集群：

```sql
change master to master_host ='10.77.0.38',
    master_port = 20001,
    master_user ='myslave',
    master_password ='123456',
    master_log_file ='mysql-bin.000004',
    master_log_pos =154;

show slave status;
start slave;
```

**这里我们先只让一台加进去，后面一台我们待会尝试中途加入**。

![从节点状态](https://5j9g3t.site/images/2024/12/mysql-slave-status.webp)

这里等到打框框的这两个值都变成 `YES` 就完成了。但是我这里把配置搞错了...导致一直加不进去，所以这里额外研究了一下节点怎么退出集群。

### 节点退出集群

使用下面的命令**之一**退出集群

```sql
# 停止从主节点的同步，直到使用 START SLAVE
STOP SLAVE;

# 删除同步的内容
RESET SLAVE;
```

部分情况下由于初始的错误配置可能导致停不掉，这时候就直接强制停止从节点重新部署一个就行了，对主节点没有影响的。

## 测试从节点

在主节点执行下面的 sql:

```sql
create database slave_test;
use slave_test;
CREATE table slave_data(
    id varchar(20) primary key ,
    tm timestamp
);

INSERT INTO slave_data value ('1', CURRENT_TIMESTAMP());
```

然后可以查看从节点是否创建相关的数据。

## 从节点扩容

> [!NOTE]
> 参考: https://blog.csdn.net/anddyhua/article/details/116240478

我们这里留了一台节点还没有加入集群，这里我们专门来测试从节点的水平扩容。这里我们使用 `xtrabackup` 来进行备份。

首先[下载](https://www.percona.com/downloads) `xtrabackup`，这里 Mysql 5.7 只能使用 2.4 版本的。下载完成后解压，进入 bin 目录，执行下列命令进行备份：

```shell
./xtrabackup --backup --target-dir=/data/mysql/backup/bakup_`date +"%F_%H_%M_%S"` --user=root --host=10.77.0.38 --port=20001 --password=123456  --datadir=/data/mysql/mysql20001
```

备份完成后查看目录：

```shell
[root@localhost bakup_2024-12-05_00_28_08]# ll
total 77876
-rw-r----- 1 root root      487 Dec  5 00:28 backup-my.cnf
-rw-r----- 1 root root      661 Dec  5 00:28 ib_buffer_pool
-rw-r----- 1 root root 79691776 Dec  5 00:28 ibdata1
drwxr-x--- 2 root root     4096 Dec  5 00:28 mysql
drwxr-x--- 2 root root     8192 Dec  5 00:28 performance_schema
drwxr-x--- 2 root root       64 Dec  5 00:28 slave_test
drwxr-x--- 2 root root     8192 Dec  5 00:28 sys
-rw-r----- 1 root root       21 Dec  5 00:28 xtrabackup_binlog_info
-rw-r----- 1 root root      138 Dec  5 00:28 xtrabackup_checkpoints
-rw-r----- 1 root root      587 Dec  5 00:28 xtrabackup_info
-rw-r----- 1 root root     2560 Dec  5 00:28 xtrabackup_logfile
```

可以发现几乎是和 mysql 数据目录一样的结构。之后我们将备份的内容复制到第二个从节点的数据目录中(`/data/mysql/mysql20003`)，这里需要注意权限问题，复制过来后需要把权限给 mysql 用户。

启动从库：

```shell
ID=3
docker run --name mysql2000$ID -u 27:27 -p 2000$ID:3306 -e MYSQL_ROOT_PASSWORD=123456 -v /data/mysql/mysql2000${ID}/:/var/lib/mysql/ -v /data/mysql/my${ID}.cnf:/etc/mysql/my.cnf -d mysql:5.7.42
```

由于我们在备份的过程中，主节点仍然可以写入数据，所以导致我们备份的数据不一定是最新的，所以在加入集群的时候不能直接使用 `show master status` 中的 binlog 位置。这里我们需要根据备份目录中 `xtrabackup_info` 文件来确定具体的位置:

```shell
[root@localhost mysql20003]# cat xtrabackup_info 
uuid = c333e3de-b25c-11ef-81e2-0242ac110002
name = 
tool_name = xtrabackup
tool_command = --backup --target-dir=/data/mysql/backup/bakup_2024-12-05_00_28_08 --user=root --host=10.77.0.38 --port=20001 --password=... --datadir=/data/mysql/mysql20001
tool_version = 2.4.29
ibbackup_version = 2.4.29
server_version = 5.7.42-log
start_time = 2024-12-05 00:28:08
end_time = 2024-12-05 00:28:15
lock_time = 4
binlog_pos = filename 'mysql-bin.000006', position '154'
innodb_from_lsn = 0
innodb_to_lsn = 12232730
partial = N
incremental = N
format = file
compact = N
compressed = N
encrypted = N
```

这里可以看到 `binlog_pos` 的值，表示当前 binlog 读到了哪里，我们根据这个值来加入主节点：

```sql
change master to master_host ='10.77.0.38',
    master_port = 20001,
    master_user ='myslave',
    master_password ='123456',
    master_log_file ='mysql-bin.000006',
    master_log_pos =154;

show slave status;
start slave;
```

---

待填坑:

- 配置 Mysql 网关实现读写分类
- 多主架构
