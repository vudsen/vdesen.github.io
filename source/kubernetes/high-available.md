---
title: 高可用集群
date: 2024-07-10 22:13:25
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---


# K8s 集群架构


etcd：保证一致性和分区容错性，使用 [raft](http://www.kailing.pub/raft/index.html) 协议来保持一致性。

一个 raft 一致性的集群至少有 `n/2 + 1` 台机器可用(忽略小数)，低于该值，集群将不可用。

一般集群数量应该为奇数个，以防止每次选取领导者时出现"平票"的情况，此时会导致多次重试，影响服务性能。

一旦分区，就产生脑裂问题，导致出现多个领导者，但是领导者仍然遵从写入数据时，过半节点响应才能够写入的规则，因此当在节点数较少的领导者节点写入数据时，将会一直失败。

K8s 中，**除了 etcd 外，都是无状态服务**。

# 证书的制作与分发

[cfssl](https://github.com/cloudflare/cfssl/releases/)
[PKI 证书和要求](https://kubernetes.io/zh-cn/docs/setup/best-practices/certificates/)
[IPVS 代理模式](https://kubernetes.io/zh-cn/docs/reference/networking/virtual-ips/#proxy-mode-ipvs)
[IPVS](https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/ipvs/README.md)
[sysctl](https://docs.kernel.org/admin-guide/sysctl/index.html)

集群相关证书类型：
- **client certificate**：用于服务端认证客户端
- **server certificate**：服务端使用，客户端以此验证服务端身份
- **peer certificate**：双向证书，即是 `client certificate` 又是 `server certificate`

在准备证书前，需要先归定好集群的网段：

- 机器网段：192.168.0.* (云服务器机器网段)
- 服务网段：10.96.*.*
- Pod 网段：196.16.*.*

## 准备操作

### 环境准备

为每个机器准备域名：

```sh
cat << EOF > /etc/hosts
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
192.168.1.26 k8s-master-1
192.168.1.28 k8s-master-2
192.168.1.29 k8s-master-3
192.168.1.32 k8s-node-1
192.168.1.30 k8s-node-2
192.168.1.31 k8s-node-3
192.168.1.34 k8s-master-lb 
EOF
```

> `k8s-master-lb` 为高可用做准备。
>
> 这里我用了阿里云的内网 SLB，这东西不知道是不是我的问题，反正就是每当主节点负载均衡到自己时，请求就会超时，但是我单独开了台服务器搭了个 nginx 做负载均衡就是正常的。
>
> 👎👎👎 而且 SLB 看不了 L4 代理的日志，有点无语。。。

其它必要操作:

```sh
# 关闭 selinux
setenforce 0
sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/sysconfig/selinux
sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/selinux/config
# 关闭 swap
swapoff -a && sysctl -w vm.swappiness=0
sed -ri 's/.*swap.*/#&/' /etc/fstab
```

```sh
# 修改 limit
ulimit -SHn 65535
vi /etc/security/limits.conf

# 末尾添加如下内容
* soft nofile 655360
* hard nofile 131072
* soft nproc 655350
* hard nproc 655350
* soft memlock unlimited
* hard memlock unlimited
```

安装 ipvs 等工具：

```sh
# 所有节点安装 ipvs 工具，方便以后操作 ipvs，ipset，conntrack 等
yum install ipvsadm ipset sysstat conntrack libseccomp -y
# 所有节点配置 ipvs 模块，执行以下命令
modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- nf_conntrack
# 修改 ipvs 配置
cat << EOF > /etc/modules-load.d/ipvs.conf
ip_vs
ip_vs_ls
ip_vs_wlc
ip_vs_rr
ip_vs_wrr
ip_vs_lblc
ip_vs_lblcr
ip_vs_dh
ip_vs_sh
ip_vs_fo
ip_vs_nq
ip_vs_sed
ip_vs_ftp
ip_vs_sh
nf_conntrack
ip_tables
ip_set
xt_set
ipt_set
ipt_rpfilter
ipt_REJECT
ipip
EOF
```

```sh
# 开启服务，如果没有这个服务，就把机器重启。
systemctl enable --now systemd-modules-load-service

# 检测是否加载
[root@k8s-node-1 ~]# lsmod | grep -e ip_vs -e nf_conntrack
ip_vs_ftp              16384  0
nf_nat                 57344  1 ip_vs_ftp
ip_vs_sed              16384  0
ip_vs_nq               16384  0
ip_vs_fo               16384  0
ip_vs_sh               16384  0
ip_vs_dh               16384  0
ip_vs_lblcr            16384  0
ip_vs_lblc             16384  0
ip_vs_wrr              16384  0
ip_vs_rr               16384  0
ip_vs_wlc              16384  0
ip_vs                 192512  23 ip_vs_wlc,ip_vs_rr,ip_vs_dh,ip_vs_lblcr,ip_vs_sh,ip_vs_fo,ip_vs_nq,ip_vs_lblc,ip_vs_wrr,ip_vs_sed,ip_vs_ftp
nf_conntrack          180224  2 nf_nat,ip_vs
nf_defrag_ipv6         24576  2 nf_conntrack,ip_vs
nf_defrag_ipv4         16384  1 nf_conntrack
libcrc32c              16384  4 nf_conntrack,nf_nat,nf_tables,ip_vs
```

设置系统参数

```sh
cat << EOF > /etc/sysctl.d/k8s.conf
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
fs.may_detach_mounts = 1
vm.overcommit_memory=1
net.ipv4.conf.all.route_localnet = 1

vm.panic_on_oom=0
fs.inotify.max_user_watches=89100
fs.file-max = 52706963
fs.nr_open = 52706963
net.netfilter.nf_conntrack_max = 2310720

net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 10
net.ipv4.tcp_max_tw_buckets = 36000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_max_orphans = 327680
net.ipv4.tcp_orphan_retries = 3
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 16768
net.ipv4.ip_conntrack_max = 65536
net.ipv4.tcp_timestamps = 0
net.core.somaxconn = 16768
EOF
# 应用设置
sysctl -p
```

有问题可以去翻文档（找了老半天）：[sysctl](https://docs.kernel.org/admin-guide/sysctl/index.html)


安装 Docker：

```sh
yum install -y yum-utils
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl start docker
```

### 配置节点间免密登录

```sh
cd ~/.ssh
ssh-keygen -t rsa
for i in k8s-master-1 k8s-master-2 k8s-master-3 k8s-node-1 k8s-node-2 k8s-node-3;do ssh-copy-id -i ~/.ssh/id_rsa.pub $i;done
```

## 准备根证书

### 创建 CA 公钥和私钥

创建一个 ca签名请求(`ca-csr.json`)

```json
{
  "CN": "kubernetes",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "Beijing",
      "L": "Beijing",
      "O": "Kubernetes",
      "OU": "Kubernetes"
    }
  ],
  "ca": {
    "expiry": "87600h"
  }
}
```

- CN(Common Name): 公用名，必须填写，一般可以是网站域名
- O(Organization)：组织名，必须填写，如果申请的是OV、EV型证书，组织名称必须严格和企业在政府登记名一致，一般需要和营业执照上的名称完全一致。
- OU(Organization Unit)：单位部门，没有过多限制，可以随意填写
- C(City)：申请单位所在城市
- ST(State/Province)：所在省份
- C(Country Name)：国家名称，应使用两位字母的简写

生成 ca 证书和私钥：

```sh
cfssl gencert -initca ca-csr.json | cfssljson -bare ca -
mv ca-key.pem ca.key
mv ca.pem ca.crt
```

---

创建一个根证书配置文件(`ca-config.json`，建议放在 `/etc/kubernetes/pki`)：

```json
{
  "signing": {
    "default": {
      "expiry": "87600h"
    },
    "profiles": {
      "server": {
        "expiry": "87600h",
        "usages": [
          "signing",
          "key encipherment",
          "server auth"
        ]
      },
      "client": {
        "expiry": "87600h",
        "usages": [
          "signing",
          "key encipherment",
          "server auth"
        ]
      },
      "peer": {
        "expiry": "87600h",
        "usages": [
          "signing",
          "key encipherment",
          "server auth",
          "client auth"
        ]
      },
      "kubernetes": {
        "expiry": "87600h",
        "usages": [
          "signing",
          "key encipherment",
          "server auth",
          "client auth"
        ]
      },
      "etcd": {
        "expiry": "87600h",
        "usages": [
          "signing",
          "key encipherment",
          "server auth",
          "client auth"
        ]
      }
    }
  }
}
```

> 实际建议使用下面的 json 配置，这里为了跟着视频教程，所以用了上面的
>
> ```json
> {
>   "signing": {
>     "default": {
>       "expiry": "87600h"
>     },
>     "profiles": {
>       "server": {
>         "expiry": "87600h",
>         "usages": [
>           "signing",
>           "key encipherment",
>           "server auth"
>         ]
>       },
>       "client": {
>         "expiry": "87600h",
>         "usages": [
>           "signing",
>           "key encipherment",
>           "client auth"
>         ]
>       },
>       "mixed": {
>         "expiry": "87600h",
>         "usages": [
>           "signing",
>           "key encipherment",
>           "server auth",
>           "client auth"
>         ]
>       }
>     }
>   }
> }
> ```
> 
> [完整的配置说明](https://github.com/cloudflare/cfssl/blob/master/doc/cmd/cfssl.txt)
>


该配置文件可以帮助我们后续签发证书，例如需要签发 `server` 证书时，只需将 `profile` 切换为 `server` 即可，使用 `cfssl print-defaults config` 可以查看相关模板。

## 搭建 etcd 集群

[硬件建议](https://etcd.io/docs/v3.5/op-guide/hardware/)
[Clustering Guide](https://etcd.io/docs/v3.5/op-guide/clustering/)

下载安装包：[etcd-releases](https://github.com/etcd-io/etcd/releases/)

下载完成后解压，将其中的 `etcd`、`etcdctl` 和 `etcdutl` 移动到 `/usr/local/bin`。

### 准备 etcd 证书

在 `/etc/kubernetes/pki` 下创建一个 etcd 文件夹，用于存放 etcd 证书。

进入文件夹，生成一个 etcd 根证书签名请求(`ca-csr.json`)：

```json
{
  "CN": "etcd",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "Beijing",
      "L": "Beijing",
      "O": "etcd",
      "OU": "etcd"
    }
  ],
  "ca": {
    "expiry": "87600h"
  }
}
```

生成证书：

```sh
cfssl gencert -initca ca-csr.json | cfssljson -bare ca -
```

创建 etcd 证书签名请求(`server-csr.json`)：

```json
{
  "CN": "kube-etcd",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "hosts": [
    "k8s-master-1",
    "k8s-master-2",
    "k8s-master-3",
    "192.168.1.26",
    "192.168.1.28",
    "192.168.1.29",
    "127.0.0.1",
    "localhost"
  ],
  "names": [
    {
      "C": "CN",
      "L": "Beijing",
      "O": "kube-etcd",
      "OU": "System",
      "ST": "beijing"
    }
  ]
}
```

使用 etcd 的 CA 证书签发：

```sh
cfssl gencert \
  -ca=/etc/kubernetes/pki/etcd/ca.pem \
  -ca-key=/etc/kubernetes/pki/etcd/ca-key.pem \
  -config=/etc/kubernetes/pki/ca-config.json \
  -profile=etcd \
  server-csr.json | cfssljson -bare /etc/kubernetes/pki/etcd/server
```

运行完后会在 `/etc/kubernetes/pki/etcd` 生成 `server.pem` 和 `server-key.pem`。

同样的方法，生成给 etcd 集群用的对等证书(`peer-csr.json`)：

```json
{
  "CN": "kube-etcd-peer",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "hosts": [
    "k8s-master-1",
    "k8s-master-2",
    "k8s-master-3",
    "192.168.1.26",
    "192.168.1.28",
    "192.168.1.29",
    "127.0.0.1",
    "localhost"
  ],
  "names": [
    {
      "C": "CN",
      "L": "Beijing",
      "OU": "System",
      "O": "kube-etcd-peer",
      "ST": "beijing"
    }
  ]
}
```

签发：

```sh
cfssl gencert \
  -ca=/etc/kubernetes/pki/etcd/ca.pem \
  -ca-key=/etc/kubernetes/pki/etcd/ca-key.pem \
  -config=/etc/kubernetes/pki/ca-config.json \
  -profile=etcd \
  peer-csr.json | cfssljson -bare /etc/kubernetes/pki/etcd/peer
```

---

最终文件：

```sh
[root@k8s-master-1 etcd]# ll
total 48
-rw-r--r-- 1 root root 1037 Jul 14 00:36 ca.csr
-rw-r--r-- 1 root root  239 Jul 14 00:35 ca-csr.json
-rw------- 1 root root 1675 Jul 14 00:36 ca-key.pem
-rw-r--r-- 1 root root 1289 Jul 14 00:36 ca.pem
-rw-r--r-- 1 root root 1163 Jul 14 00:37 peer.csr
-rw-r--r-- 1 root root  394 Jul 14 00:37 peer-csr.json
-rw------- 1 root root 1675 Jul 14 00:37 peer-key.pem
-rw-r--r-- 1 root root 1525 Jul 14 00:37 peer.pem
-rw-r--r-- 1 root root 1151 Jul 14 00:37 server.csr
-rw-r--r-- 1 root root  384 Jul 14 00:37 server-csr.json
-rw------- 1 root root 1675 Jul 14 00:37 server-key.pem
-rw-r--r-- 1 root root 1513 Jul 14 00:37 server.pem
```

整理证书：

```sh
rm -f ca.csr ca-csr.json peer.csr peer-csr.json server.csr server-csr.json
mv ca-key.pem ca.key
mv ca.pem ca.crt
mv peer-key.pem peer.key
mv peer.pem peer.crt
mv server-key.pem server.key
mv server.pem server.crt
```

然后发送给其它节点。

### 准备 etcd 配置文件

[配置文件样例](https://github.com/etcd-io/etcd/blob/main/etcd.conf.yml.sample)
[etcdctl](https://github.com/etcd-io/etcd/blob/main/etcdctl/README.md)

一般把配置文件放在 `/etc/etcd` 中：`mkdir -p /etc/etcd`。

在三个节点中分别配置(`/etc/etcd/etcd.yaml`)：

```yaml
# 节点名称，不能重复
name: 'etcd-master-1'
data-dir: /var/lib/etcd
wal-dir: /var/lib/etcd/wal
# 本机 ip + 2380 端口，代表和集群通讯
listen-peer-urls: https://192.168.1.26:2380
# 客户端操作地址，因为可能存在本机操作，所以需要使用 127.0.0.1
listen-client-urls: https://192.168.1.26:2379,http://127.0.0.1:2379
# 对等 url
initial-advertise-peer-urls: https://192.168.1.26:2380
# 客户端应该使用的 url
advertise-client-urls: https://192.168.1.26:2379
# 集群地址
initial-cluster: "etcd-master-1=https://192.168.1.26:2380,etcd-master-2=https://192.168.1.28:2380,etcd-master-3=https://192.168.1.29:2380"
# 客户端访问证书
client-transport-security:
  cert-file: /etc/kubernetes/pki/etcd/server.crt
  key-file: /etc/kubernetes/pki/etcd/server.key
  client-cert-auth: true
  trusted-ca-file: /etc/kubernetes/pki/etcd/ca.crt
  auto-tls: true
# 对等证书，正常情况下还需要额外签发一个 kube-etcd-peer 证书，用于集群节点间的通讯
peer-transport-security:
  cert-file: /etc/kubernetes/pki/etcd/peer.crt
  key-file: /etc/kubernetes/pki/etcd/peer.key
  peer-client-cert-auth: true
  trusted-ca-file: /etc/kubernetes/pki/etcd/ca.crt
  auto-tls: true
```

将 `etcd` 做成服务，开机启动(`/usr/lib/systemd/system/etcd.service`)：

```service
[Unit]
Description=Etcd Service
Documentation=https://etcd.io/docs/v3.5/op-guide/clustering/
After=network.target

[Service]
Type=notify
ExecStart=/usr/local/bin/etcd --config-file=/etc/etcd/etcd.yaml
Restart=on-failure
RestartSec=20
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
Alias=etcd3.service
```

开始启动：

```sh
systemctl daemon-reload
systemctl enable --now etcd

# 如果启动失败，查看日志：
journalctl -xeu etcd
```

检测是否安装成功：

```sh
export ETCDCTL_API=3
ENDPOINTS=192.168.1.26:2379,192.168.1.28:2379,192.168.1.29:2379

etcdctl --endpoints=$ENDPOINTS member list --write-out=table --cacert=/etc/kubernetes/pki/etcd/ca.pem --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key
```

期望输出：

```log
[root@k8s-master-1 etcd]# etcdctl member list --write-out=table
+------------------+---------+---------------+---------------------------+---------------------------+------------+
|        ID        | STATUS  |     NAME      |        PEER ADDRS         |       CLIENT ADDRS        | IS LEARNER |
+------------------+---------+---------------+---------------------------+---------------------------+------------+
| a70a3882ca2ed04b | started | etcd-master-2 | https://192.168.1.28:2380 | https://192.168.1.28:2379 |      false |
| aba9edaf5d433902 | started | etcd-master-3 | https://192.168.1.29:2380 | https://192.168.1.29:2379 |      false |
| d59c76c6a4473d61 | started | etcd-master-1 | https://192.168.1.26:2380 | https://192.168.1.26:2379 |      false |
+------------------+---------+---------------+---------------------------+---------------------------+------------+
```

如果不想每次都指定命令行参数，可以通过添加环境变量的方式来实现(详见本节开头的 etcdctl 链接)：

```sh
export ETCDCTL_DIAL_TIMEOUT=3s
export ETCDCTL_CACERT=/etc/kubernetes/pki/etcd/ca.crt
export ETCDCTL_CERT=/etc/kubernetes/pki/etcd/server.crt
export ETCDCTL_KEY=/etc/kubernetes/pki/etcd/server.key
export ETCDCTL_ENDPOINTS=192.168.1.26:2379,192.168.1.28:2379,192.168.1.29:2379
```

**任何配置都可以以 `ETCDCTL_` 开头，加上大小的名称来进行配置**。

### 准备 kube-apiserver-etcd-client 证书

这里还需要给 apiserver 准备访问 etcd 的证书，*当然，你可以直接使用 etcd 的 `server.crt` 和 `server.key`*。

准备证书签名请求(`apiserver-etcd-client-csr.json`，**直接放在 pki 目录中**)：

```json
{
  "CN": "kube-apiserver-etcd-client",
  "key": {
    "algo": "rsa",
    "size": 2048
  }
}
```

生成证书：

```sh
cfssl gencert -ca=/etc/kubernetes/pki/etcd/ca.crt -ca-key=/etc/kubernetes/pki/etcd/ca.key -config=ca-config.json -profile=client apiserver-etcd-client-csr.json | cfssljson -bare /etc/kubernetes/pki/apiserver-etcd-client && \
rm -f apiserver-etcd-client.csr apiserver-etcd-client-csr.json && \
mv apiserver-etcd-client-key.pem apiserver-etcd-client.key && \
mv apiserver-etcd-client.pem apiserver-etcd-client.crt
```


## 二进制安装 K8s 集群

在 [CHANGELOG](https://github.com/kubernetes/kubernetes/tree/master/CHANGELOG) 中找到要安装的版本，下载对应的 Server 和 Node Binaries。

在所有主节点上：

```sh
tar -zxvf kubernetes-server-linux-amd64.tar.gz kubernetes/server/bin/kube{let,ctl,-apiserver,-controller-manager,-scheduler,-proxy}
mv kubernetes/server/bin/* /usr/local/bin/
rm -rf kubernetes
```


在所有工作节点上：

```sh
tar -zxvf kubernetes-node-linux-amd64.tar.gz kubernetes/node/bin/kube{let,-proxy}
mv kubernetes/node/bin/* /usr/local/bin/
rm -rf kubernetes
```

## api-server 证书准备

创建证书签名请求(`apiserver-csr.json`)：

```json
{
  "CN": "kube-apiserver",
  "hosts": [
    "127.0.0.1",
    "192.168.1.26",
    "192.168.1.28",
    "192.168.1.29",
    "192.168.1.34",
    "10.96.0.1",
    "kubernetes",
    "kubernetes.default",
    "kubernetes.default.svc",
    "kubernetes.default.svc.cluster",
    "kubernetes.default.svc.cluster.local"
  ],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "L": "Beijing",
      "ST": "Beijing",
      "O": "Kubernetes",
      "OU": "Kubernetes"
    }
  ]
}
```

其中 `192.168.1.34` 为负载均衡的地址，`10.96.0.1` 为 K8s 内部 apiserver 的负载均衡地址，**一定要加，不然后面网络组件安装不了**，如果换了服务的 cidr，则将后面两位换成 `0.1` 即可。

生成证书：

```sh
cfssl gencert -ca=/etc/kubernetes/pki/ca.crt -ca-key=/etc/kubernetes/pki/ca.key -config=/etc/kubernetes/pki/ca-config.json -profile=server apiserver-csr.json | cfssljson -bare /etc/kubernetes/pki/apiserver && \
rm -f apiserver-csr.json apiserver.csr && \
mv apiserver-key.pem apiserver.key && \
mv apiserver.pem apiserver.crt
```

上面的创建完了还需要创建客户端证书(`apiserver-kubelet-client-csr.json`)：

```json
{
  "CN": "kube-apiserver-kubelet-client",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
   "names": [
    {
      "O": "system:masters"
    }
  ]
}
```

生成客户端证书：

```sh
cfssl gencert -ca=/etc/kubernetes/pki/ca.crt -ca-key=/etc/kubernetes/pki/ca.key -config=ca-config.json -profile=client apiserver-kubelet-client-csr.json | cfssljson -bare /etc/kubernetes/pki/apiserver-kubelet-client && \
rm -f apiserver-kubelet-client.csr apiserver-kubelet-client-csr.json && \
mv apiserver-kubelet-client.pem apiserver-kubelet-client.crt && \
mv apiserver-kubelet-client-key.pem apiserver-kubelet-client.key
```


## front-proxy 证书生成

[配置聚合层](https://kubernetes.io/zh-cn/docs/tasks/extend-kubernetes/configure-aggregation-layer/)


创建 ca 签名请求(`front-proxy-ca-csr.json`)：

```json
{
  "CN": "kubernetes-front-proxy-ca",
  "key": {
    "algo": "rsa",
    "size": 2048
  }
}
```

生成 CA 证书：

```sh
cfssl gencert -initca front-proxy-ca-csr.json | cfssljson -bare /etc/kubernetes/pki/front-proxy-ca
rm -f front-proxy-ca-csr.json front-proxy-ca.csr
mv front-proxy-ca.pem front-proxy-ca.crt
mv front-proxy-ca-key.pem front-proxy-ca.key
```

创建客户端证书签名请求(`front-proxy-client-csr.json`)：

```json
{
  "CN": "front-proxy-client",
  "key": {
    "algo": "rsa",
    "size": 2048
  }
}
```

生成客户端证书：

```sh
cfssl gencert -ca=/etc/kubernetes/pki/front-proxy-ca.crt -ca-key=/etc/kubernetes/pki/front-proxy-ca.key -config=ca-config.json -profile=kubernetes front-proxy-client-csr.json | cfssljson -bare /etc/kubernetes/pki/front-proxy-client
rm -f front-proxy-client.csr front-proxy-client-csr.json
mv front-proxy-client.pem front-proxy-client.crt
mv front-proxy-client-key.pem front-proxy-client.key
```

## 为服务账号配置证书

[为服务账号配置证书](https://kubernetes.io/zh-cn/docs/setup/best-practices/certificates/#configure-certificates-for-user-accounts)

这里的证书不需要放在 pki 下，创建完后一般就不再需要了，所以可以放在一个临时目录中，例如 `/etc/kubernetes/serviceaccount`：

### controller-manager 证书生成

创建证书生成请求(`controller-manager-csr.json`)：

```json
{
  "CN": "system:kube-controller-manager",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "Beijing",
      "L": "Beijing",
      "OU": "kubernetes"
    }
  ]
}
```

生成证书：

```sh
cfssl gencert \
  -ca=/etc/kubernetes/pki/ca.crt \
  -ca-key=/etc/kubernetes/pki/ca.key \
  -config=/etc/kubernetes/pki/ca-config.json \
  -profile=client \
  controller-manager-csr.json | cfssljson -bare /etc/kubernetes/serviceaccount/controller-manager
```

配置服务账号证书：

```sh
kube=/etc/kubernetes/controller-manager.conf

KUBECONFIG=$kube kubectl config set-cluster kubernetes --server=https://192.168.1.250:6443 --certificate-authority /etc/kubernetes/pki/ca.crt --embed-certs

KUBECONFIG=$kube kubectl config set-credentials system:kube-controller-manager --client-key /etc/kubernetes/serviceaccount/controller-manager-key.pem --client-certificate /etc/kubernetes/serviceaccount/controller-manager.pem --embed-certs

KUBECONFIG=$kube kubectl config set-context system:kube-controller-manager@kubernetes --cluster kubernetes --user system:kube-controller-manager

KUBECONFIG=$kube kubectl config use-context system:kube-controller-manager@kubernetes
```

### scheduler 证书生成与配置

创建证书签名请求(`scheduler-csr.json`)：

```json
{
  "CN": "system:kube-scheduler",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "Beijing",
      "L": "Beijing",
      "OU": "Kubernetes"
    }
  ]
}
```

签发证书：

```sh
cfssl gencert \
  -ca=/etc/kubernetes/pki/ca.crt \
  -ca-key=/etc/kubernetes/pki/ca.key \
  -config=/etc/kubernetes/pki/ca-config.json \
  -profile=client \
  scheduler-csr.json | cfssljson -bare /etc/kubernetes/serviceaccount/scheduler
```

生成配置：

```sh
kube=/etc/kubernetes/scheduler.conf

KUBECONFIG=$kube kubectl config set-cluster kubernetes --server=https://192.168.1.250:6443 --certificate-authority /etc/kubernetes/pki/ca.crt --embed-certs

KUBECONFIG=$kube kubectl config set-credentials system:kube-scheduler --client-key /etc/kubernetes/serviceaccount/scheduler-key.pem --client-certificate /etc/kubernetes/serviceaccount/scheduler.pem --embed-certs

KUBECONFIG=$kube kubectl config set-context system:kube-scheduler@kubernetes --cluster kubernetes --user system:kube-scheduler

KUBECONFIG=$kube kubectl config use-context system:kube-scheduler@kubernetes
```

### admin 证书生成与配置

懒得详细说了，直接贴指令(`admin-csr.json`)：

```json
{
  "CN": "kubernetes-admin",
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "Beijing",
      "L": "Beijing",
      "O": "system:masters",
      "OU": "Kubernetes"
    }
  ]
}
```

签发证书：

```sh
cfssl gencert \
  -ca=/etc/kubernetes/pki/ca.crt \
  -ca-key=/etc/kubernetes/pki/ca.key \
  -config=/etc/kubernetes/pki/ca-config.json \
  -profile=client \
  admin-csr.json | cfssljson -bare /etc/kubernetes/serviceaccount/admin
```

生成配置：

```sh
kube=/etc/kubernetes/admin.conf

KUBECONFIG=$kube kubectl config set-cluster kubernetes --server=https://192.168.1.33:6443 --certificate-authority /etc/kubernetes/pki/ca.crt --embed-certs

KUBECONFIG=$kube kubectl config set-credentials kubernetes-admin --client-key /etc/kubernetes/serviceaccount/admin-key.pem --client-certificate /etc/kubernetes/serviceaccount/admin.pem --embed-certs

KUBECONFIG=$kube kubectl config set-context kubernetes-admin@kubernetes --cluster kubernetes --user 	kubernetes-admin

KUBECONFIG=$kube kubectl config use-context kubernetes-admin@kubernetes
```

### ServiceAccount Key 生成

K8s 底层，每创建一个 ServiceAccount，都会分配一个 Secret，而 Secret 里面有秘钥，秘钥就是由我们接下来的 sa 生成的。所以需要提前创建出 sa 信息(RSA加密的公钥和私钥)：

```sh
openssl genrsa -out /etc/kubernetes/pki/sa.key 2048

openssl rsa -in /etc/kubernetes/pki/sa.key -pubout -out /etc/kubernetes/pki/sa.pub
```

### 同步配置文件

最后，将创建好的配置文件发送到其它节点：

```sh
scp /etc/kubernetes/admin.conf k8s-master-2:/etc/kubernetes/admin.conf
scp /etc/kubernetes/controller-manager.conf k8s-master-2:/etc/kubernetes/controller-manager.conf
scp /etc/kubernetes/scheduler.conf k8s-master-2:/etc/kubernetes/scheduler.conf
```

# 启动所有组件

日志级别：

- `--v=0` 通常对此有用，*始终*对运维人员可见。
- `--v=1` 如果您不想要详细程度，则为合理的默认日志级别。
- `--v=2` 有关服务的有用稳定状态信息以及可能与系统中的重大更改相关的重要日志消息。这是大多数系统的建议默认日志级别。
- `--v=3` 有关更改的扩展信息。
- `--v=4` Debug 级别。
- `--v=6` 显示请求的资源。
- `--v=7` 显示 HTTP 请求头。
- `--v=8` 显示 HTTP 请求内容。
- `--v=9` 显示 HTTP 请求内容而不截断内容。

## 启动 ApiServer

**在启动前应该先配置好 apiserver 的负载均衡**，具体就不展示了，很简单。

创建必要的目录：

```sh
mkdir -p /etc/kubernetes/manifests/ /etc/systemd/system/kubelet.service.d /var/lib/kubelet /var/log/kubernetes
```

### 配置 ApiServer 服务

[kube-apiserver](https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-apiserver/)

所有 Master 节点创建 kube-apiserver.service。

> 如果不是高可用集群，192.168.0.250 (负载均衡 ip) 应该改为本机的 ip
> 以下文档使用的 k8s service 网段为 10.96.0.0/16，该网段不能喝宿主机的网段、Pod网段重叠
> ~~特别注意：docker 的网桥默认为 172.17.0.1/16，不要使用这个网段~~ (存疑，现在都是 containerd 了)

执行如下命令

```sh
# --advertise-address 需要改为本master节点的ip
# --service-cluster-ip-range 需要改为自己规划的服务网段
# --etcd-servers: 改为自己etcd-server的所有地址
cat << EOF > /usr/lib/systemd/system/kube-apiserver.service
[unit]
Description=Kubernetes API Server
Documentation=https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-apiserver/
After=network.target

[Service]
ExecStart=/usr/local/bin/kube-apiserver \\
  --v=2 \\
  --allow-privileged=true \\
  --bind-address=0.0.0.0 \\
  --secure-port=6443 \\
  --advertise-address=机器 ip \\
  --service-cluster-ip-range=10.96.0.0/16 \\
  --service-node-port-range=30000-32767 \\
  --etcd-servers=https://192.168.1.26:2379,https://192.168.1.28:2379,https://192.168.1.29:2379 \\
  --etcd-cafile=/etc/kubernetes/pki/etcd/ca.crt \\
  --etcd-certfile=/etc/kubernetes/pki/apiserver-etcd-client.crt \\
  --etcd-keyfile=/etc/kubernetes/pki/apiserver-etcd-client.key \\
  --client-ca-file=/etc/kubernetes/pki/ca.crt \\
  --tls-cert-file=/etc/kubernetes/pki/apiserver.crt \\
  --tls-private-key-file=/etc/kubernetes/pki/apiserver.key \\
  --kubelet-client-certificate=/etc/kubernetes/pki/apiserver-kubelet-client.crt \\
  --kubelet-client-key=/etc/kubernetes/pki/apiserver-kubelet-client.key \\
  --service-account-key-file=/etc/kubernetes/pki/sa.pub \\
  --service-account-signing-key-file=/etc/kubernetes/pki/sa.key \\
  --service-account-issuer=https://kubernetes.default.svc.cluster.local \\
  --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname \\
  --enable-admission-plugins=NamespaceLifecycle,LimitRanger,ServiceAccount,DefaultStorageClass,DefaultTolerationSeconds,NodeRestriction,ResourceQuota \\
  --authorization-mode=Node,RBAC \\
  --enable-bootstrap-token-auth=true \\
  --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt \\
  --proxy-client-cert-file=/etc/kubernetes/pki/front-proxy-client.crt \\
  --proxy-client-key-file=/etc/kubernetes/pki/front-proxy-client.key \\
  --requestheader-allowed-names=aggregator,front-proxy-client \\
  --requestheader-username-headers=X-Remote-User \\
  --requestheader-group-headers=X-Remote-Group \\
  --requestheader-extra-headers-prefix=X-Remote-Extra-
  # --token-auth-file 

Restart=on-failure
RestartSec=10s
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now kube-apiserver

systemctl status kube-apiserver
```

## 启动 controller-manager

[kube-controller-manager](https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-controller-manager/)

```sh
# --cluster-cidr 是 Pod 的 ip 范围
cat << EOF > /usr/lib/systemd/system/kube-controller-manager.service
[Unit]
Description=Kubernetes Controller Manager
Documentation=https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-controller-manager/
After=network.target

[Service]
ExecStart=/usr/local/bin/kube-controller-manager \\
  --v=2 \\
  --root-ca-file=/etc/kubernetes/pki/ca.crt \\
  --cluster-signing-cert-file=/etc/kubernetes/pki/ca.crt \\
  --cluster-signing-key-file=/etc/kubernetes/pki/ca.key \\
  --service-account-private-key-file=/etc/kubernetes/pki/sa.key \\
  --kubeconfig=/etc/kubernetes/controller-manager.conf \\
  --use-service-account-credentials=true \\
  --controllers=*,bootstrap-signer-controller,token-cleaner-controller \\
  --allocate-node-cidrs=true \\
  --cluster-cidr=196.16.0.0/16 \\
  --master=https://192.168.1.34:6443 \\
  --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt \\
  

Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now kube-controller-manager

systemctl status kube-controller-manager
```

## 启动 scheduler

[kube-scheduler](https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-scheduler/)

```sh
cat << EOF > /usr/lib/systemd/system/kube-scheduler.service
[Unit]
Description=Kubernetes Scheduler
Documentation=https://kubernetes.io/zh-cn/docs/reference/command-line-tools-reference/kube-scheduler/
After=network.target

[Service]
ExecStart=/usr/local/bin/kube-scheduler \\
  --v=2 \\
  --master=https://192.168.1.34:6443 \\
  --kubeconfig=/etc/kubernetes/scheduler.conf

Restart=on-failure
RestartSec=10s
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload && systemctl enable --now kube-scheduler

systemctl status kube-scheduler
```

# 接下来

到目录为止，所有主节点需要的组件已经全部部署完成，后续则是 kubelet 等组件的部署。

为避免章节过长，所以对文章进行了分节：

- [高可用集群 P2](/kubernetes/high-available-p2)