---
title: 自动化测试
date: 2024-04-09 16:32:25
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 单元测试

当使用 Cargo 创建一个 lib 类型的包时，它会为我们自动生成一个测试模块。先来创建一个 lib 类型的 adder 包：

```bash
cargo new adder --lib
cd adder
```

创建成功后，在 *src/lib.rs* 文件中可以发现如下代码:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
```

其中，`tests` 就是一个测试模块，`it_works` 则是我们的主角：测试函数。

经过 `test` 标记的函数就可以被测试执行器发现，并进行运行。当然，在测试模块 `tests` 中，还可以定义非测试函数，这些函数可以用于设置环境或执行一些通用操作：例如为部分测试函数提供某个通用的功能，这种功能就可以抽象为一个非测试函数。

使用`cargo test`运行所有的测试用例。Rust 在默认情况下会为每一个测试函数启动单独的线程去处理，当主线程 main 发现有一个测试线程死掉时，main 会将相应的测试标记为失败。

## 期望 panic

当一个函数在给定的参数下希望能够 panic，则需要添加 `should_panic` 来告诉 rust:
```rust
pub struct Guess {
    value: i32,
}

impl Guess {
    pub fn new(value: i32) -> Guess {
        if value < 1 || value > 100 {
            panic!("Guess value must be between 1 and 100, got {}.", value);
        }

        Guess { value }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic]
    fn greater_than_100() {
        Guess::new(200);
    }
}
```

上面是一个简单的猜数字游戏，Guess 结构体的 new 方法在传入的值不在 [1,100] 之间时，会直接 panic，而在测试函数 greater_than_100 中，我们传入的值 200 显然没有落入该区间，因此 new 方法会直接 panic，为了测试这个预期的 panic 行为，我们使用 #[should_panic] 对其进行了标注。

### expected

虽然 panic 被成功测试到，但是如果代码发生的 panic 和我们预期的 panic 不符合呢？因为一段糟糕的代码可能会在不同的代码行生成不同的 panic。

鉴于此，我们可以使用可选的参数 expected 来说明预期的 panic 长啥样：

```rust
// --snip--
impl Guess {
    pub fn new(value: i32) -> Guess {
        if value < 1 {
            panic!(
                "Guess value must be greater than or equal to 1, got {}.",
                value
            );
        } else if value > 100 {
            panic!(
                "Guess value must be less than or equal to 100, got {}.",
                value
            );
        }

        Guess { value }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic(expected = "Guess value must be less than or equal to 100")]
    fn greater_than_100() {
        Guess::new(200);
    }
}
```

## 使用 Result

当测试函数的返回 `Result` 时，若发生错误，测试也将失败：
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn it_works() -> Result<(), String> {
        if 2 + 2 == 3 {
            Ok(())
        } else {
            Err(String::from("two plus two does not equal four"))
        }
    }
}
```

```log
---- tests::it_works stdout ----
Error: "two plus two does not equal four"


failures:
    tests::it_works

test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## 传递命令行参数

使用`cargo test --help`可以查看帮助：
```bash
$ cargo test --help
Execute all unit and integration tests and build examples of a local package

Usage: cargo.exe test [OPTIONS] [TESTNAME] [-- [args]...]
```

可以发现如果需要输入命令行参数，需要加上`--`，然后右边就全部会被视为命令行参数。

### 限制运行的线程数

当运行多个测试函数时，默认情况下是为每个测试都生成一个线程，然后通过主线程来等待它们的完成和结果。并行测试最大的问题就在于共享状态的修改，因为难以控制测试的运行顺序，因此如果多个测试共享一个数据，那么对该数据的使用也将变得不可控制。

其中的一个解决方法就是限制所有测试只能一个接着一个的运行：

```bash
cargo test -- --test-threads=1
```

除此之外，也可以把每个测试写入独立的文件中。

### 显示打印输出

默认情况下，如果测试通过，那写入标准输出的内容是不会显示在测试结果中的。

如果需要查看标准输出的内容，使用下面的启动命令即可：

```rust
cargo test -- --show-output
```

## 指定运行一部分测试

```rust
// lib.rs
pub fn add_two(a: i32) -> i32 {
    a + 2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_two_and_two() {
        assert_eq!(4, add_two(2));
    }

    #[test]
    fn add_three_and_two() {
        assert_eq!(5, add_two(3));
    }

    #[test]
    fn one_hundred() {
        assert_eq!(102, add_two(100));
    }
}
```

### 运行单个测试

运行单个测试只需要将指定的测试函数名作为参数即可：

```bash
$ cargo test one_hundred
running 1 test
test tests::one_hundred ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 2 filtered out; finished in 0.00s
```

默认情况下只会测试 `lib.rs` 中的内容，在这里就是`tests`模块。

但是只能指定一个函数，无法指定多个，例如下面的命令:

```bash
cargo test one_hundred,add_two_and_two
cargo test one_hundred add_two_and_two
```

这两种方式统统不行，此时就需要使用名称过滤的方式来实现了。

### 通过名称来过滤测试

可以通过指定部分名称的方式来过滤运行相应的测试:

```bash
$ cargo test add
running 2 tests
test tests::add_three_and_two ... ok
test tests::add_two_and_two ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out; finished in 0.00s
```

实际上只要函数名包含我们指定的字符串就会被执行：

```rust
$ cargo test and
running 2 tests
test tests::add_two_and_two ... ok
test tests::add_three_and_two ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out; finished in 0.00s
```

### 忽略部分测试

使用`#[ignore]`可以将测试函数表示为*被忽略*:

```rust
#[test]
fn it_works() {
    assert_eq!(2 + 2, 4);
}

#[test]
#[ignore]
fn expensive_test() {
    // 这里的代码需要几十秒甚至几分钟才能完成
}
```

正常执行测试不会运行被忽略的函数：

```rust
$ cargo test
running 2 tests
test expensive_test ... ignored
test it_works ... ok

test result: ok. 1 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s

   Doc-tests adder

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

如果需要执行被忽略的测试函数，则可以使用下面的命令：

```rust
cargo test -- --ignored
```

# dev-dependencies

Rust 能够引入只在开发测试场景使用的外部依赖。

其中一个例子就是 [pretty_assertions](https://docs.rs/crate/pretty_assertions/latest)，它可以用来扩展标准库中的 assert_eq! 和 assert_ne!，例如提供彩色字体的结果对比。

在 `Cargo.toml` 文件中添加以下内容来引入 `pretty_assertions`：

```rust
# standard crate data is left out
[dev-dependencies]
pretty_assertions = "1"
```

然后在`src/lib.rs`中添加：

```rust
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq; // 该包仅能用于测试

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }
}
```

# 集成测试

与单元测试的同吃同住不同，集成测试的代码是在一个单独的目录下的。由于它们使用跟其它模块一样的方式去调用你想要测试的代码，因此只能调用通过 pub 定义的 API，这一点与单元测试有很大的不同。

如果说单元测试是对代码单元进行测试，那集成测试则是对某一个功能或者接口进行测试，因此单元测试的通过，并不意味着集成测试就能通过：局部上反映不出的问题，在全局上很可能会暴露出来。

## test 目录

项目中的 test 目录，就是用来存放集成测试文件的。首先来创建一个集成测试文件 `tests/integration_test.rs`:

```rust
use adder;

#[test]
fn it_adds_two() {
    assert_eq!(4, adder::add_two(2));
}
```

执行测试：

```rust
cargo test --test
```

如果不加`--test`，则会执行所有单元测试、集成测试和文档测试。

## 共享模块

在集成测试的 tests 目录下，每一个文件都是一个独立的包，这种组织方式可以很好的帮助我们理清测试代码的关系，但是如果想要在多个文件中共享同一个功能，则需要创建一个`mod.rs`。

例如 `tests/common/mod.rs` 而不是 `tests/common.rs`， 后者仍然会被当做一个测试文件，而前者则是我们的共享模块。

```rust
use adder;

mod common;

#[test]
fn it_adds_two() {
    common::setup();
    assert_eq!(4, adder::add_two(2));
}
```

总结来说，tests 目录下的子目录中的文件不会被当作独立的包，也不会有测试输出。

# 断言 assertion

常用的断言：

- `assert!`, `assert_eq!`, `assert_ne!`, 它们会在所有模式下运行
- `debug_assert!`, `debug_assert_eq!`, `debug_assert_ne!`, 它们只会在 Debug 模式下运行

