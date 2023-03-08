---
title: HashMap源码
date: 2023-03-07 23:22:15
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'Java', path: "/2023/03/05/java-source#Java"}
---

HashMap在jdk8前是由数组+链表实现的，也就是数据结构上非常经典的实现操作：

假如元素的的哈希值为`hash`，数组长度为`len`，那么该元素应该放在`hash % len`处

- 若该位置没有元素，则直接放进去
- 若该位置有元素，则直接将该元素放到链表后(如果该元素不是链表则要新建一个链表)

在jdk8中，若链表过长，则会将链表转换为红黑树(本篇不讲红黑树原理，因为我也不会2333，只需要知道是一个平衡树即可，搜索效率一般为`log(n)`。

接下来我将根据自己的理解，一步一步阅读HashMap源码(我使用的是jdk11，与java8应该不会有太大差距)。

# 1. 构造器

HashMap有四个构造器：

```java
public HashMap(int initialCapacity, float loadFactor) {
    if (initialCapacity < 0)
        throw new IllegalArgumentException("Illegal initial capacity: " +
                                           initialCapacity);
    if (initialCapacity > MAXIMUM_CAPACITY)
        initialCapacity = MAXIMUM_CAPACITY;
    if (loadFactor <= 0 || Float.isNaN(loadFactor))
        throw new IllegalArgumentException("Illegal load factor: " +
                                           loadFactor);
    this.loadFactor = loadFactor;
    this.threshold = tableSizeFor(initialCapacity);
}

public HashMap(int initialCapacity) {
    this(initialCapacity, DEFAULT_LOAD_FACTOR);
}

public HashMap() {
    this.loadFactor = DEFAULT_LOAD_FACTOR; // all other fields defaulted
}

public HashMap(Map<? extends K, ? extends V> m) {
    this.loadFactor = DEFAULT_LOAD_FACTOR;
    putMapEntries(m, false);
}
```

可以发现其中出现了两个属性：`loadFactor(负载因子)`和`threshold(扩容阈值)`

首先需要知道这样一个关系：`threshold = loadFactor * capacity`

其中`capacity`为整个Hash表数组长度，当`size(插入到HashMap中元素的个数) > threshold`时，就会对HashMap进行扩容。

可以发现，除了第四个构造器，其它3个其实都没有对Hash表数组进行初始化，只是设置了扩容阈值和负载因子而已。

## 1.1 tableSizeFor

第一个构造器中，在给threshold赋值前，还调用了tableSizeFor方法：

```java
// java11
static final int tableSizeFor(int cap) {
    int n = -1 >>> Integer.numberOfLeadingZeros(cap - 1);
    return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
}

// java8
static final int tableSizeFor(int cap) {
    int n = cap - 1;
    //移位运算
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
}
```

具体可以看这篇文章：[HashMap之tableSizeFor方法图解 - 希夷小道 - 博客园 (cnblogs.com)](https://www.cnblogs.com/xiyixiaodao/p/14483876.html)

这个方法的主要目的是返回一个最小的，并且大于等于`cap`的2次幂。

为什么要二次幂呢？这里需要了解一个小知识：

假设`k`为2的幂，那么对于任意一个数(非负)`m`，有：`m & (k - 1) = m % k`

其实也不难理解，比如`10101(21)`对`1000(8)`取余，结果为5，很明显，对于`1000`左边(包括)所有的位，它都能够整除，因为都是2的幂，而对于右边不难整除，所以就一定是余数了，减一个1变成`0111`，再取并，就可以得到右边的余数了。

在Java11中，主要通过`Integer.numberOfLeadingZeros`获取最高位1的左边有几个0，然后再对`-1`进行无符号位移得到结果：

```java
public static int numberOfLeadingZeros(int i) {
    // HD, Count leading 0's
    if (i <= 0)
        return i == 0 ? 32 : 0;
    int n = 31;
		// 这里类似二分搜索
    if (i >= 1 << 16) { n -= 16; i >>>= 16; }
    if (i >= 1 <<  8) { n -=  8; i >>>=  8; }
    if (i >= 1 <<  4) { n -=  4; i >>>=  4; }
    if (i >= 1 <<  2) { n -=  2; i >>>=  2; }
    return n - (i >>> 1);
}
```

## 2. put

`put`其实是调用了内部的`putVal`方法：

```java
public V put(K key, V value) {
    return putVal(hash(key), key, value, false, true);
}

/**
 * Implements Map.put and related methods.
 *
 * @param hash hash for key
 * @param key the key
 * @param value the value to put. 
 * @param onlyIfAbsent if true, don't change existing value(如果为ture，当插入相同的key时不会进行替换)
 * @param evict if false, the table is in creation mode(如果为false，表示哈希表为创建模式)
 * @return previous value, or null if none
 */
final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
               boolean evict) {
		Node<K,V>[] tab; Node<K,V> p; int n, i;
		// 在这里将哈希表赋值给tab
		if ((tab = table) == null || (n = tab.length) == 0)
			// 到这里表示hash表没有初始化，在这里进行扩容
		    n = (tab = resize()).length;
		if ((p = tab[i = (n - 1) & hash]) == null)
			// 当前位置没有节点，直接插入
		    tab[i] = newNode(hash, key, value, null);
		else {
			// 到这里说明当前位置有节点，p就是那个节点
			// 这里的e代表：若有相同的key，则用变量e暂时保存下来，再根据onlyIfAbsent参数考虑是否替换
		    Node<K,V> e; K k;
		    if (p.hash == hash &&
		        ((k = p.key) == key || (key != null && key.equals(k))))
				// 相同的key，考虑是否替换
		        e = p;
		    else if (p instanceof TreeNode)
				// p是一个树的根节点，把新节点插入到树里，该方法会返回之前的旧值，如果没有则返回null
		        e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
		    else {
				// p链表头部，遍历到尾部后进行插入
		        for (int binCount = 0; ; ++binCount) {
		            if ((e = p.next) == null) {
		                p.next = newNode(hash, key, value, null);
						// **如果链表节点数量超过TREEIFY_THRESHOLD，则将链表进行树化，默认值为8**
		                if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
		                    treeifyBin(tab, hash);
		                break;
		            }
		            if (e.hash == hash &&
		                ((k = e.key) == key || (key != null && key.equals(k))))
		                break;
					// 同理，出现相同的key，考虑进行替换
		            p = e;
		        }
		    }
			// 判断是否有旧值
		    if (e != null) { // existing mapping for key
		        V oldValue = e.value;
		        if (!onlyIfAbsent || oldValue == null)
					// 进行替换
		            e.value = value;
		        afterNodeAccess(e);
		        return oldValue;
		    }
		}
		++modCount;
		// 在这里判断总节点数是否超过阈值，若超过则进行扩容
		if (++size > threshold)
		    resize();
		afterNodeInsertion(evict);
		return null;
}
```

# 3. resize

```java
final Node<K,V>[] resize() {
	// 首先保存好旧哈希表
    Node<K,V>[] oldTab = table;
	// 旧的容量
    int oldCap = (oldTab == null) ? 0 : oldTab.length;
	// 旧的阈值
    int oldThr = threshold;
	// 新的容量和阈值
    int newCap, newThr = 0;
	// 如果旧容量大于0，说明已经初始化过了
    if (oldCap > 0) {
		// 如果超过容量最大值，则不再进行扩容，即将扩容阈值设置为Int最大值
        if (oldCap >= MAXIMUM_CAPACITY) {
            threshold = Integer.MAX_VALUE;
            return oldTab;
        }
		// 这里将容量乘2，至于后面那个判断意义不是很明确，因为后面也有关于newThr的判断
        else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY &&
                 oldCap >= DEFAULT_INITIAL_CAPACITY)
            newThr = oldThr << 1; // double threshold
    }
	// 因为之前判断过oldCap是否大于0，所以到这里oldCap一定等于0，因此后面的判断都是去初始化哈希表的
    else if (oldThr > 0) // initial capacity was placed in threshold
        newCap = oldThr;
    else {               // zero initial threshold signifies using defaults
		// 旧阈值为0，标示使用了空参构造器，并且还没有初始化
        newCap = DEFAULT_INITIAL_CAPACITY;
        newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
    }
    if (newThr == 0) {
		// 设置扩容阈值
        float ft = (float)newCap * loadFactor;
		// 防止超出上限
        newThr = (newCap < MAXIMUM_CAPACITY && ft < (float)MAXIMUM_CAPACITY ?
                  (int)ft : Integer.MAX_VALUE);
    }
    threshold = newThr;
    @SuppressWarnings({"rawtypes","unchecked"})
    Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
    table = newTab;
    if (oldTab != null) {
		// 在这里重新计算hash，并将节点放到新的哈希表中
        for (int j = 0; j < oldCap; ++j) {
            Node<K,V> e;
            if ((e = oldTab[j]) != null) {
                oldTab[j] = null;
				// 如果当前节点只有一个，则直接将其移动
                if (e.next == null)
                    newTab[e.hash & (newCap - 1)] = e;
				// 如果当前节点为树节点，则重新建树
                else if (e instanceof TreeNode)
                    ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
                else { // preserve order
					// 到这里说明当前节点是有多个节点的链表
					// 这里lo代表低位，hi代表高位
					// 因为扩容只是将capacity左移了一位，因此对于一个节点及其子节点，它们最多分散到两个位置
                    Node<K,V> loHead = null, loTail = null;
                    Node<K,V> hiHead = null, hiTail = null;
                    Node<K,V> next;
                    do {
                        next = e.next;
                        if ((e.hash & oldCap) == 0) {
							// 到这里说明这个节点在哈希表的位置没有变，这里为什么是用哈希值和旧容量相并判断的呢？
							// 因为在前面说过了，造成位置变化的唯一原因是capacity左移了一位，而我们取索引是通过hash & (capacity - 1)来获得的
							// 所以只要在旧hash的最高位1的位置，oldCap这一位也是1，说明扩容后索引一定发生了变化
							// 例如旧长度为10000(16)，最高位1在第五个，对于1011010(hex)，由于它的第五位也是1，说明新hash肯定会发生变化
							// 新长度为100000(32)，减一后为011111(31)，后4位我们不用管，只用管第五位，和hash取并后会产生新索引。
                            if (loTail == null)
                                loHead = e;
                            else
                                loTail.next = e;
                            loTail = e;
                        }
                        else {
                            if (hiTail == null)
                                hiHead = e;
                            else
                                hiTail.next = e;
                            hiTail = e;
                        }
                    } while ((e = next) != null);
					// 插入链表
                    if (loTail != null) {
                        loTail.next = null;
                        newTab[j] = loHead;
                    }
                    if (hiTail != null) {
                        hiTail.next = null;
                        newTab[j + oldCap] = hiHead;
                    }
                }
            }
        }
    }
    return newTab;
}
```

扩容大致流程如下：

​	- 首先判断数是否初始化(即判断oldCap是否大于0)，如果大于0并且没有超出扩容限制，则进行扩容

​	- 若oldCap为0，并且oldThr大于0，此时进行初始化，直接将哈希表容量设置为oldThr

​	- 若上面两条都不满足，即oldCap为0，oldThr小于等于0，此时哈希表将会以默认容量初始化(16)

之后则是重新hash了。



在树的重hash中，也有一个重要参数*`UNTREEIFY_THRESHOLD`，*如果新树的节点数量小于等于该值，则会调用`TreeNode#untreeify`来链表化，这个阈值默认为6。<font color="red">这么设置主要是为了避免频繁的树化和链表化造成性能问题</font>。

在java7中，链表的插入采用的是头插法，在多线程环境下会产生死链，在java8后，采用了尾插法，有效的解决了死链的问题。

下面是java7的实现：

```java
void transfer(Entry[] newTable) {
    Entry[] src = table;
    int newCapacity = newTable.length;
    for (int j = 0; j < src.length; j++) {
        Entry<K,V> e = src[j];
        if (e != null) {
            src[j] = null;
            do {
                Entry<K,V> next = e.next;
                int i = indexFor(e.hash, newCapacity);
                e.next = newTable[i];
                newTable[i] = e;
                e = next;
            } while (e != null);
        }
    }
}
```

