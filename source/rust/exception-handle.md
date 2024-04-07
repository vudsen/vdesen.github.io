---
title: 返回值和错误处理
date: 2024-03-15 17:05:24
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---


# panic

当出现 panic! 时，程序提供了两种方式来处理终止流程：**栈展开**和**直接终止**。

其中，默认的方式就是 `栈展开`，这意味着 Rust 会回溯栈上数据和函数调用，因此也意味着更多的善后工作，好处是可以给出充分的报错信息和栈调用信息，便于事后的问题复盘。`直接终止`，顾名思义，不清理数据就直接退出程序，善后工作交与操作系统来负责。

使用`直接终止`的方式可以减少发行包的大小。

**当线程 panic 后，只有对应的线程会退出，并不会影响到主线程**。

## 触发方式

### 被动触发

先来看一段简单又熟悉的代码:

```rust
fn main() {
    let v = vec![1, 2, 3];

    v[99];
}
```

该代码发生了数组越界异常，因此在运行后会报错：
```bash
$ cargo run
   Compiling panic v0.1.0 (file:///projects/panic)
    Finished dev [unoptimized + debuginfo] target(s) in 0.27s
     Running `target/debug/panic`
thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 99', src/main.rs:4:5
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

### 主动触发

使用 `panic!` 宏可以主动触发。当调用执行该宏时，程序会打印出一个错误信息，展开报错点往前的函数调用堆栈，最后退出程序。

```rust
fn main() {
    panic!("crash and burn");
}
```

运行后输出：
```bash
thread 'main' panicked at 'crash and burn', src/main.rs:2:5
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

## backtrace 栈展开


在真实场景中，错误往往涉及到很长的调用链甚至会深入第三方库，如果没有栈展开技术，错误将难以跟踪处理。

例如下面的代码：

```rust
fn main() {
    let v = vec![1, 2, 3];

    hello(&v);
}

fn hello(val: &Vec<i32>) {
    val[99];
}
```

运行后报错信息：
```bash
thread 'main' panicked at src/main.rs:8:8:
index out of bounds: the len is 3 but the index is 99
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

可以发现报错信息中只提供了行数，并没有给出具体的调用栈。

如果需要知到详细的调用栈，则需要按照提示，添加环境变量使用`RUST_BACKTRACE=1 cargo run`或者`$env:RUST_BACKTRACE=1 ; cargo run`来运行程序：

```bash
thread 'main' panicked at src/main.rs:8:8:
index out of bounds: the len is 3 but the index is 99
stack backtrace:
   0: rust_begin_unwind
             at /rustc/07dca489ac2d933c78d3c5158e3f43beefeb02ce/library/std/src/panicking.rs:645:5
   1: core::panicking::panic_fmt
             at /rustc/07dca489ac2d933c78d3c5158e3f43beefeb02ce/library/core/src/panicking.rs:72:14
   2: core::panicking::panic_bounds_check
             at /rustc/07dca489ac2d933c78d3c5158e3f43beefeb02ce/library/core/src/panicking.rs:208:5
   3: <usize as core::slice::index::SliceIndex<[T]>>::index
             at /rustc/07dca489ac2d933c78d3c5158e3f43beefeb02ce/library/core/src/slice/index.rs:255:10
   4: core::slice::index::<impl core::ops::index::Index<I> for [T]>::index
             at /rustc/07dca489ac2d933c78d3c5158e3f43beefeb02ce/library/core/src/slice/index.rs:18:9
   5: <alloc::vec::Vec<T,A> as core::ops::index::Index<I>>::index
             at /rustc/07dca489ac2d933c78d3c5158e3f43beefeb02ce/library/alloc/src/vec/mod.rs:2770:9
   6: playground::hello
             at ./src/main.rs:8:8
   7: playground::main
             at ./src/main.rs:4:5
   8: core::ops::function::FnOnce::call_once
             at /rustc/07dca489ac2d933c78d3c5158e3f43beefeb02ce/library/core/src/ops/function.rs:250:5
note: Some details are omitted, run with `RUST_BACKTRACE=full` for a verbose backtrace.
```

上面的代码就是一次栈展开(也称栈回溯)，它包含了函数调用的顺序，要获取到栈回溯信息，还需要开启 `debug` 标志，该标志在使用 `cargo run` 或者 `cargo build` 时自动开启（这两个操作默认是 `Debug` 运行方式）

# 可恢复的错误 Result

可恢复的错误一般用 `Result<T, E>`，定义如下：
```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

泛型参数 `T` 代表成功时存入的正确值的类型，存放方式是 `Ok(T)`，`E` 代表错误时存入的错误值，存放方式是 `Err(E)`。

例如下面的代码：
```rust
use std::fs::File;

fn main() {
    let f: Result<std::fs::File, std::io::Error> = File::open("hello.txt");

    let f = match f {
        Ok(file) => file,
        Err(error) => {
            panic!("Problem opening the file: {:?}", error)
        },
    };
}
```

代码中对打开文件后的 `Result<T, E>` 类型进行匹配取值，如果是成功，则将 `Ok(file)` 中存放的的文件句柄 `file` 赋值给 `f`，如果失败，则将 `Err(error)` 中存放的错误信息 `error` 使用 `panic` 抛出来，进而结束程序。

## 对错误的返回进行处理

我们还可以对预期中的错误进行处理以保证程序正常运行：
```rust
use std::fs::File;
use std::io::ErrorKind;

fn main() {
    let f = File::open("hello.txt");

    let f = match f {
        Ok(file) => file,
        Err(error) => match error.kind() {
            ErrorKind::NotFound => match File::create("hello.txt") {
                Ok(fc) => fc,
                Err(e) => panic!("Problem creating the file: {:?}", e),
            },
            other_error => panic!("Problem opening the file: {:?}", other_error),
        },
    };
}
```

上面代码在匹配出 `error` 后，又对 `error` 进行了详细的匹配解析，最终结果：

- 如果是文件不存在错误 `ErrorKind::NotFound`，就创建文件，这里创建文件 `File::create` 也是返回 `Result`，因此继续用 `match` 对其结果进行处理：创建成功，将新的文件句柄赋值给 `f`，如果失败，则 `panic`
- 剩下的错误，一律 `panic`

## unwrap 和 expect

某些情况下，我们确信某些操作并不会发生`Error`，而且也并不想去写 `match` 来处理 `Error`，那么就可以直接使用 `unwrap` 来直接将 `Ok(T)` 中的值取出来：

```rust
use std::fs::File;

fn main() {
    let f = File::open("hello.txt").unwrap();
}
```

如果真的发生了 `Error`，那么程序将会直接 `panic`。

`expect` 和 `unwrap` 类似，但是 `expect` 可以让我们带上自定义的错误提示信息：
```rust
use std::fs::File;

fn main() {
    let f = File::open("hello.txt").expect("Failed to open hello.txt");
}
```

## 错误传播

如果当前代码*不知道怎么处理*或者*不需要处理*某次调用发生的错误，那么它可以考虑直接将错误传递给上层的调用函数。

例如以下函数从文件中读取用户名，然后将结果进行返回：

```rust
use std::fs::File;
use std::io::{self, Read};

fn read_username_from_file() -> Result<String, io::Error> {
    // 打开文件，f是`Result<文件句柄,io::Error>`
    let f = File::open("hello.txt");

    let mut f = match f {
        // 打开文件成功，将file句柄赋值给f
        Ok(file) => file,
        // 打开文件失败，将错误返回(向上传播)
        Err(e) => return Err(e),
    };
    // 创建动态字符串s
    let mut s = String::new();
    // 从f文件句柄读取数据并写入s中
    match f.read_to_string(&mut s) {
        // 读取成功，返回Ok封装的字符串
        Ok(_) => Ok(s),
        // 将错误向上传播
        Err(e) => Err(e),
    }
}
```

有几点需要注意：
- 该函数返回一个 `Result<String, io::Error>` 类型，当读取用户名成功时，返回 `Ok(String)`，失败时，返回 `Err(io:Error)`
- `File::open` 和 `f.read_to_string` 返回的 `Result<T, E>` 中的 `E` 就是 `io::Error`

由此可见，该函数将 `io::Error` 的错误往上进行传播，该函数的调用者最终会对 `Result<String,io::Error>` 进行再处理，至于怎么处理就是调用者的事，如果是错误，它可以选择继续向上传播错误，也可以直接 `panic`。

## ? 宏

```rust
use std::fs::File;
use std::io;
use std::io::Read;

fn read_username_from_file() -> Result<String, io::Error> {
    let mut f = File::open("hello.txt")?;
    let mut s = String::new();
    f.read_to_string(&mut s)?;
    Ok(s)
}
```

`?`与`unwarp`类似，但是在发生错误时并不会 `panic`，而是将错误向上传递。

### 自动类型转换

`?` 还能够做到自动类型转换，其原理就是实现了 `From` 特征。

```rust
fn open_file() -> Result<File, Box<dyn std::error::Error>> {
    let mut f = File::open("hello.txt")?;
    Ok(f)
}
```

可以发现，上面的`?`宏直接帮我们把 `std::io::Error` 转换成 `Box<dyn std::error::Error>` 传递出去了。

### 链式调用

`?` 还能实现链式调用：

```rust
use std::fs::File;
use std::io;
use std::io::Read;

fn read_username_from_file() -> Result<String, io::Error> {
    let mut s = String::new();

    File::open("hello.txt")?.read_to_string(&mut s)?;

    Ok(s)
}
```

### 用于 Option 的返回


```rust
fn first(arr: &[i32]) -> Option<&i32> {
   let v = arr.get(0)?;
   Some(v)
}
```

在上面的代码中，如果 `arr.get(0)` 不为 `None`，则会把得到的值赋给 `v`，如果为 `None`，则函数直接返回一个`None`，不走后面的逻辑。

如果在返回值中可能存在错误，则可以省略`?`：
```rust
fn add_two(n_str: &str) -> Result<i32, ParseIntError> {
    //  n_str.parse::<i32>()?.map(|i| i + 2)
    n_str.parse::<i32>().map(|i| i + 2)
}
```


## and_then 和 map

`Result`有两个常用方法：[and_then](https://doc.rust-lang.org/stable/std/result/enum.Result.html#method.and_then)和[map](https://doc.rust-lang.org/stable/std/result/enum.Result.html#method.map)。

例如下面的函数是将传入的字符串解析为数字后，将值加2返回：
```rust
fn add_two(n_str: &str) -> Result<i32, ParseIntError> {
   n_str.parse::<i32>().map(|num| num +2)
}
```

可以发现`map`能直接获取到 Ok 中的值，如果失败，则会直接返回对应的 `Error`。

`and_then`与`map`相似，但一般用于嵌套调用：
```rust
fn multiply1(n1_str: &str, n2_str: &str) -> Result<i32, ParseIntError> {
    n1_str.parse::<i32>().and_then(| n1 | {
        n2_str.parse::<i32>().map(| n2 | n2 * n1)
    })
}
```

上面的函数的作用是将两个数字字符串相乘。