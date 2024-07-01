---
title: async/await 异步编程
date: 2024-07-01 22:56:28
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---


# async/.await 简单入门

`async/.await` 是 Rust 内置的语言特性，可以让我们用同步的方式去编写异步的代码。

通过 `async` 标记的语法块会被转换成实现了 `Future` 特征的状态机。 与同步调用阻塞当前线程不同，当 `Future` 执行并遇到阻塞时，它会让出当前线程的控制权，这样其它的 `Future`就可以在该线程中运行，这种方式完全不会导致当前线程的阻塞。

导入下面的包：

```toml
[dependencies]
futures = "0.3.30"
```

## 使用 async

首先，使用 async fn 语法来创建一个异步函数:

```rust
async fn do_something() {
    println!("go go go !");
}
```

需要注意，**异步函数的返回值是一个 `Future`**，若直接调用该函数，不会输出任何结果，因为 `Future` 还未被执行：

```rust
fn main() {
      do_something();
}
```

运行后，`go go go` 并没有打印，同时编译器给予一个提示：`warning: unused implementer of Future that must be used`，告诉我们 `Future` 未被使用，那么到底该如何使用？答案是使用一个执行器(`executor`):

```rust
// `block_on`会阻塞当前线程直到指定的`Future`执行完成，这种阻塞当前线程以等待任务完成的方式较为简单、粗暴，
// 好在其它运行时的执行器(executor)会提供更加复杂的行为，例如将多个`future`调度到同一个线程上执行。
use futures::executor::block_on;

async fn hello_world() {
    println!("hello, world!");
}

fn main() {
    let future = hello_world(); // 返回一个Future, 因此不会打印任何输出
    block_on(future); // 执行`Future`并等待其运行完成，此时"hello, world!"会被打印输出
}
```

## 使用.await

当在异步函数中调用异步函数时，如果需要等待调用的异步函数执行完成，可以直接使用 `.await` 来进行等待：

```rust
use futures::executor::block_on;

async fn hello_world() {
    hello_cat().await;
    println!("hello, world!");
}

async fn hello_cat() {
    println!("hello, kitty!");
}
fn main() {
    let future = hello_world();
    block_on(future);
}
```

输出：

```log
hello, kitty!
hello, world!
```

但是如果不加 `.await`:

```rust
use futures::executor::block_on;

async fn hello_world() {
    // 移出 .await
    hello_cat();
    println!("hello, world!");
}

async fn hello_cat() {
    println!("hello, kitty!");
}
fn main() {
    let future = hello_world();
    block_on(future);
}
```

此时编译器会给出警告:

```log
warning: unused implementer of `futures::Future` that must be used
 --> src/main.rs:6:5
  |
6 |     hello_cat();
  |     ^^^^^^^^^^^^
= note: futures do nothing unless you `.await` or poll them
...
hello, world!
```

`hello_cat` 方法并没有被执行，编译器也提示需要加上 `.await`。

总之，在 `async fn` 函数中使用 `.await` 可以等待另一个异步调用的完成。但是与 `block_on` 不同，`.await` 并不会阻塞当前的线程，而是异步的等待 `Future A` 的完成，在等待的过程中，该线程还可以继续执行其它的 `Future B`，最终实现了并发处理的效果。