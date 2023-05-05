---
title: 进阶使用
date: 2023-04-23 20:48:20
categories:
  data:
    - { name: "Docker", path: "/2023/04/20/docker/" }
---

# 1. MySQL部署

## 1.1 MySQL主从配置

启动MySQL主机：

```shell
docker run -p 3307:3306 --name=mysql-master --privileged=true \
-v /mydata/mysql-master/log:/var/log/mysql \
-v /mydata/mysql-master/data:/var/lib/mysql \
-v /mydata/mysql-master/conf:/etc/mysql \
-v /home/mysql/mysql-files:/var/lib/mysql-files \
-e MYSQL_ROOT_PASSWORD=root \
-d mysql
```

进入配置文件夹(/mydata/mysql-master/conf)，添加配置文件my.cnf：

```text
[mysqld]
## 设置server_id，同一局域网中需要唯一
server_id=101
## 指定不需要同步的数据库名称
binlog-ignore-db=mysql
## 开启二进制日志功能
log-bin=mall-mysql-bin
## 设置二进制日志使用内存大小(事务)
binlog_cache_size=1M
## 设置使用的二进制日志格式(mixed, statement, row)
binlog_format=mixed
## 二进制日志过期清理时间。默认为0表示不清理
expire_logs_days=7
## 跳过主从复制中遇到的所有的错误或指定类型的错误，避免slave端复制中断。
## 如：1062错误是指一些主键重复，1032是指主从数据库不一致
slave_skip_errors=1062
```

进入主数据库创建从机账号：

```shell
CREATE USER 'slave'@'%' IDENTIFIED BY '123456';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'slave'@'%';
```

启动从数据库：

```shell
docker run -p 3308:3306 --name=mysql-slave --privileged=true \
-v /mydata/mysql-slave/log:/var/log/mysql \
-v /mydata/mysql-slave/data:/var/lib/mysql \
-v /mydata/mysql-slave/conf:/etc/mysql \
-v /home/mysql-slave/mysql-files:/var/lib/mysql-files \
-e MYSQL_ROOT_PASSWORD=root \
-d mysql
```

添加配置文件(my.cnf)：

```text
[mysqld]
## 设置server_id，同一局域网中需要唯一
server_id=102
## 指定不需要同步的数据库名称
binlog-ignore-db=mysql
## 开启二进制日志功能
log-bin=mall-mysql-slave1-bin
## 设置二进制日志使用内存大小(事务)
binlog_cache_size=1M
## 设置使用的二进制日志格式(mixed, statement, row)
binlog_format=mixed
## 二进制日志过期清理时间。默认为0表示不清理
expire_logs_days=7
## 跳过主从复制中遇到的所有的错误或指定类型的错误，避免slave端复制中断。
## 如：1062错误是指一些主键重复，1032是指主从数据库不一致
slave_skip_errors=1062
## log_slave_updates表示slave将复制事件写进自己的二进制日志
log_slave_updates=1
## slave设置为只读
read_only=1
## relay_log配置中继日志
relay_log=mall-mysql-relay-bin
```

在主数据库中查看主从同步状态：

```shell
mysql> show master status;
+-----------------------+----------+--------------+------------------+-------------------+
| File                  | Position | Binlog_Do_DB | Binlog_Ignore_DB | Executed_Gtid_Set |
+-----------------------+----------+--------------+------------------+-------------------+
| mall-mysql-bin.000005 |      712 |              | mysql            |                   |
+-----------------------+----------+--------------+------------------+-------------------+
1 row in set (0.00 sec)
```

在从数据库中配置主从复制：

```shell
change master to master_host="宿主机ip", master_user='slave', master_password='123456', master_port=3307, master_log_file='mall-mysql-bin.000005', master_log_pos=712, master_connect_retry=30
```

在从数据库中查看主从复制状态：

```shell
mysql> show slave status \G;
*************************** 1. row ***************************
               Slave_IO_State: 
                  Master_Host: 192.168.170.131
                  Master_User: slave
                  Master_Port: 3307
                Connect_Retry: 30
              Master_Log_File: mall-mysql-bin.000005
          Read_Master_Log_Pos: 712
               Relay_Log_File: mall-mysql-relay-bin.000001
                Relay_Log_Pos: 4
        Relay_Master_Log_File: mall-mysql-bin.000005
             Slave_IO_Running: No
            Slave_SQL_Running: No
            
    ...
    
1 row in set, 1 warning (0.01 sec)
```

在从数据库中开启主从同步：

```shell
start slave;
```

# 2. Redis分布式部署

Redis分布式哈希主要使用哈希槽实现。这里将以3主3从的方式演示。

启动6个redis：

```shell
docker run -d --name redis-node-1 --net host --privileged=true -v /data/redis/share/redis-node-1:/data redis --cluster-enabled yes --appendonly yes --port 6381

docker run -d --name redis-node-2 --net host --privileged=true -v /data/redis/share/redis-node-2:/data redis --cluster-enabled yes --appendonly yes --port 6382

docker run -d --name redis-node-3 --net host --privileged=true -v /data/redis/share/redis-node-3:/data redis --cluster-enabled yes --appendonly yes --port 6383

docker run -d --name redis-node-4 --net host --privileged=true -v /data/redis/share/redis-node-4:/data redis --cluster-enabled yes --appendonly yes --port 6384

docker run -d --name redis-node-5 --net host --privileged=true -v /data/redis/share/redis-node-5:/data redis --cluster-enabled yes --appendonly yes --port 6385

docker run -d --name redis-node-6 --net host --privileged=true -v /data/redis/share/redis-node-6:/data redis --cluster-enabled yes --appendonly yes --port 6386
```

进入redis容器后，输入如下指令：

```shell
redis-cli --cluster create 192.168.170.131:6381 192.168.170.131:6382 192.168.170.131:6383 192.168.170.131:6384 192.168.170.131:6385 192.168.170.131:6386 --cluster-replicas 1
```

这里的IP需要修改为自己的，`--cluster-replicas`表示为每一个master创建一个`slave`节点。

运行结果：

```shell
[root@localhost ~]# docker exec -it redis-node-1 /bin/bash
root@localhost:/data# redis-cli --cluster create 192.168.170.131:6381 192.168.170.131:6382 192.168.170.131:6383 192.168.170.131:6384 192.168.170.131:6385 192.168.170.131:6386 --cluster-replicas 1
>>> Performing hash slots allocation on 6 nodes...
Master[0] -> Slots 0 - 5460
Master[1] -> Slots 5461 - 10922
Master[2] -> Slots 10923 - 16383
Adding replica 192.168.170.131:6385 to 192.168.170.131:6381
Adding replica 192.168.170.131:6386 to 192.168.170.131:6382
Adding replica 192.168.170.131:6384 to 192.168.170.131:6383
>>> Trying to optimize slaves allocation for anti-affinity
[WARNING] Some slaves are in the same host as their master
M: f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5 192.168.170.131:6381
   slots:[0-5460] (5461 slots) master
M: 3966aca2c22809e62891386d1fe815edb8a13c4d 192.168.170.131:6382
   slots:[5461-10922] (5462 slots) master
M: 8513fb8649e422c0082baf1c53a3fc618eff2ced 192.168.170.131:6383
   slots:[10923-16383] (5461 slots) master
S: 9dcca86c999abdad29214c1167c6a41d6861d78d 192.168.170.131:6384
   replicates 3966aca2c22809e62891386d1fe815edb8a13c4d
S: af329601a2212a38377611fa808844a12089fad6 192.168.170.131:6385
   replicates 8513fb8649e422c0082baf1c53a3fc618eff2ced
S: 4552034720a87b8fa6d2b5411f2d275c260113d0 192.168.170.131:6386
   replicates f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5
Can I set the above configuration? (type 'yes' to accept): yes
>>> Nodes configuration updated
>>> Assign a different config epoch to each node
>>> Sending CLUSTER MEET messages to join the cluster
Waiting for the cluster to join
.
>>> Performing Cluster Check (using node 192.168.170.131:6381)
M: f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5 192.168.170.131:6381
   slots:[0-5460] (5461 slots) master
   1 additional replica(s)
M: 3966aca2c22809e62891386d1fe815edb8a13c4d 192.168.170.131:6382
   slots:[5461-10922] (5462 slots) master
   1 additional replica(s)
S: 9dcca86c999abdad29214c1167c6a41d6861d78d 192.168.170.131:6384
   slots: (0 slots) slave
   replicates 3966aca2c22809e62891386d1fe815edb8a13c4d
S: af329601a2212a38377611fa808844a12089fad6 192.168.170.131:6385
   slots: (0 slots) slave
   replicates 8513fb8649e422c0082baf1c53a3fc618eff2ced
M: 8513fb8649e422c0082baf1c53a3fc618eff2ced 192.168.170.131:6383
   slots:[10923-16383] (5461 slots) master
   1 additional replica(s)
S: 4552034720a87b8fa6d2b5411f2d275c260113d0 192.168.170.131:6386
   slots: (0 slots) slave
   replicates f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
```

查看集群状态：

```shell
## redis-cli
cluster info
cluster nodes

## shell
redis-cli --cluster check [host]:[port]
```

主从机的指定是随机的，每次都可能不同。

在连接redis时需要添加`-c`参数，以集群的方式连接：

```shell
redis-cli -p 6381 -c
```

进入1号节点，若不使用`-c`参数：

```shell
127.0.0.1:6381> set k1 v1
(error) MOVED 12706 192.168.170.131:6383
```

使用`-c`参数：

```shell
127.0.0.1:6381> set k1 v1
-> Redirected to slot [12706] located at 192.168.170.131:6383
OK
```

## 2.1 Redis主从切换

上面我们部署了3主3从后，此时我们关闭1号节点，期望6号机能够"上位"。

关闭1号节点：

```shell
docker stop redis-node-1
```

进入任意节点，查看节点状态：

```shell
127.0.0.1:6382> cluster nodes
8513fb8649e422c0082baf1c53a3fc618eff2ced 192.168.170.131:6383@16383 master - 0 1682330542000 3 connected 10923-16383
9dcca86c999abdad29214c1167c6a41d6861d78d 192.168.170.131:6384@16384 slave 3966aca2c22809e62891386d1fe815edb8a13c4d 0 1682330541000 2 connected
4552034720a87b8fa6d2b5411f2d275c260113d0 192.168.170.131:6386@16386 master - 0 1682330542667 7 connected 0-5460
af329601a2212a38377611fa808844a12089fad6 192.168.170.131:6385@16385 slave 8513fb8649e422c0082baf1c53a3fc618eff2ced 0 1682330541663 3 connected
f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5 192.168.170.131:6381@16381 master,fail - 1682330496440 1682330493000 1 disconnected
3966aca2c22809e62891386d1fe815edb8a13c4d 192.168.170.131:6382@16382 myself,master - 0 1682330541000 2 connected 5461-10922
```

可以发现6号节点已经成为master节点。在1号节点重启后，1号节点会变为slave状态，6号节点会仍然是master。

## 2.2 Redis主从扩容

新增两个容器：

```shell
docker run -d --name redis-node-7 --net host --privileged=true -v /data/redis/share/redis-node-7:/data redis --cluster-enabled yes --appendonly yes --port 6387

docker run -d --name redis-node-8 --net host --privileged=true -v /data/redis/share/redis-node-8:/data redis --cluster-enabled yes --appendonly yes --port 6388
```

将新增的6387作为master节点加入集群：

```shell
redis-cli --cluster add-node [自己的IP]:6387 [某一集群Reids的IP]:[PORT]
```

在新增的节点默认不会被分配槽位：

```shell
root@localhost:/data# redis-cli --cluster check 192.168.170.131:6387
192.168.170.131:6387 (693799ad...) -> 0 keys | 0 slots | 0 slaves.
192.168.170.131:6382 (3966aca2...) -> 0 keys | 5462 slots | 1 slaves.
192.168.170.131:6383 (8513fb86...) -> 1 keys | 5461 slots | 1 slaves.
192.168.170.131:6386 (45520347...) -> 2 keys | 5461 slots | 1 slaves.
```

使用如下指令重新分配槽号：

```shell
redis-cli --cluster reshard [IP]:[PORT]
```

```shell
root@localhost:/data# redis-cli --cluster reshard 192.168.170.131:6387
>>> Performing Cluster Check (using node 192.168.170.131:6387)
M: 693799adb79799c38a343feb09a6df95f60a0fb4 192.168.170.131:6387
   slots: (0 slots) master
S: 9dcca86c999abdad29214c1167c6a41d6861d78d 192.168.170.131:6384
   slots: (0 slots) slave
   replicates 3966aca2c22809e62891386d1fe815edb8a13c4d
M: 3966aca2c22809e62891386d1fe815edb8a13c4d 192.168.170.131:6382
   slots:[5461-10922] (5462 slots) master
   1 additional replica(s)
M: 8513fb8649e422c0082baf1c53a3fc618eff2ced 192.168.170.131:6383
   slots:[10923-16383] (5461 slots) master
   1 additional replica(s)
M: 4552034720a87b8fa6d2b5411f2d275c260113d0 192.168.170.131:6386
   slots:[0-5460] (5461 slots) master
   1 additional replica(s)
S: f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5 192.168.170.131:6381
   slots: (0 slots) slave
   replicates 4552034720a87b8fa6d2b5411f2d275c260113d0
S: af329601a2212a38377611fa808844a12089fad6 192.168.170.131:6385
   slots: (0 slots) slave
   replicates 8513fb8649e422c0082baf1c53a3fc618eff2ced
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
# 这里由于是4台机器，需要给平分出来就是4096，意思是给新机器分4096个槽出去
How many slots do you want to move (from 1 to 16384)? 4096
# 要分配的节点ID
What is the receiving node ID? 693799adb79799c38a343feb09a6df95f60a0fb4
Please enter all the source node IDs.
  Type 'all' to use all the nodes as source nodes for the hash slots.
  Type 'done' once you entered all the source nodes IDs.
# 这里表示谁来出这些槽位，使用all表示从所有主节点中拿出槽位
Source node #1: all
```

再次检查集群状态：

```shell
root@localhost:/data# redis-cli --cluster check 192.168.170.131:6387
192.168.170.131:6387 (693799ad...) -> 1 keys | 4096 slots | 0 slaves.
192.168.170.131:6382 (3966aca2...) -> 0 keys | 4096 slots | 1 slaves.
192.168.170.131:6383 (8513fb86...) -> 1 keys | 4096 slots | 1 slaves.
192.168.170.131:6386 (45520347...) -> 1 keys | 4096 slots | 1 slaves.
[OK] 3 keys in 4 masters.
0.00 keys per slot on average.
>>> Performing Cluster Check (using node 192.168.170.131:6387)
M: 693799adb79799c38a343feb09a6df95f60a0fb4 192.168.170.131:6387
   slots:[0-1364],[5461-6826],[10923-12287] (4096 slots) master
S: 9dcca86c999abdad29214c1167c6a41d6861d78d 192.168.170.131:6384
   slots: (0 slots) slave
   replicates 3966aca2c22809e62891386d1fe815edb8a13c4d
M: 3966aca2c22809e62891386d1fe815edb8a13c4d 192.168.170.131:6382
   slots:[6827-10922] (4096 slots) master
   1 additional replica(s)
M: 8513fb8649e422c0082baf1c53a3fc618eff2ced 192.168.170.131:6383
   slots:[12288-16383] (4096 slots) master
   1 additional replica(s)
M: 4552034720a87b8fa6d2b5411f2d275c260113d0 192.168.170.131:6386
   slots:[1365-5460] (4096 slots) master
   1 additional replica(s)
S: f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5 192.168.170.131:6381
   slots: (0 slots) slave
   replicates 4552034720a87b8fa6d2b5411f2d275c260113d0
S: af329601a2212a38377611fa808844a12089fad6 192.168.170.131:6385
   slots: (0 slots) slave
   replicates 8513fb8649e422c0082baf1c53a3fc618eff2ced
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
```

<font color=red>可以发现扩容时，已有节点的右区间不变，每次都是在左区间"平分"给新的节点，新节点的哈希槽并不是连续的</font>。

最后再将最后一个从节点加入集群：

```shell
redis-cli --cluster add-node [从机Host]:[从机PORT] [主机Host]:[主机PORT] --cluster-slave --cluster-master-id [主节点ID]
```

## 2.3 Redis主从缩容

Redis集群缩容，在这里删除6387和6388节点。

首先需要删除从节点：

```shell
redis-cli --cluster del-node [从机HOST]:[从机IP] [从机节点ID]
```

```shell
root@localhost:/data# redis-cli --cluster del-node 192.168.170.131:6388 21b32459b66ff851ee5eaa540749589484172909
>>> Removing node 21b32459b66ff851ee5eaa540749589484172909 from cluster 192.168.170.131:6388
>>> Sending CLUSTER FORGET messages to the cluster...
>>> Sending CLUSTER RESET SOFT to the deleted node.
```

之后删除主节点，并将它的槽位全部分配给另外一个主节点：

```shell
redis-cli --cluster reshard [要分配给的节点Host]:[节点PORT]
```

```shell
root@localhost:/data# redis-cli --cluster del-node 192.168.170.131:6388 21b32459b66ff851ee5eaa540749589484172909
>>> Removing node 21b32459b66ff851ee5eaa540749589484172909 from cluster 192.168.170.131:6388
>>> Sending CLUSTER FORGET messages to the cluster...
>>> Sending CLUSTER RESET SOFT to the deleted node.
root@localhost:/data# redis-cli --cluster reshard 192.168.170.131:6381
>>> Performing Cluster Check (using node 192.168.170.131:6381)
S: f68a76ffd6a7d405ee7d9645c28964ec3f6d56f5 192.168.170.131:6381
   slots: (0 slots) slave
   replicates 4552034720a87b8fa6d2b5411f2d275c260113d0
M: 3966aca2c22809e62891386d1fe815edb8a13c4d 192.168.170.131:6382
   slots:[6827-10922] (4096 slots) master
   1 additional replica(s)
M: 4552034720a87b8fa6d2b5411f2d275c260113d0 192.168.170.131:6386
   slots:[1365-5460] (4096 slots) master
   1 additional replica(s)
S: af329601a2212a38377611fa808844a12089fad6 192.168.170.131:6385
   slots: (0 slots) slave
   replicates 8513fb8649e422c0082baf1c53a3fc618eff2ced
M: 8513fb8649e422c0082baf1c53a3fc618eff2ced 192.168.170.131:6383
   slots:[12288-16383] (4096 slots) master
   1 additional replica(s)
M: 693799adb79799c38a343feb09a6df95f60a0fb4 192.168.170.131:6387
   slots:[0-1364],[5461-6826],[10923-12287] (4096 slots) master
S: 9dcca86c999abdad29214c1167c6a41d6861d78d 192.168.170.131:6384
   slots: (0 slots) slave
   replicates 3966aca2c22809e62891386d1fe815edb8a13c4d
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
How many slots do you want to move (from 1 to 16384)? 4096
# 谁接收
What is the receiving node ID? 4552034720a87b8fa6d2b5411f2d275c260113d0
Please enter all the source node IDs.
  Type 'all' to use all the nodes as source nodes for the hash slots.
  Type 'done' once you entered all the source nodes IDs.
# 节点6387"出血"
Source node #1: 693799adb79799c38a343feb09a6df95f60a0fb4
Source node #2: done
```

检查集群状态：

```shell
root@localhost:/data# redis-cli --cluster check 192.168.170.131:6381
192.168.170.131:6382 (3966aca2...) -> 0 keys | 4096 slots | 1 slaves.
192.168.170.131:6386 (45520347...) -> 2 keys | 8192 slots | 1 slaves.
192.168.170.131:6383 (8513fb86...) -> 1 keys | 4096 slots | 1 slaves.
192.168.170.131:6387 (693799ad...) -> 0 keys | 0 slots | 0 slaves.
```

最后可以直接将6387删除：

```shell
redis-cli --cluster del-node [IP]:[PORT] [节点ID]
```

