---
title: 搭建私钥镜像仓库
date: 2024-02-21 20:54:15
categories: 
  data:
    - { name: "k8s", path: "/2024/02/k8s" }
---

因为k8s在之前的版本中弃用了 Docker ，新版本中使用的是 containerd，因此忽略证书校验也是不一样的。

首先Docker中，只需要在`/etc/docker/daemon.json`中配置`insecure-registries`属性就可以直接使用自己的私有仓库了。

而在 containerd 中，它并不会使用 Docker 的配置，**而且它默认使用https访问，即使仓库地址是 ip**，所以你还要必须要给镜像仓库配个证书并且证书校验，或者添加配置改为http访问。

[文档](https://github.com/containerd/containerd/blob/release/1.6/docs/hosts.md)

# 安装registry

## 创建自签证书
[openssl给内网IP生成ca证书(ssl证书)](https://blog.csdn.net/wd520521/article/details/129832318)

### 生成私钥和证书

```bash
openssl req -newkey rsa:2048 -nodes -keyout ca.key -out ca.csr
```

```log
[root@localhost certs]# openssl req -newkey rsa:2048 -nodes -keyout ca.key -out ca.csr
Generating a 2048 bit RSA private key
...................+++
............+++
writing new private key to 'ca.key'
-----
You are about to be asked to enter information that will be incorporated
into your certificate request.
What you are about to enter is what is called a Distinguished Name or a DN.
There are quite a few fields but you can leave some blank
For some fields there will be a default value,
If you enter '.', the field will be left blank.
-----
Country Name (2 letter code) [XX]:CN
State or Province Name (full name) []:hubei
Locality Name (eg, city) [Default City]:wuhan
Organization Name (eg, company) [Default Company Ltd]:
Organizational Unit Name (eg, section) []:
Common Name (eg, your name or your server's hostname) []:192.168.0.202
Email Address []:

Please enter the following 'extra' attributes
to be sent with your certificate request
A challenge password []:
An optional company name []:
```

注意里面有个`Common Name`，这里填你的ip或者域名。

### 自签署证书

```bash
openssl x509 -req -days 365 -in ca.csr -signkey ca.key -out ca.crt
```

### 生成服务器证书

```bash
openssl genrsa -out server.key 2048
# 使用域名
openssl req -new -key server.key -out server.csr
# 使用ip
openssl req -new -key server.key  -subj "/CN=192.168.0.202" -out server.csr
# https://goharbor.io/docs/2.9.0/install-config/configure-https/
cat > v3.ext <<-EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1=yourdomain.com
DNS.2=yourdomain
DNS.3=hostname
EOF

openssl x509 -req -sha512 -days 3650 -extfile v3.ext -CA ca.crt -CAkey ca.key -CAcreateserial -in server.csr -out server.crt
```
记得修改`DNS.1`为你的ip或者域名，如果只有一个，把下面多的DNS都给删了就行。


## 启动私有仓库

```bash
docker pull registry:latest

# 注意可能需要自己改一下容器数据卷的位置。
docker run -d -p 443:5000 --restart=always --name registry \
    -v `pwd`/certs:/certs \
    -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/server.crt \
    -e REGISTRY_HTTP_TLS_KEY=/certs/server.key \
    -v /opt/data/registry:/var/lib/registry \
    registry
```

测试：
```bash
ctr images pull 192.168.0.202:5000/test:latest
```

如果报错是这样的：
```log
ctr: failed to resolve reference "192.168.0.202:5000/test:latest": failed to do request: Head "https://192.168.0.202:5000/v2/test/manifests/latest": tls: failed to verify certificate: x509: certificate relies on legacy Common Name field, use SANs instead
```

则说明你证书没生成好，正常的是这样的：

```log
ctr: failed to resolve reference "192.168.0.202:5000/test:latest": failed to do request: Head "https://192.168.0.202:5000/v2/test/manifests/latest": tls: failed to verify certificate: x509: cannot validate certificate for 192.168.0.202 because it doesn't contain any IP SANs
```

用域名就是这样的：
```log
INFO[0000] trying next host                              error="failed to do request: Head \"https://my.registry/v2/registry/manifests/latest\": tls: failed to verify certificate: x509: certificate signed by unknown authority" host=my.registry
ctr: failed to resolve reference "my.registry/registry:latest": failed to do request: Head "https://my.registry/v2/registry/manifests/latest": tls: failed to verify certificate: x509: certificate signed by unknown authority
```

# 忽略证书校验

> [官方文档](https://github.com/containerd/containerd/blob/release/1.6/docs/hosts.md)

在进行下一步前我们要了解一个东西(当然你直接跳过也行，反正我是踩了很大的坑)。

首先如果你用 Docker 作为 k8s 的运行基础的话，那么你一定用过`ctr`指令。

这个指令是 containerd 自带的 CLI 命令行工具，然后我们知到，新版 k8s 只和[容器运行时接口（CRI）](https://kubernetes.io/zh-cn/docs/concepts/architecture/cri/)打交道。

所以就有了 crictl，它是k8s中CRI（容器运行时接口）的客户端，k8s使用该客户端和 containerd 进行交互。

所以这有什么用呢？

首先在配置文件`/etc/containerd/config.toml`中，我们都知到这是 containerd 的配置，如果你以为这是一个通用配置，是给 ctr 和 crictl 这两个用的，那就大错特错了。。。

ctr 不使用 CRI 的配置([#5407](https://github.com/containerd/containerd/issues/5407#issuecomment-824967150))，所以这个配置是给 crictl 用的。

为什么说这个？。。

看到上面我用 ctr 拉镜像没？我试了一个晚上，以为这东西有 bug，不读我忽略证书校验的配置，结果配置文件是给 crictl 用的。。

## 修改配置文件

修改配置：
```bash
vi /etc/containerd/config.toml
```

修改如下内容：
```toml
[plugins."io.containerd.grpc.v1.cri".registry]
    config_path = "/etc/containerd/certs.d"
```

添加配置文件：

```bash
mkdir /etc/containerd/certs.d
# 修改为你自己的域名
mkdir /etc/containerd/your.domain

cat > /etc/containerd/your.domain/hosts.toml <<-EOF
server = "https://your.domain"

[host."https://your.domain"]
  capabilities = ["pull", "resolve"]
  skip_verify = true
EOF

systemctl restart containerd
```

如果是Ip访问，直接把域名替换成ip就行了，其它步骤不变。

如果想换成http访问，就把下面`[host."https://192.168.xxx.xxx"]`里面的`https`换成`http`就行了。
