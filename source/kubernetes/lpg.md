---
title: 搭建LPG日志采集系统
date: 2024-05-26 21:54:55
categories: 
  data:
    - { name: "k8s", path: "/2024/02/08/k8s" }
---


# 安装并使用 helm

安装没什么好说的，直接照着官方文档来就行：[安装 Helm](https://helm.sh/zh/docs/intro/install/)。注意需要安装在主节点上，因为 Helm 会用 `kubectl`

推荐直接二进制版本安装：

1. 下载 [需要的版本](https://github.com/helm/helm/releases)
2. 解压(`tar -zxvf helm-v3.0.0-linux-amd64.tar.gz`)
3. 在解压目录中找到helm程序，移动到需要的目录中(`mv linux-amd64/helm /usr/local/bin/helm`)

基本使用只需要记住下面几个命令：
```bash
# 打印某个chart的配置文件，这个配置文件基本不能直接用，里面会有一些 helm 的脚本，但是里面一般会有注释。
helm show values repo/chart

# 安装某个 chart，一定需要注意加上后面的命名空间，不然就安装到默认的命名空间里面了！！helm安装一般不会给你创建命名空间的。
helm install <release_name> <repo>/<chart> --values <config_file_name> -n <namespace>

# 更新某个 release
helm upgrade <release_name> <repo>/<chart> --values <config_file_name> -n <namespace>

# 卸载某个 release
helm uninstall <release_name> -n <namespace>

# 显示所有 release
heml list -A
```

# 安装LPG

> 安装前需要集群中存在可用的默认 StorageClass

## 安装 Loki

Loki 是日志的存储和检索系统，是核心的组件，因此需要先安装 Loki。官方推荐 Loki 使用 helm 安装。

有两种安装方案：

- 可伸缩部署
- 单机部署

默认是 *可伸缩部署*，个人也推荐直接用这个，因为 loki 占用很低，最后一整套下来可能也就 1G 左右的内存占用(我这里是 4 个节点)。

按照下面的步骤安装：

```bash
# 这里需要自己设代理，或者找镜像，我是设的代理。。。没有找到镜像
helm repo add grafana https://grafana.github.io/helm-charts

# 更新
helm repo update
```

然后创建配置文件，loki 的文档十分拉胯...有很多坑。

```yaml
# loki-values.yaml
minio:
  enabled: true
loki:
  storage:
    # 这里代表用一个本地的存储支持
    type: s3
  schemaConfig:
    configs:
      # from 表示这个时间之后的日志使用这个配置进行存储.
      - from: 2024-05-22
        object_store: s3
        store: tsdb
        schema: v13
        index:
          prefix: index_
          period: 24h

# 分布式配置，read、backend 和 write 至少 3 个，每个服务基本只占用 100 MB 左右
read:
  replicas: 3
  extraEnv:
    - name: TZ
      value: "CST-8"

backend:
  replicas: 3
  extraEnv:
    - name: TZ
      value: "CST-8"

write:
  replicas: 3
  extraEnv:
    - name: TZ
      value: "CST-8"

# 这个内存配置一定要改，默认为 8G
chunksCache:
  allocatedMemory: 2048
  extraEnv:
    - name: TZ
      value: "CST-8"
```

之后使用 helm 安装即可。

## 安装 Grafana

配置文件：

```yaml
# grafana-values.yaml
ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: nginx
  hosts:
    - dashboards.oneaccess.com
  path: /grafana
  pathType: Prefix


grafana.ini:
  server:
    root_url: https://dashboards.oneaccess.com/grafana
    serve_from_sub_path: true

persistence:
  enabled: true
  size: 5Gi
```

因为是一个控制台，没什么好说的，直接 helm 安装即可。

## 安装 Promtail

这个东西推荐直接 yaml 安装，不建议使用 helm，因为它的配置会频繁变动，并且官方也建议直接使用 yaml 安装。

进入官方文档复制 yaml 并应用：[install-as-kubernetes-daemonset-recommended](https://grafana.com/docs/loki/latest/send-data/promtail/installation/#install-as-kubernetes-daemonset-recommended)

# 配置日志采集

## 配置租户并添加数据源

管理员登录 grafana，如果忘记密码，可以进入容器执行如下命令：

```sh
grafana-cli admin reset-admin-password <new_password>
```

登录后进入设置切换为中文。然后回到首页，点击左侧：管理 -> 概况 -> 组织。

在这里，一个组织就是一个租户，在组织的左边有一个 ID，这个 ID 要记住，默认的是 1。

之后点击左侧：连接 -> 添加新连接 -> 搜索 loki.

进去之后进行配置，url 一栏用服务名访问，例如我的是：`loki-gateway.loki.svc.cluster.local`.

默认没有认证，**但是需要在请求头中添加请求头 `X-Scope-OrgID`，值为组织的 ID**，这一步掉了会直接报错，并且还要自己去看容器日志，很麻烦。

配置完后添加，这一步完成。

## 配置 promtail

日志采集主要由 Promtail 实现，它的文档写的不是很好(~~也有可能是我英语不行没看懂...~~)，所以这里我用我实际用到的需求举例：

1. 收集集群节点上路径为 `/var/log/<tenantry>/<project_name>/<service_name>/<pod_name>/*.log` 中的所有日志。
2. `<project_name>` 代表项目名称，`<service_name>` 代表服务名称，为了防止冲突，额外添加了 `<pod_name>`。
3. 进入一个 `<project_name>`，下面有多个 `<serivce_name>`，要求能够准确获取时间、日志级别和日志内容。
4. `<tenantry>` 为租户名称，不强求与 id 相同.

相信这个需求是绝大部分项目都可以用到的一个模板。这里我就分享一下我的配置文件，打开安装 Promtail 的命名空间，修改它的 ConfigMap：

```yaml
data:
  promtail.yaml: |
    server:
      http_listen_port: 9080
      grpc_listen_port: 0

    clients:
    - url: http://loki-gateway/loki/api/v1/push
      tenant_id: 2

    positions:
      filename: /tmp/positions.yaml

    target_config:
      sync_period: 10s

    # 这里是重要的配置
    scrape_configs:
      - job_name: read_xxx_log
        static_configs:
          - targets:
              - localhost
            labels:
              __path__: /var/log/xxx/**/*-info.log
        pipeline_stages:
          - regex:
              expression: "/var/log/xxx/(?P<project_name>[\\w-]+)/[\\w-]+/(?P<service_name>[\\w-]+)-info.log"
              source: "filename"
          - labels:
              project_name: 
              service_name: 
          - multiline:
              firstline: "^ ?\\[20"
              max_lines: 200
          - regex:
              expression: "\\[(?P<time>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]\\[(?P<level>\\w+) \\]"
          - timestamp:
              source: time
              format: "2006-01-02 15:04:05.999"
              location: "Asia/Shanghai"
          - labeldrop:
              - filename
```

首先在 `clients[0].tenant_id` 中，我们配置了租户 Id，这里的租户 Id 是一个默认 Id，如果后面不显式配置则会使用这个值。

在真正来看日志收集的配置前，先理解一个概念：**每次日志收集都只收集一条，是一条，不是一行，然后一条日志中拥有各种标签，标签用于日志的查询和过滤**。

如果我们想要收集日志，首先得去告诉 protmail 去哪里收集，这里我使用了 `static_configs`，表示使用本机文件上的静态文件:

```yaml
static_configs:
  - targets:
      - localhost
    labels:
      __path__: /var/log/xxx/**/*-info.log
```

更多可用内容可以在文档中找: [scrape_configs](https://grafana.com/docs/loki/latest/send-data/promtail/configuration/#scrape_configs)

> 这里开始文档就非常恶心了，它将日志的位置，即从哪里收集，和其它很多配置，例如日志内容处理，这些配置都被放在了一个同级下面，实际上如果这些配置如果能够分类就会更舒服，例如日志收集方式和日志内容处理分为两个类别，这样理解起来会很好，并且找起来也更方便...

这一步完成后，我们就依次来完成我们的需求。

### 提取标签

在前面的需求中，要求能够提取出项目名和服务名，而这些信息一般存在于文件路径中，所以使用 regx 来进行提取：

```yaml
regex:
  expression: "/var/log/xxx/(?P<project_name>[\\w-]+)/[\\w-]+/(?P<service_name>[\\w-]+)-info.log"
  source: "filename"
```

这里的 source 可以填入任意的标签名称，至于有哪些标签可用，可以去已经采集后的日志中去看...

这里的 `expression` 提取标签需要用到正则表达式的命名分组，具体就不多说了。

在正则表达式提取到后，需要用 `labels` 将其发送给 loki：

```yaml
labels:
  project_name: 
  service_name: 
```

### 处理错误日志

正常情况下，当服务报错时，服务会打印出很多行的错误调用栈，而 protmail 默认会将一行认作一条日志，但实际上，我们希望单条错误和调用栈一起作为一条日志。

这时候就需要使用 `multline` 来指定每条日志的开头了：

```yaml
multiline:
  firstline: "^ ?\\[20"
  max_lines: 200
```

这里需要提供一个正则表达式，当某一行匹配时，就将其作为一条新的日志，如果不匹配，则链接到前一条日志，直到匹配到下一条新的日志。

注意下面的 `max_lines`，代表一条日志最长有多长，如果你的日志调用栈行数超过了这个值，则**日志会被截断，即使它的开头不符合要求，这意味着你可能丢失日志级别或时间等其它重要信息**。默认值为 `128`。

### 提取日志级别和时间

默认情况下，日志的时间是日志发送到 loki 并成功保存的时间，而日志级别会用特殊的方法去猜测(疑似是扫描 ERROR 关键词)。

对于这俩个，我们只需要用 `regx` 提取出 `level` 和 `time` 即可：

```yaml
regex:
  expression: "\\[(?P<time>\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]\\[(?P<level>\\w+) \\]"
```

这里我是 Java 程序，我的日志一般是这样的：

```log
[2024-06-24 14:51:10.254][INFO ] [http-nio-8083-exec-1] [xxx.xxx.Hello#world:123] - hello world 
```

对于时间，这里还有一个坑，那就是时区，默认是 UTC+0，我一开始尝试改容器的时区，但是发现没有用，后面发现可以直接用现成的配置：

```yaml
timestamp:
  source: time
  format: "2006-01-02 15:04:05.999"
  location: "Asia/Shanghai"
```

这里的 `format` 是 `GoLang` 的格式化模板，这个时间似乎是 `GoLang` 的诞生时间.

