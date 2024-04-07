---
title: 方法 Method
date: 2024-01-12 22:27:54
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 1. 定义方法

Rust 使用 impl 来定义方法，例如以下代码：
```rust
struct Circle {
    x: f64,
    y: f64,
    radius: f64,
}

impl Circle {
    // new是Circle的关联函数，因为它的第一个参数不是self，且new并不是关键字
    // 这种方法往往用于初始化当前结构体的实例
    fn new(x: f64, y: f64, radius: f64) -> Circle {
        Circle {
            x: x,
            y: y,
            radius: radius,
        }
    }

    // Circle的方法，&self表示借用当前的Circle结构体
    fn area(&self) -> f64 {
        std::f64::consts::PI * (self.radius * self.radius)
    }
}
```

Rust和其它语言，例如Java中的类不同的是，`impl`只能用来定义方法，里面不能包括属性，而Java中的类既可以有方法，也可以有属性。
如果需要使用属性，需要搭配结构体使用。

如果`impl`和`struct`的名称相同，则两者会被视作同一个：
```rust
#[derive(Debug)]
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height
    }
}

fn main() {
    let rect1 = Rectangle { width: 30, height: 50 };

    println!(
        "The area of the rectangle is {} square pixels.",
        rect1.area()
    );
}
```

## self、&self和&mut self

在上面 `area`` 的签名中，我们使用 `&self` 替代 `rectangle: &Rectangle`，`&self` 其实是 `self: &Self` 的简写（注意大小写）。在一个 `impl` 块内，`Self` 指代被实现方法的结构体类型，`self` 指代此类型的实例，换句话说，`self` 指代的是 `Rectangle` 结构体实例，这样的写法会让我们的代码简洁很多，而且非常便于理解：我们为哪个结构体实现方法，那么 `self` 就是指代哪个结构体的实例。

需要注意的是，self 依然有所有权的概念：

- self 表示 Rectangle 的所有权转移到该方法中，这种形式用的较少
- &self 表示该方法对 Rectangle 的不可变借用
- &mut self 表示可变借用


# 2. 关联函数

参数中不包含 `self` 的函数就是关联函数，注意是函数而不是方法。

```rust
impl Rectangle {
    fn new(w: u32, h: u32) -> Rectangle {
        Rectangle { width: w, height: h }
    }
}
```

在Rust中，并没有构造器的概念，也就是说构造一个对象并不一定需要调用`new`方法，而`new`方法在语法层面也并不代表构造器，只是一个
约定俗成的规则，Rust里使用new作为构造器的名称。

因为是函数，所以不能用`.`来调用，只能通过`::`来调用，例如`String::from`。

# 3. 多个impl定义

Rust 允许我们为一个结构体定义多个 impl 块，目的是提供更多的灵活性和代码组织性，例如当方法多了后，可以把相关的方法组织在同一个 impl 块中，那么就可以形成多个 impl 块，各自完成一块儿目标：

```rust
impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height
    }
}

impl Rectangle {
    fn can_hold(&self, other: &Rectangle) -> bool {
        self.width > other.width && self.height > other.height
    }
}
```

# 4. 为枚举实现方法

枚举类型之所以强大，不仅仅在于它好用、可以同一化类型，还在于，我们可以像结构体一样，为枚举实现方法：
```rust
#![allow(unused)]
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(i32, i32, i32),
}

impl Message {
    fn call(&self) {
        // 在这里定义方法体
    }
}

fn main() {
    let m = Message::Write(String::from("hello"));
    m.call();
}
```
