---
title: 错误处理
date: 2024-06-02 22:45:31
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 组合器

在 Rust 中，组合器用于对返回结果的类型进行变换：例如使用 `ok_or` 将一个 `Option` 类型转换成 `Result` 类型。

## or() 和 and()

跟布尔关系的与/或很像，这两个方法会对两个表达式做逻辑组合，最终返回 `Option` / `Result`。

- `or()`，表达式按照顺序求值，若任何一个表达式的结果是 `Some` 或 `Ok`，则该值会立刻返回，否则返回 `or` 中指定的参数。
  ```rust
  let some1 = Some("some1");
  let some2 = Some("some2");
  let none: Option<&str> = None;

  assert_eq!(some1.or(some2), some1); // Some1 or Some2 = Some1
  assert_eq!(some1.or(none), some1);  // Some or None = Some
  assert_eq!(none.or(some1), some1);  // None or Some = Some
  assert_eq!(none.or(none), none);    // None1 or None2 = None2
  ```
- `and()`，如果自身为 `None` 或者 `Err` 则返回自身，否则返回 `and()` 中的参数
  ```rust
  let some1 = Some("some1");
  let some2 = Some("some2");
  let none: Option<&str> = None;

  assert_eq!(some1.and(some2), some2); // Some1 and Some2 = Some2
  assert_eq!(some1.and(none), none);   // Some and None = None
  assert_eq!(none.and(some1), none);   // None and Some = None
  assert_eq!(none.and(none), none);    // None1 and None2 = None1
  ```

对于 `Options`， 还有 `xor` 可用，它会在仅有一个值为 `'true'` 时，返回该值。


实际可以把 `Some` 和 `Ok` 看做 `true`，`None` 和 `Err` 看做 `false`:

当进行逻辑判断时，最后一次的成功判断，则为返回的值。

例如 `Some1 or Some2`，在判断 `Some1` 时，就可以知道整个表达式都是 `true` 了，因此此时 `Some1` 为返回的值。

再例如 `Some1 and Some2`，此时需要比较两个值，最后比较的是 `Some2` 因此 `Some2` 为返回的值。

## or_else() 和 and_then()

它们跟 `or()` 和 `and()` 类似，唯一的区别在于，它们的第二个表达式是一个闭包。

```rust
fn main() {
    // or_else with Option
    let some1 = Some("some1");
    let some2 = Some("some2");
    let fn_some2 = || Some("some2"); // 类似于: let fn_some = || -> Option<&str> { Some("some2") };

    let none: Option<&str> = None;
    let fn_none = || None;

    assert_eq!(some1.or_else(fn_some2), some1);  // Some1 or_else Some2 = Some1
    assert_eq!(some1.or_else(fn_none), some1);  // Some or_else None = Some
    assert_eq!(none.or_else(fn_some2), some2);   // None or_else Some = Some
    assert_eq!(none.or_else(fn_none), None); // None1 or_else None2 = None2
}
```

`and_then()` 可以获取前一个表达式的值： 

```rust
fn main() {
    // and_then with Option
    let some1 = Some("some1");
    let some2 = Some("some2");
    let fn_some2 = |_| Some("some2"); // 类似于: let fn_some = |_| -> Option<&str> { Some("some2") };

    let n: Option<&str> = None;
    let fn_none = |_| None;

    assert_eq!(some1.and_then(fn_some2), some2); // Some1 and_then Some2 = Some2
    assert_eq!(some1.and_then(fn_none), n);  // Some and_then None = None
    assert_eq!(n.and_then(fn_some2), n);   // None and_then Some = None
    assert_eq!(n.and_then(fn_none), n);   // None1 and_then None2 = None1
}
```

## filter

`filter` 用于对 `Option` 进行过滤，当 `Option` 值为 `None` 时，直接返回，否则调用闭包函数进行过滤，当闭包函数返回 `true` 时，才返回 `Some` 中的值，否则返回 `None`。

```rust
fn main() {
    let s1 = Some(3);
    let s2 = Some(6);
    let n = None;

    let fn_is_even = |x: &i8| x % 2 == 0;

    assert_eq!(s1.filter(fn_is_even), n);  // Some(3) -> 3 is not even -> None
    assert_eq!(s2.filter(fn_is_even), s2); // Some(6) -> 6 is even -> Some(6)
    assert_eq!(n.filter(fn_is_even), n);   // None -> no value -> None
}
```

## map() 和 map_err()

`map` 可以将 `Some` 或 `Ok` 中的值映射为另一个：

```rust
fn main() {
    let s1 = Some("abcde");
    let s2 = Some(5);

    let n1: Option<&str> = None;
    let n2: Option<usize> = None;

    let o1: Result<&str, &str> = Ok("abcde");
    let o2: Result<usize, &str> = Ok(5);

    let e1: Result<&str, &str> = Err("abcde");
    let e2: Result<usize, &str> = Err("abcde");

    let fn_character_count = |s: &str| s.chars().count();

    assert_eq!(s1.map(fn_character_count), s2); // Some1 map = Some2
    assert_eq!(n1.map(fn_character_count), n2); // None1 map = None2

    assert_eq!(o1.map(fn_character_count), o2); // Ok1 map = Ok2
    assert_eq!(e1.map(fn_character_count), e2); // Err1 map = Err2
}
```

`map_err` 则是将 `Err` 中的值转换成另外一个，在面对 `Ok` 时将直接返回：

```rust
fn main() {
    let o1: Result<&str, &str> = Ok("abcde");
    let o2: Result<&str, isize> = Ok("abcde");

    let e1: Result<&str, &str> = Err("404");
    let e2: Result<&str, isize> = Err(404);

    let fn_character_count = |s: &str| -> isize { s.parse().unwrap() }; // 该函数返回一个 isize

    assert_eq!(o1.map_err(fn_character_count), o2); // Ok1 map = Ok2
    assert_eq!(e1.map_err(fn_character_count), e2); // Err1 map = Err2
}
```

## map_or() 和 map_or_else()

`map_or` 在 `map` 的基础上提供了一个默认值:

```rust
fn main() {
    const V_DEFAULT: u32 = 1;

    let s: Result<u32, ()> = Ok(10);
    let n: Option<u32> = None;
    let fn_closure = |v: u32| v + 2;

    assert_eq!(s.map_or(V_DEFAULT, fn_closure), 12);
    assert_eq!(n.map_or(V_DEFAULT, fn_closure), V_DEFAULT);
}
```

当 `map_or` 处理 `None` 时，将会返回第一个参数作为默认值。

`map_or_else` 与 `map_or` 类似，但是它是通过一个闭包来提供默认值:

```rust
fn main() {
    let s = Some(10);
    let n: Option<i8> = None;

    let fn_closure = |v: i8| v + 2;
    let fn_default = || 1;

    assert_eq!(s.map_or_else(fn_default, fn_closure), 12);
    assert_eq!(n.map_or_else(fn_default, fn_closure), 1);

    let o = Ok(10);
    let e = Err(5);
    let fn_default_for_result = |v: i8| v + 1; // 闭包可以对 Err 中的值进行处理，并返回一个新值

    assert_eq!(o.map_or_else(fn_default_for_result, fn_closure), 12);
    assert_eq!(e.map_or_else(fn_default_for_result, fn_closure), 6);
}
```

## ok_or() and ok_or_else()

这两个组合器可以将 `Some(v)` 转换成 `Ok(v)`，`None` 转化为 `Err(err)`:

```rust
fn main() {
    const ERR_DEFAULT: &str = "error message";

    let s = Some("abcde");
    let n: Option<&str> = None;

    let o: Result<&str, &str> = Ok("abcde");
    let e: Result<&str, &str> = Err(ERR_DEFAULT);

    assert_eq!(s.ok_or(ERR_DEFAULT), o); // Some(T) -> Ok(T)
    assert_eq!(n.ok_or(ERR_DEFAULT), e); // None -> Err(default)
}
```

`ok_or_else` 则是提供了懒加载错误的方式：

```rust
fn main() {
    let s = Some("abcde");
    let n: Option<&str> = None;
    let fn_err_message = || "error message";

    let o: Result<&str, &str> = Ok("abcde");
    let e: Result<&str, &str> = Err("error message");

    assert_eq!(s.ok_or_else(fn_err_message), o); // Some(T) -> Ok(T)
    assert_eq!(n.ok_or_else(fn_err_message), e); // None -> Err(default)
}
```
# 归一化不同的错误类型

## 自定义错误类型

为了帮助我们更好的定义错误，Rust 在标准库中提供了一些可复用的特征，例如 `std::error::Error` 特征：

```rust
use std::fmt::{Debug, Display};

pub trait Error: Debug + Display {
    fn source(&self) -> Option<&(Error + 'static)> { ... }
}
```

虽然 `Result` 中**并没有强制要求** `Err` 的参数实现 `Error` 特征，但是对于一个错误来说，实现 `Error` 特征可以统一接口，为错误类型提供了一个标准化的接口，使得不同的错误类型可以以一致的方式被处理和操作。

要想实现 `Error` 特征，则必须实现 `Debug` 和 `Display` 特征。

`Error::source()` 方法一般是可选的，如果不实现，默认返回 `None`，这个方法一般用于返回内部错误，例如这个错误可能是由多个其它错误，或者某个子错误造成的，则可以通过该方法获取更原始的错误信息，进而方便问题的定位。


## 归一化

在实际项目中，一个函数可能会返回多种错误类型，但是正常情况下只能够指定一种：

```rust
use std::fs::read_to_string;

fn main() -> Result<(), std::io::Error> {
  let html = render()?;
  println!("{}", html);
  Ok(())
}

fn render() -> Result<String, std::io::Error> {
  let file = std::env::var("MARKDOWN")?;
  let source = read_to_string(file)?;
  Ok(source)
}
```

编译报错：

```log
error[E0277]: `?` couldn't convert the error to `std::io::Error`
  --> src\main.rs:10:41
   |
9  | fn render() -> Result<String, std::io::Error> {
   |                ------------------------------ expected `std::io::Error` because of this
10 |     let file = std::env::var("MARKDOWN")?;
   |                                         ^ the trait `From<VarError>` is not implemented for `std::io::Error`
   |
```

上面的代码会报错，原因在于 `render` 函数中的两个 `?` 返回的实际上是不同的错误：`env::var()` 返回的是 `std::env::VarError`，而 `read_to_string` 返回的是 `std::io::Error`。

为了满足 `render` 函数的签名，就需要将 `env::VarError` 和 `io::Error` 归一化为同一种错误类型。

### Box<dyn Error>

正常情况下，所有的错误类型都应该实现 `Error` 特征，此时我们就可以直接使用特征对象来处理所有的错误：

```rust
use std::fs::read_to_string;
use std::error::Error;
fn main() -> Result<(), Box<dyn Error>> {
  let html = render()?;
  println!("{}", html);
  Ok(())
}

fn render() -> Result<String, Box<dyn Error>> {
  let file = std::env::var("MARKDOWN")?;
  let source = read_to_string(file)?;
  Ok(source)
}
```

但是一旦 `Result<T, E>` 中的 `E` 没有实现 `Error` 特征，这个方法就不管用了。

### 自定义错误类型

自定义错误类型麻烦归麻烦，但是它非常灵活，因此也不具有上面的类似限制:

```rust
use std::fs::read_to_string;

fn main() -> Result<(), MyError> {
  let html = render()?;
  println!("{}", html);
  Ok(())
}

fn render() -> Result<String, MyError> {
  let file = std::env::var("MARKDOWN")?;
  let source = read_to_string(file)?;
  Ok(source)
}

#[derive(Debug)]
enum MyError {
  EnvironmentVariableNotFound,
  IOError(std::io::Error),
}

impl From<std::env::VarError> for MyError {
  fn from(_: std::env::VarError) -> Self {
    Self::EnvironmentVariableNotFound
  }
}

impl From<std::io::Error> for MyError {
  fn from(value: std::io::Error) -> Self {
    Self::IOError(value)
  }
}

impl std::error::Error for MyError {}

impl std::fmt::Display for MyError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      MyError::EnvironmentVariableNotFound => write!(f, "Environment variable not found"),
      MyError::IOError(err) => write!(f, "IO Error: {}", err.to_string()),
    }
  }
}
```

上面代码中有一行值得注意：`impl std::error::Error for MyError {}` ，只有为自定义错误类型实现 `Error` 特征后，才能转换成相应的特征对象。

## 简化错误处理

### thiserror

自定义错误类型很灵活，但是它太啰嗦了，每次都需要编写一堆代码。

好在使用 [thiserror](https://github.com/dtolnay/thiserror) 可以帮助我们简化错误的声明：

```rust
use std::fs::read_to_string;

fn main() -> Result<(), MyError> {
  let html = render()?;
  println!("{}", html);
  Ok(())
}

fn render() -> Result<String, MyError> {
  let file = std::env::var("MARKDOWN")?;
  let source = read_to_string(file)?;
  Ok(source)
}

#[derive(thiserror::Error, Debug)]
enum MyError {
  #[error("Environment variable not found")]
  EnvironmentVariableNotFound(#[from] std::env::VarError),
  #[error(transparent)]
  IOError(#[from] std::io::Error),
}
```

`#[error]` 用于定于 `Display` 中具体的打印信息，常用格式如下：

- `#[error("{var}")]` ⟶ `write!("{}", self.var)`
- `#[error("{0}")]` ⟶ `write!("{}", self.0)`
- `#[error("{var:?}")]` ⟶ `write!("{:?}", self.var)`
- `#[error("{0:?}")]` ⟶ `write!("{:?}", self.0)`

`#[error(transparent)]` 则是直接使用源错误的 `Display` 方法。

更多用法可以在 `Github` 仓库页面查看。

### anyhow


[anyhow](https://github.com/dtolnay/anyhow) 在你并不关心函数错误的返回类型时很管用。

例如开发一款应用时，在业务逻辑中有些错误可能并不想直接处理，而是直接抛出去给上层，交给统一的错误处理器来处理。

```rust
use std::fs::read_to_string;

use anyhow::Result;

fn main() -> Result<()> {
    let html = render()?;
    println!("{}", html);
    Ok(())
}

fn render() -> Result<String> {
    let file = std::env::var("MARKDOWN")?;
    let source = read_to_string(file)?;
    Ok(source)
}
```

