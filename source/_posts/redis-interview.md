---
title: redis面试
date: 2023-03-28 22:21:42
tags:
---

# 1. Redis字典

[深入理解Redis 数据结构—字典 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/555430730)

> 可以这样理解：Redis的字典就是java7的HashMap，即哈希表+链表

Redis字典使用的哈希表结构如下：[redis/dict.h at 2.6 · redis/redis (github.com)](https://github.com/redis/redis/blob/2.6/src/dict.h#L68-L73)

```c++
typedef struct dictht {
     // table 数组
    dictEntry **table;
    // 哈希表的大小
    unsigned long size;
    // 等于size-1，用于计算索引值, 这里说明size肯定是2的幂
    unsigned long sizemask;
    // 已有的键值对数量
    unsigned long used;
} dictht;
```

`dictEntry`就是哈希节点了：[redis/dict.h at 2.6 · redis/redis (github.com)](https://github.com/redis/redis/blob/2.6/src/dict.h#L47-L55)

```c++
typedef struct dictEntry {
    // 键
    void *key;
    // 值   
    union {
        void *val;
        uint64_t u64;
        int64_t s64;
    } v;
    // 指向下一个哈希表节点，形成链表
    struct dictEntry *next;
} dictEntry;
```

Redis中的字典则由`dict`组成：[redis/dict.h at 2.6 · redis/redis (github.com)](https://github.com/redis/redis/blob/2.6/src/dict.h#L75-L81)

```c++
typedef struct dict {
    // 类型特定的函数，提供增删改查等功能 
    dictType *type;
   // 私有函数
    void *privdata;
    // 哈希表, 这里的二维是后面用来扩容的
    dictht ht[2];
    // rehash 索引，记录了当前扩容的进度
    int rehashidx; /* rehashing not in progress if rehashidx == -1 */
    // 用来记录当前运行的安全迭代器数，当不为0的时候表示有安全迭代器正在执行，这时候就会暂停rehash操作
    int iterators; /* number of iterators currently running */
} dict;
```

![总览](https://xds.asia/public/post/2023-2-3-0c4958ca-7128-481d-807c-0c95384937ec.webp)



# 2. Redis扩容与缩容

我们用`ht[0].used/ht[0].size`表示负载因子

## 2.1 扩容

- 如果没有**fork**子进程在执行**RDB**或者**AOF**的持久化，一旦满足**负载因子大于等于1**，此时触发扩容；

- 如果有**fork**子进程在执行**RDB**或者**AOF**的持久化时，则需要满足**负载因子大于5**，此时触发扩容。

Redis在扩容时使用的是渐进式哈希，即每次值移动一部分的数据到新的哈希表中。

在字典`dict`中，`dict.ht[0]`代表旧的哈希表，`dict.ht[1]`代表新的哈希表，每次扩容时会将容量乘2，同时`dict.rehashidx`代表rehash的进度，表示`dict.ht[0]`中，小于该索引的值都已经被移动到`dict.ht[1]`中了，此时需要在`dict.ht[1]`中进行相关的增删改查操作，反之则在`dict.ht[0]`中进行。

在扩容期间，每次进行增删改查都会将`dict.rehashidx`加一，并进行相关的rehash操作。

在扩容完毕后，将`dict.ht[0]`指向`dict.ht[1]`，并删除旧的哈希表。

## 2.2 缩容

当负载因子小于0.1时，Redis就会对哈希表进行收缩操作。

相关操作和扩容一样，在`dict.ht[1]`处创建新的哈希表，之后再渐进式rehash。

## 2.3 其它问题

假如在rehash扩容的时候，我们一直插入，会不会导致再次扩容呢？

假设此时哈希表容量为`n`，元素数量为`n`，在扩容哈希表容量后变为`2n`，而对于Redis来说，完成rehash需要`2n - n = n`次操作，所以我们最多进行`n`次插入，插入完后元素数量也变为`2n`，再次触发扩容。

对于负载因子为5的时候，假设此时哈希表容量为`n`，元素数量为`5n + 1`，扩容后哈希表容量为`2n`，同样我们可以插入`n`个元素，此时元素数量变为`6n + 1`，负载因子为`(6n + 1) / 2n`约等于3，此时不会触发扩容。

# 3. 字典遍历

## 3.1 全遍历

使用如下指令就会执行全遍历，返回所有的key：

```shell
keys *
```

优点：

- 返回的key不会重复

缺点：

- 在遍历完前会阻塞服务器

迭代器结构：

```c++
typedef struct dictIterator {
    dict *d; //迭代的字典
    int index; //当前迭代到Hash表中哪个索引值
    int table, safe; //table用于表示当前正在迭代的Hash表,即ht[0]与ht[1]，safe用于表示当前创建的是否为安全迭代器
    dictEntry *entry, *nextEntry;//当前节点，下一个节点
    /* unsafe iterator fingerprint for misuse detection. */
    long long fingerprint;//字典的指纹，当字典未发生改变时，该值不变，发生改变时则值也随着改变
} dictIterator;
```

[Redis源码学习——安全迭代器和非安全迭代器（一）_damanchen的博客-CSDN博客](https://blog.csdn.net/damanchen/article/details/89474695)

[Redis源码学习——安全迭代器和非安全迭代器（二）_damanchen的博客-CSDN博客](https://blog.csdn.net/damanchen/article/details/89479299)

## 3.2 间接遍历

使用`scan`命令可以间接遍历，这个命令每次会返回一个下一个需要遍历的索引值：

```shell
redis 127.0.0.1:6379> scan 0
1) "17"
2)  1) "key:12"
    2) "key:8"
    3) "key:4"
    4) "key:14"
    5) "key:16"
    6) "key:17"
    7) "key:15"
    8) "key:10"
    9) "key:3"
   10) "key:7"
   11) "key:1"
redis 127.0.0.1:6379> scan 17
1) "0"
2) 1) "key:5"
   2) "key:18"
   3) "key:0"
   4) "key:2"
   5) "key:19"
   6) "key:13"
   7) "key:6"
   8) "key:9"
   9) "key:11"
```

[Redis SCAN 命令](https://redis.com.cn/commands/scan.html)

优点：

- 一次只返回部分内容，响应较快，不会较长时间阻塞服务器

缺点：

- 可能会返回重复的值

[redis scan 命令底层原理（为什么会重复扫描？）_redis scan命令原理_柏油的博客-CSDN博客](https://blog.csdn.net/ldw201510803006/article/details/124052245)

这里第一次看可能会有这个疑问，我们打个比方：

遍历顺序：00 -> 10 -> 01 -> 11

若正好遍历到10时扩容完毕了，则新顺序为：

000 -> 100 -> 010 -> 110 -> 001 -> 101 -> 011 -> 111

此时我们在第三个位置，即010那里。

这时候可能就有疑问了：<font color=red>100那里不就遍历不到了吗？这不是丢数据了吗？</font>

但这样其实是想多了，我们来看000和100，假如哈希表长度为4时，这两个索引下的元素会落到哪个哈希表下？

很明显，这两个位置的元素都会落到00这个索引的下面，因为哈希表长度为4时，索引位置的取法就是和`0x11`做与操作，而000和100低两位相同，所以它们俩在之前就在00处，以链表的形式组合在了一起，当遍历到10时，100也肯定被遍历了。

---

总结一下就是`scan`命令会在哈希表缩容的时候造成数据重复，在rehash的期间也会造成重复。

在rehash期间调用`scan`，Redis会先扫小表，假如最终索引为v，然后会接着在大表中从v开始扫。

# 4. 五大基本数据类型

在看数据类型前，我们再回顾一下entry的结构：

```c++
typedef struct dictEntry {
    // 键
    void *key;
    // 值   
    union {
        void *val;
        uint64_t u64;
        int64_t s64;
    } v;
    // 指向下一个哈希表节点，形成链表
    struct dictEntry *next;
} dictEntry;
```

有没有发现一个问题：这个v代表值，那么这个值是个什么东西？？

这里其实是C语言的union，可以让多个变量使用同一个内存空间：[C/C++ union 使用教程 (常见操作与缺陷) - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/595288133)

你可以这样理解：这里的v即有三种类型，即`void*`、`uint64_t`(64位无符号整数)、`int64_t`(64位有符号整数)。

对应`void*`你可以理解为Java中的`Object`类型，用它做参数的话就可以传入任意对象，更详细的信息可以看这篇博客：[void*（指针）的类型转换-专讲_void*转换_NeverLate_gogogo的博客-CSDN博客](https://blog.csdn.net/NeverLate_gogogo/article/details/79308195)

---

一般情况下`void*`都是指向`redisObject `：[redis/README.md at cb1717865804fdb0561e728d2f3a0a1138099d9d · redis/redis (github.com)](https://github.com/redis/redis/blob/cb1717865804fdb0561e728d2f3a0a1138099d9d/README.md?plain=1#L323)

```c++
struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    unsigned lru:LRU_BITS; /* LRU time (relative to global lru_clock) or
                            * LFU data (least significant 8 bits frequency
                            * and most significant 16 bits access time). */
    int refcount;
    void *ptr;
};
```

- `type`：没啥好说的，每种数据结构的标识符

- `encoding`：编码

  - 以string来说，就有三种：`int` , `embstr` , `raw`：

    ```shell
    127.0.0.1:6379> SET counter 1
    OK
    127.0.0.1:6379> OBJECT ENCODING counter
    "int"
    127.0.0.1:6379> SET name "Tom"
    OK
    127.0.0.1:6379> OBJECT ENCODING name
    "embstr"
    127.0.0.1:6379> SETBIT bits 1 1
    (integer) 0
    127.0.0.1:6379> OBJECT ENCODING bits
    "raw"
    ```

- `lru`：给Redis做内存淘汰用

- `refcount`：引用计数，这个值为0的时候这个对象会被清除

- `ptr`：指向对象的实际表示，可能有多个指向同一个对象，一般还要配合encoding判断

## 4.1 String

Redis 的字符串是动态字符串，是可以修改的字符串，可以勉强理解为Java里的`StringBuilder`。

当字符串需要扩容时，有如下两种情况：

-  当字符串长度小于 1M 时，扩容都是加倍现有的空间
- 超过 1M，扩容时一次只会多扩 1M 的空间

字符串最大长度为512MB。
数据结构：[redis/sds.h at cb1717865804fdb0561e728d2f3a0a1138099d9d · redis/redis (github.com)](https://github.com/redis/redis/blob/cb1717865804fdb0561e728d2f3a0a1138099d9d/src/sds.h#L45)

```c++
#define SDS_TYPE_5  0
#define SDS_TYPE_8  1
#define SDS_TYPE_16 2
#define SDS_TYPE_32 3
#define SDS_TYPE_64 4
typedef char *sds;

struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len; /* used */
    uint8_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr16 {
    uint16_t len; /* used */
    uint16_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr32 {
    uint32_t len; /* used */
    uint32_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
struct __attribute__ ((__packed__)) sdshdr64 {
    uint64_t len; /* used */
    uint64_t alloc; /* excluding the header and null terminator */
    unsigned char flags; /* 3 lsb of type, 5 unused bits */
    char buf[];
};
```

我们可以发现，字符串结构体基本由`len`(已使用的长度)、`alloc`(最大长度/分配的长度)、`flags`(标志信息)、`buf`(字符串内容)组成。

字符串拼接：[redis/sds.c at cb1717865804fdb0561e728d2f3a0a1138099d9d · redis/redis · GitHub](https://github.com/redis/redis/blob/cb1717865804fdb0561e728d2f3a0a1138099d9d/src/sds.c#LL483)

```c++
sds sdscatlen(sds s, const void *t, size_t len) {
    size_t curlen = sdslen(s);
    s = sdsMakeRoomFor(s,len);
    // 内存不足
    if (s == NULL) return NULL;
    memcpy(s+curlen, t, len);
    sdssetlen(s, curlen+len);
    s[curlen+len] = '\0';
    return s;
}
```

[要懂redis，首先得看懂sds（全网最细节的sds讲解） - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/269496479)

## 4.2 Hash

Hash类型有两种实现方式：

- ziplist 编码的哈希对象使用压缩列表作为底层实现
- hashtable 编码的哈希对象使用字典作为底层实现

### 4.2.1 ziplist

`ziplist`的运作方式<font color=red>类似</font>于一个队列，当有一对键值时，先将值入队，再将键入队。

这种设计完全不符合哈希表的设计，所以只会在数据量较少时使用。

当发生如下情况时，`ziplist`会被转换为真正的哈希表(字典)：

- 当hash中的数据项的数目超过512的时候，也就是ziplist数据项超过1024的时候
- 当hash中插入的任意一个value的长度超过了64的时候

### 4.2.2 hashtable

