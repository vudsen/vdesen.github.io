---
title: 注释和文档
date: 2024-03-28 17:05:03
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---


在 Rust 中，注释分为三类：

- 代码注释，用于说明某一块代码的功能，读者往往是同一个项目的协作开发者
- 文档注释，支持 Markdown，对项目描述、公共 API 等用户关心的功能进行介绍，同时还能提供示例代码，目标读者往往是想要了解你项目的人
- 包和模块注释，严格来说这也是文档注释中的一种，它主要用于说明当前包和模块的功能，方便用户迅速了解一个项目

# 代码注释

行注释`//`:
```rust
fn main() {
    // 我是Sun...
    // face
    let name = "sunface";
    let age = 18; // 今年好像是18岁
}
```

当行数过多时，可以使用块注释`/* ... */`:

```rust
fn main() {
    /*
        我
        是
        S
        u
        n
        ... 哎，好长!
    */
    let name = "sunface";
    let age = "???"; // 今年其实。。。挺大了
}
```

# 文档注释

Rust 提供了 `cargo doc` 的命令，可以用于把这些文档注释转换成 HTML 网页文件，最终展示给用户浏览。

## 文档行注释 `///`

```rust
/// `add_one` 将指定值加1
///
/// # Examples
///
/// ```
/// let arg = 5;
/// let answer = my_crate::add_one(arg);
///
/// assert_eq!(6, answer);
/// ```
pub fn add_one(x: i32) -> i32 {
    x + 1
}
```

以上代码有几点需要注意：

- 文档注释需要位于 lib 类型的包中，例如 src/lib.rs 中
- 文档注释可以使用 markdown语法！例如 # Examples 的标题，以及代码块高亮
- 被注释的对象需要使用 pub 对外可见，记住：文档注释是给用户看的，内部实现细节不应该被暴露出去

## 文档块注释 `/** .. */`

与代码注释一样，文档也有块注释，当注释内容多时，使用块注释可以减少 `///` 的使用：

```rust
/** `add_two` 将指定值加2


```
let arg = 5;
let answer = my_crate::add_two(arg);

assert_eq!(7, answer);
```
*/
pub fn add_two(x: i32) -> i32 {
    x + 2
}
```

## 查看文档

编写完文档后，运行 `cargo doc` 可以直接生成 `HTML` 文件，默认在 *target/doc* 目录下。

也可以直接使用 `cargo doc --open` 命令，可以在文档生成后在浏览器中自动打开。

```rust
///
/// # 你好
///
/// 我是rust文档
///
/// #test
/// ```rust
/// hello_rust()
/// ```
pub fn hello_rust() {
    println!("hello rust!");
}
```

![rust-doc](https://selfb.asia/images/2024/03/PixPin_2024-03-28_17-37-46.webp)

除了 `#example` 外，还有一些常用的，你可以在项目中酌情使用：
- Panics：函数可能会出现的异常状况，这样调用函数的人就可以提前规避
- Errors：描述可能出现的错误及什么情况会导致错误，有助于调用者针对不同的错误采取不同的处理方式
- Safety：如果函数使用 unsafe 代码，那么调用者就需要注意一些使用条件，以确保 unsafe 代码块的正常工作

仅仅是一种代码风格，没有强制要求。

# 包和模块级别的注释

除了函数、结构体等 Rust 项的注释，还可以给包和模块添加注释，需要注意的是，**这些注释要添加到包、模块的最上方**！

包级别的注释也分为两种：行注释 `//!` 和块注释 `/*! ... */`。

```rust
/*! lib包是world_hello二进制包的依赖包，
 里面包含了compute等有用模块 */

pub mod compute;
```

# 文档测试 (Doc Test)

在 Rust 中，测试用例可以直接写在文档中！

```rust
/// `add_one` 将指定值加1
///
/// # Examples11
///
/// ```
/// let arg = 5;
/// let answer = world_hello::compute::add_one(arg);
///
/// assert_eq!(6, answer);
/// ```
pub fn add_one(x: i32) -> i32 {
    x + 1
}
```

以上的注释不仅仅是文档，还可以作为单元测试的用例运行，使用 cargo test 运行测试：

```rust
Doc-tests world_hello

running 2 tests
test src/compute.rs - compute::add_one (line 8) ... ok
test src/compute.rs - compute::add_two (line 22) ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.00s
```

可以看到，文档中的测试用例被完美运行，而且输出中也明确提示了 `Doc-tests world_hello`，意味着这些测试的名字叫 `Doc test` 文档测试。

## 期望 panic 的测试用例

若某个测试用例期望调用能够 `panic`，则需要加上`should_panic`来控制：

```rust
/// # Panics
///
/// The function panics if the second argument is zero.
///
/// ```rust,should_panic
/// // panics on division by zero
/// world_hello::compute::div(10, 0);
/// ```
pub fn div(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("Divide-by-zero error");
    }

    a / b
}
```

## 保留测试，隐藏文档

在某些时候，我们希望保留文档测试的功能，但是又要将某些测试用例的内容从文档中隐藏起来（例如只关心输入，不关心细节和输出）：

```rust
/// ```
/// # // 使用#开头的行会在文档中被隐藏起来，但是依然会在文档测试中运行
/// # fn try_main() -> Result<(), String> {
/// let res = world_hello::compute::try_div(10, 0)?;
/// # Ok(()) // returning from try_main
/// # }
/// # fn main() {
/// #    try_main().unwrap();
/// #
/// # }
/// ```
pub fn try_div(a: i32, b: i32) -> Result<i32, String> {
    if b == 0 {
        Err(String::from("Divide-by-zero"))
    } else {
        Ok(a / b)
    }
}
```

用户在文档中只能看到相关的输入，无法看到其它的细节：
![input-only!](https://selfb.asia/images/2024/03/v2-d1b98f5e70b7f8c8fb9aecce325dba0e_1440w.webp)

# 代码跳转

Rust 在文档注释中还提供了一个非常强大的功能，那就是可以实现对外部项的链接。

跳转到标准库：

```rust
/// `add_one` 返回一个[`Option`]类型
pub fn add_one(x: i32) -> Option<i32> {
    Some(x + 1)
}
```

此处的 [\`Option\`] 就是一个链接，指向了标准库中的 `Option` 枚举类型。

也可以使用完整路径跳转到任意项：
```rust
// lib.rs
pub mod a {
    /// `add_one` 返回一个[`Option`]类型
    /// 跳转到[`crate::MySpecialFormatter`]
    pub fn add_one(x: i32) -> Option<i32> {
        Some(x + 1)
    }
}

pub struct MySpecialFormatter;
```

## 同名项的跳转

如果遇到同名项，可以使用标示类型的方式进行跳转：

```rust
/// 跳转到结构体  [`Foo`](struct@Foo)
pub struct Bar;

/// 跳转到同名函数 [`Foo`](fn@Foo)
pub struct Foo {}

/// 跳转到同名宏 [`foo!`]
pub fn Foo() {}

#[macro_export]
macro_rules! foo {
  () => {}
}
```

# 文档搜索别名

Rust 文档支持搜索功能，可以给自己的结构添加别名来方便搜索：

```rust
#[doc(alias = "x")]
#[doc(alias = "big")]
pub struct BigX;

#[doc(alias("y", "big"))]
pub struct BigY;
```