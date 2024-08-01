---
title: 循环引用与自引用
date: 2024-05-04 13:18:16
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---


# Weak 与循环引用

## 制造循环引用

关于循环引用，如果没有充足的 Rust 经验，可能都无法造出一份代码来再现它：

```rust
use crate::ListNode::{Next, Nil};
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug)]
enum ListNode {
    Next(i32, RefCell<Rc<ListNode>>),
    Nil,
}

impl ListNode {
    fn tail(&self) -> Option<&RefCell<Rc<ListNode>>> {
        match self {
            Next(_, item) => Some(item),
            Nil => None,
        }
    }
}

impl Drop for ListNode {
    fn drop(&mut self) {
        match self {
            Next(val, _) => {
                println!("I am dropped my value is {val}!")
            }
            Nil => {
                println!("I am dropped without value!")
            }
        }
    }
}
```

这里是一个简单链表的实现，每一个 `ListNode` 代表一个链表节点。

使用：

```rust
fn main() {
    let a = Rc::new(Next(5, RefCell::new(Rc::new(Nil))));

    println!("a的初始化rc计数 = {}", Rc::strong_count(&a));
    println!("a指向的节点 = {:?}", a.tail());

    // 创建`b`到`a`的引用
    let b = Rc::new(Next(10, RefCell::new(Rc::clone(&a))));

    println!("在b创建后，a的rc计数 = {}", Rc::strong_count(&a));
    println!("b的初始化rc计数 = {}", Rc::strong_count(&b));
    println!("b指向的节点 = {:?}", b.tail());

    // 利用RefCell的可变性，创建了`a`到`b`的引用
    if let Some(link) = a.tail() {
        *link.borrow_mut() = Rc::clone(&b);
    }

    println!("在更改a后，b的rc计数 = {}", Rc::strong_count(&b));
    println!("在更改a后，a的rc计数 = {}", Rc::strong_count(&a));

    // 下面一行println!将导致循环引用
    // 我们可怜的8MB大小的main线程栈空间将被它冲垮，最终造成栈溢出
    // println!("a next item = {:?}", a.tail());
}
```

这个类型定义看着复杂，使用起来更复杂！不过排除这些因素，我们可以清晰看出：

- 在创建了 `a` 后，紧接着就使用 `a` 创建了 `b`，因此 `b` 引用了 `a`
- 然后我们又利用 `Rc` 克隆了 `b`，然后通过 `RefCell` 的可变性，让 `a` 引用了 `b`

至此成功创建了循环引用 `a` -> `b` -> `a` -> `b` ····

代码输出：

```log
a的初始化rc计数 = 1
a指向的节点 = Some(RefCell { value: Nil })
在b创建后，a的rc计数 = 2
b的初始化rc计数 = 1
b指向的节点 = Some(RefCell { value: Next(5, RefCell { value: Nil }) })
I am dropped without value!
在更改a后，b的rc计数 = 2
在更改a后，a的rc计数 = 2
```

可以发现 `a` 和 `b` 并没有释放，其中也没有它们的 `Drop` 打印。

在 `main` 函数结束前，`a` 和 `b` 的引用计数均是 `2`，随后 `b` 触发 `Drop`，此时引用计数会变为 `1`，并不会归 `0`，因此 `b` 所指向内存不会被释放，同理可得 `a` 指向的内存也不会被释放，最终发生了内存泄漏。

下面一张图很好的展示了这种引用循环关系：

![循环引用](https://selfb.asia/images/2024/05/v2-2dbfc981f05019bf70bf81c93f956c35_1440w.webp)

## Weak

`Weak` 非常类似于 `Rc`，但是与 `Rc` 持有所有权不同，`Weak` 不持有所有权，它仅仅保存一份指向数据的弱引用：如果你想要访问数据，需要通过 `Weak` 指针的 `upgrade` 方法实现，该方法返回一个类型为 `Option<Rc<T>>` 的值。

弱引用不计入所有权，因此它无法阻止所引用的内存值被释放掉，而且 `Weak` 本身不对值的存在性做任何担保，引用的值还存在就返回 `Some`，不存在就返回 `None`。

| Weak                              | Rc                      |
|-----------------------------------|-------------------------|
| 不计数                               | 引用计数                    |
| 不拥有所有权                            | 拥有值的所有权                 |
| 不阻止值被释放(drop)                     | 所有权计数归零，才能 drop         |
| 引用的值存在返回 Some，不存在返回 None          | 引用的值必定存在                |
| 通过 upgrade 取到 `Option<Rc<T>>`，然后再取值 | 通过 Deref 自动解引用，取值无需任何操作 |


`Weak` 使用方式简单总结下：对于父子引用关系，可以让父节点通过 `Rc` 来引用子节点，然后让子节点通过 Weak 来引用父节点。

一个非常简单的例子：

```rust
use std::rc::Rc;

fn main() {
    // 创建Rc，持有一个值5
    let five = Rc::new(5);

    // 通过Rc，创建一个Weak指针
    let weak_five = Rc::downgrade(&five);

    // Weak引用的资源依然存在，取到值5
    let strong_five: Option<Rc<_>> = weak_five.upgrade();
    assert_eq!(*strong_five.unwrap(), 5);

    // 手动释放资源`five`
    drop(five);

    // Weak引用的资源已不存在，因此返回None
    let strong_five: Option<Rc<_>> = weak_five.upgrade();
    assert_eq!(strong_five, None);
}
```

# 结构体中的自引用

## 正常的自引用

```rust
struct SelfRef<'a> {
    value: String,

    // 该引用指向上面的value
    pointer_to_value: &'a str,
}

fn main(){
    let s = "aaa".to_string();
    let v = SelfRef {
        value: s,
        pointer_to_value: &s
    };
}
```

运行后报错：

```log
 let v = SelfRef {
12 |         value: s,
   |                - value moved here
13 |         pointer_to_value: &s
   |                           ^^ value borrowed here after move
```

因为我们试图同时使用值和值的引用，最终所有权转移和借用一起发生了。所以这里无论如何是无法实现的。

## 使用 Option 实现自引用

可以使用 `Option` 分两步来实现：

```rust
#[derive(Debug)]
struct WhatAboutThis<'a> {
    name: String,
    nickname: Option<&'a str>,
}

fn main() {
    let mut tricky = WhatAboutThis {
        name: "Annabelle".to_string(),
        nickname: None,
    };
    tricky.nickname = Some(&tricky.name[..4]);

    println!("{:?}", tricky);
}
```

虽然上述代码可以执行，但是限制较多，例如它无法从一个函数创建并返回：

```rust
fn creator<'a>() -> WhatAboutThis<'a> {
    let mut tricky = WhatAboutThis {
        name: "Annabelle".to_string(),
        nickname: None,
    };
    tricky.nickname = Some(&tricky.name[..4]);

    tricky
}
```

报错：

```log
error[E0515]: cannot return value referencing local data `tricky.name`
  --> src/main.rs:24:5
   |
22 |     tricky.nickname = Some(&tricky.name[..4]);
   |                             ----------- `tricky.name` is borrowed here
23 |
24 |     tricky
   |     ^^^^^^ returns a value referencing data owned by the current function
```

其实从函数签名就能看出来端倪，`'a` 生命周期是凭空产生的，而且编译器也无法根据入参推断，所以报错了。

## 无法被移动的 Pin

`Pin` 可以固定住一个值，防止该值在内存中被移动。

通过开头我们知道，自引用最麻烦的就是创建引用的同时，值的所有权会被转移，而通过 `Pin` 就可以很好的防止这一点：

```rust
use std::marker::PhantomPinned;
use std::pin::Pin;
use std::ptr::NonNull;

// 下面是一个自引用数据结构体，因为 slice 字段是一个指针，指向了 data 字段
// 我们无法使用普通引用来实现，因为违背了 Rust 的编译规则
// 因此，这里我们使用了一个裸指针，通过 NonNull 来确保它不会为 null
struct Unmovable {
    data: String,
    slice: NonNull<String>,
    _pin: PhantomPinned,
}

impl Unmovable {
    // 为了确保函数返回时数据的所有权不会被转移，我们将它放在堆上，唯一的访问方式就是通过指针
    fn new(data: String) -> Pin<Box<Self>> {
        let res = Unmovable {
            data,
            // 只有在数据到位时，才创建指针，否则数据会在开始之前就被转移所有权
            slice: NonNull::dangling(),
            _pin: PhantomPinned,
        };
        let mut boxed = Box::pin(res);

        let slice = NonNull::from(&boxed.data);
        // 这里其实安全的，因为修改一个字段不会转移整个结构体的所有权
        unsafe {
            let mut_ref: Pin<&mut Self> = Pin::as_mut(&mut boxed);
            Pin::get_unchecked_mut(mut_ref).slice = slice;
        }
        boxed
    }
}

fn main() {
    let unmoved = Unmovable::new("hello".to_string());
    // 只要结构体没有被转移，那指针就应该指向正确的位置，而且我们可以随意移动指针
    let mut still_unmoved = unmoved;
    assert_eq!(still_unmoved.slice, NonNull::from(&still_unmoved.data));

    // 因为我们的类型没有实现 `Unpin` 特征，下面这段代码将无法编译
    // let mut new_unmoved = Unmovable::new("world".to_string());
    // std::mem::swap(&mut *still_unmoved, &mut *new_unmoved);
}
```