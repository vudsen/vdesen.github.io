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

"Pinning" 允许我们去把内存中存在的一个值转换成一种特殊状态，在这种状态下，任何安全的代码都无法移动它的内存地址，也无法用其它方式来*无效化*(invalidate)它当前所在的内存地址（除非这个值实现了 [Unpin](https://doc.rust-lang.org/std/marker/trait.Unpin.html)，这个特征将在[下面提到](#unpin)）。任何想要和固定值交互的操作，都是有能力或有潜力去违背这些担保的，所以这些操作必须承诺它们不会真的去违背这些担保，所以需要使用 [unsafe](https://doc.rust-lang.org/std/keyword.unsafe.html) 关键字来作出相关的承诺，表示

## subtle-details-and-the-drop-guarantee

## unpin