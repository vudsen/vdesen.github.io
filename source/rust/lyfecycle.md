---
title: 生命周期
date: 2023-01-30 23:09:10
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/Rust/" }
---

# 悬垂指针和生命周期

生命周期的主要作用是避免悬垂引用，它会导致程序引用了本不该引用的数据：
```rust
{
    let r;

    {
        let x = 5;
        r = &x;
    }

    println!("r: {}", r);
}
```

`r` 引用了内部花括号中的 `x` 变量，但是 `x` 会在内部花括号 `}` 处被释放，因此回到外部花括号后，`r` 会引用一个无效的 `x`。

此处 `r` 就是一个悬垂指针，它引用了提前被释放的变量 `x`，编译器在编译时就会报错。

#借用检查

为了保证 Rust 的所有权和借用的正确性，Rust 使用了一个借用检查器(Borrow checker)，来检查我们程序的借用正确性：
```rust
{
    let r;                // ---------+-- 'a
                          //          |
    {                     //          |
        let x = 5;        // -+-- 'b  |
        r = &x;           //  |       |
    }                     // -+       |
                          //          |
    println!("r: {}", r); //          |
}                         // ---------+
```

这段代码和之前的一模一样，唯一的区别在于增加了对变量生命周期的注释。这里，`r` 变量被赋予了生命周期 `'a`，`x` 被赋予了生命周期 `'b`，从图示上可以明显看出生命周期 `'b` 比 `'a` 小很多。

在编译期，Rust 会比较两个变量的生命周期，结果发现 `r` 明明拥有生命周期 `'a`，但是却引用了一个小得多的生命周期 `'b`，在这种情况下，编译器会认为我们的程序存在风险，因此拒绝运行。

如果想要编译通过，也很简单，只要 'b 比 'a 大就好。总之，x 变量只要比 r 活得久，那么 r 就能随意引用 x 且不会存在危险：

```rust
{
    let x = 5;            // ----------+-- 'b
                          //           |
    let r = &x;           // --+-- 'a  |
                          //   |       |
    println!("r: {}", r); //   |       |
                          // --+       |
}                         // ----------+
```

## 函数中的生命周期

```rust
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}

fn main() {
    let string1 = String::from("abcd");
    let string2 = "xyz";

    let result = longest(string1.as_str(), string2);
    println!("The longest string is {}", result);
}
```

这段代码看似没有问题，实际上编译期就会报错：
```log
error[E0106]: missing lifetime specifier
 --> src/main.rs:9:33
  |
9 | fn longest(x: &str, y: &str) -> &str {
  |               ----     ----     ^ expected named lifetime parameter // 参数需要一个生命周期
  |
  = help: this function's return type contains a borrowed value, but the signature does not say whether it is
  borrowed from `x` or `y`
  = 帮助： 该函数的返回值是一个引用类型，但是函数签名无法说明，该引用是借用自 `x` 还是 `y`
help: consider introducing a named lifetime parameter // 考虑引入一个生命周期
  |
9 | fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
  |           ^^^^    ^^^^^^^     ^^^^^^^     ^^^
```

因为在此处编译器无法确定返回值的生命周期，因为两个参数的生命周期可能并不一样。

要想正常使用该函数，则需要我们手动进行生命周期标注。

# 生命周期标注语法

标记的生命周期只是为了取悦编译器，让编译器不要难为我们，实际上对代码的运行不会有任何影响。

声明周期以`'`开头，名称往往是一个单独的小写字母，一般从`a`开始：
```rust
&i32        // 一个引用
&'a i32     // 具有显式生命周期的引用
&'a mut i32 // 具有显式生命周期的可变引用
```
例如下面的函数声明：
```rust
fn useless<'a>(first: &'a i32, second: &'a i32) {}
```
此处生命周期标注仅仅说明，这两个参数 first 和 second 至少活得和'a 一样久，实际上，`'a`的声明周期是`first`和`second`这两个的交集。

再例如之前的例子，加上生命周期后：
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}
```

此处 `longest` 函数并不知道 x 和 y 具体会活多久，但是只要知道它们的作用域至少能持续 'a 这么长就行：
```rust
fn main() {
    let string1 = String::from("long string is long");
    let result;
    {
        // string1 和 string2 生命周期的交集开始
        let string2 = String::from("xyz");
        result = longest(string1.as_str(), string2.as_str());
        // string1 和 string2 生命周期的交集结束
    }
    // error 在生命周期交集外使用
    println!("The longest string is {}", result);
}
```

## 深入了解

生命周期的声明不需要为全部的变量提供：
```rust
fn longest<'a>(x: &'a str, y: &str) -> &'a str {
    x
}
```

例如上面的函数中，返回值的声明周期和参数`x`保持一致，和`y`的生命周期没有任何关系。

---

**函数的返回值如果是一个引用类型，那么它的生命周期只会来源于：**

- 函数参数的生命周期
- 函数体中某个新建引用的生命周期

如果是后者，则是典型的悬垂引用，此时是无法通过编译的，只能考虑返回所有权而不是引用。

# 结构体中的生命周期

```rust
struct ImportantExcerpt<'a> {
    part: &'a str,
}

fn main() {
    let novel = String::from("Call me Ishmael. Some years ago...");
    let first_sentence = novel.split('.').next().expect("Could not find a '.'");
    let i = ImportantExcerpt {
        part: first_sentence,
    };
}
```

ImportantExcerpt 结构体中有一个引用类型的字段 part，因此需要为它标注上生命周期。结构体的生命周期标注语法跟泛型参数语法很像，需要对生命周期参数进行声明 <'a>。该生命周期标注说明，结构体 ImportantExcerpt 所引用的字符串 str 必须比该结构体活得更久。

从 main 函数实现来看，ImportantExcerpt 的生命周期从第 4 行开始，到 main 函数末尾结束，而该结构体引用的字符串从第一行开始，也是到 main 函数末尾结束，可以得出结论结构体引用的字符串活得比结构体久，这符合了编译器对生命周期的要求，因此编译通过。

例如如下代码无法通过编译：

```rust
#[derive(Debug)]
struct ImportantExcerpt<'a> {
    part: &'a str,
}

fn main() {
    let i;
    {
        let novel = String::from("Call me Ishmael. Some years ago...");
        let first_sentence = novel.split('.').next().expect("Could not find a '.'");
        i = ImportantExcerpt {
            part: first_sentence,
        };
    }
    println!("{:?}",i);
}
```

观察代码，可以看出结构体比它引用的字符串活得更久，引用字符串在内部语句块末尾 } 被释放后，println! 依然在外面使用了该结构体，因此会导致无效的引用。