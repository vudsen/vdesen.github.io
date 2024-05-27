---
title: 多线程并发编程
date: 2024-05-20 22:53:17
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---


# 使用线程

## 创建线程

使用 `thread::spawn` 可以创建线程：

```rust
use std::thread;
use std::time::Duration;

fn main() {
    thread::spawn(|| {
        for i in 1..10 {
            println!("hi number {} from the spawned thread!", i);
            thread::sleep(Duration::from_millis(1));
        }
    });

    for i in 1..5 {
        println!("hi number {} from the main thread!", i);
        thread::sleep(Duration::from_millis(1));
    }
}
```

有几点值得注意：

- 线程内部的代码使用闭包来执行
- `main` 线程一旦结束，程序就立刻结束，因此需要保持它的存活，直到其它子线程完成自己的任务
- `thread::sleep` 会让当前线程休眠指定的时间，随后其它线程会被调度运行（上一节并发与并行中有简单介绍过），因此就算你的电脑只有一个 `CPU` 核心，该程序也会表现的如同多 `CPU` 核心一般，这就是并发！

并且这段代码的每次运行结果都将不一样！

## 等待子线程结束

在某些情况下，某个线程需要等待其它线程执行完成后才能继续，例如在上面的例子中，我们希望主线程在子线程执行完后再执行后面的打印过程。

可以使用 `thread::spawn` 的返回值 `JoinHandle`，调用它的 `join` 方法：

```rust
use std::thread;
use std::time::Duration;

fn main() {
    let handle = thread::spawn(|| {
        for i in 1..5 {
            println!("hi number {} from the spawned thread!", i);
            thread::sleep(Duration::from_millis(1));
        }
    });

    handle.join().unwrap();

    for i in 1..5 {
        println!("hi number {} from the main thread!", i);
        thread::sleep(Duration::from_millis(1));
    }
}
```

通过调用 `handle.join`，可以让当前线程阻塞，直到它等待的子线程的结束，在上面代码中，由于 `main` 线程会被阻塞，因此它直到子线程结束后才会输出自己的 `1..5`：

```log
hi number 1 from the spawned thread!
hi number 2 from the spawned thread!
hi number 3 from the spawned thread!
hi number 4 from the spawned thread!
hi number 1 from the main thread!
hi number 2 from the main thread!
hi number 3 from the main thread!
hi number 4 from the main thread!
```

## 在线程闭包中使用 move

首先，来看看在一个线程中直接使用另一个线程中的数据会如何：

```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(|| {
        println!("Here's a vector: {:?}", v);
    });

    handle.join().unwrap();
}
```

运行结果：

```log
  |
6 |     let handle = thread::spawn(|| {
  |                                ^^ may outlive borrowed value `v`
7 |         println!("Here's a vector: {:?}", v);
  |                                           - `v` is borrowed here
  |
note: function requires argument type to outlive `'static`
 --> src/main.rs:6:18
  |
6 |       let handle = thread::spawn(|| {
  |  __________________^
7 | |         println!("Here's a vector: {:?}", v);
8 | |     });
  | |______^
help: to force the closure to take ownership of `v` (and any other referenced variables), use the `move` keyword
  |
6 |     let handle = thread::spawn(move || {
  |                                ++++
```

其实代码本身并没有什么问题，问题在于 Rust 无法确定新的线程会活多久，即使使用了 `join` 来确保变量 `v` 在线程执行完前不会被释放，但是对于编译器来说，不确定性还是太大了。

此时编译器提示可使用 `move` 来拿走所有权：
```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(move || {
        println!("Here's a vector: {:?}", v);
    });

    handle.join().unwrap();

    // 下面代码会报错borrow of moved value: `v`
    // println!("{:?}",v);
}
```

如上所示，很简单的代码，而且 Rust 的所有权机制保证了数据使用上的安全：v 的所有权被转移给新的线程后，main 线程将无法继续使用：最后一行代码将报错。

## 线程屏障

在 `Rust` 中，可以使用 `Barrier` 让多个线程都执行到某个点后，才继续一起往后执行：

```rust
use std::sync::{Arc, Barrier};
use std::thread;

fn main() {
    let mut handles = Vec::with_capacity(6);
    let barrier = Arc::new(Barrier::new(6));

    for _ in 0..6 {
        let b = barrier.clone();
        handles.push(thread::spawn(move|| {
            println!("before wait");
            b.wait();
            println!("after wait");
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

这段代码中创建了一个 `Barrier`，并且带有一个初始的计数器：`6`。每调用一次 `wait` 计数器都将减一并阻塞当前线程，当计数器减为 `0` 的时候，恢复所有被阻塞的线程。

## 线程局部变量(Thread Local Variable)

### 标准库 thread_local

使用 `thread_local` 宏可以初始化线程局部变量，然后在线程内部使用该变量的 `with` 方法获取变量值：

```rust
use std::cell::RefCell;
use std::thread;

#![allow(unused)]
fn main() {
    thread_local!(static FOO: RefCell<u32> = RefCell::new(1));

    FOO.with(|f| {
        assert_eq!(*f.borrow(), 1);
        *f.borrow_mut() = 2;
    });

    // 每个线程开始时都会拿到线程局部变量的FOO的初始值
    let t = thread::spawn(move|| {
        FOO.with(|f| {
            assert_eq!(*f.borrow(), 1);
            *f.borrow_mut() = 3;
        });
    });

    // 等待线程完成
    t.join().unwrap();

    // 尽管子线程中修改为了3，我们在这里依然拥有main线程中的局部值：2
    FOO.with(|f| {
        assert_eq!(*f.borrow(), 2);
    });
}
```

### 三方库 thread-local

除了标准库外，一位大神还开发了 [thread-local](https://github.com/Amanieu/thread_local-rs) 库，它允许每个线程持有值的独立拷贝：

```rust
#![allow(unused)]
fn main() {
use thread_local::ThreadLocal;
use std::sync::Arc;
use std::cell::Cell;
use std::thread;

let tls = Arc::new(ThreadLocal::new());
let mut v = vec![];
// 创建多个线程
for _ in 0..5 {
    let tls2 = tls.clone();
    let handle = thread::spawn(move || {
        // 将计数器加1
        // 请注意，由于线程 ID 在线程退出时会被回收，因此一个线程有可能回收另一个线程的对象
        // 这只能在线程退出后发生，因此不会导致任何竞争条件
        let cell = tls2.get_or(|| Cell::new(0));
        cell.set(cell.get() + 1);
    });
    v.push(handle);
}
for handle in v {
    handle.join().unwrap();
}
// 一旦所有子线程结束，收集它们的线程局部变量中的计数器值，然后进行求和
let tls = Arc::try_unwrap(tls).unwrap();
let total = tls.into_iter().fold(0, |x, y| {
    // 打印每个线程局部变量中的计数器值，发现不一定有5个线程，
    // 因为一些线程已退出，并且其他线程会回收退出线程的对象
    println!("x: {}, y: {}", x, y.get());
    x + y.get()
});

// 和为5
assert_eq!(total, 5);
}
```

该库不仅仅使用了值的拷贝，而且还能自动把多个拷贝汇总到一个迭代器中，最后进行求和。

## 用条件控制线程的挂起和执行

条件变量(Condition Variables)经常和 `Mutex` 一起使用，可以让线程挂起，直到某个条件发生后再继续执行：

```rust
use std::thread;
use std::sync::{Arc, Mutex, Condvar};
use std::time::Duration;

fn main() {
    let pair = Arc::new((Mutex::new(false), Condvar::new()));
    let pair2 = pair.clone();

    thread::spawn(move|| {
        let (lock, cvar) = &*pair2;
        println!("3. trying to acquired lock in thread...");
        let mut started = lock.lock().unwrap();
        println!("4. changing started");
        *started = true;
        cvar.notify_one();
        println!("5. sleep 5 sec in thread...");
        thread::sleep(Duration::from_secs(5));
    });

    let (lock, cvar) = &*pair;
    let mut started = lock.lock().unwrap();
    println!("1. {started}");
    while !*started {
        println!("2. sleep 5 sec...");
        thread::sleep(Duration::from_secs(5));
        // 暂时释放当前锁.
        started = cvar.wait(started).unwrap();
    }

    println!("6. started changed");
}
```

运行结果：

```log
1. false
2. sleep 5 sec...
3. trying to acquired lock in thread...
4. changing started
false
5. sleep 5 sec in thread...
6. started changed

```


上述代码流程如下：

1. `main` 线程首先进入 `while` 循环，调用 `wait` 方法挂起等待子线程的通知，并释放了锁 `started`。
2. 子线程获取到锁，并将其修改为 `true`，然后调用条件变量的 `notify_one` 方法来通知主线程继续执行

## 只被调用一次的函数

有时，我们会需要某个函数在多线程环境下只被调用一次，例如初始化全局变量，无论是哪个线程先调用函数来初始化，都会保证全局变量只会被初始化一次，随后的其它线程调用就会忽略该函数：

```rust
use std::thread;
use std::sync::Once;

static mut VAL: usize = 0;
static INIT: Once = Once::new();

fn main() {
    let handle1 = thread::spawn(move || {
        INIT.call_once(|| {
            unsafe {
                VAL = 1;
            }
        });
    });

    let handle2 = thread::spawn(move || {
        INIT.call_once(|| {
            unsafe {
                VAL = 2;
            }
        });
    });

    handle1.join().unwrap();
    handle2.join().unwrap();

    println!("{}", unsafe { VAL });
}
```

代码运行的结果取决于哪个线程先调用 `INIT.call_once` （虽然代码具有先后顺序，但是线程的初始化顺序并无法被保证！因为线程初始化是异步的，且耗时较久），若 `handle1` 先，则输出 `1`，否则输出 `2`。

`call_once`方法执行初始化过程一次，并且只执行一次。如果当前有另一个初始化过程正在运行，线程将阻止该方法被调用。当这个函数返回时，保证一些初始化已经运行并完成，它还保证由执行的闭包所执行的任何内存写入都能被其他线程在这时可靠地观察到。


# 线程间的消息传递

Rust 是在标准库里提供了消息通道(`channel`)来进行消息传递。

## 多发送者，单接收者

标准库提供了通道 `std::sync::mpsc`其中 `mpsc`是 `multiple producer, single consumer` 的缩写，代表了该通道支持多个发送者，但是只支持唯一的接收者：

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    // 创建一个消息通道, 返回一个元组：(发送者，接收者)
    let (tx, rx) = mpsc::channel();

    // 创建线程，并发送消息
    thread::spawn(move || {
        // 发送一个数字1, send方法返回Result<T,E>，通过unwrap进行快速错误处理
        tx.send(1).unwrap();

        // 下面代码将报错，因为编译器自动推导出通道传递的值是i32类型，那么Option<i32>类型将产生不匹配错误
        // tx.send(Some(1)).unwrap()
    });

    // 在主线程中接收子线程发送的消息并输出
    println!("receive {}", rx.recv().unwrap());
}
```

以上代码并不复杂，但仍有几点需要注意：

- `tx`, `rx` 对应发送者和接收者，它们的类型由编译器自动推导: `tx.send(1)` 发送了整数，因此它们分别是 `mpsc::Sender<i32>` 和 `mpsc::Receiver<i32>` 类型，需要注意，由于内部是泛型实现，一旦类型被推导确定，该通道就只能传递对应类型的值, 例如此例中非 `i32` 类型的值将导致编译错误
- 接收消息的操作 `rx.recv()` 会阻塞当前线程，直到读取到值，或者通道被关闭
- 需要使用 `move` 将 `tx` 的所有权转移到子线程的闭包中

在注释中提到 `send` 方法返回一个 `Result<T, E>`，说明它有可能返回一个错误，例如接收者被 `drop` 导致了发送的值不会被任何人接收，此时继续发送毫无意义，因此返回一个错误最为合适。

同样的，对于 `recv` 方法来说，当发送者关闭时，它也会接收到一个错误，用于说明不会再有任何值被发送过来。

`Sender` 可以使用 `clone` 方法复制，然后分给其它线程，但是需要注意，如果克隆了多个 `Sender` 并且没有被全部回收，那么将造成死锁：

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    // 创建一个消息通道, 返回一个元组：(发送者，接收者)
    let (tx, rx) = mpsc::channel::<i32>();

    let tx2 = tx.clone();
    // 创建线程，并发送消息
    thread::spawn(move || {
        println!("{:?}", tx2);
    });

    // 在主线程中接收子线程发送的消息并输出
    println!("receive {}", rx.recv().unwrap());
}
```

例如在上面的代码中，复制了一个 `tx2` 给了另外一个线程，但是它并没有发送消息，在线程结束后被回收，但是对于原始的 `tx` 变量，在 `main` 方法结束前都不会被释放，所以此时调用 `rx.recv()` 仍然会阻塞，并且永远不会结束。

### 不阻塞的 try_recv 方法

除了上述 `recv` 方法，还可以使用 `try_recv` 尝试接收一次消息，该方法并不会阻塞线程，当通道中没有消息时，它会立刻返回一个错误：

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        tx.send(1).unwrap();
    });

    println!("receive {:?}", rx.try_recv());
}
```

由于子线程的创建需要时间，因此 `println!` 和 `try_recv` 方法会先执行，而此时子线程的消息还未被发出。`try_recv` 会尝试立即读取一次消息，因为消息没有发出，此次读取最终会报错，且主线程运行结束。

## 同步和异步通道

Rust 标准库的 `mpsc` 通道其实分为两种类型：同步和异步。

### 异步通道

无论接收者是否正在接收消息，消息发送者在发送消息时都不会阻塞:

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
fn main() {
    let (tx, rx)= mpsc::channel();

    let handle = thread::spawn(move || {
        println!("发送之前");
        tx.send(1).unwrap();
        println!("发送之后");
    });

    println!("睡眠之前");
    thread::sleep(Duration::from_secs(3));
    println!("睡眠之后");

    println!("receive {}", rx.recv().unwrap());
    handle.join().unwrap();
}
```

运行后输出如下:

```log
睡眠之前
发送之前
发送之后
//···睡眠3秒
睡眠之后
receive 1
```

### 同步通道

与异步通道相反，同步通道**发送消息是阻塞的，只有在消息被接收后才解除阻塞**:

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
fn main() {
    // 设置消息最多缓存 n 条，前 n - 1 条消息发送时不会阻塞，只有在第 n 条消息发送时，才会阻塞。
    let (tx, rx)= mpsc::sync_channel(0);

    let handle = thread::spawn(move || {
        println!("发送之前");
        tx.send(1).unwrap();
        println!("发送之后");
    });

    println!("睡眠之前");
    thread::sleep(Duration::from_secs(3));
    println!("睡眠之后");

    println!("receive {}", rx.recv().unwrap());
    handle.join().unwrap();
}
```

运行后输出如下：

```log
睡眠之前
发送之前
//···睡眠3秒
睡眠之后
receive 1
发送之后
```

可以看出，主线程由于睡眠被阻塞导致无法接收消息，因此子线程的发送也一直被阻塞，直到主线程结束睡眠并成功接收消息后，发送才成功：发送之后的输出是在 `receive 1` 之后，说明只有接收消息彻底成功后，发送消息才算完成。

## 多发送者，多接收者

如果需要 `mpmc`(多发送者，多接收者)或者需要更高的性能，可以考虑第三方库:

- `crossbeam-channel`, 老牌强库，功能较全，性能较强，之前是独立的库，但是后面合并到了 `crossbeam` 主仓库中
- `flume`, 官方给出的性能数据某些场景要比 `crossbeam` 更好些

# 线程同步：锁、Condvar和信号量

## 互斥锁 Mutex

`Mutex`让多个线程并发的访问同一个值变成了排队访问：同一时间，只允许一个线程 `A` 访问该值，其它线程需要等待 `A` 访问完成后才能继续。

```rust
use std::sync::Mutex;

fn main() {
    // 使用`Mutex`结构体的关联函数创建新的互斥锁实例
    let m = Mutex::new(5);

    {
        // 获取锁，然后deref为`m`的引用
        // lock返回的是Result
        let mut num = m.lock().unwrap();
        *num = 6;
        // 锁自动被drop
    }

    println!("m = {:?}", m);
}
```

要访问内部的数据，需要使用方法 `m.lock()` 向 `m` 申请一个锁, 该方法会阻塞当前线程，直到获取到锁，因此当多个线程同时访问该数据时，只有一个线程能获取到锁，其它线程只能阻塞着等待，这样就保证了数据能被安全的修改！


获取 `m.lock()` 会返回一个 `MutexGuard` 对象，它保存了加锁的数据，它实现了下面两个关键特征：

- `Drop`：离开作用域后，立即释放锁。
- `Deref`: 能够解引用获取内部的值。

### 多线程中使用 Mutex

因为创建线程需要拿走变量的所有权，而 `Mutex` 没有实现 `Clone` 特征，只好考虑使用 `Rc` 实现：

```rust
use std::rc::Rc;
use std::sync::Mutex;
use std::thread;

fn main() {
    // 通过`Rc`实现`Mutex`的多所有权
    let counter = Rc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Rc::clone(&counter);
        // 创建子线程，并将`Mutex`的所有权拷贝传入到子线程中
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();

            *num += 1;
        });
        handles.push(handle);
    }

    // 等待所有子线程完成
    for handle in handles {
        handle.join().unwrap();
    }

    // 输出最终的计数结果
    println!("Result: {}", *counter.lock().unwrap());
}
```

但是很遗憾，上面的代码会报错：

```log
error[E0277]: `Rc<Mutex<i32>>` cannot be sent between threads safely
   --> src\main.rs:13:36
    |
13  |           let handle = thread::spawn(move || {
    |                        ------------- ^------
    |                        |             |
    |  ______________________|_____________within this `{closure@src\main.rs:13:36: 13:43}`
    | |                      |
    | |                      required by a bound introduced by this call
14  | |             let mut num = counter.lock().unwrap();
15  | |
16  | |             *num += 1;
17  | |         });
    | |_________^ `Rc<Mutex<i32>>` cannot be sent between threads safely
    |
    = help: within `{closure@src\main.rs:13:36: 13:43}`, the trait `Send` is not implemented for `Rc<Mutex<i32>>`
note: required because it's used within this closure
```

错误中提到了一个关键点：`Rc<T>` 无法在线程中传输，因为它没有实现 `Send` 特征，而该特征可以确保数据在线程中安全的传输。

好在，`Arc<T>` 实现了这个特征:

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..10 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();

            *num += 1;
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    println!("Result: {}", *counter.lock().unwrap());
}
```

也正因为如此，`Rc<T>/RefCell<T>` 用于单线程内部可变性，`Arc<T>/Mutex<T>` 用于多线程内部可变性。

### 当持有锁时 panic

`m.lock()` 方法也有可能报错，例如当前正在持有锁的线程 `panic` 了。在这种情况下，其它线程不可能再获得锁，因此 `lock` 方法会返回一个错误:

```rust
use std::sync::{Arc, LockResult, Mutex};
use std::thread;
use std::thread::sleep;
use std::time::Duration;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for i in 0..10 {
        let counter = Arc::clone(&counter);
        let handle = thread::spawn(move || {
            for _ in 0..3 {
                match counter.lock() {
                    Ok(mut num) => {
                        *num += 1;
                        if i == 5 {
                            panic!("panic")
                        }
                        println!("[{i}] acquire lock success");
                        break
                    },
                    Err(e) => {
                        println!("[{i}] try get lock failed: {e}");
                        sleep(Duration::from_secs(1));
                    }
                } ;
            }
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join();
    }

    match counter.lock() {
        Ok(num) => {
            println!("{num}")
        }
        Err(err) => {
            println!("{err}");
        }
    };
}
```

上面的方法创建了 10 个线程，每个线程都将会对 `Mutex` 中的值加一，但是第 5 个线程会直接 panic 掉。其它 9 个线程正常执行，理论上此时最后的结果应该为 9。

但是实际运行后，由于一个线程的 panic，导致其它线程都无法再使用锁，因此在最后尝试获取锁打印对应的值时，会获取一个失败的结果。

## 死锁

### 单线程死锁

没错，单线程也能死锁，`Mutex`不支持重入(一个线程获取到锁后，再次尝试获取锁)：

```rust
use std::sync::Mutex;

fn main() {
    let data = Mutex::new(0);
    let d1 = data.lock();
    let d2 = data.lock();
} // d1锁在此处释放
```

此时获取了锁 `d1` 但是在获取 `d2` 时将会造成死锁。

### 多线程死锁

多线程死锁就很常规了，就是两个或多个线程互相持有了对方所需要的锁。例如线程 A 需要 `mutex1`，持有了 `mutex2`，但是线程 B 需要 `mutex2` 但是持有了 `mutex1`，此时就会造成死锁。

可以考虑使用 `try_lock` 方法来尝试获取一次锁，如果无法获取会返回一个错误，因此不会发生阻塞。

## 读写锁

`Mutex` 会对每次读写都进行加锁，但某些时候，我们需要大量的并发读，`Mutex` 就无法满足需求了，此时就可以使用 `RwLock`:

```rust
use std::sync::RwLock;

fn main() {
    let lock = RwLock::new(5);

    // 同一时间允许多个读
    {
        let r1 = lock.read().unwrap();
        let r2 = lock.read().unwrap();
        assert_eq!(*r1, 5);
        assert_eq!(*r2, 5);
    } // 读锁在此处被drop

    // 同一时间只允许一个写
    {
        let mut w = lock.write().unwrap();
        *w += 1;
        assert_eq!(*w, 6);

        // 以下代码会阻塞发生死锁，因为读和写不允许同时存在
        // 写锁w直到该语句块结束才被释放，因此下面的读锁依然处于`w`的作用域中
        // let r1 = lock.read();
        // println!("{:?}",r1);
    }// 写锁在此处被drop
}
```

RwLock在使用上和Mutex区别不大，只有在多个读的情况下不阻塞程序，其他如读写、写读、写写情况下均会对后获取锁的操作进行阻塞。

也可以使用 `try_write` 和 `try_read` 来尝试进行一次写/读，若失败则返回错误。


简单总结下`RwLock`:

- 同时允许多个读，但最多只能有一个写
- 读和写不能同时存在
- 读可以使用 `read`、`try_read`，写 `write`、`try_write`, 在实际项目中，`try_xxx`会安全的多

## 三方库提供的锁实现

标准库在设计时总会存在取舍，因为往往性能并不是最好的，如果你追求性能，可以使用三方库提供的并发原语:

- [parking_lot](https://crates.io/crates/parking_lot), 功能更完善、稳定，社区较为活跃，star 较多，更新较为活跃
- [spin](https://crates.io/crates/spin), 在多数场景中性能比parking_lot高一点，最近没怎么更新

如果不是追求特别极致的性能，建议选择前者。

## 用条件变量(Condvar)控制线程的同步

`Mutex` 用于解决资源安全访问的问题，但是我们还需要一个手段来解决资源访问顺序的问题。而 Rust 考虑到了这一点，为我们提供了条件变量(Condition Variables)，它经常和 Mutex 一起使用，可以让线程挂起，直到某个条件发生后再继续执行:

```rust
use std::sync::{Arc,Mutex,Condvar};
use std::thread::{spawn,sleep};
use std::time::Duration;

fn main() {
    let flag = Arc::new(Mutex::new(false));
    let cond = Arc::new(Condvar::new());
    let cflag = flag.clone();
    let ccond = cond.clone();

    let hdl = spawn(move || {
        let mut lock = cflag.lock().unwrap();
        let mut counter = 0;

        while counter < 3 {
            while !*lock {
                // wait方法会接收一个MutexGuard<'a, T>，且它会自动地暂时释放这个锁，使其他线程可以拿到锁并进行数据更新。
                // 同时当前线程在此处会被阻塞，直到被其他地方notify后，它会将原本的MutexGuard<'a, T>还给我们，即重新获取到了锁，同时唤醒了此线程。
                lock = ccond.wait(lock).unwrap();
            }
            
            *lock = false;

            counter += 1;
            println!("inner counter: {}", counter);
        }
    });

    let mut counter = 0;
    loop {
        sleep(Duration::from_millis(1000));
        *flag.lock().unwrap() = true;
        counter += 1;
        if counter > 3 {
            break;
        }
        println!("outside counter: {}", counter);
        cond.notify_one();
    }
    hdl.join().unwrap();
    println!("{:?}", flag);
}
```

例子中通过主线程来触发子线程实现交替打印输出：

```log
outside counter: 1
inner counter: 1
outside counter: 2
inner counter: 2
outside counter: 3
inner counter: 3
Mutex { data: true, poisoned: false, .. }
```

## 信号量 Semaphore

在多线程中，另一个重要的概念就是信号量，使用它可以让我们精准的控制当前正在运行的任务最大数量。

本来 Rust 在标准库中有提供一个[信号量实现](https://doc.rust-lang.org/1.8.0/std/sync/struct.Semaphore.html), 但是由于各种原因这个库现在已经不再推荐使用了，因此我们推荐使用 tokio 中提供的 Semaphore 实现: [tokio::sync::Semaphore](https://github.com/tokio-rs/tokio/blob/master/tokio/src/sync/semaphore.rs)。

```rust
use std::sync::Arc;
use tokio::sync::Semaphore;

#[tokio::main]
async fn main() {
    let semaphore = Arc::new(Semaphore::new(3));
    let mut join_handles = Vec::new();

    for _ in 0..5 {
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        join_handles.push(tokio::spawn(async move {
            //
            // 在这里执行任务...
            //
            drop(permit);
        }));
    }

    for handle in join_handles {
        handle.await.unwrap();
    }
}
```

上面代码创建了一个容量为 3 的信号量，当正在执行的任务超过 3 时，剩下的任务需要等待正在执行任务完成并减少信号量后到 3 以内时，才能继续执行。

这里的关键其实说白了就在于：信号量的申请和归还，使用前需要申请信号量，如果容量满了，就需要等待；使用后需要释放信号量，以便其它等待者可以继续。