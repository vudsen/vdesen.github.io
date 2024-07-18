---
title: Module pin
date: 2024-07-12 20:50:48
categories: "rust-doc"
---

> [std::pin](https://doc.rust-lang.org/std/pin/index.html#structs)
>
> version: 1.79.0

# Module std::pin

一种用于将数据固定到内存地址的类型。

当你需要依赖一个确定的、不会被移动的值时非常有用，或者说你希望这个值的内存地址是不可以变化的。当有一个或多个[指针](https://doc.rust-lang.org/std/primitive.pointer.html)执向这个值的时候是非常有用的。rust 提供了一种担保，可以让一个指针指向的值将：

1. 不会被移出它所在的内存地址
2. 简单点说，保证这个值在同一内存地址上一直有效

而这种担保被叫做 "pining"。当一个值满足这些条件时，就可以说它被 "pinned" 了，这个值将永远(直到生命周期结束)被固定到对应的内存地址上，就像被固定到一个钉板上。当你需要构建一个 [unsafe](https://doc.rust-lang.org/std/keyword.unsafe.html) 代码块时，固定一个值能够帮助你确定一个原始指针(raw pointer)的值仍然有效。[在后面也会提到](#subtle-details-and-the-drop-guarantee)，*将一个值从创建到生命周期结束的期间固定住是非常有必要的* (原文: this is necessarily from the time the value is first pinned until the end of its lifespan)。"pining" 的概念是非常必要的，当你想要使用安全的接口来实现一些高级特性时，例如自引用或者侵入式数据结构，这些操作在 safe Rust 的[引用](https://doc.rust-lang.org/std/primitive.reference.html)借用检查中是不可能实现的。

"Pinning" 允许我们去把内存中存在的一个值转换成一种特殊状态，在这种状态下，任何安全的代码都无法移动它的内存地址，也无法用其它方式来*无效化*(invalidate)它当前所在的内存地址（除非这个值实现了 [Unpin](https://doc.rust-lang.org/std/marker/trait.Unpin.html)，这个特征将在[下面提到](#unpin)）。任何想要和固定值交互的操作，都是有能力或有潜力去违背这些担保的，所以这些操作必须承诺它们不会真的去违背这些担保，所以需要使用 [unsafe](https://doc.rust-lang.org/std/keyword.unsafe.html) 关键字来作出相关的承诺，此时这个保证将会从编译器负责改为由用户负责。通过这种方法，我们可以允许 [unsafe](https://doc.rust-lang.org/std/keyword.unsafe.html) 代码依赖于任意 `pinned value`，以便在这个`pinned value` 有效时去解引用。

需要注意的是，只要你不使用 [unsafe](https://doc.rust-lang.org/std/keyword.unsafe.html)，那么就不可能以不正常的方式创建或者滥用 `pinned value`。查阅 [Pin<Ptr>](https://doc.rust-lang.org/std/pin/struct.Pin.html) 以了解如何固定一个值，以及如何从用户的角度通过非 [unsafe](https://doc.rust-lang.org/std/keyword.unsafe.html) 代码来使用固定值。

本文档的剩余部分，如果你正在使用 [Pin<Ptr>](https://doc.rust-lang.org/std/pin/struct.Pin.html) 实现一个接口中的不安全部分，并且接口中需要依赖于"pinning" 以确保有消息，那么下面就会展示一些相关事实依据，以帮助你更好的了解。

## 什么是 "moving"?

当我们说一个值被 *moved*，可以说是编译器一个字节一个字节的将值从一个内存地址复制到另外一个内存地址。在机器语义上，这等同于在内存中 [Copy](https://doc.rust-lang.org/std/marker/trait.Copy.html) 一块到另外一块。在 Rust 中，"move" 在语义上还表示了一个变量所有权的转移，这也是它和 [Copy](https://doc.rust-lang.org/std/marker/trait.Copy.html) 最关键的不同之处。然而，就本模块的文档而言，当我们使用斜体书写 *move* 时，表示这个值已经机械的从内存中 *move* 到一个新的地方了 (即没有所有权的转移)。

任何的值在 Rust 中都是可以轻松移动的。这表示一个值在 borrows 前后所在的内存地址并不是固定的。编译器被允许 *move* 一个值到一个新的内存地址，并且在 *move* 时不会运行任何代码来提示这个值的内存地址发生了变动。尽管编译器不会在没有明确发生 move 语义的前提下主动插入内存 *move* 代码，但是也还是会有很多地方会导致一个值被 moved。例如，当我们进行赋值或者将一个参数传递给函数。

```rust
#[derive(Default)]
struct AddrTracker(Option<usize>);

impl AddrTracker {
    // 如果我们还没有获取 self 的地址，那么就保存它当前的地址
    // 如果我们有，就会确认当前 self 的内存地址和之前保存的是否一致，如果不一样，则会 panic
    fn check_for_move(&mut self) {
        let current_addr = self as *mut Self as usize;
        match self.0 {
            None => self.0 = Some(current_addr),
            Some(prev_addr) => assert_eq!(prev_addr, current_addr),
        }
    }
}


// 创建一个 tracker 并且保存它的初始地址
let mut tracker = AddrTracker::default();
tracker.check_for_move();

// 这里我们遮蔽了变量。这里存在语义上面的移动，因此也会造成机器语义上的 *move*
let mut tracker = tracker;

// May panic!
// tracker.check_for_move();
```

[RUN](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021)

在这种场景下，Rust 不会保证 `check_for_move()` 永远不会 panic，因为在很多情况下，编译器允许去 *move* `tracker`。

寻常的指针指针类型例如 [Box<T>](https://doc.rust-lang.org/std/boxed/struct.Box.html) 和 [&mut T](https://doc.rust-lang.org/std/primitive.reference.html)，也同样允许 *moving* 它们指向的值：你可以把值移出 [Box<T>](https://doc.rust-lang.org/std/boxed/struct.Box.html)，或者你可以使用 [mem::replace](https://doc.rust-lang.org/std/mem/fn.replace.html) 来把 `T` 移出 [&mut T](https://doc.rust-lang.org/std/primitive.reference.html)。因此，把一个值放在指针后，是无法确保它的内存地址不会改变的。

## 什么是 pinning

当我们说一个值被 *pinned* 是表示它进入了一种状态，这个状态可以保证它可以一直在内存中的同一个位置，这个状态从这个值被 pinned 到它自己的 [drop](https://doc.rust-lang.org/std/ops/trait.Drop.html#tymethod.drop) 方法被调用之间一直有效。

### Address-sensitive values, AKA “when we need pinning”

> 标题机翻: 地址敏感值，又称“当我们需要固定时”

在Rust中，大部分的值对被 *moved* 都是不敏感的 (问题不大的)。任何可以被 *moved* 的值都应该实现 [Unpin](https://doc.rust-lang.org/std/marker/trait.Unpin.html)，这个我们在[下面](#unpin)会讲到。

[Pin](https://doc.rust-lang.org/std/pin/struct.Pin.html) 专门被用于围绕一些有状态的类型实现安全的接口，在这些状态下它们(有状态的类型)会变得地址敏感。一个值在地址敏感的状态下，不能忍受被随意 *moved*。一个值在它的寿命中，必须在整个地址敏感部分保持 *un-moved* 并且有效，因为一些接口会依赖于这些不变量来保证它自己的代码实现是健全的。

如果你正在考虑要将哪些类型变的地址敏感，你应该考虑那些拥有指针，并且是指向自己部分数据的指针，例如自引用类型。为了实现一个健全的类型，指向自己数据的指针必须被证明它们的访问是合法的。但是如果一个值被 *moved*了，这个指针仍然指向的是旧内存地址，并且指向的也是旧的值，而不是 `self` 被 *moved* 后的新地址，因此就会变得不合法。一个十分关键的例子就是，自引用类型是编译器生成的状态机，用于给 `async fn`实现 [Future](https://doc.rust-lang.org/std/future/trait.Future.html)。

## subtle-details-and-the-drop-guarantee

## unpin

