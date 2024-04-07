---
title: 泛型和特征
date: 2024-01-13 22:08:54
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 1. 泛型

声明一个泛型:
```rust
fn largest<T>(list: &[T]) -> T {
```

如果想要泛型具有某些属性或方法，则需要限制其特征，例如让泛型允许相加的特征：
```rust
fn add<T: std::ops::Add<Output = T>>(a:T, b:T) -> T {
    a + b
}
```

## 结构体中的泛型

结构体中的字段类型也可以用泛型来定义，下面代码定义了一个坐标点 Point，它可以存放任何类型的坐标值：
```rust
struct Point<T> {
    x: T,
    y: T,
}

fn main() {
    let integer = Point { x: 5, y: 10 };
    let float = Point { x: 1.0, y: 4.0 };
}
```

## 枚举中的泛型

最常见的就是`Option`了：
```rust
enum Option<T> {
    Some(T),
    None,
}
```

## 方法中的泛型

方法上也可以使用泛型：
```rust
struct Point<T> {
    x: T,
    y: T,
}

impl<T> Point<T> {
    fn x(&self) -> &T {
        &self.x
    }

    fn mixup<V>(self, other: Point<V>) -> Point<V> {
        Point {
            x: self.x,
            y: other.y,
        }
    }
}

fn main() {
    let p = Point { x: 5, y: 10 };

    println!("p.x = {}", p.x());
}
```
使用泛型参数前，依然需要提前声明：impl<T>，只有提前声明了，我们才能在Point<T>中使用它，这样 Rust 就知道 Point 的尖括号中的类型是泛型而不是具体类型。

### 为具体的泛型单独实现方法

例如你想到对泛型使用`f32`的方法提供单独的实现，可以这样进行定义：
```rust
impl Point<f32> {
    fn distance_from_origin(&self) -> f32 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}
```

这段代码意味着 Point<f32> 类型会有一个方法 distance_from_origin，而其他 T 不是 f32 类型的 Point<T> 实例则没有定义此方法。这个方法计算点实例与坐标(0.0, 0.0) 之间的距离，并使用了只能用于浮点型的数学运算符。

这样我们就能针对特定的泛型类型实现某个特定的方法，对于其它泛型类型则没有定义该方法。

## const泛型

在旧版本的 Rust 中，如果需要以数组为参数，要么使用引用：
```rust
fn display_array(arr: &[i32]) {
    println!("{:?}", arr);
}
```
要么使用带有长度的数组：
```rust
fn display_array(arr: [i32; 3]) {
    println!("{:?}", arr);
}
```
对于数组的类型，不同的长度是完全不同的类型，例如 `[i32; 2]` 和 `[i32; 3]` 是不同的数组类型，将 `[i32; 2]` 的数组
传入上方函数将会报错。

而在旧版本，对于数组的长度是无法抽象成一个泛型或其它东西的，因此旧版本一些标准库数组的长度被限定在了 32。

在新版本中，可以使用 const 泛型来处理数组长度问题：
```rust
fn display_array<T: std::fmt::Debug, const N: usize>(arr: [T; N]) {
    println!("{:?}", arr);
}
fn main() {
    let arr: [i32; 3] = [1, 2, 3];
    display_array(arr);

    let arr: [i32; 2] = [1, 2];
    display_array(arr);
}
```


# 2. 特征 Trait

特征，类似与 Java 中的接口，**只用来定义一组行为，而不提供具体实现**。

定义一个特征：
```rust
pub trait Summary {
    fn summarize(&self) -> String;
}
```

这里使用 trait 关键字来声明一个特征，Summary 是特征名。在大括号中定义了该特征的所有方法，在这个例子中是： fn summarize(&self) -> String。

由于特征不关心具体实现，因此直接使用了 `;` 进行结尾。

## 为类型实现特征

为 `Post` 和 `Weibo` 实现 `Summary` 特征：
```rust
pub trait Summary {
    fn summarize(&self) -> String;
}
pub struct Post {
    pub title: String, // 标题
    pub author: String, // 作者
    pub content: String, // 内容
}

impl Summary for Post {
    fn summarize(&self) -> String {
        format!("文章{}, 作者是{}", self.title, self.author)
    }
}

pub struct Weibo {
    pub username: String,
    pub content: String
}

impl Summary for Weibo {
    fn summarize(&self) -> String {
        format!("{}发表了微博{}", self.username, self.content)
    }
}
```

具体语法: `impl Trait for TypeName`。

在实现后，就可以在这个类型上调用特征的方法：
```rust
fn main() {
    let post = Post{title: "Rust语言简介".to_string(),author: "Sunface".to_string(), content: "Rust棒极了!".to_string()};
    let weibo = Weibo{username: "sunface".to_string(),content: "好像微博没Tweet好用".to_string()};

    println!("{}",post.summarize());
    println!("{}",weibo.summarize());
}
```

### 默认实现

你可以在特征中定义具有默认实现的方法，这样其它类型无需再实现该方法，或者也可以选择重载该方法：

```rust
pub trait Summary {
    fn summarize(&self) -> String {
        String::from("(Read more...)")
    }
}
```

## 使用特征作为函数参数

定义一个函数，使用特征作为函数参数：
```rust
pub fn notify(item: &impl Summary) {
    println!("Breaking news! {}", item.summarize());
}
```

需要再特征名称前面加上一个`impl`，可以使用任何实现了 `Summary`` 特征的类型作为该函数的参数。

## 特征约束 (trait bound)


虽然 impl Trait 这种语法非常好理解，但是实际上它只是一个语法糖，真正的写法如下：
```rust
pub fn notify<T: Summary>(item: &T) {
    println!("Breaking news! {}", item.summarize());
}
```

大部分情况下这个语法糖是足够使用的，但是如果存在如下情况：
```rust
pub fn notify(item1: &impl Summary, item2: &impl Summary) {}
```

如果要求 `item1` 和 `item2` 都必须是同一类型，则使用 `impl` 就不行了，此时需要使用特征约束来实现：
```rust
pub fn notify<T: Summary>(item1: &T, item2: &T) {}
```

### 多重约束

除了单个约束条件，我们还可以指定多个约束条件，例如除了让参数实现 Summary 特征外，还可以让参数实现 Display 特征以控制它的格式化输出：
```rust
pub fn notify(item: &(impl Summary + Display)) {}

pub fn notify<T: Summary + Display>(item: &T) {}
```

### where 约束

当特征约束变得很多时，函数的签名将变得很复杂：
```rust
fn some_function<T: Display + Clone, U: Clone + Debug>(t: &T, u: &U) -> i32 {}
```

通过 `where` 可以对其进行简化：
```rust
fn some_function<T, U>(t: &T, u: &U) -> i32
    where T: Display + Clone,
          U: Clone + Debug
{}
```

### 使用特征约束有条件地实现方法或特征

特征约束，可以让我们在指定类型 + 指定特征的条件下去实现方法，例如：
```rust
use std::fmt::Display;

struct Pair<T> {
    x: T,
    y: T,
}

impl<T> Pair<T> {
    fn new(x: T, y: T) -> Self {
        Self {
            x,
            y,
        }
    }
}

impl<T: Display + PartialOrd> Pair<T> {
    fn cmp_display(&self) {
        if self.x >= self.y {
            println!("The largest member is x = {}", self.x);
        } else {
            println!("The largest member is y = {}", self.y);
        }
    }
}
```

`cmp_display` 方法，并不是所有的 `Pair<T>` 结构体对象都可以拥有，只有 `T` 同时实现了 `Display + PartialOrd` 的 `Pair<T>` 才可以拥有此方法。

也可以有条件地实现特征, 例如，标准库为任何实现了 Display 特征的类型实现了 ToString 特征：

```rust
impl<T: Display> ToString for T {
    // --snip--
}
```

我们可以对任何实现了 Display 特征的类型调用由 ToString 定义的 to_string 方法。例如，可以将整型转换为对应的 String 值，因为整型实现了 Display：

```rust
let s = 3.to_string();
```

## 函数返回中的 impl Trait

可以通过 impl Trait 来说明一个函数返回了一个类型，该类型实现了某个特征：
```rust
fn returns_summarizable() -> impl Summary {
    Weibo {
        username: String::from("sunface"),
        content: String::from(
            "m1 max太厉害了，电脑再也不会卡",
        )
    }
}
```

因为 Weibo 实现了 Summary，因此这里可以用它来作为返回值。要注意的是，虽然我们知道这里是一个 Weibo 类型，但是对于 returns_summarizable 的调用者而言，他只知道返回了一个实现了 Summary 特征的对象，但是并不知道返回了一个 Weibo 类型。

但是这种返回值方式有一个很大的限制：只能有一个具体的类型，例如：

```rust
fn returns_summarizable(switch: bool) -> impl Summary {
    if switch {
        Post {
            title: String::from(
                "Penguins win the Stanley Cup Championship!",
            ),
            author: String::from("Iceburgh"),
            content: String::from(
                "The Pittsburgh Penguins once again are the best \
                 hockey team in the NHL.",
            ),
        }
    } else {
        Weibo {
            username: String::from("horse_ebooks"),
            content: String::from(
                "of course, as you probably already know, people",
            ),
        }
    }
}
```

以上的代码就无法通过编译，因为它返回了两个不同的类型 Post 和 Weibo。如果需要实现这个功能，则需要用到特征对象。


# 3. 特征对象

使用 `dyn` 即可表示一个参数为特征对象：
```rust
trait Draw {
    fn draw(&self) -> String;
}

impl Draw for u8 {
    fn draw(&self) -> String {
        format!("u8: {}", *self)
    }
}

impl Draw for f64 {
    fn draw(&self) -> String {
        format!("f64: {}", *self)
    }
}

// 若 T 实现了 Draw 特征， 则调用该函数时传入的 Box<T> 可以被隐式转换成函数参数签名中的 Box<dyn Draw>
fn draw1(x: Box<dyn Draw>) {
    // 由于实现了 Deref 特征，Box 智能指针会自动解引用为它所包裹的值，然后调用该值对应的类型上定义的 `draw` 方法
    x.draw();
}

fn draw2(x: &dyn Draw) {
    x.draw();
}

fn main() {
    let x = 1.1f64;
    // do_something(&x);
    let y = 8u8;

    // x 和 y 的类型 T 都实现了 `Draw` 特征，因为 Box<T> 可以在函数调用时隐式地被转换为特征对象 Box<dyn Draw> 
    // 基于 x 的值创建一个 Box<f64> 类型的智能指针，指针指向的数据被放置在了堆上
    draw1(Box::new(x));
    // 基于 y 的值创建一个 Box<u8> 类型的智能指针
    draw1(Box::new(y));
    draw2(&x);
    draw2(&y);
}
```

特征对象，需要在运行时从 vtable 动态查找需要调用的方法，性能相对于泛型 + 特征约束较差。

`dyn` 不能单独作为特征对象的定义，例如下面的代码编译器会报错，原因是特征对象可以是任意实现了某个特征的类型，编译器在编译期不知道该类型的大小，不同的类型大小是不同的。

```rust
fn draw2(x: dyn Draw) {
    x.draw();
}
```

```shell
10 | fn draw2(x: dyn Draw) {
   |          ^ doesn't have a size known at compile-time
   |
   = help: the trait `Sized` is not implemented for `(dyn Draw + 'static)`
help: function arguments must have a statically known size, borrowed types always have a known size
```

## 特征对象的动态分发

泛型是在编译期完成处理的：编译器会为每一个泛型参数对应的具体类型生成一份代码，这种方式是**静态分发(static dispatch)**，因为是在编译期完成的，对于运行期性能完全没有任何影响。

与静态分发相对应的是**动态分发(dynamic dispatch)**，在这种情况下，直到运行时，才能确定需要调用什么方法。之前代码中的关键字 `dyn` 正是在强调这一“动态”的特点。

当使用特征对象时，Rust 必须使用动态分发。编译器无法知晓所有可能用于特征对象代码的类型，所以它也不知道应该调用哪个类型的哪个方法实现。为此，Rust 在运行时使用特征对象中的指针来知晓需要调用哪个方法。动态分发也阻止编译器有选择的内联方法代码，这会相应的禁用一些优化。

## 特征对象的限制

不是所有特征都能拥有特征对象，只有对象安全的特征才行。当一个特征的所有方法都有如下属性时，它的对象才是安全的：

- 方法的返回类型不能是 Self
- 方法没有任何泛型参数

标准库中的 Clone 特征就不符合对象安全的要求：
```rust
pub trait Clone {
    fn clone(&self) -> Self;
}
```

因为它的其中一个方法，返回了 Self 类型，因此它是对象不安全的。

# 3. 其它

## 关联类型

关联类型是在特征定义的语句块中，申明一个自定义类型，这样就可以在特征的方法签名中使用该类型：

```rust
pub trait Iterator {
    type Item;

    fn next(&mut self) -> Option<Self::Item>;
}
```

以上是标准库中的迭代器特征 Iterator，它有一个 Item 关联类型，用于替代遍历的值的类型。

同时，next 方法也返回了一个 Item 类型，不过使用 Option 枚举进行了包裹，假如迭代器中的值是 i32 类型，那么调用 next 方法就将获取一个 Option<i32> 的值。

**关联类型总是可以用泛型来替代实现，但反之则不一定**，那么关联类型有什么用呢？

例如使用泛型会得到如下代码：
```rust
trait Container<A,B> {
    fn contains(&self,a: A,b: B) -> bool;
}

fn difference<A,B,C>(container: &C) -> i32
  where
    C : Container<A,B> {...}
```

可以看到，由于使用了泛型，导致函数头部也必须增加泛型的声明，导致结构比较臃肿，而使用关联类型，将得到可读性好得多的代码：

```rust
trait Container{
    type A;
    type B;
    fn contains(&self, a: &Self::A, b: &Self::B) -> bool;
}

fn difference<C: Container>(container: &C) {}

fn difference<C: Container<A = i32, B = i32>>(container: &C) {
    container.contains(&1, &2);
}
```

## 默认泛型类型参数

当使用泛型类型参数时，可以为其指定一个默认的具体类型，例如标准库中的 std::ops::Add 特征：

```rust
trait Add<RHS=Self> {
    type Output;

    fn add(self, rhs: RHS) -> Self::Output;
}
```

它有一个泛型参数 RHS，但是与我们以往的用法不同，这里它给 RHS 一个默认值，也就是当用户不指定 RHS 时，默认使用两个同样类型的值进行相加，然后返回一个关联类型 Output。

```rust
use std::ops::Add;

#[derive(Debug, PartialEq)]
struct Point {
    x: i32,
    y: i32,
}

impl Add for Point {
    type Output = Point;

    fn add(self, other: Point) -> Point {
        Point {
            x: self.x + other.x,
            y: self.y + other.y,
        }
    }
}

fn main() {
    assert_eq!(Point { x: 1, y: 0 } + Point { x: 2, y: 3 },
               Point { x: 3, y: 3 });
}
```

上面的代码主要干了一件事，就是为 Point 结构体提供 + 的能力，这就是运算符重载，不过 Rust 并不支持创建自定义运算符，你也无法为所有运算符进行重载，目前来说，只有定义在 std::ops 中的运算符才能进行重载。

## 调用同名的方法

不同特征拥有同名的方法是很正常的事情，你没有任何办法阻止这一点；甚至除了特征上的同名方法外，在你的类型上，也有同名方法：

```rust
trait Pilot {
    fn fly(&self);
}

trait Wizard {
    fn fly(&self);
}

struct Human;

impl Pilot for Human {
    fn fly(&self) {
        println!("This is your captain speaking.");
    }
}

impl Wizard for Human {
    fn fly(&self) {
        println!("Up!");
    }
}

impl Human {
    fn fly(&self) {
        println!("*waving arms furiously*");
    }
}
```

### 优先调用类型上的方法

当调用 Human 实例的 fly 时，编译器默认调用该类型中定义的方法：

```rust
fn main() {
    let person = Human;
    person.fly();
}
```

这段代码会打印 *waving arms furiously*，说明直接调用了类型上定义的方法。

### 调用特征上的方法

为了能够调用两个特征的方法，需要使用显式调用的语法：

```rust
fn main() {
    let person = Human;
    Pilot::fly(&person); // 调用Pilot特征上的方法
    Wizard::fly(&person); // 调用Wizard特征上的方法
    person.fly(); // 调用Human类型自身的方法
}
```

运行后依次输出：

```shell
This is your captain speaking.
Up!
*waving arms furiously*
```

但如果方法没有`self`参数，情况又会变得不一样：

```rust
trait Animal {
    fn baby_name() -> String;
}

struct Dog;

impl Dog {
    fn baby_name() -> String {
        String::from("Spot")
    }
}

impl Animal for Dog {
    fn baby_name() -> String {
        String::from("puppy")
    }
}

fn main() {
    // Spot
    println!("A baby dog is called a {}", Dog::baby_name());
}
```

如果需要调用`Animal`特征上的方法，则需要使用完全限定语法：
```rust
<Type as Trait>::function(receiver_if_method, next_arg, ...);
```

上面定义中，第一个参数是方法接收器 receiver （三种 self），只有方法才拥有，例如关联函数就没有 receiver。

```rust
fn main() {
    println!("A baby dog is called a {}", <Dog as Animal>::baby_name());
}
```

完全限定语法可以用于任何函数或方法调用，但大部分时候是用不上的。

## 特征定义中的特征约束

有时，我们会需要让某个特征 A 能使用另一个特征 B 的功能(另一种形式的特征约束)，类似于Java中一个A接口继承了另外一个接口B，在实现时需要实现两个接口，而且在A中，可以使用B接口的方法。

例如有一个特征 OutlinePrint，它有一个方法，能够对当前的实现类型进行格式化输出：

```rust
use std::fmt::Display;

trait OutlinePrint: Display {
    fn outline_print(&self) {
        let output = self.to_string();
        let len = output.len();
        println!("{}", "*".repeat(len + 4));
        println!("*{}*", " ".repeat(len + 2));
        println!("* {} *", output);
        println!("*{}*", " ".repeat(len + 2));
        println!("{}", "*".repeat(len + 4));
    }
}
```

其中`self`的`to_string`方法是由`Display`特征提供的。

## 在外部类型上实现外部特征(newtype)

特征存在一个*孤儿规则*，就是特征或者类型必需至少有一个是本地的，才能在此类型上定义特征。

但有一个办法来绕过孤儿规则，那就是使用 newtype 模式，简而言之：就是为一个元组结构体创建新类型。该元组结构体封装有一个字段，该字段就是希望实现特征的具体类型。

newtype 不仅仅能实现以上的功能，而且它在运行时没有任何性能损耗，因为在编译期，该类型会被自动忽略。

```rust
use std::fmt;

struct Wrapper(Vec<String>);

impl fmt::Display for Wrapper {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[{}]", self.0.join(", "))
    }
}

fn main() {
    let w = Wrapper(vec![String::from("hello"), String::from("world")]);
    println!("w = {}", w);
}
```

上面的例子中，任何数组上的方法，都无法直接调用，需要先用 `self.0` 取出数组，然后再进行调用。

但是 Rust 提供了一个特征叫 `Deref`，实现该特征后，可以自动做一层类似类型转换的操作，可以将 `Wrapper` 变成 `Vec<String>` 来使用。这样就会像直接使用数组那样去使用 `Wrapper`，而无需为每一个操作都添加上 `self.0`。