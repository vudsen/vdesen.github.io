---
title: 全局变量
date: 2024-06-02 17:45:24
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 全局变量

## 编译期初始化

### 静态常量

全局常量可以在程序任何一部分使用，当然，如果它是定义在某个模块中，你需要引入对应的模块才能使用。常量，顾名思义它是不可变的，很适合用作静态配置：

```rust
const MAX_ID: usize = usize::MAX / 2;
fn main() {
   println!("用户ID允许的最大值是{}",MAX_ID);
}
```

常量与普通变量的区别

- 关键字是 `const` 而不是 `let`
- 定义常量必须指明类型（如 `i32`）不能省略
- 定义常量时变量的命名规则一般是全部大写
- 常量可以在任意作用域进行定义，其生命周期贯穿整个程序的生命周期。编译时编译器会尽可能将其内联到代码中，所以在不同地方对同一常量的引用并不能保证引用到相同的内存地址
- 常量的赋值只能是常量表达式/数学表达式，也就是说必须是在编译期就能计算出的值，如果需要在运行时才能得出结果的值比如函数，则不能赋值给常量表达式
- 对于变量出现重复的定义(绑定)会发生变量遮盖，后面定义的变量会遮住前面定义的变量，常量则不允许出现重复的定义

### 静态变量

静态变量允许声明一个全局的变量，常用于全局数据统计，例如我们希望用一个变量来统计程序当前的总请求数：

```rust
static mut REQUEST_RECV: usize = 0;
fn main() {
   unsafe {
        REQUEST_RECV += 1;
        assert_eq!(REQUEST_RECV, 1);
   }
}
```

Rust 要求必须使用 `unsafe` 语句块才能访问和修改 `static` 变量，因为这种使用方式往往并不安全，当在多线程中同时去修改时，会不可避免的遇到脏数据。

只有在同一线程内或者不在乎数据的准确性时，才应该使用全局静态变量。

静态变量和常量的区别

- 静态变量不会被内联，在整个程序中，静态变量只有一个实例，所有的引用都会指向同一个地址
- 存储在静态变量中的值必须要实现 `Sync` trait

### 原子类型

想要全局计数器、状态控制等功能，又想要线程安全的实现，原子类型是非常好的办法:

```rust
use std::sync::atomic::{AtomicUsize, Ordering};
static REQUEST_RECV: AtomicUsize  = AtomicUsize::new(0);
fn main() {
    for _ in 0..100 {
        REQUEST_RECV.fetch_add(1, Ordering::Relaxed);
    }

    println!("当前用户请求数{:?}",REQUEST_RECV);
}
```

## 运行期初始化


以上的静态初始化有一个致命的问题：无法用函数进行静态初始化，例如如果想声明一个全局的 `Mutex` 锁：

```rust
use std::sync::Mutex;
static NAMES: Mutex<String> = Mutex::new(String::from("Sunface, Jack, Allen"));

fn main() {
    let v = NAMES.lock().unwrap();
    println!("{}",v);
}
```

运行后报错如下：

```log
error[E0015]: calls in statics are limited to constant functions, tuple structs and tuple variants
 --> src/main.rs:3:42
  |
3 | static NAMES: Mutex<String> = Mutex::new(String::from("sunface"));
```

因为无法直接初始化 `String` 对象，因此在这里无法创建。但是在 Rust 中，也提供了解决的方法。

### lazy_static

[lazy_static](https://github.com/rust-lang-nursery/lazy-static.rs) 是社区提供的非常强大的宏，用于懒初始化静态变量，之前的静态变量都是在编译期初始化的，因此无法使用函数调用进行赋值，而 `lazy_static` 允许我们在运行期初始化静态变量！

```rust
use std::sync::Mutex;
use lazy_static::lazy_static;
lazy_static! {
    static ref NAMES: Mutex<String> = Mutex::new(String::from("Sunface, Jack, Allen"));
}

fn main() {
    let mut v = NAMES.lock().unwrap();
    v.push_str(", Myth");
    println!("{}",v);
}
```

`lazy_static` 在每次访问静态变量时，会有轻微的性能损失，因为其内部实现用了一个底层的并发原语 `std::sync::Once`，在每次访问该变量时，程序都会执行一次原子指令用于确认静态变量的初始化是否完成。

`lazy_static` 宏，匹配的是 `static ref`，所以定义的静态变量都是不可变引用。

使用 `lazy_static` 实现全局缓存：

```rust
use lazy_static::lazy_static;
use std::collections::HashMap;

lazy_static! {
    static ref HASHMAP: HashMap<u32, &'static str> = {
        let mut m = HashMap::new();
        m.insert(0, "foo");
        m.insert(1, "bar");
        m.insert(2, "baz");
        m
    };
}

fn main() {
    // 首次访问`HASHMAP`的同时对其进行初始化
    println!("The entry for `0` is \"{}\".", HASHMAP.get(&0).unwrap());

    // 后续的访问仅仅获取值，再不会进行任何初始化操作
    println!("The entry for `1` is \"{}\".", HASHMAP.get(&1).unwrap());
}
```

### OnceLock

现在可以直接使用标准库中的 `OnceLock` 来实现 `lazy_static` 库的功能：

```rust
use std::collections::HashMap;
use std::sync::OnceLock;

fn hashmap() -> &'static HashMap<u32, &'static str> {
    static HASHMAP: OnceLock<HashMap<u32, &str>> = OnceLock::new();
    HASHMAP.get_or_init(|| {
        let mut m = HashMap::new();
        m.insert(0, "foo");
        m.insert(1, "bar");
        m.insert(2, "baz");
        m
    })
}

fn main() {
    // First access to `HASHMAP` initializes it
    println!("The entry for `0` is \"{}\".", hashmap().get(&0).unwrap());

    // Any further access to `HASHMAP` just returns the computed value
    println!("The entry for `1` is \"{}\".", hashmap().get(&1).unwrap());
}
```

### Box::leak

下面一段代码，将会创建一个全局静态变量，然后在主线程中进行初始化：

```rust
#[derive(Debug)]
struct Config {
    a: String,
    b: String,
}
static mut CONFIG: Option<&mut Config> = None;

fn main() {
    unsafe {
        CONFIG = Some(&mut Config {
            a: "A".to_string(),
            b: "B".to_string(),
        });

        println!("{:?}", CONFIG)
    }
}
```

但是在运行后会报错：

```log
error[E0716]: temporary value dropped while borrowed
  --> src/main.rs:10:28
   |
10 |            CONFIG = Some(&mut Config {
   |   _________-__________________^
   |  |_________|
   | ||
11 | ||             a: "A".to_string(),
12 | ||             b: "B".to_string(),
13 | ||         });
   | ||         ^-- temporary value is freed at the end of this statement
   | ||_________||
   |  |_________|assignment requires that borrow lasts for `'static`
   |            creates a temporary which is freed while still in use
```

原因是在 `unsafe` 块中创建的对象生命周期没有那么大，如果想要赋给 `CONFIG`，至少需要 `'static` 的生命周期。

好在Rust为提供了 `Box::leak` 方法，它可以将一个变量从内存中泄漏，然后将其变为 `'static` 生命周期，最终该变量将和程序活得一样久，因此可以赋值给全局静态变量 `CONFIG`。

```rust
#[derive(Debug)]
struct Config {
    a: String,
    b: String
}
static mut CONFIG: Option<&mut Config> = None;

fn main() {
    let c = Box::new(Config {
        a: "A".to_string(),
        b: "B".to_string(),
    });

    unsafe {
        // 将`c`从内存中泄漏，变成`'static`生命周期
        CONFIG = Some(Box::leak(c));
        println!("{:?}", CONFIG);
    }
}
```

### 标准库中的 OnceCell

在 `Rust` 标准库中提供了 `cell::OnceCell` 和 `sync::OnceLock`，前者用于单线程，后者用于多线程，它们用来存储堆上的信息，并且具有最多只能赋值一次的特性。

例如实现一个多线程的日志组件`Logger`:

```rust
use std::{sync::OnceLock, thread};

fn main() {
    // 子线程中调用
    let handle = thread::spawn(|| {
        let logger = Logger::global();
        logger.log("thread message".to_string());
    });

    // 主线程调用
    let logger = Logger::global();
    logger.log("some message".to_string());

    let logger2 = Logger::global();
    logger2.log("other message".to_string());

    handle.join().unwrap();
}

#[derive(Debug)]
struct Logger;

static LOGGER: OnceLock<Logger> = OnceLock::new();

impl Logger {
    fn global() -> &'static Logger {
        // 获取或初始化 Logger
        LOGGER.get_or_init(|| {
            println!("Logger is being created..."); // 初始化打印
            Logger
        })
    }

    fn log(&self, message: String) {
        println!("{}", message)
    }
}
```