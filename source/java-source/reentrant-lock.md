---
title: ReentrantLock源码
date: 2023-03-08 12:37:15
categories:
  data:
    - { name: "Java源码", path: "/2023/03/05/java-source/" }
tags:	
  data:
    - { name: 'Java', path: "/2023/03/05/java-source#Java"}
---

关于`ReentrantLock`这里打算分两部分讲，第一部分则是`lock`和`unlock`的实现，第二部分则是`Condition`的实现。

在这之前有个问题：请说说你对AQS的理解？

面试的时候被问到这种问题就很蛋疼，因为你可能知道它的原理，但是不知道怎么概括出来。

所以个人建议在看源码前一定要看一下每个类上的注释，比如说这里的AQS(这里只截取了部分)：

> Provides a framework for implementing blocking locks and related synchronizers (semaphores, events, etc) that rely on first-in-first-out (FIFO) wait queues. 
>
> 提供了一个框架，去帮助开发者实现一个依赖于先进先出(FIFO)等待队列的同步锁或相关同步器(事件、信号量等)

如果谈理解的话，用这一句开头就会很舒服、

# 1. 基本内容

![类继承图](https://xds.asia/public/java-source/2023-2-3-12046ac9-cd7f-4b31-9c43-6f398f6a86a3.webp)

对于`ReentrantLock`，你需要知道它里面有一个<font color="red">等待队列，也就是AQS</font>(`AbstractQueuedSynchronizer`)，<font color="red">这个队列只有“头部的节点”才有资格抢到锁！但这并不代表其它节点对应的线程不会被唤醒，这些线程只是没有抢锁的资格，在获取资格前抢锁永远失败。在这里需要注意：**没有资格抢锁 != 没有机会被唤醒**。</font>

上面对<font color="skyblue">头部的节点</font>打了引号，是因为在AQS中，头部的节点对应的线程并不是资格抢锁的线程线程，而是头结点的下一个节点对应的线程才具有抢锁的资格。至于为什么，相信把源码看完你也就能理解了。

另外线程在入队之前也会尝试抢锁，如果抢到了就不会入队了，这就是公平锁和非公平锁的相关实现了，即只有非公平锁才能这么干，公平锁永远只能先入队，再抢锁。



## 1.1 构造器

```java
/**
 * Creates an instance of {@code ReentrantLock}.
 * This is equivalent to using {@code ReentrantLock(false)}.
 */
public ReentrantLock() {
    sync = new NonfairSync();
}

/**
 * Creates an instance of {@code ReentrantLock} with the
 * given fairness policy.
 *
 * @param fair {@code true} if this lock should use a fair ordering policy
 */
public ReentrantLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
}
```

可以通过构造器来设置锁是否为公平锁，默认为非公平锁

公平锁和非公平锁的唯一区别就是公平锁多了一个判断条件：`hasQueuedPredecessors`。该方法主要用于判断公平锁加锁时等待队列中是否存在有效节点。

```java
// 公平锁
@ReservedStackAccess
protected final boolean tryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) {
        // 公平只比非公平锁多了下面一个条件，其余和非公平锁一样。
        if (!hasQueuedPredecessors() &&
            compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(current);
            return true;
        }
    }
    else if (current == getExclusiveOwnerThread()) {
        int nextc = c + acquires;
        if (nextc < 0)
            throw new Error("Maximum lock count exceeded");
        setState(nextc);
        return true;
    }
    return false;
}
```

这里以非公平锁为例演示(两种就上面的区别，不用在意会差很多)

## 1.2 lock

`lock`方法主要调用了AQS中的`acquire`方法

```java
// 该方法是RentrantLock里的
public void lock() {
    sync.acquire(1);
}

// 该方法是AQS类里的
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();
}
```

### 1.2.1 tryAcquire

调用子类的`tryAcquire`方法，该方法先尝试抢占锁(尝试将status从0设置为1)，若失败则继续判断

```java
static final class NonfairSync extends Sync {
    private static final long serialVersionUID = 7316153563782823691L;
    protected final boolean tryAcquire(int acquires) {
        return nonfairTryAcquire(acquires);
    }
}

final boolean nonfairTryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
	// 判断当前锁状态是否为0(即没有线程占用)
    if (c == 0) {
		// 尝试CAS获取锁
        if (compareAndSetState(0, acquires)) {
			// 设置当前线程独占
            setExclusiveOwnerThread(current);
            return true;
        }
    }
	// 判断当前线程是否早已持有锁
    else if (current == getExclusiveOwnerThread()) {
		// 该值用来配合锁的重入，同一个线程每lock一次，该值加一
        int nextc = c + acquires;
        if (nextc < 0) // overflow
            throw new Error("Maximum lock count exceeded");
        setState(nextc);
        return true;
    }
    return false;
}
```

### 1.2.2 acquireQueued

如果`tryAcquire`没有拿到锁，则会进入这一步，在此之前会调用`addWaiter`，将当前线程添加到等待队列的末尾。

```java
private Node addWaiter(Node mode) {
    Node node = new Node(mode);

    for (;;) {
		// 尝试在队列尾部追加元素
        Node oldTail = tail;
        if (oldTail != null) {
            node.setPrevRelaxed(oldTail);
            if (compareAndSetTail(oldTail, node)) {
                oldTail.next = node;
                return node;
            }
        } else {
            // 队列为空，在头部初始化一个节点
            initializeSyncQueue();
        }
    }
}

private final void initializeSyncQueue() {
    Node h;
	// 在这里把头部插入一个**虚拟**节点！
    if (HEAD.compareAndSet(this, null, (h = new Node())))
        tail = h;
}
```

然后调用`acquireQueued`

```java
final boolean acquireQueued(final Node node, int arg) {
    boolean interrupted = false;
    try {
        for (;;) {
			// 获取当前节点的前置节点
            final Node p = node.predecessor();
			// 如果前置节点为头节点，然后再尝试获取锁
            if (p == head && tryAcquire(arg)) {
				// **修改头部为当前节点**
                setHead(node);
                p.next = null; // help GC
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node))
                // 在这里将线程挂起(lock方法会忽略中断方法！如果需要响应中断，请调用lockInterruptly)
                interrupted |= parkAndCheckInterrupt();
        }
    } catch (Throwable t) {
		// 若在加锁过程中发生错误，则需要调用该方法将当前节点删除
        cancelAcquire(node);
        if (interrupted)
            selfInterrupt();
        throw t;
    }
}

// 在获取锁失败后是否应该挂起线程
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
	// 获取前一个节点的等待状态
    int ws = pred.waitStatus;
    if (ws == Node.SIGNAL)
        /*
         * This node has already set status asking a release
         * to signal it, so it can safely park.
         */
        return true;
    if (ws > 0) {
        /*
         * Predecessor was cancelled. Skip over predecessors and
         * indicate retry.
         */
        do {
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        /*
         * waitStatus must be 0 or PROPAGATE.  Indicate that we
         * need a signal, but don't park yet.  Caller will need to
         * retry to make sure it cannot acquire before parking.
         */
        pred.compareAndSetWaitStatus(ws, Node.SIGNAL);
    }
    return false;
}
```

首先我们来介绍一下节点的`waitStatus`：

```java
 static final class Node {
     // ...

     /** 表示当前节点已经被取消了，即放弃抢锁 */
     static final int CANCELLED =  1;
     /** 表示当前节点的下一个节点的线程需要被唤醒 */
     static final int SIGNAL    = -1;
     /** 表示当前节点已经被挂起，正在等待唤醒信号 */
     static final int CONDITION = -2;
     /**
       * 指示下一次被获取的waitStatus值应无条件传播(机翻)
       * waitStatus value to indicate the next acquireShared should
       * unconditionally propagate.
       */
     static final int PROPAGATE = -3;

     // ...
 }
```

当`waitStatus`为0时，表示当前节点正处于刚创建状态或初始化状态。

那么关于`shouldParkAfterFailedAcquire`，节点第一次进来时，`waitStatus`一定是0，之后会在最后一个else被替换为`Node.SIGNAL`，之后如果还是抢锁失败，再调用该方法时会返回true，当前线程会被挂起。

如果前一个节点的waitStatus大于0，说明当之前节点对应的线程被取消了，在这里需要将前面的节点删除掉。

## 1.3 unlock

```java
public void unlock() {
    sync.release(1);
}

// AQS的方法
public final boolean release(int arg) {
    if (tryRelease(arg)) {
		// 这里获取了锁的Node一定是头节点！
		// 锁释放成功了
        Node h = head;
		// 判断头结点非空，并且不是初始状态
        if (h != null && h.waitStatus != 0)
			// 唤醒对应线程
            unparkSuccessor(h);
        return true;
    }
    return false;
}

// Sync类的方法
protected final boolean tryRelease(int releases) {
    int c = getState() - releases;
	// 如果锁不是当前线程持有，则抛出异常
    if (Thread.currentThread() != getExclusiveOwnerThread())
        throw new IllegalMonitorStateException();
    boolean free = false;
	// 如果c为0，则释放锁
    if (c == 0) {
        free = true;
        setExclusiveOwnerThread(null);
    }
    setState(c);
    return free;
}

// AQS类的方法
private void unparkSuccessor(Node node) {
    /*
     * If status is negative (i.e., possibly needing signal) try
     * to clear in anticipation of signalling.  It is OK if this
     * fails or if status is changed by waiting thread.
     */
    int ws = node.waitStatus;
	// 将waitStatus设置为0(该值大于0一般表示线程被中断了)
    if (ws < 0)
        node.compareAndSetWaitStatus(ws, 0);

    /*
     * Thread to unpark is held in successor, which is normally
     * just the next node.  But if cancelled or apparently null,
     * traverse backwards from tail to find the actual
     * non-cancelled successor.
     */
    Node s = node.next;
	// 判断当前节点是否为空，或是是否已经被取消
    if (s == null || s.waitStatus > 0) {
        s = null;
		// 从尾部遍历，获取可用被唤醒的线程
        for (Node p = tail; p != node && p != null; p = p.prev)
            if (p.waitStatus <= 0)
                s = p;
    }
    if (s != null)
		// 唤醒线程
        LockSupport.unpark(s.thread);
}
```

可以发现在释放锁后，<font color=red>头结点**并没有被删除**，而是将其状态重置为0了，即初始化状态</font>，此时可以将头结点理解为一个全新的虚拟节点。

## 1.4 cancelAcquire

`cancelAcquire`将会在`acquireQueued`方法中出现异常时调用，如果在加锁时调用的时`lockInterruptibly`，那么在锁被中断时也会调用。

内容很简单，就是一个简单的链表删除

```java
private void cancelAcquire(Node node) {
    // Ignore if node doesn't exist
    if (node == null)
        return;

    node.thread = null;

    // Skip cancelled predecessors.
    Node pred = node.prev;
    while (pred.waitStatus > 0)
        node.prev = pred = pred.prev;

    // predNext is the apparent node to unsplice. CASes below will
    // fail if not, in which case, we lost race vs another cancel
    // or signal, so no further action is necessary, although with
    // a possibility that a cancelled node may transiently remain
    // reachable.
    Node predNext = pred.next;

    // Can use unconditional write instead of CAS here.
    // After this atomic step, other Nodes can skip past us.
    // Before, we are free of interference from other threads.
    // 标记当前节点的状态为CANCELLED，即1
    node.waitStatus = Node.CANCELLED;

    // If we are the tail, remove ourselves.
    // 如果是尾结点，则用CAS尝试删除
    if (node == tail && compareAndSetTail(node, pred)) {
        pred.compareAndSetNext(predNext, null);
    } else {
        // If successor needs signal, try to set pred's next-link
        // so it will get one. Otherwise wake it up to propagate.
        int ws;
        // 尝试删除处于链表中间的节点
        if (pred != head &&
            ((ws = pred.waitStatus) == Node.SIGNAL ||
             (ws <= 0 && pred.compareAndSetWaitStatus(ws, Node.SIGNAL))) &&
            pred.thread != null) {
            Node next = node.next;
            if (next != null && next.waitStatus <= 0)
                pred.compareAndSetNext(predNext, next);
        } else {
            // 如果删除失败，则唤醒当前节点的后一个没有被取消的节点
            unparkSuccessor(node);
        }

        node.next = node; // help GC
    }
}
```

再来看一下`unparkSuccessor`，这个方法也在上面说了，主要用于唤起当前节点下一个waitStatus大于0的节点。

```java
private void unparkSuccessor(Node node) {
    /*
         * If status is negative (i.e., possibly needing signal) try
         * to clear in anticipation of signalling.  It is OK if this
         * fails or if status is changed by waiting thread.
         */
    int ws = node.waitStatus;
    if (ws < 0)
        node.compareAndSetWaitStatus(ws, 0);

    /*
         * Thread to unpark is held in successor, which is normally
         * just the next node.  But if cancelled or apparently null,
         * traverse backwards from tail to find the actual
         * non-cancelled successor.
         */
    Node s = node.next;
    // 找到下一个waitStatus小于等于0的节点并唤醒
    if (s == null || s.waitStatus > 0) {
        s = null;
        for (Node p = tail; p != node && p != null; p = p.prev)
            if (p.waitStatus <= 0)
                s = p;
    }
    if (s != null)
        LockSupport.unpark(s.thread);
}
```

到这里你可能有个疑问，在`cancelAcquire`里有这样一串代码：

```java
int ws;
if (pred != head &&
    ((ws = pred.waitStatus) == Node.SIGNAL ||
     (ws <= 0 && pred.compareAndSetWaitStatus(ws, Node.SIGNAL))) &&
    pred.thread != null) {
    Node next = node.next;
    if (next != null && next.waitStatus <= 0)
        // 如果这里执行失败？
        pred.compareAndSetNext(predNext, next);
} else {
    unparkSuccessor(node);
}
```

如果这一行if执行失败，那么我们的链表节点不就是没删掉吗？

其实这里是想多了，还记得我们之前的`shouldParkAfterFailedAcquire`方法吗，这个方法就会去检查某个节点前面的节点是否被取消，如果被取消了，它就会负责去删除，我们在这里CAS失败，说明节点早就已经被删掉了。

## 1.5 总结

最后用一张图总结一下吧：

![总结](https://xds.asia/public/java-source/2023-2-3-aa7d1ca2-677d-4c91-b6b4-411036b452c2.webp)

# 2. Condition

```java
ReentrantLock reentrantLock = new ReentrantLock();
# newCondition是AQS提供的方法
Condition condition = reentrantLock.newCondition();
```

对于`Condition`，这里我们来了解一下`await`和`signal`这俩个重要的方法。

```java
public final void await() throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
    Node node = addConditionWaiter();
    int savedState = fullyRelease(node);
    int interruptMode = 0;
    while (!isOnSyncQueue(node)) {
        LockSupport.park(this);
        if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
            break;
    }
    if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
        interruptMode = REINTERRUPT;
    if (node.nextWaiter != null) // clean up if cancelled
        unlinkCancelledWaiters();
    if (interruptMode != 0)
        reportInterruptAfterWait(interruptMode);
}
```

## 2.1 await

### 2.1.2 addConditionWaiter

这个方法会在<font color=red>**条件**队列</font>(每一个`ConditionObject`都会自带一个条件队列)的尾部添加一个新节点，在添加前会判断最后一个节点是否已经失效，若失效则会进行链表删除操作，之后创建新节点，添加到链表。

调用这个方法时必须保证当前线程持有锁，否则会抛出异常。

```java
private Node addConditionWaiter() {
    // 在这里判断当前线程是否已经拿到锁，没拿到就直接抛异常
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    Node t = lastWaiter;
    // If lastWaiter is cancelled, clean out.
    // 如果最后一个节点的状态不是Node.CONDITION，则删除这些已经被取消的节点
    if (t != null && t.waitStatus != Node.CONDITION) {
        // 这个方法会进行链表删除，删除状态不是Node.CONDITION的节点
        unlinkCancelledWaiters();
        t = lastWaiter;
    }
	
    Node node = new Node(Node.CONDITION);

    if (t == null)
        firstWaiter = node;
    else
        t.nextWaiter = node;
    lastWaiter = node;
    return node;
}
```

### 2.1.2 fullyRelease

`fullyRelease`会释放当前线程占用的锁，如果释放失败，则会删除该节点。

```java
final int fullyRelease(Node node) {
    try {
        // state一般表示重入次数
        int savedState = getState();
        if (release(savedState))
            return savedState;
        throw new IllegalMonitorStateException();
    } catch (Throwable t) {
        node.waitStatus = Node.CAN CELLED;
        throw t;
    }
}

public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            // 这里别忘了，头节点要么是拿到锁的线程，要么是占位节点，头结点的下一个才是能够抢锁的线程
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```

### 2.1.3 小总结

```java
public final void await() throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
    // 添加等待节点
    Node node = addConditionWaiter();
    // 释放锁
    int savedState = fullyRelease(node);
    int interruptMode = 0;
    // 这个方法主要是判断节点是否在同步队列里，在同步队列里了说明有机会抢锁了，就不用死循环了
    while (!isOnSyncQueue(node)) {
        LockSupport.park(this);
        if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
            break;
    }
    // 到这里说明已经得到信号，想要重新获取锁了，就让它去抢锁
    if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
        interruptMode = REINTERRUPT;
    // 清除多余的waiter
    if (node.nextWaiter != null) // clean up if cancelled
        unlinkCancelledWaiters();
    if (interruptMode != 0)
        // 如果中断模式为THROW_IE，则会抛出异常，如果为REINTERRUPT，则会调用线程的中断方法以维持中断状态
        reportInterruptAfterWait(interruptMode);
}
```

## 2.2 signal

```java
public final void signal() {
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    Node first = firstWaiter;
    if (first != null)
        doSignal(first);
}

private void doSignal(Node first) {
    do {
        if ((firstWaiter = first.nextWaiter) == null)
            lastWaiter = null;
        first.nextWaiter = null;
    } while (!transferForSignal(first) &&
             (first = firstWaiter) != null);
}

// 将节点从条件队列移动到同步队列
final boolean transferForSignal(Node node) {
    /*
     * If cannot change waitStatus, the node has been cancelled.
     */
    // 将节点状态设置为0(初始化状态)
    if (!node.compareAndSetWaitStatus(Node.CONDITION, 0))
        return false;

    /*
     * Splice onto queue and try to set waitStatus of predecessor to
     * indicate that thread is (probably) waiting. If cancelled or
     * attempt to set waitStatus fails, wake up to resync (in which
     * case the waitStatus can be transiently and harmlessly wrong).
     */
    
    Node p = enq(node);
    int ws = p.waitStatus;
    if (ws > 0 || !p.compareAndSetWaitStatus(ws, Node.SIGNAL))
        LockSupport.unpark(node.thread);
    return true;
}

// 将节点插入同步队列，在必要时进行初始化。同时会返回旧的尾结点
private Node enq(Node node) {
    for (;;) {
        Node oldTail = tail;
        if (oldTail != null) {
            // 设置prev节点，该操作对于其它线程可见
            node.setPrevRelaxed(oldTail);
            if (compareAndSetTail(oldTail, node)) {
                oldTail.next = node;
                return oldTail;
            }
        } else {
            // 为头部和尾部初始化一个占位节点
            initializeSyncQueue();
        }
    }
}
```

### 2.2.1 isOnSyncQueue

这时我们再来看`isOnSyncQueue`就可以发现清晰多了。

首先在调用`isOnSyncQueue`之前，创建的节点都是在条件队列里的，同步队列里并没有相关的节点。

```java
final boolean isOnSyncQueue(Node node) {
    // 如果节点状态为CONDITION，说明一定不在同步队列，我们在上面可以看到，在节点进入同步队列后
    // 它的waitStatus会被设置为0
    // 第二个条件则是判断条件队列前面有节点，说明自己肯定还在同步队列里(这里存疑)
    if (node.waitStatus == Node.CONDITION || node.prev == null)
        return false;
    // 如果当前节点有后续节点，说明一定在同步队列，因为对于条件队列，我们只会唤醒头结点，不会跟
    // 同步队列一样，每个节点都有唤醒的机会，而且被唤醒的时候一定是有人调用了signal或者中断
    if (node.next != null) // If has successor, it must be on queue
        return true;
    /*
         * node.prev can be non-null, but not yet on queue because
         * the CAS to place it on queue can fail. So we have to
         * traverse from tail to make sure it actually made it.  It
         * will always be near the tail in calls to this method, and
         * unless the CAS failed (which is unlikely), it will be
         * there, so we hardly ever traverse much.
         */
    // 这里直接遍历同步队列，查看是否在队列里
    return findNodeFromTail(node);
}
```

在同步队列里说明了什么？说明它有机会拿到锁继续运行！所以在`await`里就要跳出循环。
