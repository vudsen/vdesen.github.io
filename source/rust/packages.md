---
title: 包和模块
date: 2024-03-20 18:05:12
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/Rust/" }
---


# Package 和 Crate

> crate！我第一眼看成了 create...

`crate`(箱) 是 Rust 的最小编译单元，一个 `package` 中包含一个活多个 `crate`，`crate`可以是一个二进制项目，或者一个库。

`package`(包) 是由 `Cargo.toml` 文件定义的，它包含了项目的元数据（如名称、版本、作者等）以及项目的依赖配置。

## 典型的 Package 结构

```text
.
├── Cargo.toml
├── Cargo.lock
├── src
│   ├── main.rs
│   ├── lib.rs
│   └── bin
│       └── main1.rs
│       └── main2.rs
├── tests
│   └── some_integration_tests.rs
├── benches
│   └── simple_bench.rs
└── examples
    └── simple_example.rs
```
在一个系统中：
- 只能包含0或1个类库箱(library crates)
- 可以包含任意多个二进制箱(binary crates)
- 至少有一个箱(Crate), 可以是类库箱(library crates), 也可以是二进制箱(binary crates)

# 模块 Module

[【翻译】关于Rust模块系统的清晰解释](https://zhuanlan.zhihu.com/p/164556350)。

首先上面的博客中，最重要的一点：**我们需要显式地在Rust中构建模块树——在文件系统树和模块树之间不存在隐式的转换。**

什么意思呢？比如你在 Java 中定义了一个类：`abc.xyz.Hello`，然后你在该项目的任何地方都能够直接使用`abc.xyz.Hello`，你不用去哪里声明我这里有这样一个类。

而在 `rust` 中，**必须在 `crate` 入口文件中使用 `mod 模块名` 来手动导入模块**。

例如在下面的文件结构中：
```text
project
└── src
    ├── front_of_house
    │   ├── mod.rs
    │   └── hosting.rs
    ├── product
    │   ├── mod.rs
    │   └── provider.rs
    └── main.rs
```

```rust
// main.rs
mod front_of_house;
// 尝试不导入 product
// mod product;

fn main() {
    print("{}", front_of_house::hosting::seat_at_table());
}
```

```rust
// hosting.rs
pub fn add_to_waitlist() {}

pub fn seat_at_table() -> String {
    crate::product::provider::give()
}
```

```rust
// provider.rs
pub fn give() -> String {
    String::from("eeee")
}
```

如果在 `main.rs` 中不写`mod product;`，则会报这样的错：
```log
   Compiling hello-world v0.1.0 (/workspace/hello-world)
error[E0433]: failed to resolve: could not find `product` in the crate root
 --> src/front_of_house/hosting.rs:4:12
  |
4 |     crate::product::provider::give()
  |            ^^^^^^^ could not find `product` in the crate root

For more information about this error, try `rustc --explain E0433`.
error: could not compile `hello-world` (bin "hello-world") due to previous error
```

只有添加上 `mod product;` 才能成功运行。


## 使用相对路径导入模块

除了使用 `crate` 作为根路径以绝对路径的方式来导入模块外，还可以使用 `self` 或 `super` 以相对路径的方式导入模块。

- `self` 类似于路径中的 `./`
- `super` 类似路径中的 `../`
