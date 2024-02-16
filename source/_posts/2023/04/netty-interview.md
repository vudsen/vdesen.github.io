---
title: Netty面试题
date: 2023-04-10 15:57:36
tags:
---

# 1. 为什么要用Netty

Netty是一个基于Java NIO封装的高性能网络通信框架。它主要有以下优势：

1. Netty提供了比NIO更简单的API
   - 很容易地实现Reactor模型
2. Netty在NIO的基础上做出了很多优化
   - 内存池
   - 零拷贝
3. Netty内置了多种通信协议

用官方的总结就是：**Netty 成功地找到了一种在不妥协可维护性和性能的情况下实现易于开发，性能，稳定性和灵活性的方法。**

# 2. Netty零拷贝

Netty零拷贝主要在五个方面：

1. Netty默认情况下使用直接内存，避免了从JVM堆内存拷贝到直接内存这一次拷贝，而是直接从直接使用直接内存进行Socket读写
2. Netty的文件传输调用了`FileRegion`包装的`transferTo`方法，可以直接将文件从缓冲区发送到目标Channel
3. Netty提供了`CompositeByteBuf`类，可以将多个ByteBuf合并为一个逻辑上的ByteBuf，避免了多个ByteBuf的拷贝。
4. 通过`ByteBuf.wrap`方法，可以将byte[]数组、ByteBuffer包装成一个ByteBuf，从而避免了拷贝
5. `ByteBuf`支持slice操作，可以将ByteBuf分解为多个共享同一存储区域的ByteBuf，避免了内存的拷贝

# 3. Netty内存管理

为了减少频繁向操作系统申请内存的情况，Netty会一次性申请一块较大的内存(由ChunkSize决定，默认为16M)，这块内存被称为`PoolChunk`。

而在一个`Chunk`下，又分为了一个一个页，叫做`Page`，默认为8K，即默认情况下一个Chunk有2048个页。

[超详细图文详解神秘的 Netty 高性能内存管理 - 知乎 (zhihu.com)](https://zhuanlan.zhihu.com/p/422289486)

## 3.1 PoolChunk如何管理Page

PoolChunk通过一个完全二叉树来管理Page，这颗二叉树的深度为12(2^11 = 2048)。

PoolChunk会维护一个`memeoryMap`数组，这个数组对应着每个节点，它的值代表这个节点之下的第几层还存在未分配的节点。

- 比如说第9层的`memeoryMap`值为9，代表这个节点下面的子节点都未被分配
- 若第9层的`memeoryMap`为10，代表它本身不可被分配，但第10层有子节点可以被分配
- 若第9层的`memeoryMap`为12(树的高度)，代表当前节点下的所有子节点都不可分配

那么我们怎么分配呢？

比如我们要15KB的空间，这里会先向上取8的整数，也就是16K，也就是2^1 * 8，拿到指数1，通过depth - 1 = 12 - 1得到11，那么我们只需要去找`memeoryMap`为11的节点即可。在分配后，父节点的`memeoryMap`等于两个子节点的最小值。

## 3.2 Page的管理

一个Page有8K，一般我们的应用程序是用不了这么多的，因此每个Page下会再次分隔。但这次分隔并不是以完全二叉树的形式，因为太占空间了，而是将这8K划分为等长的n份，一般会由`PoolSubpage`管理，一般分为两类：

- tiny：用于分配小于512字节的内存，一般大小为16B，32B，...，496B，每次增长为16的倍数，共32个。
- small：用于分配大于等于512字节的内存，一般大小为512B、1K、2K，4K。

对于每个块，会有一个bitMap去判断是否使用，可以理解为Java中的`BitSet`

## 3.3 Chunk的管理

每个PoolChunk通过`PoolArena`类来管理，这些Chunk被封装在`PoolChunkList`类中，这是一个双向链表。

`PoolArena`有6个`PoolChunkList`：

- qInit：存储内存利用率 0-25% 的 chunk
- q000：存储内存利用率 1-50% 的 chunk
- q025：存储内存利用率 25-75% 的 chunk
- q050：存储内存利用率 50-100% 的 chunk
- q075：存储内存利用率 75-100%的 chunk
- q100：存储内存利用率 100%的 chunk

`PoolArena`分配内存的顺序是：q050、q025、q000、qInit、q075

这样分配的好处是可以提高内存的利用率，以及减少链表的遍历次数。

## 3.4 PoolThreadCache

PoolThreadCache利用了ThreadLocal，每次线程在申请内存时都会优先从这里面获取。

- 在释放已分配的内存块时，不放回到 Chunk 中，而是缓存到 ThreadCache 中
- 在分配内存块时，优先从 ThreadCache 获取。若无法获取到，再从 Chunk 中分配
- 通过这样的方式，既能提高分配效率，又尽可能的避免多线程的同步和竞争

# 4. 直接内存回收原理

每个ByteBuf都实现了一个`ReferenceCounted`接口，netty也是直接采用了引用计数法来进行内存回收。

# 5. 怎么判断ByteBuffer是否处于写模式或读模式

`ByteBuffer`有三个重要参数：`position`、`limit`、`capacity`，而平常我们说的读模式或写模式只是用来方便我们理解的东西，真正在ByteBuffer的实现里并不存在什么读模式和写模式，也就是说你在"读模式下"仍然可以写。

例如下面的代码：

```java
ByteBuffer byteBuffer = ByteBuffer.allocate(1024);

byte[] hello = "hello".getBytes(StandardCharsets.UTF_8);
System.out.println(Arrays.toString(hello));
// "write mode"
byteBuffer.put(hello);
// "read mode"
byteBuffer.flip();
// write again
byteBuffer.put("h".getBytes(StandardCharsets.UTF_8));

while (byteBuffer.hasRemaining()) {
    System.out.print(byteBuffer.get() + " ");
}
```

<font color=red>在"读模式"下去写的时候，并不会报错</font>，由于切换到了"读模式"，此时`position = 0，limit = 写模式的offset`，因此在写的时候，会从索引0处开始写，写完后，`position`变为1，我们再读的话也就只能从索引1读到4了。

如果硬要判断是不是"读模式"或"写模式"，可以根据`position`和`limit`的值进行判断：

- 如`limit = capacity`，表示当前**可能**为写模式

