---
title: ConcurrentHashMap源码
date: 2023-03-07 23:22:15
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'Java', path: "/2023/03/05/java-source#Java"}
---

> 本篇基于Java11

由于`ConcurrentHashMap`比`HashMap`复杂了不止一点，个人建议自己跟着源码追，有看不懂的方法再来看我的博客。

省流版：

- loadFactor(负载因子)被固定为了0.75，且通过构造器设置只会影响初始容量
- `ConcurrentHashMap`支持并发扩容
- `HashMap`的`threshold`被替换为了`sizeCtl`，高16位代表当前哈希表容量的一个"版本号"，`低16位 - 1`表示当前正在进行扩容的线程数

# 1. 构造器

```java
public ConcurrentHashMap() {
}

public ConcurrentHashMap(int initialCapacity) {
    this(initialCapacity, LOAD_FACTOR, 1);
}

public ConcurrentHashMap(Map<? extends K, ? extends V> m) {
    this.sizeCtl = DEFAULT_CAPACITY;
    putAll(m);
}

public ConcurrentHashMap(int initialCapacity, float loadFactor) {
    this(initialCapacity, loadFactor, 1);
}

public ConcurrentHashMap(int initialCapacity,
                         float loadFactor, int concurrencyLevel) {
    if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
        throw new IllegalArgumentException();
    if (initialCapacity < concurrencyLevel)   // Use at least as many bins
        initialCapacity = concurrencyLevel;   // as estimated threads
    long size = (long)(1.0 + (long)initialCapacity / loadFactor);
    int cap = (size >= (long)MAXIMUM_CAPACITY) ?
        MAXIMUM_CAPACITY : tableSizeFor((int)size);
    this.sizeCtl = cap;
}
```

和我们的老朋友`HashMap`有如下不同：

- `HashMap`的`threshold`扩容阈值没有了
- 这里新出来了一个`sizeCtl`，根据其大小有不同的含义：
  - 当该值为0时，表示正在等待哪个线程去初始化
  - 当该值为负数时，表示正在初始化或者调整大小
    - -1表示正在初始化
    - 若为其他负数，<font color=red>**则`低16位 - 1`表示当前正在扩容的线程数**</font>，是的，你没看错，`ConcurrentHashMap`是支持并发扩容的！
  - 当大于0时，<font color=red>这个值就和`HashMap`的`threshold`一样的意思了，都是代表扩容阈值</font>。

- 构造器多了一个`concurrencyLevel`，表示预估会有多少个写线程，实际上也没什么用，就是一个局部变量。

# 2. put

在看`put`之前还需要了解其它一些方法。

## 2.1 initTable

```java
/**
 * Initializes table, using the size recorded in sizeCtl.
 */
private final Node<K,V>[] initTable() {
    Node<K,V>[] tab; int sc;
    while ((tab = table) == null || tab.length == 0) {
        // 前面说过了，sizeCtl小于0表示正在初始化，这里说明有别的线程正在初始化
        if ((sc = sizeCtl) < 0)
            // 让当前线程主动放弃CPU
            Thread.yield(); // lost initialization race; just spin
        // 在这里进行CAS修改sizeCtl为-1
        else if (U.compareAndSetInt(this, SIZECTL, sc, -1)) {
            try {
                if ((tab = table) == null || tab.length == 0) {
                    // n表示新哈希表容量，默认容量还是16
                    int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
                    @SuppressWarnings("unchecked")
                    Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                    table = tab = nt;
                    // 这里可以理解为 sc = n * 0.75. 向右位移2位等于除以4
                    sc = n - (n >>> 2);
                }
            } finally {
                sizeCtl = sc;
            }
            break;
        }
    }
    return tab;
}
```

## 2.2 tabAt

```java
static final <K,V> Node<K,V> tabAt(Node<K,V>[] tab, int i) {
    return (Node<K,V>)U.getObjectAcquire(tab, ((long)i << ASHIFT) + ABASE);
}

public final Object getObjectAcquire(Object o, long offset) {
    return getObjectVolatile(o, offset);
}
```

看名字就很容易能看懂是干嘛的了，因为我们不能给数组的某个元素加`volatile`，所以只能用这种方式保证可见性。

这里的ASHIFT和ABASE可以在源码的最后的静态代码块处看到，这里我将其提了出来：

```java
static final Unsafe U = createUnsafe();

public static Unsafe createUnsafe() {
    try {
        Class<?> unsafeClass = Class.forName("sun.misc.Unsafe");
        Field field = unsafeClass.getDeclaredField("theUnsafe");
        field.setAccessible(true);
        return (Unsafe) field.get(null);
    } catch (Exception e) {
        e.printStackTrace();
    }
    return null;
}

static class Node {}

public static void main(String[] args) {
    int[] arr = new int[10];
    int scale = U.arrayIndexScale(Node[].class);
    int ABASE = U.arrayBaseOffset(Node[].class);
    int ASHIFT = 31 - Integer.numberOfLeadingZeros(scale);
    System.out.println("ABASE = " + ABASE + ", ASHIFT = " + ASHIFT + ", scale = " + scale);

    scale = U.arrayIndexScale(long[].class);
    ABASE = U.arrayBaseOffset(long[].class);
    ASHIFT = 31 - Integer.numberOfLeadingZeros(scale);
    System.out.println("ABASE = " + ABASE + ", ASHIFT = " + ASHIFT + ", scale = " + scale);
}
```

输出：

```text
ABASE = 16, ASHIFT = 2, scale = 4
ABASE = 16, ASHIFT = 3, scale = 8
```

这里的scale很明显，代表数组每个元素的占用大小。

ABASE则是元素在数组里的偏移值，一般大小为：**对象头(8字节) + 类型指针(默认4字节，关闭指针压缩后为8字节) + 数组长度(4字节)  = 16**，如果你不清楚我在说什么，可以去看一下我的这篇博客：[对象在内存中的存储布局 (notion.so)](https://www.notion.so/f3486133d4f64c738ae857df740bee95)。

ASHIFT则是表示当前元素占用大小二进制的1右边有多少个0，在`ConcurrentHashMap`初始化时，如果scale不是2的幂则会报错。

那么在取值的时候是什么意思呢？

其实这里很像C的指针了，ABASE代表基础偏移值，而`i << ASHIFT`则每个元素的位置：

- 比如`i`为0，`i << ASHIFT = 0`，代表这个元素在`对象在堆中的地址 + ABASE`

- 比如`i`为1，`i << ASHIFT = 4`，代表这个元素在`对象在堆中的地址 + ABASE + 4`

## 2.2 putVal

`put`内部其实就是调用了`putVal`：

```java
final V putVal(K key, V value, boolean onlyIfAbsent) {
    if (key == null || value == null) throw new NullPointerException();
    // 在这里将key的哈希高16位和低16位进行异或后得到新的哈希
    int hash = spread(key.hashCode());
    int binCount = 0;
    // 看到这层死循环就应该感觉到会有CAS出现
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh; K fk; V fv;
        if (tab == null || (n = tab.length) == 0)
            // 初始化表
            tab = initTable();
        // 这里取哈希索引和HashMap一样
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            // 这个位置没有元素，则尝试CAS放进去
            if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value)))
                break;                   // no lock when adding to empty bin
        }
        // 这里后面再讲
        else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);
        // 在这里判断是否需要替换掉原节点
        else if (onlyIfAbsent // check first node without acquiring lock
                 && fh == hash
                 && ((fk = f.key) == key || (fk != null && key.equals(fk)))
                 && (fv = f.val) != null)
            return fv;
        else {
            V oldVal = null;
            // 锁住当前节点
            synchronized (f) {
                // 确保这个没有被修改
                if (tabAt(tab, i) == f) {
                    // 判断fh是否大于0？？ 正常人看到这里一定会非常懵逼，因为通过spread计算的hash不可能为负数
                    // 先别急，既然有负数，肯定后面还干了什么东西的，咱们接着往下看。
                    if (fh >= 0) {
                        // 这个值代表链表的大小
                        binCount = 1;
                        for (Node<K,V> e = f;; ++binCount) {
                            K ek;
                            // 这里同样也是在尝试进行替换：判断hash和key是否相等
                            if (e.hash == hash &&
                                ((ek = e.key) == key ||
                                 (ek != null && key.equals(ek)))) {
                                oldVal = e.val;
                                if (!onlyIfAbsent)
                                    e.val = value;
                                break;
                            }
                            // 这里检查是否遍历到链表尾部，如果到尾部了则直接插入
                            Node<K,V> pred = e;
                            if ((e = e.next) == null) {
                                pred.next = new Node<K,V>(hash, key, value);
                                break;
                            }
                        }
                    }
                    // 如果是红黑树
                    else if (f instanceof TreeBin) {
                        Node<K,V> p;
                        binCount = 2;
                        // 在红黑树里进行查找
                        if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                              value)) != null) {
                            oldVal = p.val;
                            if (!onlyIfAbsent)
                                p.val = value;
                        }
                    }
                    // 这个后面讲
                    else if (f instanceof ReservationNode)
                        throw new IllegalStateException("Recursive update");
                }
            }
            // 这里判断是否需要将链表树化
            if (binCount != 0) {
                if (binCount >= TREEIFY_THRESHOLD)
                    treeifyBin(tab, i);
                if (oldVal != null)
                    return oldVal;
                break;
            }
        }
    }
    // 进行统计，同时在这里判断是否需要扩容
    addCount(1L, binCount);
    return null;
}
```

## 2.3 addCount

这个方法比较复杂，先讲一些其它的小方法。

### 2.3.1 resizeStamp

```java
static final int resizeStamp(int n) {
    return Integer.numberOfLeadingZeros(n) | (1 << (RESIZE_STAMP_BITS - 1));
}
```

这个方法主要是获取n最高位前面有几个0，然后和后面的值相与。RESIZE_STAMP_BITS为常量：16

那么右边整体就是个常量：(1 << 15) 即1的右边15个0。

那么这个方法有什么用呢？其实这里是用作来生成一个扩容标记的，相当于一个版本号。

至于这么玩有什么用，正常看源码到这里是不知道的，我们先接着往后看。

### 2.3.2 transfer

> Moves and/or copies the nodes in each bin to new table. See above for explanation.

这个方法大致就是将节点从旧哈希表复制或者移动到新的哈希表中，方法很长。

源码里又出现了两个新的类变量：

- `nextTable`：表示新的哈希表，仅在扩容时非空。
- `transferIndex`：The next table index (plus one) to split while resizing. 这里不是很好理解，就不翻译了，看源码就能懂。

同时这里用到了一个新的节点：`ForwardingNode`，这个节点继承了基础的`Node`节点，<font color=red>但是其hash值永远为MOVED，即为`-1`</font>。同时，内部还保存了新的哈希表`nextTable`。根据文档翻译，这个节点是用作一个头结点，作为新哈希表的表头（A node inserted at head of bins during transfer operations.）。



`transfer`是并发扩容的实现，对于每个线程，<font color=red>每次会分配一块固定长度大小的区域</font>来让线程对tab进行重新hash，这个区域的大小与CPU核心数成反比，但最小为16。

```java
private final void transfer(Node<K,V>[] tab, Node<K,V>[] nextTab) {
    int n = tab.length, stride;
    // 将n/8/CPU核心数当做区域大小，最小值为16
    if ((stride = (NCPU > 1) ? (n >>> 3) / NCPU : n) < MIN_TRANSFER_STRIDE)
        stride = MIN_TRANSFER_STRIDE; // subdivide range
    // nextTab为空，表示当前线程是第一个进行扩容的线程
    if (nextTab == null) {            // initiating
        try {
            @SuppressWarnings("unchecked")
            Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n << 1];
            nextTab = nt;
        } catch (Throwable ex) {      // try to cope with OOME
            // OOM的fallback
            sizeCtl = Integer.MAX_VALUE;
            return;
        }
        nextTable = nextTab;
        transferIndex = n;
    }
    int nextn = nextTab.length;
    // 用于占位。当别的线程发现这个槽位中是 fwd 类型的节点，则跳过这个节点。
    ForwardingNode<K,V> fwd = new ForwardingNode<K,V>(nextTab);
    boolean advance = true;
    boolean finishing = false; // to ensure sweep before committing nextTab
    for (int i = 0, bound = 0;;) {
        Node<K,V> f; int fh;
        while (advance) {
            // 1. 因为advance一开始肯定为true，所以进入这个循环
            int nextIndex, nextBound;
            // --i相当于从大到小去分配区域
            if (--i >= bound || finishing)
                advance = false;
            // 获取当前已经分配到的索引
            else if ((nextIndex = transferIndex) <= 0) {
                // 小于0表示已经扩容完了
                i = -1;
                advance = false;
            }
            // 尝试接下这块区域
            else if (U.compareAndSetInt
                     (this, TRANSFERINDEX, nextIndex,
                      nextBound = (nextIndex > stride ?
                                   nextIndex - stride : 0))) {
                // 到这里，说明当前线程已经接下了[nextBound, i]这块区域重新分配的任务
                bound = nextBound;
                i = nextIndex - 1;
                advance = false;
            }
        }
        // i小于0，说明线程没拿到任务，后面俩条件意义不明。。
        if (i < 0 || i >= n || i + n >= nextn) {
            int sc;
            // 判断扩容已经完成
            if (finishing) {
                nextTable = null;
                table = nextTab;
                // 这里重新分配扩容阈值，负载因子为0.75
                sizeCtl = (n << 1) - (n >>> 1);
                return;
            }
            // 将sizeCtl - 1，在开头我们已经说了，sizeCtl低16位保存当前正在进行扩容的线程数量
            if (U.compareAndSetInt(this, SIZECTL, sc = sizeCtl, sc - 1)) {
                // 这里判断是否只有一个线程在扩容
                if ((sc - 2) != resizeStamp(n) << RESIZE_STAMP_SHIFT)
                    // 只有一个线程扩容，且没有接到任务，说明扩容完成了
                    return;
                // 还有别的线程在扩容，给个标记后再重新检查一遍。。
                finishing = advance = true;
                i = n; // recheck before commit
            }
        }
        // 如果任务区间最后一个为空
        else if ((f = tabAt(tab, i)) == null)
            // 尝试CAS将其赋值为占位节点
            advance = casTabAt(tab, i, null, fwd);
        // 如果为true，表示有其它人跟自己一样分配到了一样的任务，需要重新分配任务.
        // 注意这里有--i，不用担心和上一次一样取到一样的hash
        else if ((fh = f.hash) == MOVED)
            advance = true; // already processed
        else {
            // 锁住尾节点
            synchronized (f) {
                // 再检查一遍
                if (tabAt(tab, i) == f) {
                    Node<K,V> ln, hn;
                    if (fh >= 0) {
                        // 链表转移. 这里貌似用的是尾插法.
                        int runBit = fh & n;
                        Node<K,V> lastRun = f;
                        for (Node<K,V> p = f.next; p != null; p = p.next) {
                            int b = p.hash & n;
                            if (b != runBit) {
                                runBit = b;
                                lastRun = p;
                            }
                        }
                        if (runBit == 0) {
                            ln = lastRun;
                            hn = null;
                        }
                        else {
                            hn = lastRun;
                            ln = null;
                        }
                        for (Node<K,V> p = f; p != lastRun; p = p.next) {
                            int ph = p.hash; K pk = p.key; V pv = p.val;
                            if ((ph & n) == 0)
                                ln = new Node<K,V>(ph, pk, pv, ln);
                            else
                                hn = new Node<K,V>(ph, pk, pv, hn);
                        }
                        setTabAt(nextTab, i, ln);
                        setTabAt(nextTab, i + n, hn);
                        setTabAt(tab, i, fwd);
                        advance = true;
                    }
                    else if (f instanceof TreeBin) {
                        // 树节点转移
                        TreeBin<K,V> t = (TreeBin<K,V>)f;
                        TreeNode<K,V> lo = null, loTail = null;
                        TreeNode<K,V> hi = null, hiTail = null;
                        int lc = 0, hc = 0;
                        for (Node<K,V> e = t.first; e != null; e = e.next) {
                            int h = e.hash;
                            TreeNode<K,V> p = new TreeNode<K,V>
                                (h, e.key, e.val, null, null);
                            if ((h & n) == 0) {
                                if ((p.prev = loTail) == null)
                                    lo = p;
                                else
                                    loTail.next = p;
                                loTail = p;
                                ++lc;
                            }
                            else {
                                if ((p.prev = hiTail) == null)
                                    hi = p;
                                else
                                    hiTail.next = p;
                                hiTail = p;
                                ++hc;
                            }
                        }
                        ln = (lc <= UNTREEIFY_THRESHOLD) ? untreeify(lo) :
                        (hc != 0) ? new TreeBin<K,V>(lo) : t;
                        hn = (hc <= UNTREEIFY_THRESHOLD) ? untreeify(hi) :
                        (lc != 0) ? new TreeBin<K,V>(hi) : t;
                        setTabAt(nextTab, i, ln);
                        setTabAt(nextTab, i + n, hn);
                        setTabAt(tab, i, fwd);
                        advance = true;
                    }
                }
            }
        }
    }
}
```

### 2.3.3 总结

了解过上面两个方法后，再来看addCount就清晰多了

```java
private final void addCount(long x, int check) {
    CounterCell[] cs; long b, s;
    if ((cs = counterCells) != null ||
        // 这里去cas设置总节点数量
        !U.compareAndSetLong(this, BASECOUNT, b = baseCount, s = b + x)) {
        // 这里就使用了类似LongAdder和Striped64的设计，将自增分散到多个格子里
        CounterCell c; long v; int m;
        boolean uncontended = true;
        if (cs == null || (m = cs.length - 1) < 0 ||
            (c = cs[ThreadLocalRandom.getProbe() & m]) == null ||
            !(uncontended =
              U.compareAndSetLong(c, CELLVALUE, v = c.value, v + x))) {
            fullAddCount(x, uncontended);
            return;
        }
        if (check <= 1)
            return;
        // 在这里重新获取总节点数量
        s = sumCount();
    }
    // 这s和b已经赋过值了
    // 这里主要判断是否需要当前线程去扩容或协助扩容
    if (check >= 0) {
        Node<K,V>[] tab, nt; int n, sc;
        // 又是循环，CAS的小曲
        // 这里主要判断容量是否大于等于sizeCtl，然后进行扩容
        while (s >= (long)(sc = sizeCtl) && (tab = table) != null &&
               (n = tab.length) < MAXIMUM_CAPACITY) {
            // 后面讲
            int rs = resizeStamp(n);
            // 判断是否有其它线程正在修改
            if (sc < 0) {
                // 如果有，判断当前容量是否已经发生改变
                // sc == rs + 1是用来判断当前是否没有线程在进行扩容
                // 后面的都是用来判断扩容是否已经完成了，不需要当前线程进行协助扩容
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                    transferIndex <= 0)
                    break;
                // 协助进行扩容，将sizeCtl + 1，表示多了一个线程在进行扩容
                if (U.compareAndSetInt(this, SIZECTL, sc, sc + 1))
                    transfer(tab, nt);
            }
            // 这里CAS修改sizeCtl为(rs << RESIZE_STAMP_SHIFT) + 2)，表示当前线程是第一个发起扩容的
            else if (U.compareAndSetInt(this, SIZECTL, sc,
                                        (rs << RESIZE_STAMP_SHIFT) + 2))
                transfer(tab, null);
            s = sumCount();
        }
    }
}
```

## 2.4 sumCount

这里就是类似于LongAdder一样，获取元素总数量，size方法也是调用的这个：

```java
final long sumCount() {
    CounterCell[] cs = counterCells;
    long sum = baseCount;
    if (cs != null) {
        for (CounterCell c : cs)
            if (c != null)
                sum += c.value;
    }
    return sum;
}

public int size() {
    long n = sumCount();
    return ((n < 0L) ? 0 :
            (n > (long)Integer.MAX_VALUE) ? Integer.MAX_VALUE :
            (int)n);
}
```

