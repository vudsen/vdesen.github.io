---
title: 包和模块
date: 2024-03-20 18:05:12
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

> 这一章很抽象，一定要自己多写，不然很难理解。

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

## 使用 use 导入模块

可以使用 `use` 关键字来简化导入：

```rust
// hosting.rs
use crate::product::provider;

pub fn add_to_waitlist() {}

pub fn seat_at_table() -> String {
    provider::give()
}
```

`use` 也可以直接导入函数：
```rust
// hosting.rs
use crate::product::provider::give;

pub fn add_to_waitlist() {}

pub fn seat_at_table() -> String {
    give()
}
```

## 限制可见性语法

- pub 意味着可见性无任何限制
- pub(crate) 表示在当前包可见
- pub(self) 在当前模块可见
- pub(super) 在父模块可见
- pub(in <path>) 表示在某个路径代表的模块中可见，其中 path 必须是父模块或者祖先模块

```rust
// 一个名为 `my_mod` 的模块
mod my_mod {
    // 模块中的项默认具有私有的可见性
    fn private_function() {
        println!("called `my_mod::private_function()`");
    }

    // 使用 `pub` 修饰语来改变默认可见性。
    pub fn function() {
        println!("called `my_mod::function()`");
    }

    // 在同一模块中，项可以访问其它项，即使它是私有的。
    pub fn indirect_access() {
        print!("called `my_mod::indirect_access()`, that\n> ");
        private_function();
    }

    // 模块也可以嵌套
    pub mod nested {
        pub fn function() {
            println!("called `my_mod::nested::function()`");
        }

        #[allow(dead_code)]
        fn private_function() {
            println!("called `my_mod::nested::private_function()`");
        }

        // 使用 `pub(in path)` 语法定义的函数只在给定的路径中可见。
        // `path` 必须是父模块（parent module）或祖先模块（ancestor module）
        pub(in crate::my_mod) fn public_function_in_my_mod() {
            print!("called `my_mod::nested::public_function_in_my_mod()`, that\n > ");
            public_function_in_nested()
        }

        // 使用 `pub(self)` 语法定义的函数则只在当前模块中可见。
        pub(self) fn public_function_in_nested() {
            println!("called `my_mod::nested::public_function_in_nested");
        }

        // 使用 `pub(super)` 语法定义的函数只在父模块中可见。
        pub(super) fn public_function_in_super_mod() {
            println!("called my_mod::nested::public_function_in_super_mod");
        }
    }

    pub fn call_public_function_in_my_mod() {
        print!("called `my_mod::call_public_funcion_in_my_mod()`, that\n> ");
        nested::public_function_in_my_mod();
        print!("> ");
        nested::public_function_in_super_mod();
    }

    // `pub(crate)` 使得函数只在当前包中可见
    pub(crate) fn public_function_in_crate() {
        println!("called `my_mod::public_function_in_crate()");
    }

    // 嵌套模块的可见性遵循相同的规则
    mod private_nested {
        #[allow(dead_code)]
        pub fn function() {
            println!("called `my_mod::private_nested::function()`");
        }
    }
}

fn function() {
    println!("called `function()`");
}

fn main() {
    // 模块机制消除了相同名字的项之间的歧义。
    function();
    my_mod::function();

    // 公有项，包括嵌套模块内的，都可以在父模块外部访问。
    my_mod::indirect_access();
    my_mod::nested::function();
    my_mod::call_public_function_in_my_mod();

    // pub(crate) 项可以在同一个 crate 中的任何地方访问
    my_mod::public_function_in_crate();

    // pub(in path) 项只能在指定的模块中访问
    // 报错！函数 `public_function_in_my_mod` 是私有的
    //my_mod::nested::public_function_in_my_mod();
    // 试一试 ^ 取消该行的注释

    // 模块的私有项不能直接访问，即便它是嵌套在公有模块内部的

    // 报错！`private_function` 是私有的
    //my_mod::private_function();
    // 试一试 ^ 取消此行注释

    // 报错！`private_function` 是私有的
    //my_mod::nested::private_function();
    // 试一试 ^ 取消此行的注释

    // 报错！ `private_nested` 是私有的
    //my_mod::private_nested::function();
    // 试一试 ^ 取消此行的注释
}
```