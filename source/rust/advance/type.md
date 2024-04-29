---
title: 深入类型
date: 2024-04-23 16:48:47
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 类型转换

## as 转换

先来看一段代码：

```rust
fn main() {
  let a: i32 = 10;
  let b: u16 = 100;

  if a < b {
    println!("Ten is less than one hundred.");
  }
}
```

这段代码很明显会报错，因为 `a` 和 `b` 拥有不同的类型，Rust 不允许两种不同的类型进行比较。

解决办法很简单，只要把 `b` 转换成 `i32` `类型即可，Rust` 中内置了一些基本类型之间的转换，这里使用 `as` 操作符来完成： `if a < (b as i32) {...}`。

从较小的类型转换成较大的类型没有任何问题，但是从较大的类型转换成较小的类型就需要注意了，转换时可能会造成数据丢失：

```rust
fn main() {
    let val:u32 = 0b11111111_11111111_11111111_11111111;

    println!("binary = {:#b}, value = {0}", val);

    let val:u8 = val as u8;

    println!("binary = {:#b}, value = {0}", val);
}
```

输出：

```bash
binary = 0b11111111111111111111111111111111, value = 4294967295
binary = 0b11111111, value = 255
```

下面是常用的转换形式：

```rust
fn main() {
   let a = 3.1 as i8;
   let b = 100_i8 as i32;
   let c = 'a' as u8; // 将字符'a'转换为整数，97

   println!("{},{},{}",a,b,c)
}
```

## TryInto 转换

在一些场景中，使用 `as` 关键字会有比较大的限制。如果想要在类型转换上拥有完全的控制而不依赖内置的转换，例如处理转换错误，那么可以使用 `TryInto` ：

```rust
fn main() {
   let a: u8 = 10;
   let b: u16 = 1500;

   let b_: u8 = b.try_into().unwrap();

   if a < b_ {
     println!("Ten is less than one hundred.");
   }
}
```

> `std::convert::TryInto` 特征已经被 `std::prelude` 提前引入，因此不需要手动导入。

这里的代码实际上最终会 panic 掉，因为 `1500` 对于 `u8` 来说太大了，转换会导致溢出，因此直接 `unwrap` 会报错。

## 通用类型转换

首先，在匹配特征时，不会做任何强制转换(除了方法)。一个类型 `T` 可以强制转换为 `U`，不代表 `impl T` 可以强制转换为 `impl U`，例如下面的代码就无法通过编译检查：

```rust
trait Trait {}

fn foo<X: Trait>(t: X) {}

impl<'a> Trait for &'a i32 {}

fn main() {
    let t: &mut i32 = &mut 0;
    foo(t);
}
```

报错如下：

```bash
error[E0277]: the trait bound `&mut i32: Trait` is not satisfied
--> src/main.rs:9:9
|
9 |     foo(t);
|         ^ the trait `Trait` is not implemented for `&mut i32`
|
= help: the following implementations were found:
        <&'a i32 as Trait>
= note: `Trait` is implemented for `&i32`, but not for `&mut i32`
```

`&i32` 实现了特征 `Trait`， `&mut i32` 可以转换为 `&i32`，但是 `&mut i32` 依然无法作为 `Trait` 来使用。

### 点操作符

方法调用的点操作符看起来简单，实际上非常不简单，它在调用时，会发生很多魔法般的类型转换，例如：自动引用、自动解引用，强制类型转换直到类型能匹配等。

