---
title: 智能指针
date: 2024-05-01 22:22:15
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

智能指针的名称来源，主要就在于它实现了 `Deref` 和 `Drop` 特征，这两个特征可以智能地帮助我们节省使用上的负担：

- `Deref` 可以让智能指针像引用那样工作，这样你就可以写出同时支持智能指针和引用的代码，例如 *T
- `Drop` 允许你指定智能指针超出作用域后自动执行的代码，例如做一些数据清除等收尾工作

# Box<T> 堆对象分配

## Box 的使用场景

由于 `Box` 是简单的封装，除了将值存储在堆上外，并没有其它性能上的损耗。

`Box` 相比其它智能指针，功能较为单一，可以在以下场景中使用它：

- 特意的将数据分配在堆上
- 数据较大时，又不想在转移所有权时进行数据拷贝
- 类型的大小在编译期无法确定，但是我们又需要固定大小的类型时
- 特征对象，用于说明对象实现了一个特征，而不是某个特定的类型

### 使用 Box<T> 将数据存储在堆上

如果一个变量拥有一个数值 `let a = 3`，那变量 `a` 必然是存储在栈上的，那如果我们想要 `a` 的值存储在堆上就需要使用 `Box<T>`：

```rust
fn main() {
    let a = Box::new(3);
    println!("a = {}", a); // a = 3

    // 下面一行代码将报错
    // let b = a + 1; // cannot add `{integer}` to `Box<{integer}>`
}
```

这样就可以创建一个智能指针指向了存储在堆上的 `3`，并且 `a` 持有了该指针。

智能指针往往都实现了 `Deref` 和 `Drop` 特征，因此：

- `println!` 可以正常打印出 `a` 的值，是因为它隐式地调用了 `Deref` 对智能指针 `a` 进行了解引用
- 最后一行代码 `let b = a + 1` 报错，是因为在表达式中，我们无法自动隐式地执行 `Deref` 解引用操作，你需要使用 `*` 操作符 `let b = *a + 1`，来显式的进行解引用
- `a` 持有的智能指针将在作用域结束（`main` 函数结束）时，被释放掉，这是因为 `Box<T>` 实现了 `Drop` 特征

### 避免栈上数据的拷贝

当栈上数据转移所有权时，实际上是把数据拷贝了一份，最终新旧变量各自拥有不同的数据，因此所有权并未转移。

而堆上则不然，底层数据并不会被拷贝，转移所有权仅仅是复制一份栈中的指针，再将新的指针赋予新的变量，然后让拥有旧指针的变量失效，最终完成了所有权的转移：

```rust
fn main() {
    // 在栈上创建一个长度为1000的数组
    let arr = [0;1000];
    // 将arr所有权转移arr1，由于 `arr` 分配在栈上，因此这里实际上是直接重新深拷贝了一份数据
    let arr1 = arr;

    // arr 和 arr1 都拥有各自的栈上数组，因此不会报错
    println!("{:?}", arr.len());
    println!("{:?}", arr1.len());

    // 在堆上创建一个长度为1000的数组，然后使用一个智能指针指向它
    let arr = Box::new([0;1000]);
    // 将堆上数组的所有权转移给 arr1，由于数据在堆上，因此仅仅拷贝了智能指针的结构体，底层数据并没有被拷贝
    // 所有权顺利转移给 arr1，arr 不再拥有所有权
    let arr1 = arr;
    println!("{:?}", arr1.len());
    // 由于 arr 不再拥有底层数组的所有权，因此下面代码将报错
    // println!("{:?}", arr.len());
}
```

从以上代码，可以清晰看出大块的数据为何应该放入堆中，此时 Box 就成为了我们最好的帮手。

> 基础数据类型，和元素为基础类型的数组都可以被直接分配在栈上。结构体由于编译器优化或者内存对齐等原因，无法直接分配在栈上。

### 将动态大小类型变为 Sized 固定大小类型

Rust 需要在编译时知道类型占用多少空间，如果一种类型在编译时无法知道具体的大小，那么被称为动态大小类型 DST。

其中一种无法在编译时知道大小的类型是**递归类型**：在类型定义中又使用到了自身，或者说该类型的值的一部分可以是相同类型的其它值，这种值的嵌套理论上可以无限进行下去，所以 Rust 不知道递归类型需要多少空间：

```rust
enum List {
    Cons(i32, List),
    Nil,
}
```

以上就是函数式语言中常见的 `Cons List`，它的每个节点包含一个 `i32` 值，还包含了一个新的 `List`，因此这种嵌套可以无限进行下去，`Rust` 认为该类型是一个 `DST` 类型，并给予报错：

```log
error[E0072]: recursive type `List` has infinite size //递归类型 `List` 拥有无限长的大小
 --> src/main.rs:3:1
  |
3 | enum List {
  | ^^^^^^^^^ recursive type has infinite size
4 |     Cons(i32, List),
  |               ---- recursive without indirection

```

此时若想解决这个问题，就可以使用我们的 `Box<T>`：

```rust
enum List {
    Cons(i32, Box<List>),
    Nil,
}
```

只需要将 `List` 存储到堆上，然后使用一个智能指针指向它，即可完成从 `DST` 到 `Sized` 类型(固定大小类型)的华丽转变。

### 特征对象

在 Rust 中，想实现不同类型组成的数组只有两个办法：枚举和特征对象，前者限制较多，因此后者往往是最常用的解决办法：

```rust
trait Draw {
    fn draw(&self);
}

struct Button {
    id: u32,
}
impl Draw for Button {
    fn draw(&self) {
        println!("这是屏幕上第{}号按钮", self.id)
    }
}

struct Select {
    id: u32,
}

impl Draw for Select {
    fn draw(&self) {
        println!("这个选择框贼难用{}", self.id)
    }
}

fn main() {
    let elems: Vec<Box<dyn Draw>> = vec![
      Box::new(Button { id: 1 }), 
      Box::new(Select { id: 2 })
    ];

    for e in elems {
        e.draw()
    }
}
```

以上代码将不同类型的 `Button` 和 `Select` 包装成 `Draw` 特征的特征对象，放入一个数组中，`Box<dyn Draw>` 就是特征对象。

其实，特征也是 `DST` 类型，而特征对象在做的就是将 `DST` 类型转换为固定大小类型。

## Box 内存布局

先来看看 Vec<i32> 的内存布局：

```text
(stack)    (heap)
┌──────┐   ┌───┐
│ vec1 │──→│ 1 │
└──────┘   ├───┤
           │ 2 │
           ├───┤
           │ 3 │
           ├───┤
           │ 4 │
           └───┘
```

`Vec` 和 `String` 都是智能指针，从上图可以看出，该智能指针存储在栈中，然后指向堆上的数组数据。

那如果数组中每个元素都是一个 `Box` 对象呢？来看看 `Vec<Box<i32>>` 的内存布局：

```text
                    (heap)
(stack)    (heap)   ┌───┐
┌──────┐   ┌───┐ ┌─→│ 1 │
│ vec2 │──→│B1 │─┘  └───┘
└──────┘   ├───┤    ┌───┐
           │B2 │───→│ 2 │
           ├───┤    └───┘
           │B3 │─┐  ┌───┐
           ├───┤ └─→│ 3 │
           │B4 │─┐  └───┘
           └───┘ │  ┌───┐
                 └─→│ 4 │
                    └───┘
```

上面的 `B1` 代表被 `Box` 分配到堆上的值 `1`。

可以看出智能指针 `vec2` 依然是存储在栈上，然后指针指向一个堆上的数组，该数组中每个元素都是一个 `Box` 智能指针，最终 `Box` 智能指针又指向了存储在堆上的实际值。

## Box::leak

`Box` 中还提供了一个非常有用的关联函数：`Box::leak`，它可以消费掉 `Box` 并且强制目标值从内存中泄漏。

它可以将值转换成 `'static` 生命周期的类型:

```rust
fn main() {
   let s = gen_static_str();
   println!("{}", s);
}

fn gen_static_str() -> &'static str{
    let mut s = String::new();
    s.push_str("hello, world");

    Box::leak(s.into_boxed_str())
}
```

在之前的代码中，如果 `String` 创建于函数中，那么返回它的唯一方法就是转移所有权给调用者 `fn move_str() -> String`，而通过 `Box::leak` 我们不仅返回了一个 `&str` 字符串切片，它还是 `'static` 生命周期的！

# Deref 解引用

## 通过 * 获取引用背后的值

常规引用是一个指针类型，包含了目标数据存储的内存地址。对常规引用使用 `*` 操作符，就可以通过解引用的方式获取到内存地址对应的数据值：

```rust
fn main() {
    let x = 5;
    let y = &x;

    assert_eq!(5, x);
    assert_eq!(5, *y);
}
```

这里 `y` 就是一个常规引用，包含了值 `5` 所在的内存地址，然后通过解引用 `*y`，我们获取到了值 `5`。如果试图执行 `assert_eq!(5, y)`;，代码就会无情报错，因为无法将一个引用与一个数值做比较：

```log
error[E0277]: can't compare `{integer}` with `&{integer}` //无法将{integer} 与&{integer}进行比较
 --> src/main.rs:6:5
  |
6 |     assert_eq!(5, y);
  |     ^^^^^^^^^^^^^^^^^ no implementation for `{integer} == &{integer}`
  |
  = help: the trait `PartialEq<&{integer}>` is not implemented for `{integer}`
                    // 你需要为{integer}实现用于比较的特征PartialEq<&{integer}>
```

## 智能指针解引用

上面所说的解引用方式和其它大多数语言并无区别，但是 `Rust` 中将解引用提升到了一个新高度。考虑一下智能指针，它是一个结构体类型，如果你直接对它进行 `*myStruct`，显然编译器不知道该如何办，因此我们可以为智能指针结构体实现 `Deref` 特征。

实现 `Deref` 后的智能指针结构体，就可以像普通引用一样，通过 `*` 进行解引用，例如 `Box<T>` 智能指针：

```rust
fn main() {
    let x = Box::new(1);
    let sum = *x + 1;
}
```

智能指针 `x` 被 `*` 解引用为 `i32` 类型的值 `1`，然后再进行求和。

### 定义自己的智能指针

现在，让我们一起来实现一个智能指针，功能上类似 `Box<T>`。由于 `Box<T>` 本身很简单，并没有包含类如长度、最大长度等信息，因此用一个元组结构体即可：

```rust
use std::ops::Deref;
struct MyBox<T>(T);

impl<T> MyBox<T> {
    fn new(x: T) -> MyBox<T> {
        MyBox(x)
    }
}

// 实现 Deref 特征
impl<T> Deref for MyBox<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

fn main() {
    let y = MyBox::new(5);

    assert_eq!(5, *y);
}
```

当解引用 `MyBox` 智能指针时，返回元组结构体中的元素 `&self.0`，有几点要注意的：

- 在 `Deref` 特征中声明了关联类型 `Target`
- `deref` 返回的是一个常规引用，可以被 `*` 进行解引用


### 背后的原理

当我们对智能指针 `Box` 进行解引用时，实际上 Rust 为我们调用了以下方法：

```rust
*(y.deref())
```

首先调用 `deref` 方法返回值的常规引用，然后通过 `*` 对常规引用进行解引用，最终获取到目标值。

## 函数和方法中的隐式 Deref 转换

对于函数和方法的传参，`Rust` 提供了一个极其有用的隐式转换：`Deref` 转换。若一个类型实现了 `Deref` 特征，那它的引用在传给函数或方法时，会根据参数签名来决定是否进行隐式的 `Deref` 转换，例如：

```rust
fn main() {
    let s = String::from("hello world");
    display(&s)
}

fn display(s: &str) {
    println!("{}",s);
}
```

以上代码有几点值得注意：

- `String` 实现了 `Deref` 特征，可以在需要时自动被转换为 `&str` 类型
- `&s` 是一个 `&String` 类型，当它被传给 `display` 函数时，自动通过 `Deref` 转换成了 `&str`
- 必须使用 `&s` 的方式来触发 `Deref`(仅引用类型的实参才会触发自动解引用)

### 连续的隐式 Deref 转换

`Deref` 可以支持连续的隐式转换，直到找到适合的形式为止：

```rust
fn main() {
    let s = MyBox::new(String::from("hello world"));
    display(&s)
}

fn display(s: &str) {
    println!("{}",s);
}
```

这里我们使用了之前自定义的智能指针 `MyBox`，并将其通过连续的隐式转换变成 `&str` 类型：首先 `MyBox` 被 `Deref` 成 `String` 类型，结果并不能满足 `display` 函数参数的要求，编译器发现 `String` 还可以继续 `Deref` 成 `&str`，最终成功的匹配了函数参数。

在方法、赋值中自动应用 Deref 的例子：

```rust
fn main() {
    let s = MyBox::new(String::from("hello, world"));
    let s1: &str = &s;
    let s2: String = s.to_string();
}
```

对于 `s1`，我们通过两次 `Deref` 将 `&str` 类型的值赋给了它（赋值操作需要手动解引用）；而对于 `s2`，我们在其上直接调用方法 `to_string`，实际上 `MyBox` 根本没有没有实现该方法，能调用 `to_string`，完全是因为编译器对 `MyBox` 应用了 `Deref` 的结果（方法调用会自动解引用）。

## 三种 Deref 转换

Rust 支持将一个可变的引用转换成另一个可变的引用以及将一个可变引用转换成不可变的引用，规则如下：

- 当 `T: Deref<Target=U>`，可以将 `&T` 转换成 `&U`，也就是我们之前看到的例子
- 当 `T: DerefMut<Target=U>`，可以将 `&mut T` 转换成 `&mut U`
- 当 `T: Deref<Target=U>`，可以将 `&mut` T 转换成 `&U`


`Deref` 可以说是 `Rust` 中最常见的隐式类型转换，而且它可以连续的实现如 `Box<String>` -> `String` -> `&str` 的隐式转换，只要链条上的类型实现了 `Deref` 特征。

原则上来说，只应该为自定义的智能指针实现 `Deref`。例如，虽然你可以为自己的自定义数组类型实现 `Deref` 以避免 `myArr.0[0]` 的使用形式，但是 `Rust` 官方并不推荐这么做，特别是在你开发三方库时。

# Drop 释放资源

下面是一个 `Drop` 的例子：

```rust
struct HasDrop1;
struct HasDrop2;
impl Drop for HasDrop1 {
    fn drop(&mut self) {
        println!("Dropping HasDrop1!");
    }
}
impl Drop for HasDrop2 {
    fn drop(&mut self) {
        println!("Dropping HasDrop2!");
    }
}
struct HasTwoDrops {
    one: HasDrop1,
    two: HasDrop2,
}
impl Drop for HasTwoDrops {
    fn drop(&mut self) {
        println!("Dropping HasTwoDrops!");
    }
}

struct Foo;

impl Drop for Foo {
    fn drop(&mut self) {
        println!("Dropping Foo!")
    }
}

fn main() {
    let _x = HasTwoDrops {
        two: HasDrop2,
        one: HasDrop1,
    };
    let _foo = Foo;
    println!("Running!");
}
```

有几点值得注意：

- `Drop` 特征中的 `drop` 方法借用了目标的可变引用，而不是拿走了所有权
- 结构体中每个字段都有自己的 `Drop`

输出：

```log
Running!
Dropping Foo!
Dropping HasTwoDrops!
Dropping HasDrop1!
Dropping HasDrop2!
```

结果符合预期，每个资源都成功的执行了收尾工作...

可以发现 `Drop` 的顺序如下：

- 变量级别，按照逆序的方式，`_x` 在 `_foo` 之前创建，因此 `_x` 在 `_foo` 之后被 `drop`
- 结构体内部，按照顺序的方式，结构体 `_x` 中的字段按照定义中的顺序依次 `drop`

`Rust` 自动为几乎所有类型都实现了 `Drop` 特征，因此就算你不手动为结构体实现 `Drop`，它依然会调用默认实现的 `drop` 函数，同时再调用每个字段的 `drop` 方法。

## 手动回收

当使用智能指针来管理锁的时候，你可能希望提前释放这个锁，然后让其它代码能及时获得锁，此时就需要提前去手动 `drop`。 但是`Drop::drop` 只是借用了目标值的可变引用，所以，就算你提前调用了 `drop`，后面的代码依然可以使用目标值，但是这就会访问一个并不存在的值，非常不安全，好在 `Rust` 会阻止你：

```rust
#[derive(Debug)]
struct Foo;

impl Drop for Foo {
    fn drop(&mut self) {
        println!("Dropping Foo!")
    }
}

fn main() {
    let foo = Foo;
    foo.drop();
    println!("Running!:{:?}", foo);
}
```

报错如下：
```log
error[E0040]: explicit use of destructor method
  --> src/main.rs:37:9
   |
37 |     foo.drop();
   |     ----^^^^--
   |     |   |
   |     |   explicit destructor calls not allowed
   |     help: consider using `drop` function: `drop(foo)`
```

如上所示，编译器直接阻止了我们调用 `Drop` 特征的 `drop` 方法，原因是对于 `Rust` 而言，不允许显式地调用析构函数。好在在报错的同时，编译器还给出了一个提示：使用 `drop` 函数。

而编译器提示的 `drop` 函数，它能够拿走目标值的所有权并清理掉数据：
```rust
// std::mem::drop
pub fn drop<T>(_x: T)
```

修改主函数：

```rust
fn main() {
    let foo = Foo;
    drop(foo);
    // 以下代码会报错：借用了所有权被转移的值
    // println!("Running!:{:?}", foo);
}
```

这里直接调用了 drop 函数，并没有引入任何模块信息，原因是该函数在`std::prelude`里。

## 互斥的 Copy 和 Drop

无法为一个类型同时实现 Copy 和 Drop 特征。因为实现了 Copy 的特征会被编译器隐式的复制，因此非常难以预测析构函数执行的时间和频率。因此这些实现了 Copy 的类型无法拥有析构函数。

```rust
#[derive(Copy)]
struct Foo;

impl Drop for Foo {
    fn drop(&mut self) {
        println!("Dropping Foo!")
    }
}
```

报错如下：

```log
error[E0184]: the trait `Copy` may not be implemented for this type; the type has a destructor
  --> src/main.rs:24:10
   |
24 | #[derive(Copy)]
   |          ^^^^ Copy not allowed on types with destructors
```

> [Why does Rust not allow the copy and drop traits on one type?](https://stackoverflow.com/questions/51704063/why-does-rust-not-allow-the-copy-and-drop-traits-on-one-type)
> 简单来说，如果一个结构体中存在一个引用，并且这个引用指向堆里的某一份数据，在进行 Copy 时，仅会复制栈上的数据，也就是说复制出来的新结构体仍然和旧的结构体使用的同一份堆中的数据，当一个结构体 Drop 掉堆中的数据时，另外一个结构体的行为将不可预测。

# Rc 与 Arc

Rust 所有权机制要求一个值只能有一个所有者，但是在部分情况下存在一份数据，需要有多个所有者。

所以 Rust 在所有权机制之外又引入了额外的措施来简化相应的实现：通过引用计数的方式，允许一个数据资源在同一时刻拥有多个所有者。

这种实现机制就是 `Rc` 和 `Arc`，前者适用于单线程，后者适用于多线程。

## Rc<T>

引用计数(reference counting)，顾名思义，通过记录一个数据被引用的次数来确定该数据是否正在被使用。当引用次数归零时，就代表该数据不再被使用，因此可以被清理释放。

当我们希望在堆上分配一个对象供程序的**多个部分使用且无法确定哪个部分最后一个结束时**，就可以使用 Rc 成为数据值的所有者。

下面是经典的所有权被转移导致报错的例子：

```rust
fn main() {
    let s = String::from("hello, world");
    // s在这里被转移给a
    let a = Box::new(s);
    // 报错！此处继续尝试将 s 转移给 b
    let b = Box::new(s);
}
```

使用 Rc 就可以轻易解决：

```rust
use std::rc::Rc;
fn main() {
    let a = Rc::new(String::from("hello, world"));
    let b = Rc::clone(&a);

    assert_eq!(2, Rc::strong_count(&a));
    assert_eq!(Rc::strong_count(&a), Rc::strong_count(&b))
}
```

以上代码我们使用 `Rc::new` 创建了一个新的 `Rc<String>` 智能指针并赋给变量 `a`，该指针指向底层的字符串数据。

智能指针 `Rc<T>` 在创建时，还会将引用计数加 `1`，此时获取引用计数的关联函数 `Rc::strong_count` 返回的值将是 1。

接着，我们又使用 `Rc::clone` 克隆了一份智能指针 `Rc<String>`，并将该智能指针的引用计数增加到 `2`。

这里的 `clone` **仅仅复制了智能指针并增加了引用计数，并没有克隆底层数据**，因此 `a` 和 `b` 是共享了底层的字符串 `s`，这种复制效率是非常高的。

实际上调用 `Rc::clone(&a)` 和 `a.clone()` 是一个效果，但是为了可读性，一般使用前者。

### 引用计数的变化

使用关联函数 `Rc::strong_count` 可以获取当前引用计数的值，我们来观察下引用计数如何随着变量声明、释放而变化：

```rust
use std::rc::Rc;
fn main() {
        let a = Rc::new(String::from("test ref counting"));
        println!("count after creating a = {}", Rc::strong_count(&a));
        let b =  Rc::clone(&a);
        println!("count after creating b = {}", Rc::strong_count(&a));
        {
            let c =  Rc::clone(&a);
            println!("count after creating c = {}", Rc::strong_count(&c));
        }
        println!("count after c goes out of scope = {}", Rc::strong_count(&a));
}
```

输出：

```log
count after creating a = 1
count after creating b = 2
count after creating c = 3
count after c goes out of scope = 2
```

有几点值得注意：

- 由于变量 `c` 在语句块内部声明，当离开语句块时它会因为超出作用域而被释放，所以引用计数会减少 1，事实上这个得益于 `Rc<T>` 实现了 `Drop` 特征
- `a`、`b`、`c` 三个智能指针引用计数都是同样的，并且共享底层的数据，因此打印计数时用哪个都行
- 无法看到的是：当 `a`、`b` 超出作用域后，引用计数会变成 0，最终智能指针和它指向的底层字符串都会被清理释放

### 不可变引用

事实上，`Rc<T>` 是指向底层数据的不可变的引用，因此无法通过它来修改数据，这也符合 Rust 的借用规则：要么存在多个不可变借用，要么只能存在一个可变借用。

但是实际开发中我们往往需要对数据进行修改，这时单独使用 `Rc<T>` 无法满足我们的需求，需要配合其它数据类型来一起使用，例如内部可变性的 `RefCell<T>` 类型以及互斥锁 `Mutex<T>`。事实上，在多线程编程中，`Arc` 跟 `Mutex` 锁的组合使用非常常见，它们既可以让我们在不同的线程中共享数据，又允许在各个线程中对其进行修改。

### 总结

一个例子：

```rust
use std::rc::Rc;

struct Owner {
    name: String,
    // ...其它字段
}

struct Gadget {
    id: i32,
    owner: Rc<Owner>,
    // ...其它字段
}

fn main() {
    // 创建一个基于引用计数的 `Owner`.
    let gadget_owner: Rc<Owner> = Rc::new(Owner {
        name: "Gadget Man".to_string(),
    });

    // 创建两个不同的工具，它们属于同一个主人
    let gadget1 = Gadget {
        id: 1,
        owner: Rc::clone(&gadget_owner),
    };
    let gadget2 = Gadget {
        id: 2,
        owner: Rc::clone(&gadget_owner),
    };

    // 释放掉第一个 `Rc<Owner>`
    drop(gadget_owner);

    // 尽管在上面我们释放了 gadget_owner，但是依然可以在这里使用 owner 的信息
    // 原因是在 drop 之前，存在三个指向 Gadget Man 的智能指针引用，上面仅仅
    // drop 掉其中一个智能指针引用，而不是 drop 掉 owner 数据，外面还有两个
    // 引用指向底层的 owner 数据，引用计数尚未清零
    // 因此 owner 数据依然可以被使用
    println!("Gadget {} owned by {}", gadget1.id, gadget1.owner.name);
    println!("Gadget {} owned by {}", gadget2.id, gadget2.owner.name);

    // 在函数最后，`gadget1` 和 `gadget2` 也被释放，最终引用计数归零，随后底层
    // 数据也被清理释放
}
```

- `Rc/Arc` 是不可变引用，你无法修改它指向的值，只能进行读取
- `Rc` 只能用于同一线程内部
- `Rc<T>` 是一个智能指针，实现了 `Deref` 特征，因此你无需先解开 `Rc` 指针，再使用里面的 `T`，而是可以直接使用 `T`，例如上例中的 `gadget1.owner.name`

## Arc

`Arc` 是 `Atomic Rc` 的缩写，顾名思义：原子化的 `Rc<T>` 智能指针。

下面是使用 `Rc` 报错的代码：

```rust
use std::rc::Rc;
use std::thread;

fn main() {
    let s = Rc::new(String::from("多线程漫游者"));
    for _ in 0..10 {
        let s = Rc::clone(&s);
        let handle = thread::spawn(move || {
           println!("{}", s)
        });
    }
}
```

报错：

```log
error[E0277]: `Rc<String>` cannot be sent between threads safely
```

`Arc` 和 `Rc` 拥有完全一样的 API，修改起来很简单：

```rust
use std::sync::Arc;
use std::thread;

fn main() {
    let s = Arc::new(String::from("多线程漫游者"));
    for _ in 0..10 {
        let s = Arc::clone(&s);
        let handle = thread::spawn(move || {
           println!("{}", s)
        });
    }
}
```

# Cell 和 RefCell

## Cell

`Cell` 和 `RefCell` 在功能上没有区别，区别在于 `Cell<T>` 适用于 `T` 实现 `Copy` 的情况：

```rust
use std::cell::Cell;
fn main() {
  let c = Cell::new("asdf");
  let one = c.get();
  c.set("qwer");
  let two = c.get();
  println!("{},{}", one, two);
}
```

输出：

```log
asdf,qwer
```

有下面几点需要注意：

- `"asdf"` 是 `&str` 类型，它实现了 `Copy` 特征
- `c.get` 用来取值，`c.set` 用来设置新值


另外一个例子：

```rust
// code snipet 1
let x = Cell::new(1);
let y = &x;
let z = &x;
x.set(2);
y.set(3);
z.set(4);
println!("{}", x.get());

// code snipet 2
let mut x = 1;
let y = &mut x;
let z = &mut x;
x = 2;
*y = 3;
*z = 4;
println!("{}", x);
```

`Cell` 没有额外的性能损耗，但代码 1 拥有代码 2 不具有的优势：它能编译成功

## RefCell

由于 `Cell` 类型针对的是实现了 `Copy` 特征的值类型，因此在实际开发中，`Cell` 使用的并不多，因为我们要解决的往往是可变、不可变引用共存导致的问题，此时就需要借助于 `RefCell` 来达成目的。


| Rust 规则            | 智能指针带来的额外规则            |
|--------------------|------------------------|
| 一个数据只有一个所有者        | Rc/Arc让一个数据可以拥有多个所有者   |
| 要么多个不可变借用，要么一个可变借用 | RefCell实现编译期可变、不可变引用共存 |
| 违背规则导致编译错误         | 违背规则导致运行时panic         |


`RefCell` 实际上**并没有解决可变引用和引用可以共存的问题**，只是将报错从编译期推迟到运行时，从编译器错误变成了 `panic` 异常：

```rust
use std::cell::RefCell;

fn main() {
    let s = RefCell::new(String::from("hello, world"));
    let s1 = s.borrow();
    let s2 = s.borrow_mut();

    println!("{},{}", s1, s2);
}
```

这段代码可以顺利通过编译，但是在运行时会直接 `panic`。

### RefCell 存在意义

由于 Rust 在编译期的**宁可错杀，绝不放过**的原则，当编译器不能确定你的代码是否正确时，就统统会判定为错误，因此难免会导致一些误报。

而 `RefCell` 正是用于你确信代码是正确的，而编译器却发生了误判时。

对于大型的复杂程序，也可以选择使用 `RefCell` 来让事情简化。例如在 Rust 编译器的 [ctxt](https://github.com/rust-lang/rust/blob/620d1ee5346bee10ba7ce129b2e20d6e59f0377d/src/librustc/middle/ty.rs#L803-L987) 结构体中有大量的 `RefCell` 类型的 `map` 字段，主要的原因是：这些 `map` 会被分散在各个地方的代码片段所广泛使用或修改。由于这种分散在各处的使用方式，导致了管理可变和不可变成为一件非常复杂的任务（甚至不可能），你很容易就碰到编译器抛出来的各种错误。而且 `RefCell` 的运行时错误在这种情况下也变得非常可爱：一旦有人做了不正确的使用，代码会 `panic`，然后告诉我们哪些借用冲突了。

## 内部可变性

对一个不可变的值进行可变借用，就叫内部可变性。

```rust
fn main() {
    let x = 5;
    let y = &mut x;
}
```

上面的代码会报错，因为不能对一个不可变的值进行可变借用，这会破坏 Rust 的安全性保证，相反，你可以对一个可变值进行不可变借用。

虽然基本借用规则是 Rust 的基石，然而在某些场景中，一个值可以在其方法内部被修改，同时对于其它代码不可变，是很有用的：

```rust
// 定义在外部库中的特征
pub trait Messenger {
    fn send(&self, msg: String);
}

// --------------------------
// 我们的代码中的数据结构和实现
struct MsgQueue {
    msg_cache: Vec<String>,
}

impl Messenger for MsgQueue {
    fn send(&self, msg: String) {
        self.msg_cache.push(msg)
    }
}
```

如上所示，外部库中定义了一个消息发送器特征 `Messenger`，它只有一个发送消息的功能：`fn send(&self, msg: String)`，因为发送消息不需要修改自身，因此原作者在定义时，使用了 `&self` 的不可变借用，这个无可厚非。

我们要在自己的代码中使用该特征实现一个异步消息队列，出于性能的考虑，消息先写到本地缓存(内存)中，然后批量发送出去，因此在 `send` 方法中，需要将消息先行插入到本地缓存 `msg_cache` 中。但是问题来了，该 `send` 方法的签名是 `&self`，因此上述代码会报错：

```rust
error[E0596]: cannot borrow `self.msg_cache` as mutable, as it is behind a `&` reference
  --> src/main.rs:11:9
   |
2  |     fn send(&self, msg: String);
   |             ----- help: consider changing that to be a mutable reference: `&mut self`
...
11 |         self.msg_cache.push(msg)
   |         ^^^^^^^^^^^^^^^^^^ `self` is a `&` reference, so the data it refers to cannot be borrowed as mutable
```

在报错的同时，编译器还善意地给出了提示：将 `&self` 修改为 `&mut self`，但是。。。我们实现的特征是定义在外部库中，因此该签名根本不能修改。值此危急关头， `RefCell` 闪亮登场：

```rust
use std::cell::RefCell;
pub trait Messenger {
    fn send(&self, msg: String);
}

pub struct MsgQueue {
    msg_cache: RefCell<Vec<String>>,
}

impl Messenger for MsgQueue {
    fn send(&self, msg: String) {
        self.msg_cache.borrow_mut().push(msg)
    }
}

fn main() {
    let mq = MsgQueue {
        msg_cache: RefCell::new(Vec::new()),
    };
    mq.send("hello, world".to_string());
}
```

## Rc + RefCell 组合使用

在 Rust 中，一个常见的组合就是 `Rc` 和 `RefCell` 在一起使用，前者可以实现一个数据拥有多个所有者，后者可以实现数据的可变性：

```rust
use std::cell::RefCell;
use std::rc::Rc;
fn main() {
    let s = Rc::new(RefCell::new("我很善变，还拥有多个主人".to_string()));

    let s1 = s.clone();
    let s2 = s.clone();
    // let mut s2 = s.borrow_mut();
    s2.borrow_mut().push_str(", oh yeah!");

    println!("{:?}\n{:?}\n{:?}", s, s1, s2);
}
```

上面代码中，我们使用 `RefCell<String>` 包裹一个字符串，同时通过 `Rc` 创建了它的三个所有者：`s`、`s1` 和 `s2`，并且通过其中一个所有者 `s2` 对字符串内容进行了修改。

由于 `Rc` 的所有者们共享同一个底层的数据，因此当一个所有者修改了数据时，会导致全部所有者持有的数据都发生了变化。

运行结果：

```log
RefCell { value: "我很善变，还拥有多个主人, oh yeah!" }
RefCell { value: "我很善变，还拥有多个主人, oh yeah!" }
RefCell { value: "我很善变，还拥有多个主人, oh yeah!" }
```

## 通过 Cell::from_mut 解决借用冲突

在 Rust 1.37 版本中新增了两个非常实用的方法：

- `Cell::from_mut`，该方法将 `&mut T` 转为 `&Cell<T>`
- `Cell::as_slice_of_cells`，该方法将 `&Cell<[T]>` 转为 `&[Cell<T>]`

下面的代码：

```rust
fn is_even(i: i32) -> bool {
    i % 2 == 0
}

fn retain_even(nums: &mut Vec<i32>) {
    let mut i = 0;
    for num in nums.iter().filter(|&num| is_even(*num)) {
        nums[i] = *num;
        i += 1;
    }
    nums.truncate(i);
}
```

会报错：

```log
error[E0502]: cannot borrow `*nums` as mutable because it is also borrowed as immutable
 --> src/main.rs:8:9
  |
7 |     for num in nums.iter().filter(|&num| is_even(*num)) {
  |                ----------------------------------------
  |                |
  |                immutable borrow occurs here
  |                immutable borrow later used here
8 |         nums[i] = *num;
  |         ^^^^ mutable borrow occurs here
```

虽然可以通过索引迭代来避免这个问题，但是为了简洁，能用迭代器更好。

这时就可以使用 Cell 新增的这两个方法：

```rust
use std::cell::Cell;

fn retain_even(nums: &mut Vec<i32>) {
    let slice: &[Cell<i32>] = Cell::from_mut(&mut nums[..])
        .as_slice_of_cells();

    let mut i = 0;
    for num in slice.iter().filter(|num| is_even(num.get())) {
        slice[i].set(num.get());
        i += 1;
    }

    nums.truncate(i);
}
```

此时代码将不会报错，因为 `Cell` 上的 `set` 方法获取的是不可变引用 `pub fn set(&self, val: T)`。