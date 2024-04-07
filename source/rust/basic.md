---
title: Rust基础
date: 2023-12-04 09:48:25
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 数值类型

| 长度       | 有符号类型 | 无符号类型 |
| ---------- | ---------- | ---------- |
| 8位        | i8         | u8         |
| 16位       | i16        | u16        |
| 32位       | i32        | u32        |
| 64位       | i64        | u64        |
| 128位      | i128       | u128       |
| 视架构而定 | isize      | usize      |


声明数值类型时，如果不提供类型，整型默认使用`i32`

## 整型溢出

在 debug 模式编译时，Rust 会检查整型溢出，若存在这些问题，则使程序在编译时崩溃。在当使用 `--release` 参数进行 release 模式构建时，Rust 不检测溢出。当检测到整型溢出时，Rust 会按照补码循环溢出的规则处理。

要显式处理可能的溢出，可以使用标准库针对原始数字类型提供的这些方法：

- 使用 `wrapping_*` 方法在所有模式下都按照补码循环溢出规则处理，例如 `wrapping_add`
- 如果使用 `checked_*` 方法时发生溢出，则返回 `None` 值
- 使用 `overflowing_*` 方法返回该值和一个指示是否存在溢出的布尔值
- 使用 `saturating_*` 方法使值达到最小值或最大值

# 浮点类型

rust只有两种浮点类型：`f32`和`f64`，默认是`f64`。

应该尽量避免比较浮点型：

```rust
fn main() {
  // 断言0.1 + 0.2与0.3相等
  assert!(0.1 + 0.2 == 0.3);
}
```

该代码的断言为否，会导致程序失败。

若需要比较，可以考虑使用如下方式：

```rust
fn main() {
  assert!((0.1_f64 + 0.2 - 0.3).abs() < 0.00001);
}
```

## NaN

Rust 的浮点数类型使用 `NaN` (not a number)来处理数学上未定义的结果。

**所有跟 `NaN` 交互的操作，都会返回一个 `NaN`**，而且 `NaN` 不能用来比较。

可以使用`is_nan()`方法来判断一个数值是否为nan：

```rust
fn main() {
    let x = (-42.0_f32).sqrt();
    if x.is_nan() {
        println!("未定义的数学行为")
    }
}
```

# 字符、布尔、单元类型

```rust
// 字符
let c = 'z';
let z = 'ℤ';
let g = '国';
let heart_eyed_cat = '😻';

// 布尔
let t = true;
let f: bool = false;
```



单元类型就是 `()`，可以理解为`void`，例如main函数的返回值就是单元类型`()`，单元类型的优势是它完全不占用任何内存，可以当做一个占位符使用。

# 函数

基本格式：
```rust
fn add(i: i32, j: i32) -> i32 {
  // 这里没有用分号结尾。
  i + j
}

fn add(i: i32, j: i32) -> i32 {
  return i + j;
}
```

- 函数名和变量名使用蛇形命名法(snake case)，例如 fn add_two() -> {}
- 函数的位置可以随便放，Rust 不关心我们在哪里定义了函数，只要有定义即可
- 每个函数参数都需要标注类型

## 发散函数

当用 ! 作函数返回类型的时候，表示该函数永不返回( diverge function )，特别的，这种语法往往用做会导致程序崩溃的函数：

```rust
fn main() {
    println!("Hello, world!");
    dead_end();
}

fn dead_end() -> i32 {
  panic!("你已经到了穷途末路，崩溃吧！");
}
```

可以注意到这里我们函数返回值是`i32`，但实际上函数并没有返回一个`i32`，
与之类似的还有`todo!()`，比如这个函数暂时只需要一个声明，就可以用`todo!()`来临时顶替。

# 所有权和借用

> Rust 中每一个值都被一个变量所拥有，该变量被称为值的所有者<p/>
一个值同时只能被一个变量所拥有，或者说一个值只能拥有一个所有者<p/>
当所有者(变量)离开作用域范围时，这个值将被丢弃(drop)

例如如下代码会报错：
```rust
let s1 = String::from("hello");
let s2 = s1;

println!("{}, world!", s1);
```
原因是s1所指向的字符串已经转移(移动)给给了s2，s1此时将不再可用。

## 函数传值与返回

将值传递给函数，一样会发生`移动`或者`复制`:

```rust
fn main() {
    let s = String::from("hello");  // s 进入作用域

    takes_ownership(s);             // s 的值移动到函数里 ...
                                    // ... 所以到这里不再有效

    let x = 5;                      // x 进入作用域

    makes_copy(x);                  // x 应该移动函数里，
                                    // 但 i32 是 Copy 的，所以在后面可继续使用 x

} // 这里, x 先移出了作用域，然后是 s。但因为 s 的值已被移走，
  // 所以不会有特殊操作

fn takes_ownership(some_string: String) { // some_string 进入作用域
    println!("{}", some_string);
} // 这里，some_string 移出作用域并调用 `drop` 方法。占用的内存被释放

fn makes_copy(some_integer: i32) { // some_integer 进入作用域
    println!("{}", some_integer);
} // 这里，some_integer 移出作用域。不会有特殊操作
```

同样的，函数返回值也有所有权，例如:
```rust
fn main() {
    let s1 = gives_ownership();         // gives_ownership 将返回值
                                        // 移给 s1

    let s2 = String::from("hello");     // s2 进入作用域

    let s3 = takes_and_gives_back(s2);  // s2 被移动到
                                        // takes_and_gives_back 中,
                                        // 它也将返回值移给 s3
} // 这里, s3 移出作用域并被丢弃。s2 也移出作用域，但已被移走，
  // 所以什么也不会发生。s1 移出作用域并被丢弃

fn gives_ownership() -> String {             // gives_ownership 将返回值移动给
                                             // 调用它的函数

    let some_string = String::from("hello"); // some_string 进入作用域.

    some_string                              // 返回 some_string 并移出给调用的函数
}

// takes_and_gives_back 将传入字符串并返回该值
fn takes_and_gives_back(a_string: String) -> String { // a_string 进入作用域

    a_string  // 返回 a_string 并移出给调用的函数
}
```

# 引用与借用

如果一个人拥有某样东西，你可以从他那里借来，当使用完毕后，也必须要物归原主。

Rust 通过`借用(Borrowing)`这个概念来达成上述的目的。


常规引用是一个指针类型，指向了对象存储的内存地址。在下面代码中，我们创建一个 i32 值的引用 y，然后使用解引用运算符来解出 y 所使用的值
```rust
fn main() {
    let x: i32 = 5;
    let y: &i32 = &x;

    assert_eq!(5, x);
    assert_eq!(5, *y);
}
```
这里，& 符号即是引用，它们允许你使用值，但是不获取所有权，即无法对原始的值进行改变。


## 可变引用

可变引用允许我们去修改原始的值

```rust
fn main() {
  // 注意这里必须加mut
  let mut s = 123;

  change(&mut s);
  assert_eq!(125, s);
}

fn change(val: &mut i32) {
  // 解引用
  *val += 2;
}
```

可变引用同时只能存在一个，如果创建多个，编译时则会报错：
```rust
let mut s = String::from("hello");

// first mutable borrow occurs here
let r1 = &mut s;
// second mutable borrow occurs here
let r2 = &mut s;

// first borrow later used here
println!("{}, {}", r1, r2);
```

可变引用与不可变引用不能同时存在：
```rust
let mut s = String::from("hello");

let r1 = &s; // 没问题
let r2 = &s; // 没问题
let r3 = &mut s; // 大问题

println!("{}, {}, and {}", r1, r2, r3);

```