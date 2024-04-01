---
title: 格式化输出
date: 2024-03-29 17:42:31
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 基础

下面是格式化的嘴基本用法：

```rust
println!("Hello");                 // => "Hello"
println!("Hello, {}!", "world");   // => "Hello, world!"
println!("The number is {}", 1);   // => "The number is 1"
println!("{:?}", (3, 4));          // => "(3, 4)"
println!("{value}", value=4);      // => "4"
println!("{} {}", 1, 2);           // => "1 2"
println!("{:04}", 42);             // => "0042" with leading zeros
```

可以看到 `println!` 宏接受的是可变参数，第一个参数是一个字符串常量，它表示最终输出字符串的格式，包含其中形如 `{}` 的符号是**占位符**，会被 `println!` 后面的参数依次替换。

## print!，println!，format!

它们是 Rust 中用来格式化输出的三大金刚，用途如下：

- `print!` 将格式化文本输出到标准输出，不带换行符
- `println!` 同上，但是在行的末尾添加换行符
- `format!` 将格式化文本输出到 String 字符串


在实际项目中，最常用的是 println! 及 format!，前者常用来调试输出，后者常用来生成格式化的字符串：

```rust
fn main() {
    let s = "hello";
    println!("{}, world", s);
    let s1 = format!("{}, world", s);
    print!("{}", s1);
    print!("{}\n", "!");
}
```

其中，`s1` 是通过 `format!` 生成的 `String` 字符串，最终输出如下：

```text
hello, world
hello, world!
```

## eprint!，eprintln!

`eprint!`，`eprintln!` 和 `print!`，`println!`的使用方法一样，唯一的区别是前者向标准错误流输出，而后者往标准输出流输出。

```rust
eprintln!("Error: Could not complete task")
```

它们仅应该被用于输出错误信息和进度信息，其它场景都应该使用 `print!` 系列。


# 占位符高级用法

与其它语言常用的 `%d`，`%s`不同，`Rust` 特立独行地选择了 {} 作为格式化占位符。

与 `{}` 类似，`{:?}` 也是占位符：

- `{}` 适用于实现了 `std::fmt::Display` 特征的类型，用来以更优雅、更友好的方式格式化文本，例如展示给用户。
- `{:?}` 适用于实现了 `std::fmt::Debug` 特征的类型，用于调试场景。


为了方便我们调试，大多数 Rust 类型都实现了 `Debug` 特征或者支持派生该特征：
```rust
#[derive(Debug)]
struct Person {
    name: String,
    age: u8
}

fn main() {
    let i = 3.1415926;
    let s = String::from("hello");
    let v = vec![1, 2, 3];
    let p = Person{name: "sunface".to_string(), age: 18};
    println!("{:?}, {:?}, {:?}, {:?}", i, s, v, p);
}
```

## {:#?}

与大部分类型实现了 `Debug` 不同，实现了 `Display` 特征的 Rust 类型并没有那么多，往往需要我们自定义想要的格式化方式：

```rust
let i = 3.1415926;
let s = String::from("hello");
let v = vec![1, 2, 3];
let p = Person {
    name: "sunface".to_string(),
    age: 18,
};
// v 和 p 无法被打印
println!("{}, {}, {}, {}", i, s, v, p);
```

`{:#?}` 与 `{:?}` 几乎一样，唯一的区别在于它能更优美地输出内容：

```rust
// {:?}
[1, 2, 3], Person { name: "sunface", age: 18 }

// {:#?}
[
    1,
    2,
    3,
], Person {
    name: "sunface",
}
```

## 为自定义类型实现 Display 特征

```rust
struct Person {
    name: String,
    age: u8,
}

use std::fmt;
impl fmt::Display for Person {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,
            "大佬在上，请受我一拜，小弟姓名{}，年芳{}，家里无田又无车，生活苦哈哈",
            self.name, self.age
        )
    }
}
fn main() {
    let p = Person {
        name: "sunface".to_string(),
        age: 18,
    };
    println!("{}", p);
}
```

如上所示，只要实现 Display 特征中的 fmt 方法，即可为自定义结构体 Person 添加自定义输出：

```text
大佬在上，请受我一拜，小弟姓名sunface，年芳18，家里无田又无车，生活苦哈哈
```

## 为外部类型实现 Display 特征

在 Rust 中，无法直接为外部类型实现外部特征，但是可以使用 `newtype` 解决此问题：

```rust
struct Array(Vec<i32>);

use std::fmt;
impl fmt::Display for Array {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "数组是：{:?}", self.0)
    }
}
fn main() {
    let arr = Array(vec![1, 2, 3]);
    println!("{}", arr);
}
```

`Array` 就是我们的 `newtype`，它将想要格式化输出的 `Vec` 包裹在内，最后只要为 `Array` 实现 `Display` 特征，即可进行格式化输出：

```text
数组是：[1, 2, 3]
```

## 位置参数

除了按照依次顺序使用值去替换占位符之外，还能让指定位置的参数去替换某个占位符，例如 {1}，表示用第二个参数替换该占位符(索引从 0 开始)：

```rust
fn main() {
    println!("{}{}", 1, 2); // =>"12"
    println!("{1}{0}", 1, 2); // =>"21"
    // => Alice, this is Bob. Bob, this is Alice
    println!("{0}, this is {1}. {1}, this is {0}", "Alice", "Bob");
    println!("{1}{}{0}{}", 1, 2); // => 2112
}
```

## 具名参数

除了像上面那样指定位置外，我们还可以为参数指定名称：

```rust
fn main() {
    println!("{argument}", argument = "test"); // => "test"
    println!("{name} {}", 1, name = 2); // => "2 1"
    println!("{a} {c} {b}", a = "a", b = 'b', c = 3); // => "a 3 b"
}
```

需要注意的是，**带名称的参数必须放在不带名称参数的后面**，例如下面代码将报错：

```rust
println!("{abc} {1}", abc = "def", 2);
```
```text
error: positional arguments cannot follow named arguments
 --> src/main.rs:4:36
   |
 4 | println!("{abc} {1}", abc = "def", 2);
   |                             -----  ^ positional arguments must be before named arguments
   |                             |
   |                             named argument
```

## 格式化参数

格式化输出，意味着对输出格式会有更多的要求，例如只输出浮点数的小数点后两位：

```rust
fn main() {
    let v = 3.1415926;
    // Display => 3.14
    println!("{:.2}", v);
    // Debug => 3.14
    println!("{:.2?}", v);
}
```

上面代码只输出小数点后两位。同时我们还展示了 `{}` 和 `{:?}` 的用法，后面如无特殊区别，就只针对 `{}` 提供格式化参数说明。

### 宽度

宽度用来指示输出目标的长度，如果长度不够，则进行填充和对齐。

#### 字符串填充

字符串格式化默认使用空格进行填充，并且进行左对齐。

```rust
fn main() {
    //-----------------------------------
    // 以下全部输出 "Hello x    !"
    // 为"x"后面填充空格，补齐宽度5
    println!("Hello {:5}!", "x");
    // 使用参数5来指定宽度
    println!("Hello {:1$}!", "x", 5);
    // 使用x作为占位符输出内容，同时使用5作为宽度
    println!("Hello {1:0$}!", 5, "x");
    // 使用有名称的参数作为宽度
    println!("Hello {:width$}!", "x", width = 5);
    //-----------------------------------

    // 使用参数5为参数x指定宽度，同时在结尾输出参数5 => Hello x    !5
    println!("Hello {:1$}!{}", "x", 5);
}
```

输出：
```text
Hello x    !
Hello x    !
Hello x    !
Hello x    !
Hello x    !5
```

#### 数字填充

数字格式化默认也是使用空格进行填充，但与字符串左对齐不同的是，数字是右对齐。

```rust
fn main() {
    // 宽度是5 => Hello     5!
    println!("Hello {:5}!", 5);
    // 显式的输出正号 => Hello +5!
    println!("Hello {:+}!", 5);
    // 宽度5，使用0进行填充 => Hello 00005!
    println!("Hello {:05}!", 5);
    // 负号也要占用一位宽度 => Hello -0005!
    println!("Hello {:05}!", -5);
}
```

输出：

```text
Hello     5!
Hello +5!
Hello 00005!
Hello -0005!
```

注意`println!("Hello {:05}!", 5)`，这个写法只能给数字用，字符串是用不了的。

### 对齐

```rust
fn main() {
    // 以下全部都会补齐5个字符的长度
    // 左对齐 => Hello x    !
    println!("Hello {:<5}!", "x");
    // 右对齐 => Hello     x!
    println!("Hello {:>5}!", "x");
    // 居中对齐 => Hello   x  !
    println!("Hello {:^5}!", "x");

    // 对齐并使用指定符号填充 => Hello x&&&&!
    // 指定符号填充的前提条件是必须有对齐字符
    println!("Hello {:&<5}!", "x");
    println!("Hello {:好^5}!", "x");
}
```

输出：

```text
Hello x    !
Hello     x!
Hello   x  !
Hello x&&&&!
Hello 好好x好好!
```

### 精度

精度可以用于控制浮点数的精度或者字符串的长度：

```rust
fn main() {
    let v = 3.1415926;
    // 保留小数点后两位 => 3.14
    println!("{:.2}", v);
    // 带符号保留小数点后两位 => +3.14
    println!("{:+.2}", v);
    // 不带小数 => 3
    println!("{:.0}", v);
    // 通过参数来设定精度 => 3.1416，相当于{:.4}
    println!("{:.1$}", v, 4);

    let s = "hi我是Sunface孙飞";
    // 保留字符串前三个字符 => hi我
    println!("{:.3}", s);
    // {:.*}接收两个参数，第一个是精度，第二个是被格式化的值 => Hello abc!
    println!("Hello {:.*}!", 3, "abcdefg");
}
```

输出：

```text
3.14
+3.14
3
3.1416
hi我
Hello abc!
```

### 进制

可以使用 `#` 号来控制数字的进制输出：

- `#b`, 二进制
- `#o`, 八进制
- `#x`, 小写十六进制
- `#X`, 大写十六进制
- `x`, 不带前缀的小写十六进制

```rust
fn main() {
    // 二进制 => 0b11011!
    println!("{:#b}!", 27);
    // 八进制 => 0o33!
    println!("{:#o}!", 27);
    // 十进制 => 27!
    println!("{}!", 27);
    // 小写十六进制 => 0x1b!
    println!("{:#x}!", 27);
    // 大写十六进制 => 0x1B!
    println!("{:#X}!", 27);

    // 不带前缀的十六进制 => 1b!
    println!("{:x}!", 27);

    // 使用0填充二进制，宽度为10 => 0b00011011!
    println!("{:#010b}!", 27);
}
```

输出：

```text
0b11011!
0o33!
27!
0x1b!
0x1B!
1b!
0b00011011!
```

### 捕获上下文变量

```rust
fn get_person() -> String {
    String::from("sunface")
}
fn main() {
    let person = get_person();
    // 直接使用 person 变量
    println!("Hello, {person}!");
}
```

甚至还可以将环境中的值用于格式化参数:

```rust
let (width, precision) = get_format();
for (name, score) in get_scores() {
  println!("{name}: {score:width$.precision$}");
}
```


### 其它

#### 指数

```rust
fn main() {
    println!("{:2e}", 1000000000); // => 1e9
    println!("{:2E}", 1000000000); // => 1E9
}
```

#### 指针地址

```rust
let v= vec![1, 2, 3];
println!("{:p}", v.as_ptr()) // => 0x600002324050
```

#### 转义

有时需要输出 `{` 和 `}`，但这两个字符是特殊字符，需要进行转义：

```rust
fn main() {
    // "{{" 转义为 '{'   "}}" 转义为 '}'   "\"" 转义为 '"'
    // => Hello "{World}" 
    println!(" Hello \"{{World}}\" ");

    // 下面代码会报错，因为占位符{}只有一个右括号}，左括号被转义成字符串的内容
    // println!(" {{ Hello } ");
    // 也不可使用 '\' 来转义 "{}"
    // println!(" \{ Hello \} ")
}
```