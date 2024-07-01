---
title: Unsafe Rust
date: 2024-06-08 22:12:25
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---


# 五种使用场景

`unsafe` 可以提供 5 种在常规代码中无法实现的特性：

- 解引用裸指针
- 调用一个 `unsafe` 或外部的函数
- 访问或修改一个可变的静态变量
- 实现一个 `unsafe` 特征
- 访问 `union` 中的字段

## 解引用裸指针

裸指针(raw pointer，又称原生指针) 在功能上跟引用类似，同时它也需要显式地注明可变性。但是又和引用有所不同，裸指针长这样: `*const T` 和 `*mut T`，它们分别代表了不可变和可变。

在裸指针 `*const T` 中，这里的 `*` 只是类型名称的一部分，并没有解引用的含义。

裸指针与引用和智能指针不同的是：

- 可以绕过 Rust 的借用规则，可以同时拥有一个数据的可变、不可变指针，甚至还能拥有多个可变的指针
- 并不能保证指向合法的内存
- 可以是 null
- 没有实现任何自动的回收 (drop)


### 基于引用创建裸指针

下面的代码基于值的引用同时创建了可变和不可变的裸指针：

```rust
let mut num = 5;

let r1 = &num as *const i32;
let r2 = &mut num as *mut i32;
```

**创建裸指针是安全的行为，而解引用裸指针才是不安全的行为**:

```rust
fn main() {
    let mut num = 5;

    let r1 = &num as *const i32;

    unsafe {
        println!("r1 is: {}", *r1);
    }
}
```

### 基于内存地址创建裸指针

基于现有的引用来创建裸指针是安全的，但是直接基于内存地址创建就不安全了：

```rust
let address = 0x012345_usize;
let r = address as *const i32;
```

这里基于一个内存地址来创建裸指针，这种行为是相当危险的。试图使用任意的内存地址往往是一种未定义的行为(undefined behavior)，因为该内存地址有可能存在值，也有可能没有，就算有值，也大概率不是你需要的值。

实际上也并不会有这种写法，一般的写法都应该是先取址，然后再使用，而不是凭空捏造一个地址：

```rust
use std::{slice::from_raw_parts, str::from_utf8_unchecked};

// 获取字符串的内存地址和长度
fn get_memory_location() -> (usize, usize) {
  let string = "Hello World!";
  let pointer = string.as_ptr() as usize;
  let length = string.len();
  (pointer, length)
}

// 在指定的内存地址读取字符串
fn get_str_at_location(pointer: usize, length: usize) -> &'static str {
  unsafe { from_utf8_unchecked(from_raw_parts(pointer as *const u8, length)) }
}

fn main() {
  let (pointer, length) = get_memory_location();
  let message = get_str_at_location(pointer, length);
  println!(
    "The {} bytes at 0x{:X} stored: {}",
    length, pointer, message
  );
}
```

### 使用 * 解引用


```rust
let a = 1;
let b: *const i32 = &a as *const i32;
let c: *const i32 = &a;
unsafe {
    println!("{}", *c);
}
```

使用 `*` 可以对裸指针进行解引用，由于该指针的内存安全性并没有任何保证，因此需要使用 unsafe 来包裹解引用的逻辑。

### 基于智能指针创建裸指针

还有一种创建裸指针的方式，那就是基于智能指针来创建：

```rust
let a: Box<i32> = Box::new(10);
// 需要先解引用a
let b: *const i32 = &*a;
// 使用 into_raw 来创建
let c: *const i32 = Box::into_raw(a);
```

## 调用 unsafe 函数或方法

`unsafe` 函数从外表上来看跟普通函数并无区别，唯一的区别就是它需要使用 `unsafe fn` 来进行定义。这种定义方式是为了告诉调用者：当调用此函数时，你需要注意它的相关需求，因为 Rust 无法担保调用者在使用该函数时能满足它所需的一切需求。

```rust
unsafe fn dangerous() {}
fn main() {
    dangerous();
}
```

上面的代码将会报错：

```log
error[E0133]: call to unsafe function is unsafe and requires unsafe function or block
 --> src/main.rs:3:5
  |
3 |     dangerous();
  |     ^^^^^^^^^^^ call to unsafe function
```

在加上 `unsafe` 后，才可调用：

```rust
unsafe {
    dangerous();
}
```

**使用 unsafe 声明的函数时，一定要看看相关的文档，确定自己没有遗漏什么**。

此外在 `unsafe` 函数体中使用 `unsafe` 语句块是多余的行为。

## 用安全抽象包裹 unsafe 代码

一个函数包含了 `unsafe` 代码不代表我们需要将整个函数都定义为 `unsafe` fn。事实上，在标准库中有大量的安全函数，它们内部都包含了 unsafe 代码块。

例如在某些场景下，需要将一个数字分成两个切片，且每一个切片都要求是可变的。类似需求在安全 Rust 中是很难实现的，因为要对同一个数组做两个可变借用：

```rust
fn split_at_mut(slice: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = slice.len();

    assert!(mid <= len);

    (&mut slice[..mid], &mut slice[mid..])
}

fn main() {
    let mut v = vec![1, 2, 3, 4, 5, 6];

    let r = &mut v[..];

    let (a, b) = split_at_mut(r, 3);

    assert_eq!(a, &mut [1, 2, 3]);
    assert_eq!(b, &mut [4, 5, 6]);
}
```

在 `split_at_mut` 企图对 `slice` 进行两次可变借用，因此会直接报错：

```log
error[E0499]: cannot borrow `*slice` as mutable more than once at a time
 --> src\main.rs:6:30
  |
1 | fn split_at_mut(slice: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
  |                        - let's call the lifetime of this reference `'1`
...
6 |     (&mut slice[..mid], &mut slice[mid..])
  |     -------------------------^^^^^--------
  |     |     |                  |
  |     |     |                  second mutable borrow occurs here
  |     |     first mutable borrow occurs here
  |     returning this value requires that `*slice` is borrowed for `'1`

```

对于 Rust 的借用检查器来说，它无法理解我们是分别借用了同一个切片的两个不同部分，但事实上，这种行为是没任何问题的，毕竟两个借用没有任何重叠之处。

所以只能绕开编译器，使用 `unsafe` 来实现了:

```rust
use std::slice;

fn split_at_mut(slice: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = slice.len();
    let ptr = slice.as_mut_ptr();

    assert!(mid <= len);

    unsafe {
        (
            slice::from_raw_parts_mut(ptr, mid),
            slice::from_raw_parts_mut(ptr.add(mid), len - mid),
        )
    }
}

fn main() {
    let mut v = vec![1, 2, 3, 4, 5, 6];

    let r = &mut v[..];

    let (a, b) = split_at_mut(r, 3);

    assert_eq!(a, &mut [1, 2, 3]);
    assert_eq!(b, &mut [4, 5, 6]);
}
```

上面这段代码：

- `as_mut_ptr` 会返回指向 `slice` 首地址的裸指针 `*mut i32`.
- `slice::from_raw_parts_mut` 函数通过指针和长度来创建一个新的切片，简单来说，该切片的初始地址是 `ptr`，长度为 `mid`.
- `ptr.add(mid)` 可以获取第二个切片的初始地址，由于切片中的元素是 `i32` 类型，每个元素都占用了 `4` 个字节的内存大小，因此我们不能简单的用 `ptr + mid` 来作为初始地址，而应该使用 `ptr + 4 * mid`，但是这种使用方式并不安全，因此 `.add` 方法是最佳选择

为了保证 `ptr.add(mid)`，在代码的前面添加了 `assert!(mid <= len)` 以防止指针越界。

所以这个函数是非常安全的，无需将其声明为 `unsafe fn`.

## FFI 

`FFI`（Foreign Function Interface）可以用来与其它语言进行交互。下面的例子演示了如何调用 C 标准库中的 `abs` 函数：

```rust
extern "C" {
    fn abs(input: i32) -> i32;
}

fn main() {
    unsafe {
        println!("Absolute value of -3 according to C: {}", abs(-3));
    }
}
```

C 语言的代码定义在了 `extern` 代码块中， 而 `extern` 必须使用 `unsafe` 才能进行进行调用，原因在于其它语言的代码并不会强制执行 Rust 的规则，因此 Rust 无法对这些代码进行检查，最终还是要靠开发者自己来保证代码的正确性和程序的安全性。

### ABI

在 `extern "C"` 代码块中，我们列出了想要调用的外部函数的签名。其中 `"C"` 定义了外部函数所使用的应用二进制接口 `ABI` (Application Binary Interface)：`ABI` 定义了如何在汇编层面来调用该函数。在所有 `ABI` 中，C 语言的是最常见的。

### 在其它语言中调用 Rust 函数

可以使用 `extern` 来创建一个接口，其它语言可以通过该接口来调用相关的 Rust 函数。但是此处的语法与之前有所不同，之前用的是语句块，而这里是在函数定义时加上 `extern` 关键字，当然，别忘了指定相应的 ABI：

```rust
#[no_mangle]
pub extern "C" fn call_from_c() {
    println!("Just called a Rust function from C!");
}
```

上面的代码可以让 `call_from_c` 函数被 `C` 语言的代码调用，当然，前提是将其编译成一个共享库，然后链接到 C 语言中。

`#[no_mangle]` 用于告诉 Rust 编译器：不要乱改函数的名称。`Mangling` 的定义是：当 Rust 因为编译需要去修改函数的名称，例如为了让名称包含更多的信息，这样其它的编译部分就能从该名称获取相应的信息，这种修改会导致函数名变得相当不可读。因此，为了让 Rust 函数能顺利被其它语言调用，必须要禁止掉该功能。

## 实现 unsafe 特征

之所以会有 `unsafe` 的特征，是因为该特征至少有一个方法包含有编译器无法验证的内容。`unsafe` 特征的声明很简单：

```rust
unsafe trait Foo {
    // 方法列表
}

unsafe impl Foo for i32 {
    // 实现相应的方法
}

fn main() {}
```

通过 unsafe impl 的使用，我们告诉编译器：相应的正确性由我们自己来保证。

## 访问 union 中的字段

`union` 主要用于跟 C 代码进行交互。

访问 union 的字段是不安全的，因为 Rust 无法保证当前存储在 union 实例中的数据类型:

```rust
#[repr(C)]
union MyUnion {
    f1: u32,
    f2: f32,
}
```

**一个联合体的长度等于其内部长度最大的成员的长度，并且它们都共享着同一段内存。**

