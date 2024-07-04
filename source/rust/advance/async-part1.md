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

# Future 执行器与任务调度

## Future 特征

`Future` 特征是 Rust 异步编程的核心，毕竟异步函数是异步编程的核心，而 `Future` 恰恰是异步函数的返回值和被执行的关键。

首先，来给出 `Future` 的定义：它是一个能产出值的异步计算(虽然该值可能为空，例如 `()` )。来看看一个简化版的 Future 特征:

```rust
trait SimpleFuture {
    type Output;
    fn poll(&mut self, wake: fn()) -> Poll<Self::Output>;
}

enum Poll<T> {
    Ready(T),
    Pending,
}
```

在上一章中，我们提到过 `Future` 需要被执行器 `poll` (轮询)后才能运行，通过调用该方法，可以推进 Future 的进一步执行，直到被切走为止。

若在当前 `poll` 中， `Future` 可以被完成，则会返回 `Poll::Ready(result)` ，反之则返回 `Poll::Pending`， 并且安排一个 `wake` 函数：当未来 `Future` 准备好进一步执行时， 该函数会被调用，然后管理该 `Future` 的执行器(例如上一章节中的 `block_on` 函数)会再次调用 `poll` 方法，此时 `Future` 就可以继续执行了。

如果没有 `wake` 方法，那执行器无法知道某个 `Future` 是否可以继续被执行，除非执行器定期的轮询每一个 `Future`，确认它是否能被执行，但这种作法效率较低。而有了 `wake`，`Future` 就可以主动通知执行器，然后执行器就可以精确的执行该 `Future`。 这种“事件通知 -> 执行”的方式要远比定期对所有 `Future` 进行一次全遍历来的高效。

用一个例子来说明下。考虑一个需要从 socket 读取数据的场景：如果有数据，可以直接读取数据并返回 `Poll::Ready(data)`， `但如果没有数据，Future` 会被阻塞且不会再继续执行，此时它会注册一个 `wake` 函数，当 `socket` 数据准备好时，该函数将被调用以通知执行器：我们的 `Future` 已经准备好了，可以继续执行。

下面的 `SocketRead` 结构体就是一个 `Future`:

```rust
pub struct SocketRead<'a> {
    socket: &'a Socket,
}

impl SimpleFuture for SocketRead<'_> {
    type Output = Vec<u8>;

    fn poll(&mut self, wake: fn()) -> Poll<Self::Output> {
        if self.socket.has_data_to_read() {
            // socket有数据，写入buffer中并返回
            Poll::Ready(self.socket.read_buf())
        } else {
            // socket中还没数据
            //
            // 注册一个`wake`函数，当数据可用时，该函数会被调用，
            // 然后当前Future的执行器会再次调用`poll`方法，此时就可以读取到数据
            self.socket.set_readable_callback(wake);
            Poll::Pending
        }
    }
}
```

这种 `Future` 模型允许将多个异步操作组合在一起，同时还无需任何内存分配。不仅仅如此，如果你需要同时运行多个 `Future` 或链式调用多个 `Future` ，也可以通过无内存分配的状态机实现，例如：

```rust
trait SimpleFuture {
    type Output;
    fn poll(&mut self, wake: fn()) -> Poll<Self::Output>;
}

enum Poll<T> {
    Ready(T),
    Pending,
}

/// 一个SimpleFuture，它会并发地运行两个Future直到它们完成
///
/// 之所以可以并发，是因为两个Future的轮询可以交替进行，一个阻塞，另一个就可以立刻执行，反之亦然
pub struct Join<FutureA, FutureB> {
    // 结构体的每个字段都包含一个Future，可以运行直到完成.
    // 等到Future完成后，字段会被设置为 `None`. 这样Future完成后，就不会再被轮询
    a: Option<FutureA>,
    b: Option<FutureB>,
}

impl<FutureA, FutureB> SimpleFuture for Join<FutureA, FutureB>
where
    FutureA: SimpleFuture<Output = ()>,
    FutureB: SimpleFuture<Output = ()>,
{
    type Output = ();
    fn poll(&mut self, wake: fn()) -> Poll<Self::Output> {
        // 尝试去完成一个 Future `a`
        if let Some(a) = &mut self.a {
            if let Poll::Ready(()) = a.poll(wake) {
                self.a.take();
            }
        }

        // 尝试去完成一个 Future `b`
        if let Some(b) = &mut self.b {
            if let Poll::Ready(()) = b.poll(wake) {
                self.b.take();
            }
        }

        if self.a.is_none() && self.b.is_none() {
            // 两个 Future都已完成 - 我们可以成功地返回了
            Poll::Ready(())
        } else {
            // 至少还有一个 Future 没有完成任务，因此返回 `Poll::Pending`.
            // 当该 Future 再次准备好时，通过调用`wake()`函数来继续执行
            Poll::Pending
        }
    }
}
```

这些例子展示了在不需要内存对象分配以及深层嵌套回调的情况下，该如何使用 Future 特征去表达异步控制流。 在了解了基础的控制流后，我们再来看看真实的 Future 特征有何不同之处:

```rust
trait Future {
    type Output;
    fn poll(
        // 首先值得注意的地方是，`self`的类型从`&mut self`变成了`Pin<&mut Self>`:
        self: Pin<&mut Self>,
        // 其次将`wake: fn()` 修改为 `cx: &mut Context<'_>`:
        cx: &mut Context<'_>,
    ) -> Poll<Self::Output>;
}
```

首先这里多了一个 `Pin` ，现在你只需要知道使用它可以创建一个无法被移动的 `Future` ，因为无法被移动，所以它将具有固定的内存地址，意味着我们可以存储它的指针(如果内存地址可能会变动，那存储指针地址将毫无意义！)，也意味着可以实现一个自引用数据结构: `struct MyFut { a: i32, ptr_to_a: *const i32 }`。 而对于 `async/await` 来说，`Pin` 是不可或缺的关键特性。

其次，从 `wake: fn()` 变成了 `&mut Context<'_>` 。意味着 wake 函数可以携带数据了，`Context` 类型也会通过提供一个 `Waker` 类型的值，就可以用来唤醒特定的的任务。

## 使用 Waker 来唤醒任务

对于 `Future` 来说，第一次被 `poll` 时无法完成任务是很正常的。但它需要确保在未来一旦准备好时，可以通知执行器再次对其进行 `poll` 进而继续往下执行，该通知就是通过 `Waker` 类型完成的。

`Waker` 提供了一个 `wake()` 方法可以用于告诉执行器：相关的任务可以被唤醒了，此时执行器就可以对相应的 `Future` 再次进行 `poll` 操作。

### 构建一个定时器

下面一起来实现一个简单的定时器 `Future` 。为了让例子尽量简单，当计时器创建时，我们会启动一个线程接着让该线程进入睡眠，等睡眠结束后再通知给 `Future`。

由于新建线程在睡眠结束后会需要将状态同步给定时器 `Future`，由于是多线程环境，所以需要使用 `Arc<Mutex<T>>` 来作为一个共享状态，用于在新线程和 `Future` 定时器间共享。

```rust
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll, Waker},
    thread,
    time::Duration,
};


/// 在Future和等待的线程间共享状态
struct SharedState {
    /// 定时(睡眠)是否结束
    completed: bool,

    /// 当睡眠结束后，线程可以用`waker`通知`TimerFuture`来唤醒任务
    waker: Option<Waker>,
}

pub struct TimerFuture {
    shared_state: Arc<Mutex<SharedState>>,
}


impl Future for TimerFuture {
    type Output = ();
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        // 通过检查共享状态，来确定定时器是否已经完成
        let mut shared_state = self.shared_state.lock().unwrap();
        if shared_state.completed {
            Poll::Ready(())
        } else {
            // 设置`waker`，这样新线程在睡眠(计时)结束后可以唤醒当前的任务，接着再次对`Future`进行`poll`操作,
            //
            // 下面的`clone`每次被`poll`时都会发生一次，实际上，应该是只`clone`一次更加合理。
            // 选择每次都`clone`的原因是： `TimerFuture`可以在执行器的不同任务间移动，如果只克隆一次，
            // 那么获取到的`waker`可能已经被篡改并指向了其它任务，最终导致执行器运行了错误的任务
            shared_state.waker = Some(cx.waker().clone());
            Poll::Pending
        }
    }
}
```

代码很简单，只要新线程设置了 `shared_state.completed = true` ，那任务就能顺利结束。如果没有设置，会为当前的任务克隆一份 `Waker` ，这样新线程就可以使用它来唤醒当前的任务。

最后，再来创建一个 API 用于构建定时器和启动计时线程:

```rust
impl TimerFuture {
    /// 创建一个新的`TimerFuture`，在指定的时间结束后，该`Future`可以完成
    pub fn new(duration: Duration) -> Self {
        let shared_state = Arc::new(Mutex::new(SharedState {
            completed: false,
            waker: None,
        }));

        // 创建新线程
        let thread_shared_state = shared_state.clone();
        thread::spawn(move || {
            // 睡眠指定时间实现计时功能
            thread::sleep(duration);
            let mut shared_state = thread_shared_state.lock().unwrap();
            // 通知执行器定时器已经完成，可以继续`poll`对应的`Future`了
            shared_state.completed = true;
            if let Some(waker) = shared_state.waker.take() {
                waker.wake()
            }
        });

        TimerFuture { shared_state }
    }
}
```

至此，一个简单的定时器 Future 就已创建成功，我们需要创建一个执行器，才能让程序动起来。

## 执行器 Executor

Rust 的 `Future` 是惰性的，其中一个推动它的方式就是在 `async` 函数中使用 `.await` 来调用另一个 `async` 函数，但是这个只能解决 `async` 内部的问题，在最外层的 async 函数，则需要执行器 `executor` 来进行推动了。

执行器会管理一批 `Future` (最外层的 `async` 函数)，然后通过不停地 `poll` 推动它们直到完成。 最开始，执行器会先 `poll` 一次 `Future` ，后面就不会主动去 `poll` 了，而是等待 `Future` 通过调用 `wake` 函数来通知它可以继续，它才会继续去 `poll` 。这种 `wake` 通知然后 `poll` 的方式会不断重复，直到 `Future` 完成。

### 构建执行器