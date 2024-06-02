---
title: 多线程并发编程 Part 2
date: 2024-06-01 22:23:51
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---


# 线程同步：Atomic 原子类型与内存顺序

`Mutex`用起来简单，但是无法并发读，`RwLock`可以并发读，但是使用场景较为受限且性能不够高...

从 Rust1.34 版本后，就正式支持原子类型。原子指的是一系列不可被 CPU 上下文交换的机器指令，这些指令组合在一起就形成了原子操作。在多核 CPU 下，当某个 CPU 核心开始运行原子操作时，会先暂停其它 CPU 内核对内存的操作，以保证原子操作不会被其它 CPU 内核所干扰。

由于原子操作是通过指令提供的支持，因此它的性能相比锁和消息传递会好很多。相比较于锁而言，原子类型不需要开发者处理加锁和释放锁的问题，同时支持修改，读取等操作，还具备较高的并发性能，几乎所有的语言都支持原子类型。

可以看出原子类型是无锁类型，但是无锁不代表无需等待，因为原子类型内部使用了 `CAS` 循环，当大量的冲突发生时，该等待还是得等待！但是总归比锁要好。

## 使用 Atomic 作为全局变量

原子类型的一个常用场景，就是作为全局变量来使用:

```rust
use std::ops::Sub;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Instant;

const N_TIMES: u64 = 10000000;
const N_THREADS: usize = 10;

static R: AtomicU64 = AtomicU64::new(0);

fn add_n_times(n: u64) -> JoinHandle<()> {
    thread::spawn(move || {
        for _ in 0..n {
            R.fetch_add(1, Ordering::Relaxed);
        }
    })
}

fn main() {
    let s = Instant::now();
    let mut threads = Vec::with_capacity(N_THREADS);

    for _ in 0..N_THREADS {
        threads.push(add_n_times(N_TIMES));
    }

    for thread in threads {
        thread.join().unwrap();
    }

    assert_eq!(N_TIMES * N_THREADS as u64, R.load(Ordering::Relaxed));

    println!("{:?}",Instant::now().sub(s));
}
```

以上代码启动了数个线程，每个线程都在疯狂对全局变量进行加 1 操作, 最后将它与线程数 * 加1次数进行比较，如果发生了因为多个线程同时修改导致了脏数据，那么这两个必将不相等。好在，它没有让我们失望，不仅快速的完成了任务，而且保证了 100%的并发安全性。

## 内存顺序

内存顺序是指 CPU 在访问内存时的顺序，该顺序可能受以下因素的影响：

- 代码中的先后顺序
- 编译器优化导致在编译阶段发生改变(内存重排序 reordering)
- 运行阶段因 CPU 的缓存机制导致顺序被打乱

### 编译器优化导致内存顺序的改变

对于第二点，举个例子：

```rust
static mut X: u64 = 0;
static mut Y: u64 = 1;

fn main() {
    ...     // A

    unsafe {
        ... // B
        X = 1;
        ... // C
        Y = 3;
        ... // D
        X = 2;
        ... // E
    }
}
```

假如在C和D代码片段中，根本没有用到X = 1，那么编译器很可能会将X = 1和X = 2进行合并:

```rust
 ...     // A

unsafe {
    ... // B
    X = 2;
    ... // C
    Y = 3;
    ... // D
    ... // E
}
```

若代码 A 中创建了一个新的线程用于读取全局静态变量 X，则该线程将无法读取到 X = 1 的结果，因为在编译阶段就已经被优化掉。

### CPU 缓存导致的内存顺序的改变

假设之前的 X = 1 没有被优化掉，并且在代码片段A中有一个新的线程:

```log
initial state: X = 0, Y = 1

THREAD Main     THREAD A
X = 1;          if X == 1 {
Y = 3;              Y *= 2;
X = 2;          }
```

由于存在 CPU 缓存，可能导致在主线程中虽然已经将 `X` 修改为2，但是在线程 A 中由于 CPU 缓存的原因，获取到的 `X` 仍然为 1.

### 限定内存顺序的 5 个规则

在使用 `Atomic` 操作时，可以通过 `Ordering` 传递顺序规则，有下面几种规则：

- **Relaxed**: 这是最宽松的规则，它对编译器和 CPU 不做任何限制，可以乱序
- **Release 释放**: 设定内存屏障(Memory barrier)，保证它之前的操作永远在它之前，但是它后面的操作可能被重排到它前面
- **Acquire 获取**: 设定内存屏障，保证在它之后的访问永远在它之后，但是它之前的操作却有可能被重排到它后面，往往和 `Release` 在不同线程中联合使用
- **AcqRel**: 是 Acquire 和 Release 的结合，同时拥有它们俩提供的保证。比如你要对一个 atomic 自增 1，同时希望该操作之前和之后的读取或写入操作不会被重新排序
- **SeqCst 顺序一致性**: SeqCst就像是AcqRel的加强版，它不管原子操作是属于读取还是写入的操作，只要某个线程有用到SeqCst的原子操作，线程中该SeqCst操作前的数据操作绝对不会被重新排在该SeqCst操作之后，且该SeqCst操作后的数据操作也绝对不会被重新排在SeqCst操作前。

原则上，`Acquire` 用于读取，而 `Release` 用于写入。但是由于有些原子操作同时拥有读取和写入的功能，此时就需要使用 `AcqRel` 来设置内存顺序了。在内存屏障中被写入的数据，都可以被其它线程读取到，不会有 CPU 缓存的问题。

### 为什么写要用 Release

写屏障(`Ordering::Release`)，可以保证所有在屏障之前对**共享内存的操作**不会被重排到屏障之后。

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

static mut DATA: u64 = 0;
static READY: AtomicBool = AtomicBool::new(false);

fn main() {
    thread::spawn(move || {
        let value = 123;
        unsafe {
            DATA = 100;  // 修改共享数据
        }
        READY.store(true, Ordering::Release);  // 发布操作

        println!("{value}");
    });

    // 假设这里有另一个线程在等待 READY 为 true
    thread::spawn(move || {
        while !READY.load(Ordering::Acquire) {
            // 等待 READY 变为 true
        }

        // READY 为 true 后，确保看到 DATA 的修改
        unsafe {
            println!("DATA: {}", DATA);
        }
    }).join().unwrap();
}
```

在这个代码中，有两个线程：

- 第一个线程在修改 `DATA` 之后，使用 `READY.store(true, Ordering::Release)` 将 `READY` 设置为 `true`，这意味着对 `DATA` 的写操作在内存中被发布（或提交）。
- 第二个线程不断检查 `READY`，直到它变为 `true`，通过 `READY.load(Ordering::Acquire)` 来同步这个操作。一旦 `READY` 为 `true`，它确保在 `READY.store(true, Ordering::Release)` 之前的所有写操作（包括 `DATA = 100`）都对该线程可见。

> 内存同步原语（如 Ordering::Release 和 Ordering::Acquire）只影响共享内存，而不影响线程私有的堆栈空间。


# 基于 Send 和 Sync 的线程安全

## Send 和 Sync

`Send` 和 `Sync` 是 Rust 安全并发的重中之重，但是实际上它们只是标记特征(marker trait，该特征未定义任何行为), 作用如下：

- 实现 `Send` 的类型可以在线程间安全的传递其所有权
- 实现 `Sync` 的类型可以在线程间安全的共享(通过引用)

这里还有一个潜在的依赖：一个类型要在线程间安全的共享的前提是，指向它的引用必须能在线程间传递。因为如果引用都不能被传递，就无法在多个线程间使用引用去访问同一个数据了。

若类型 `T` 是 `Sync`，则 `T` 的引用 `&T` 是 `Send`；反之不一定。

例如 `RwLock` 的实现：

```rust
unsafe impl<T: ?Sized + Send + Sync> Sync for RwLock<T> {}
```

`RwLock` 可以在线程间安全的共享，那它肯定是实现了 `Sync`，而且 `RwLock` 可以并发的读，说明其中的值 `T` 必定也可以在线程间共享，那T必定要实现 `Sync`。

再例如在 `Mutex` 中:

```rust
unsafe impl<T: ?Sized + Send> Sync for Mutex<T> {}
```

不出所料，`Mutex<T>` 中的T并没有 `Sync` 特征约束。

---

再比如说 `Rc<T>`，它没有实现 `Send` 特征，因为的运用场景中可能导致并发问题：

```rust
use std::rc::Rc;
use std::thread;

fn main() {
    let rc = Rc::new(5);

    let rc_clone = rc.clone();
    thread::spawn(move || {
        println!("{}", rc_clone);
    });

    // 主线程仍然持有 rc 的引用
    println!("{}", rc);
}
```

在这里，虽然 `Rc<T>` 的所有权仅能被一个线程持有，但是它的引用就不一定了，上面的代码中，主线程和子线程都拥有了 `Rc<T>` 的所有权，可能会导致潜在的并发问题。因此 `Rc<T>` 并没有被**标记**为 `Send`.


## 实现 Send 和 Sync 的类型

在 Rust 中，几乎所有类型都默认实现了 `Send` 和 `Sync`，而且由于这两个特征都是可自动派生的特征(通过`derive`派生)，意味着一个复合类型(例如结构体), 只要它内部的所有成员都实现了 `Send` 或者 `Sync`，那么它就自动实现了 `Send` 或 `Sync`。

但是有如下几个常见的特例：

- 裸指针两者都没实现，因为它本身就没有任何安全保证
- UnsafeCell不是Sync，因此Cell和RefCell也不是
- Rc两者都没实现(因为内部的引用计数器不是线程安全的)

手动实现 `Send` 和 `Sync` 是不安全的，通常并不需要手动实现 `Send` 和 `Sync` trait，实现者需要使用 unsafe 小心维护并发安全保证。

### 为裸指针实现Send

使用 `newtype` 类型为 u8 裸指针实现 `Send`:

```rust
use std::thread;

#[derive(Debug)]
struct MyBox(*mut u8);
unsafe impl Send for MyBox {}
fn main() {
    let p = MyBox(5 as *mut u8);
    let t = thread::spawn(move || {
        println!("{:?}",p);
    });

    t.join().unwrap();
}
```

实现 `Send` 特征并不需要编写额外代码，**仅仅是告诉编译器，这个结构体可以被安全的发送，即便它实际上并不能被安全发送**，也就意味着开发者需要自己保证这个操作是安全的。

### 为裸指针实现Sync

`Sync` 是多线程间共享一个值，但是实际上并不能直接共享一个引用：

```rust
use std::thread;
fn main() {
    let v = 5;
    let t = thread::spawn(|| {
        println!("{:?}",&v);
    });

    t.join().unwrap();
}
```

上面的代码会报错，原因是编译器无法确定主线程和线程 `t` 谁的生命周期更长。

因此得配合 `Arc` 去使用:

```rust
use std::thread;
use std::sync::Arc;
use std::sync::Mutex;

#[derive(Debug)]
struct MyBox(*const u8);
unsafe impl Send for MyBox {}

fn main() {
    let b = &MyBox(5 as *const u8);
    let v = Arc::new(Mutex::new(b));
    let t = thread::spawn(move || {
        let _v1 =  v.lock().unwrap();
    });

    t.join().unwrap();
}
```

上面代码将智能指针 `v` 的所有权转移给新线程，同时 `v` 包含了一个引用类型 `b`，当在新的线程中试图获取内部的引用时，会报错：

```log
error[E0277]: `*const u8` cannot be shared between threads safely
--> src/main.rs:25:13
|
25  |     let t = thread::spawn(move || {
|             ^^^^^^^^^^^^^ `*const u8` cannot be shared between threads safely
|
= help: within `MyBox`, the trait `Sync` is not implemented for `*const u8`
```

只需要为 `MyBox` 实现 `Sync` 特征就可以了：

```rust
unsafe impl Sync for MyBox {}
```