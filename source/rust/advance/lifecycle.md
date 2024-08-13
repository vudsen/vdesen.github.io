---
title: 生命周期
date: 2024-04-13 15:50:51
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 不太聪明的生命周期检查

## 例子 1

```rust
#[derive(Debug)]
struct Foo;

impl Foo {
    fn mutate_and_share(&mut self) -> &Self {
        &*self
    }
    fn share(&self) {}
}

fn main() {
    let mut foo: Foo = Foo;
    let loan: &Foo = foo.mutate_and_share();
    foo.share();
    println!("{:?}", loan);
}
```

在这段代码中，`mutate_and_share` 将当前的 `Foo` 引用解引用，然后返回一个新的引用回去，在这里这个新的引用被赋值给了 `loan` 参数。

此时 `loan` 是一个不可变借用，之后的 `foo.share()` 同样也进行了不可变借用。

在最后，使用 `println` 打印了 `loan`，因为多个不可变借用可以同时存在，因此代码应该通过编译。

但是运行后编译器报错：

```bash
error[E0502]: cannot borrow `foo` as immutable because it is also borrowed as mutable
  --> src\main.rs:31:5
   |
30 |     let loan = foo.mutate_and_share();
   |                --- mutable borrow occurs here
31 |     foo.share();
   |     ^^^ immutable borrow occurs here
32 |     println!("{:?}", loan);
   |                      ---- mutable borrow later used here
```

第一眼看过去肯定是懵逼的，对函数进行生命周期标识后会更好理解：

```rust
struct Foo;

impl Foo {
    fn mutate_and_share<'a>(&'a mut self) -> &'a Self {
        &'a *self
    }
    fn share<'a>(&'a self) {}
}

fn main() {
    'b: {
        let mut foo: Foo = Foo;
        'c: {
            let loan: &'c Foo = Foo::mutate_and_share::<'c>(&'c mut foo);
            'd: {
                Foo::share::<'d>(&'d foo);
            }
            println!("{:?}", loan);
        }
    }
}
```

因为我们在调用 `mutate_and_share` 时，对 `foo` 进行了可变借用，然而返回出来的引用，也就是 `loan`，它的生命周期和 `foo` 是保持一致的，即在 `println` 时，foo的不可变借用仍然存在。

如果将代码改成下面的样子就可以正常通过编译并运行：
```rust
#[derive(Debug)]
struct Foo;

impl Foo {
    fn mutate_and_share(&mut self) -> &Self {
        &*self
    }
    fn share(&self) {}
}

fn main() {
    let mut foo = Foo;
    let loan = foo.mutate_and_share();
    {
        foo.share();
    }
    let loan = foo.mutate_and_share();
    println!("{:?}", loan);
}
```

## 例子 2

```rust
#![allow(unused)]
fn main() {
    use std::collections::HashMap;
    use std::hash::Hash;
    fn get_default<'m, K, V>(map: &'m mut HashMap<K, V>, key: K) -> &'m mut V
    where
        K: Clone + Eq + Hash,
        V: Default,
    {
        match map.get_mut(&key) {
            Some(value) => value,
            None => {
                map.insert(key.clone(), V::default());
                map.get_mut(&key).unwrap()
            }
        }
    }
}
```

运行之后：

```bash
error[E0499]: cannot borrow `*map` as mutable more than once at a time
  --> src\main.rs:30:17
   |
22 |       fn get_default<'m, K, V>(map: &'m mut HashMap<K, V>, key: K) -> &'m mut V
   |                      -- lifetime `'m` defined here
...
27 |           match map.get_mut(&key) {
   |           -     --- first mutable borrow occurs here
   |  _________|
   | |
28 | |             Some(value) => value,
29 | |             None => {
30 | |                 map.insert(key.clone(), V::default());
   | |                 ^^^ second mutable borrow occurs here
31 | |                 map.get_mut(&key).unwrap()
32 | |             }
33 | |         }
   | |_________- returning this value requires that `*map` is borrowed for `'m`
```

可以发现 `match` 中的变量一直活到了 `match` 结束，也就是说对 `map` 的可变借用一直持续到了 `match` 结束，因此在 `match` 里面，不能再进行任何借用。

可以修改为如下的代码：

```rust
#![allow(unused)]
fn main() {
    use std::collections::HashMap;
    use std::hash::Hash;
    fn get_default<'m, K, V>(map: &'m mut HashMap<K, V>, key: K) -> &'m mut V
    where
        K: Clone + Eq + Hash,
        V: Default,
    {
        if let None = map.get_mut(&key) {
          map.insert(key.clone(), V::default());
        }
        map.get_mut(&key).unwrap()
    }
}
```

上面的代码避免了将 `map.get_mut` 的值赋值给某个变量，以防它获得较大的生命周期。

## 例子 3

来看下面这段神奇的代码：

```rust
#[derive(Debug)]
struct Life<'a> {
    val: &'a str
}

impl<'a> Life<'a> {
    
    fn mut_brrow(&'a mut self) { }

}

fn main() {
    let mut life = Life {
        val: "eee"
    };

    {
        let mut_ref = &mut life;
        mut_ref.mut_brrow();
    }

    println!("{:?}", life);
}
```

运行后报错：
```bash
error[E0502]: cannot borrow `life` as immutable because it is also borrowed as mutable
  --> src\main.rs:22:22
   |
18 |         let mut_ref = &mut life;
   |                       --------- mutable borrow occurs here
...
22 |     println!("{:?}", life);
   |                      ^^^^
   |                      |
   |                      immutable borrow occurs here
   |                      mutable borrow later used here
   |
```

但是一旦你把 `mut_brrow` 入参的生命周期标识删除：`fn mut_brrow(&mut self)`。这段代码就可以正常运行...

我们在这这里给它标上生命周期标识`'a`，就表示 `mut_ref` 活的跟 `life` 一样久，虽然它实际并没有活这么久，在大括号结束后它就被回收了，但是 Rust 编译器并不这么认为。。



# 生命周期约束 HRTB

生命周期约束跟特征约束类似，都是通过形如 'a: 'b 的语法，来说明两个生命周期的长短关系。

## 'a >= 'b

假设有两个引用 &'a i32 和 &'b i32，它们的生命周期分别是 'a 和 'b，若 'a >= 'b，则可以定义 'a:'b，表示 'a 至少要活得跟 'b 一样久。

```rust
struct DoubleRef<'a, 'b:'a, T> {
    r: &'a T,
    s: &'b T
}
```

例如上述代码定义一个结构体，它拥有两个引用字段，类型都是泛型 T，每个引用都拥有自己的生命周期，由于我们使用了生命周期约束 'b: 'a，因此 'b 必须活得比 'a 久，也就是结构体中的 s 字段引用的值必须要比 r 字段引用的值活得要久。

## T: 'a

表示类型 T 必须比 'a 活得要久：

```rust
struct Ref<'a, T: 'a> {
    r: &'a T
}
```

因为结构体字段 r 引用了 T，因此 r 的生命周期 'a 必须要比 T 的生命周期更短(被引用者的生命周期必须要比引用长)。

从 1.31 版本开始，编译器可以自动推导 T: 'a 类型的约束，因此我们只需这样写即可：

```rust
struct Ref<'a, T> {
    r: &'a T
}
```

# 闭包函数的消除规则

来看下面一段代码：

```rust
fn fn_elision(x: &i32) -> &i32 { x }

fn main() {
    let closure_slision = |x: &i32| -> &i32 { x };
}
```

运行之后可以发现，我们声明的函数没有报错，但是声明的闭包函数却报错了：

```bash
error: lifetime may not live long enough
  --> src\main.rs:20:47
   |
20 |     let closure_slision = |x: &i32| -> &i32 { x };
   |                               -        -      ^ returning this value requires that `'1` must outlive `'2`
   |                               |        |
   |                               |        let's call the lifetime of this reference `'2`
   |                               let's call the lifetime of this reference `'1`
```

然而实际上，结论是：**这个问题，可能很难被解决，建议大家遇到后，还是老老实实用正常的函数，不要秀闭包了。**

对于函数的生命周期而言，它的消除规则之所以能生效是因为它的生命周期完全体现在签名的引用类型上，在函数体中无需任何体现：

```rust
fn fn_elision(x: &i32) -> &i32 {..}
```

因此编译器可以做各种编译优化，也很容易根据参数和返回值进行生命周期的分析，最终得出消除规则。

但是对于闭包，它的生命周期分散在参数和闭包函数体中(主要是它没有确切的返回值签名)，编译器就必须深入到闭包函数体中，去分析和推测生命周期，复杂度因此急剧提升。

> **用 Fn 特征解决闭包生命周期**
> 
> ```rust
> fn main() {
>    let closure_slision = fun(|x: &i32| -> &i32 { x });
>    assert_eq!(*closure_slision(&45), 45);
>    // Passed !
> }
> 
> fn fun<T, F: Fn(&T) -> &T>(f: F) -> F {
>    f
> }
> ```

# NLL (Non-Lexical Lifetime)

引用的生命周期正常来说应该从借用开始一直持续到作用域结束，但是这种规则会让多引用共存的情况变得更复杂：

```rust
fn main() {
   let mut s = String::from("hello");

    let r1 = &s;
    let r2 = &s;
    println!("{} and {}", r1, r2);
    // 新编译器中，r1,r2作用域在这里结束

    let r3 = &mut s;
    println!("{}", r3);
}
```

按照上述规则，这段代码将会报错，因为 r1 和 r2 的不可变引用将持续到 main 函数结束，而在此范围内，我们又借用了 r3 的可变引用，这违反了借用的规则：要么多个不可变借用，要么一个可变借用。

好在，该规则从 1.31 版本引入 NLL 后，就变成了：**引用的生命周期从借用处开始，一直持续到最后一次使用的地方**。

再来看一段关于 NLL 的代码解释：

```rust
let mut u = 0i32;
let mut v = 1i32;
let mut w = 2i32;

// lifetime of `a` = α ∪ β ∪ γ
let mut a = &mut u;     // --+ α. lifetime of `&mut u`  --+ lexical "lifetime" of `&mut u`,`&mut u`, `&mut w` and `a`
use(a);                 //   |                            |
*a = 3; // <-----------------+                            |
...                     //                                |
a = &mut v;             // --+ β. lifetime of `&mut v`    |
use(a);                 //   |                            |
*a = 4; // <-----------------+                            |
...                     //                                |
a = &mut w;             // --+ γ. lifetime of `&mut w`    |
use(a);                 //   |                            |
*a = 5; // <-----------------+ <--------------------------+
```

这段代码一目了然，a 有三段生命周期：α，β，γ，每一段生命周期都随着当前值的最后一次使用而结束。

# Reborrow 再借用

先来看一段代码：

```rust
#[derive(Debug)]
struct Point {
    x: i32,
    y: i32,
}

impl Point {
    fn move_to(&mut self, x: i32, y: i32) {
        self.x = x;
        self.y = y;
    }
}

fn main() {
    let mut p = Point { x: 0, y: 0 };
    let r = &mut p;
    let rr: &Point = &*r;

    println!("{:?}", rr);
    r.move_to(10, 10);
    println!("{:?}", r);
}
```

以上代码，大家可能会觉得可变引用 r 和不可变引用 rr 同时存在会报错吧？但是事实上并不会，原因在于 rr 是对 r 的再借用。

对于再借用而言，rr 再借用时不会破坏借用规则，但是你不能在它的生命周期内再使用原来的借用 r，来看看对上段代码的分析：

```rust
fn main() {
    let mut p = Point { x: 0, y: 0 };
    let r = &mut p;
    // reborrow! 此时对`r`的再借用不会导致跟上面的借用冲突
    let rr: &Point = &*r;

    // 再借用`rr`最后一次使用发生在这里，在它的生命周期中，我们并没有使用原来的借用`r`，因此不会报错
    println!("{:?}", rr);

    // 再借用结束后，才去使用原来的借用`r`
    r.move_to(10, 10);
    println!("{:?}", r);
}
```


# Box::leak

`Box::leak` 可以消费掉Box并且强制目标值从内存中泄漏。

## 'static 生命周期

使用 `Box::leak` 可以将变量变成 `'static` 生命周期，例如把一个 `String` 转换成一个具有 `'static` 生命周期的 `&str` 类型:

```rust
fn intern_str() -> &'static str {
    let mut s = String::new();
    s.push_str("Hello World");

    Box::leak(s.into_boxed_str())
}
```

在正常情况下，我们创建的 `String` 只能通过返回的形式把所有权交出去，而在这里，通过 `Box::leak` 不仅返回了一个 `&str`，而且它还是 `'static` 类型的！

## 给全局变量赋值

```rust
#[derive(Debug)]
struct Config {
    a: String,
    b: String
}

static mut config: Option<&mut Config> = None;

fn main() {
    let c = Box::new(Config {
        a: "A".to_string(),
        b: "B".to_string()
    });
    unsafe {
        // 在这里给 config 赋值需要值拥有 'static 的生命周期.
        config = Some(Box::leak(c));

        println!("{:?}", config);
    }
}
```