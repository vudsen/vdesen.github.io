---

title: 流程控制
date: 2023-12-26 23:30:14
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 1. 基础

## 1.1 if判断

rust的if表达式如下：
```rust
if condition == true {
    // A...
} else {
    // B...
}
```

在rust中的三目运算符也需要if来完成：
```rust
fn main() {
    let condition = true;
    let number = if condition {
        5
    } else {
        6
    };

    println!("The value of number is: {}", number);
}
```

用 if 来赋值时，要保证每个分支返回的类型一样，不然编译会报错。

## 1.2 for循环

rust的for循环和寻常的语言不一样，例如从1到5是这样写的：
```rust
fn main() {
    for i in 1..=5 {
        println!("{}", i);
    }
}
```
加上等号代表范围是[1, 5]，去掉则是[1, 5)。

主要的语义表达式如下：
```rust
for 元素 in 集合 {
  // 使用元素干一些你懂我不懂的事情
}
```

如果想在循环中，修改该元素，可以使用 mut 关键字：
```rust
fn main() {
    let mut collection = [1, 2, 3, 4, 5];
    for val in &mut collection {
        *val = 3;
    }

    for val in &collection {
        // output: 3 3 3 3 3 3
        println!("{}", val)
    }
}
```

**在使用时，如果传入的集合不是一个引用，那么对应的所有权将会被转移走**。

| 使用方法                          | 等价使用方式                                   | 所有权   |
|-------------------------------|---------------------------------------------------|-------|
| `for item in collection`      | `for item in IntoIterator::into_iter(collection)` | 转移所有权 |
| `for item in &collection`     | `for item in collection.iter()`                   | 不可变借用 |
| `for item in &mut collection` | `for item in collection.iter_mut()`               | 	可变借用 |


## 1.3 while循环

```rust
fn main() {
    let mut n = 0;

    while n <= 5 {
        println!("{}!", n);

        n = n + 1;
    }

    println!("我出来了！");
}
```

## 1.4 loop循环

loop循环可以理解为简化版的while true循环，代码块中的代码会一直运行，直到返回或退出。

```rust
fn main() {
    let mut counter = 0;

    let result = loop {
        counter += 1;

        if counter == 10 {
            break counter * 2;
        }
    };

    println!("The result is {}", result);
}
```

使用`label`可以控制`continue`和`break`的位置：
```rust
fn main() {
    let mut count = 0;
    'outer: loop {
        'inner1: loop {
            if count >= 20 {
                // 这只会跳出 inner1 循环
                break 'inner1; // 这里使用 `break` 也是一样的
            }
            count += 2;
        }
        count += 5;
        'inner2: loop {
            if count >= 30 {
                break 'outer;
            }
            continue 'outer;
        }
    }
    assert!(count == 30)
}
```

# 2. 模式匹配

## 2.1 match匹配

在 Rust 中，模式匹配最常用的就是 match 和 if let，下面是match的一个例子：
```rust
enum Direction {
    East,
    West,
    North,
    South,
}

fn main() {
    let dire = Direction::South;
    match dire {
        Direction::East => println!("East"),
        Direction::North | Direction::South => {
            println!("South or North");
        },
        _ => println!("West"),
    };
}
```
这里我们想去匹配 dire 对应的枚举类型，因此在 match 中用三个匹配分支来完全覆盖枚举变量 Direction 的所有成员类型，有以下几点值得注意：

- match 的匹配必须要穷举出所有可能，因此这里用 _ 来代表未列出的所有可能性
- match 的每一个分支都必须是一个表达式，且所有分支的表达式最终返回值的类型必须相同
- X | Y，类似逻辑运算符 或，代表该分支可以匹配 X 也可以匹配 Y，只要满足一个即可

其实 match 跟其他语言中的 switch 非常像，_ 类似于 switch 中的 default，如果没有默认，则match必须要覆盖所有的值，不然会报错。

match匹配的通用形式：
```rust
match target {
    模式1 => 表达式1,
    模式2 => {
        语句1;
        语句2;
        表达式2
    },
    _ => 表达式3
}
```

match可以用于返回值：
```rust
enum Coin {
    Penny,
    Nickel,
    Dime,
    Quarter,
}

fn value_in_cents(coin: Coin) -> u8 {
    match coin {
        Coin::Penny =>  {
            println!("Lucky penny!");
            1
        },
        Coin::Nickel => 5,
        Coin::Dime => 10,
        Coin::Quarter => 25,
    }
}
```

也可以给变量赋值：
```rust
enum IpAddr {
   Ipv4,
   Ipv6
}

fn main() {
    let ip1 = IpAddr::Ipv6;
    let ip_str = match ip1 {
        IpAddr::Ipv4 => "127.0.0.1",
        _ => "::1",
    };

    println!("{}", ip_str);
}
```

### 2.1.1 模式绑定


模式匹配的另外一个重要功能是从模式中取出绑定的值，例如：
```rust
#[derive(Debug)]
enum UsState {
    Alabama,
    Alaska,
    // --snip--
}

enum Coin {
    Penny,
    Nickel,
    Dime,
    Quarter(UsState), // 25美分硬币
}
```

其中 Coin::Quarter 成员还存放了一个值，可以通过模式绑定取到这个值：
```rust
fn value_in_cents(coin: Coin) -> u8 {
    match coin {
        Coin::Penny => 1,
        Coin::Nickel => 5,
        Coin::Dime => 10,
        Coin::Quarter(state) => {
            println!("State quarter from {:?}!", state);
            25
        },
    }
}
```

### 2.1.2 _通配符

通配符提供了一种默认的处理方式：
```rust
let some_u8_value = 0u8;
match some_u8_value {
    1 => println!("one"),
    3 => println!("three"),
    5 => println!("five"),
    7 => println!("seven"),
    _ => (),
}
```
如果不使用通配符，则需要覆盖所有情况。

除了使用通配符，用一个变量来承载其它情况也是可以的：
```rust
#[derive(Debug)]
enum Direction {
    East,
    West,
    North,
    South,
}

fn main() {
    let dire = Direction::South;
    match dire {
        Direction::East => println!("East"),
        other => println!("other direction: {:?}", other),
    };
}
```

## 2.2 if let匹配

有时会遇到只有一个模式的值需要被处理，其它值直接忽略的场景，如果用 match 来处理就要写成下面这样：
```rust
let v = Some(3u8);
match v {
    Some(3) => println!("three"),
    _ => (),
}
```

为了减少代码量，可以使用`if let`的方式来替换：
```rust
if let Some(3) = v {
    println!("three");
}
```

当只要匹配一个条件，且忽略其他条件时就用 `if let` ，否则都用 `match`。

## 2.3 matches! 宏

`matches!`宏用于匹配两个变量，返回一个布尔值，它可以用于快速进行匹配：
```rust
let foo = 'f';
assert!(matches!(foo, 'A'..='Z' | 'a'..='z'));

let bar = Some(4);
assert!(matches!(bar, Some(x) if x > 2));
```

## 2.4 while let 条件循环

一个与 if let 类似的结构是 while let 条件循环，它允许只要模式匹配就一直进行 while 循环。下面展示了一个使用 while let 的例子：
```rust
// Vec是动态数组
let mut stack = Vec::new();

// 向数组尾部插入元素
stack.push(1);
stack.push(2);
stack.push(3);

// stack.pop从数组尾部弹出元素
while let Some(top) = stack.pop() {
    println!("{}", top);
}
```