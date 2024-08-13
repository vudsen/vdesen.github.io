---
title: 使用 Python 调用 etcd gRPC 接口
date: 2024-08-06 17:59:24
tags: 
  - 'etcd'
categories:
  - 'kubernetes'
seo:
  description: 使用 Python 调用 etcd gRPC 接口。
  keywords: 
   - etcd
   - 'etcd with python'
   - 'etcd gGPC'
---

# 环境准备

因为 etcd 的 API 很少，所以这里直接考虑自己写库调用，而不是用第三方库。

## 安装依赖

```shell
pip install grpcio
pip install grpcio-tools

pip install google-api-core
```

## 创建 protobuf 文件

直接从官方文档抄就行了：[rpc.proto](https://github.com/etcd-io/etcd/blob/main/api/etcdserverpb/rpc.proto#L37)。

碰到报错的 `option` 直接删掉就行(`import` 不能删，后面会讲)。

`rpc.proto` 是基础的服务，只用拿出你需要的服务即可，例如需要使用 `Range` 功能，可以这样写：

```protobuf
syntax = "proto3";
package etcdserverpb;

import "api/mvccpb/kv.proto";

service KV {
  rpc Range(RangeRequest) returns (RangeResponse) {}
}
```

`RangeRequest` 和 `RangeResponse` 都在同一个文件中，部分文件例如 `kv.proto` 是缺失的，需要再跟着复制进来。

这里是我的目录结构，可以把它嵌套到其它目录中，但是后面的生成代码指令需要同步修改：

```log
api
├── etcdserverpb
│   └── rpc.proto
└── mvccpb
    └── kv.proto
```

---

例如需要使用 `Range` 和 `Put` 两个功能，完整的代码如下：

```proto
// api/etcdserverpb/rpc.proto
syntax = "proto3";
package etcdserverpb;

import "google/api/annotations.proto";
import "api/mvccpb/kv.proto";


service KV {
  // Range gets the keys in the range from the key-value store.
  rpc Range(RangeRequest) returns (RangeResponse) {}

  // Put puts the given key into the key-value store.
  // A put request increments the revision of the key-value store
  // and generates one event in the event history.
  rpc Put(PutRequest) returns (PutResponse) {
      option (google.api.http) = {
        post: "/v3/kv/put"
        body: "*"
    };
  }
}

message RangeRequest {
  enum SortOrder {
	NONE = 0; // default, no sorting
	ASCEND = 1; // lowest target value first
	DESCEND = 2; // highest target value first
  }
  enum SortTarget {
	KEY = 0;
	VERSION = 1;
	CREATE = 2;
	MOD = 3;
	VALUE = 4;
  }

  bytes key = 1;
  bytes range_end = 2;
  int64 limit = 3;
  int64 revision = 4;
  SortOrder sort_order = 5;
  SortTarget sort_target = 6;
  bool serializable = 7;
  bool keys_only = 8;
  bool count_only = 9;
  int64 min_mod_revision = 10;
  int64 max_mod_revision = 11;
  int64 min_create_revision = 12;
  int64 max_create_revision = 13;
}

message RangeResponse {
  ResponseHeader header = 1;
  // kvs is the list of key-value pairs matched by the range request.
  // kvs is empty when count is requested.
  repeated mvccpb.KeyValue kvs = 2;
  // more indicates if there are more keys to return in the requested range.
  bool more = 3;
  // count is set to the number of keys within the range when requested.
  int64 count = 4;
}

message ResponseHeader {
  // cluster_id is the ID of the cluster which sent the response.
  uint64 cluster_id = 1;
  // member_id is the ID of the member which sent the response.
  uint64 member_id = 2;
  // revision is the key-value store revision when the request was applied, and it's
  // unset (so 0) in case of calls not interacting with key-value store.
  // For watch progress responses, the header.revision indicates progress. All future events
  // received in this stream are guaranteed to have a higher revision number than the
  // header.revision number.
  int64 revision = 3;
  // raft_term is the raft term when the request was applied.
  uint64 raft_term = 4;
}

message PutRequest {
  // key is the key, in bytes, to put into the key-value store.
  bytes key = 1;
  // value is the value, in bytes, to associate with the key in the key-value store.
  bytes value = 2;
  // lease is the lease ID to associate with the key in the key-value store. A lease
  // value of 0 indicates no lease.
  int64 lease = 3;

  // If prev_kv is set, etcd gets the previous key-value pair before changing it.
  // The previous key-value pair will be returned in the put response.
  bool prev_kv = 4;

  // If ignore_value is set, etcd updates the key using its current value.
  // Returns an error if the key does not exist.
  bool ignore_value = 5;

  // If ignore_lease is set, etcd updates the key using its current lease.
  // Returns an error if the key does not exist.
  bool ignore_lease = 6;
}

message PutResponse {
  ResponseHeader header = 1;
  // if prev_kv is set in the request, the previous key-value pair will be returned.
  mvccpb.KeyValue prev_kv = 2;
}
```

```proto
// api/mvccpb/kv.proto
syntax = "proto3";
package mvccpb;

message KeyValue {
  // key is the key in bytes. An empty key is not allowed.
  bytes key = 1;
  // create_revision is the revision of last creation on this key.
  int64 create_revision = 2;
  // mod_revision is the revision of last modification on this key.
  int64 mod_revision = 3;
  // version is the version of the key. A deletion resets
  // the version to zero and any modification of the key
  // increases its version.
  int64 version = 4;
  // value is the value held by the key, in bytes.
  bytes value = 5;
  // lease is the ID of the lease that attached to key.
  // When the attached lease expires, the key will be deleted.
  // If lease is 0, then no lease is attached to the key.
  int64 lease = 6;
}
```

### 生成代码

之后使用命令生成对应的 Python 代码：

```shell
python -m grpc_tools.protoc -I./ -I./.venv/Lib/site-packages --python_out=./ --pyi_out=./ api/mvccpb/kv.proto
python -m grpc_tools.protoc -I./ -I./.venv/Lib/site-packages --python_out=./ --pyi_out=./ --grpc_python_out=./ api/etcdserverpb/rpc.proto 
```

注意 `-I./.venv/Lib/site-packages`，这个就是告诉 `protoc`，将这个目录也作为 `protoc` 文件的搜素目录(实际是让它搜素该文件夹中的 `google` 目录)。

测试：

```python
def main():
    with grpc.insecure_channel('10.77.0.38:2379') as channel:
        stub = rpc_pb2_grpc.KVStub(channel)
        range_response = stub.Range(
            rpc_pb2.RangeRequest(
                key=bytes('/testenv', 'utf-8'),
                range_end=bytes('\0', 'utf-8'),
            )
        )
        print(range_response.kv)


if __name__ == "__main__":
    main()
```

### Ptyhon 3.6 生成文件的问题


如果是 Python 3.6，在使用`--pyi_out`会报错，这个是一个声明文件的生成，不生成不会影响运行，但是会导致语法提示缺失。

首先去掉 `--pyi_out`。之后下载 [protoc](https://github.com/protocolbuffers/protobuf)，直接用最新版就可以了(我当时是 28.0)。

然后使用下面的命令重新生成 pyi 文件。

```shell
protoc -I./ -I./.ansible-cd-venv/Lib/site-packages --pyi_out=./ api/etcdserverpb/rpc.proto
protoc -I./ -I./.ansible-cd-venv/Lib/site-packages --pyi_out=./ api/mvccpb/kv.proto
```


# 关于 key 和 range_end

对于 `key` 是必须提供的，搭配上 `range_end`，etcd 会做出不同的行为：

- 如果 `range_end` 为空，则精确匹配 `key`。
- 如果 `range_end` 为 `\0`，则匹配所有前缀为 `key` 的项目。
- 如果 `range_end` 为其它值，则会使用**字典序**匹配出所有 [`key`, `range_end`) 范围内的项目。
    - 例如: `fa`、`fb`、`fc`、`fca`、`fcb`、`fcc`、`fd`、`fe` 是一组字典序升序的字符串，[`fb`, `fd`) 的结果就是 `fb`、`fc`、`fca`、`fcb`、`fcc`。

除此之外，**如果 `key` 为 `\0`，则匹配所有键**。如果要搜素所有的键，则需要指定 `key = '\0'`，`range_end = '\0'`.