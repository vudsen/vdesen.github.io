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