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

假设有一个方法 foo，它有一个接收器(接收器就是 `self`、`&self`、`&mut self` 参数)。如果调用 `value.foo()`，编译器在调用 `foo` 之前，需要决定到底使用哪个 `Self` 类型来调用。现在假设 `value` 拥有类型 `T`。

再进一步，我们使用完全限定语法来进行准确的函数调用:

1. 首先，编译器检查它是否可以直接调用 `T::foo(value)`，称之为**值方法调用**
2. 如果上一步调用无法完成(例如方法类型错误或者特征没有针对 `Self` 进行实现，上文提到过特征不能进行强制转换)，那么编译器会尝试增加自动引用，例如会尝试以下调用： `<&T>::foo(value)` 和 `<&mut T>::foo(value)`，称之为引用方法调用
3. 若上面两个方法依然不工作，编译器会试着解引用 `T` ，然后再进行尝试。这里使用了 `Deref` 特征 —— 若 `T: Deref<Target = U>` (`T` 可以被解引用为 `U`)，那么编译器会使用 `U` 类型进行尝试，称之为解引用方法调用
4. 若 `T` 不能被解引用，且 `T` 是一个定长类型(在编译期类型长度是已知的)，那么编译器也会尝试将 `T` 从定长类型转为不定长类型，例如将 `[i32; 2]` 转为 `[i32]`
5. 若还是不行，编译失败。

例如下面的代码：

```rust
let array: Rc<Box<[T; 3]>> = ...;
let first_entry = array[0];
```

1. 首先， `array[0]` 只是 `Index` 特征的语法糖：编译器会将 `array[0]` 转换为 `array.index(0)` 调用，当然在调用之前，编译器会先检查 `array` 是否实现了 `Index` 特征。
2. 接着，编译器检查 `Rc<Box<[T; 3]>>` 是否有实现 `Index` 特征，结果是否，不仅如此，`&Rc<Box<[T; 3]>>` 与 `&mut Rc<Box<[T; 3]>>` 也没有实现。
3. 上面的都不能工作，编译器开始对 `Rc<Box<[T; 3]>>` 进行解引用，把它转变成 `Box<[T; 3]>`
4. 此时继续对 `Box<[T; 3]>` 进行上面的操作：`Box<[T; 3]>`， `&Box<[T; 3]>`，和 `&mut Box<[T; 3]>` 都没有实现 `Index` 特征，所以编译器开始对 `Box<[T; 3]>` 进行解引用，然后我们得到了 `[T; 3]`
5. `[T; 3]` 以及它的各种引用都没有实现 `Index` 索引(是不是很反直觉:D，在直觉中，数组都可以通过索引访问，实际上只有数组切片才可以!)，它也不能再进行解引用，因此编译器只能祭出最后的大杀器：将定长转为不定长，因此 `[T; 3]` 被转换成 `[T]`，也就是数组切片，它实现了 `Index` 特征，因此最终我们可以通过 `index` 方法访问到对应的元素。

# newtype 和 类型别名

## newtype

`newtype` 简单来说就是使用元组结构体的方式将已有的类型包裹起来，例如：`struct Meters(u32)`，此处 `Meters` 就是一个 `newtype`。

### 为外部类型实现外部特征

由于孤儿规则的存在，要为类型 `A` 实现特征 `T`，那么 `A` 或者 `T` 必须至少有一个在当前的作用范围内。

例如，如果想使用 `println!("{}", v)` 的方式去格式化输出一个动态数组 `Vec`，以期给用户提供更加清晰可读的内容，那么就需要为 `Vec` 实现 `Display` 特征，但是这里有一个问题： `Vec` 类型定义在标准库中，`Display` 亦然，这时就可以祭出大杀器 `newtype` 来解决：

```rust
use std::fmt;

struct Wrapper<'a>(&'a Vec<String>);

impl<'a> fmt::Display for Wrapper<'a> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[{}]", self.0.join(", "))
    }
}

fn main() {
    let vec = vec![String::from("hello"), String::from("world")];
    let w = Wrapper(&vec);
    println!("w = {}", w);
}
```

### 更好的可读性以及类型异化

更好的可读性不等于更少的代码，其次下面的例子只是一个示例，未必能体现出更好的可读性：

```rust
use std::ops::Add;
use std::fmt;

struct Meters(u32);
impl fmt::Display for Meters {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "目标地点距离你{}米", self.0)
    }
}

impl Add for Meters {
    type Output = Self;

    fn add(self, other: Meters) -> Self {
        Self(self.0 + other.0)
    }
}
fn main() {
    let d = calculate_distance(Meters(10), Meters(20));
    println!("{}", d);
}

fn calculate_distance(d1: Meters, d2: Meters) -> Meters {
    d1 + d2
}
```

上面代码创建了一个 `newtype` Meters，为其实现 `Display` 和 `Add` 特征，接着对两个距离进行求和计算，最终打印出该距离：

```shell
目标地点距离你30米
```

事实上，除了可读性外，还有一个极大的优点：如果给 `calculate_distance` 传一个其它的类型，例如 `struct MilliMeters(u32)` 甚至 `u32`，该代码将无法编译。尽管都使用了 u32 类型，但是它们是不同的类型！

## 类型别名

除了使用 newtype，还可以使用一个更传统的方式来创建新类型：类型别名

```rust
type Meters = u32
```

**类型别名并不是一个独立的全新的类型，而是某一个类型的别名：**

```rust
type Meters = u32;

let x: u32 = 5;
let y: Meters = 5;

println!("x + y = {}", x + y);
```

上面的代码将顺利编译通过。

类型别名除了让类型可读性更好，还能**减少模版代码的使用**：

```rust
let f: Box<dyn Fn() + Send + 'static> = Box::new(|| println!("hi"));

fn takes_long_type(f: Box<dyn Fn() + Send + 'static>) {
    // --snip--
}

fn returns_long_type() -> Box<dyn Fn() + Send + 'static> {
    // --snip--
}
```

由于这些类型标注太多，并且可以复用，所以可以直接使用类型别名替换：

```rust
type Thunk = Box<dyn Fn() + Send + 'static>;

let f: Thunk = Box::new(|| println!("hi"));

fn takes_long_type(f: Thunk) {
    // --snip--
}

fn returns_long_type() -> Thunk {
    // --snip--
}
```

# Sized 和不定长类型 DST

在 Rust 中类型有多种抽象的分类方式，例如：基本类型、集合类型、复合类型等。再比如说，如果从编译器何时能获知类型大小的角度出发，可以分成两类:

- 定长类型( sized )，这些类型的大小在编译时是已知的
- 不定长类型( unsized )，与定长类型相反，它的大小只有到了程序运行时才能动态获知，这种类型又被称之为 DST

## 动态大小类型 DST

对于动态大小类型编译器无法在编译期得知该类型值的大小，只有到了程序运行时，才能动态获知。对于动态类型，用 `DST`(dynamically sized types)或者 `unsized` 类型来称呼它。

试图创建动态大小的数组：

```rust
fn my_function(n: usize) {
    let array = [123; n];
}
```

以上代码就会报错(错误输出的内容并不是因为 `DST`，但根本原因是类似的)，因为 `n` 在编译期无法得知，而数组类型的一个组成部分就是长度，长度变为动态的，自然类型就变成了 `unsized` 。


Rust 中常见的 DST 类型有: `str`、`[T]`、`dyn Trait`，它们都无法单独被使用，必须要通过引用或者 Box 来间接使用。

## Sized 特征

编译器会自动帮我们在泛型约束上添加 `Sized` 特征约束，例如下面的函数没有对泛型 `T` 作任何限制：

```rust
fn generic<T>(t: T) {
    // --snip--
}
```

但是编译器会自动添加 `Sized` 特征：

```rust
fn generic<T: Sized>(t: T) {
    // --snip--
}
```

**所有在编译时就能知道其大小的类型，都会自动实现 Sized 特征**，除了 `str` 和特征。

每一个特征都是一个可以通过名称来引用的动态大小类型。因此如果想把特征作为具体的类型来传递给函数，你必须将其转换成一个特征对象：诸如 `&dyn Trait` 或者 `Box<dyn Trait>` (还有 `Rc<dyn Trait>`)这些引用类型。

如果非要使用没有 `Sized` 特征的动态类型数据，可以使用 `?Sized` 特征：

```rust
fn generic<T: ?Sized>(t: &T) {
    // --snip--
}
```

`?Sized` 特征用于表明类型 `T` 既有可能是固定大小的类型，也可能是动态大小的类型。还有一点要注意的是，函数参数类型从 `T` 变成了 `&T`，因为 `T` 可能是动态大小的，因此需要用一个固定大小的指针(引用)来包裹它。

# 枚举和整数的转换

在 Rust 中以下代码：

```rust
enum MyEnum {
    A = 1,
    B,
    C,
}

fn main() {
    // 将枚举转换成整数，顺利通过
    let x = MyEnum::C as i32;

    // 将整数转换为枚举，失败
    match x {
        MyEnum::A => {}
        MyEnum::B => {}
        MyEnum::C => {}
        _ => {}
    }
}
```

就会报错: `MyEnum::A => {} mismatched types, expected i32, found enum MyEnum`。


最简单，但也是最不安全的方式是使用 `std::mem::transmute` 实现：

```rust
// 控制底层类型的大小
#[repr(i32)]
enum MyEnum {
    A = 1, B, C
}

fn main() {
    let x = MyEnum::C;
    let y = x as i32;
    let z: MyEnum = unsafe { std::mem::transmute(2_i32) };

    // match the enum that came from an int
    match z {
        MyEnum::A => { println!("Found A"); }
        MyEnum::B => { println!("Found B"); }
        MyEnum::C => { println!("Found C"); }
    }
}
```