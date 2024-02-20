---
title: 集合
date: 2023-01-21 22:40:14
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/Rust/" }
---

# 1. 动态数组 Vector

## 创建动态数组

在 Rust 中，有多种方式可以创建动态数组。

### Vec::new

使用 Vec::new 创建动态数组是最 rusty 的方式，它调用了 Vec 中的 new 关联函数：
```rust
let v: Vec<i32> = Vec::new();
```

通过`Vec::new()`时无法传递泛型，因此只能靠类型声明来指定泛型的类型。

或者在操作时，编译器会自动推断：
```rust
let mut v = Vec::new();
v.push(1);
```

此时，v 就无需手动声明类型，因为编译器通过 v.push(1)，推测出 v 中的元素类型是 i32，因此推导出 v 的类型是 Vec<i32>。

> 如果预先知道要存储的元素个数，可以使用 Vec::with_capacity(capacity) 创建动态数组

### vec![]

还可以使用宏 vec! 来创建数组，与 Vec::new 有所不同，`vec![]`能在创建的同时给予初始化值：
```rust
let v = vec![1, 2, 3];
let v = vec![0; 3];
```

此处 Vec 的类型可直接由编译器推断。

### Vec::from

从已有数组创建：
```rust
let v_from = Vec::from([0, 0, 0]);
```

## 从Vector读取元素

可以通过下面的方式读取元素：
- 通过下标索引访问
- 使用`get`方法

```rust
let v = vec![1, 2, 3, 4, 5];

let third: &i32 = &v[2];
println!("第三个元素是 {}", third);

match v.get(2) {
    Some(third) => println!("第三个元素是 {third}"),
    None => println!("去你的第三个元素，根本没有！"),
}
```

使用下标索引时，可以直接拿到对应的值，而不需要进行额外的判断。使用`get`时，返回的是一个`Option`的值，需要添加额外的判断。

但是在使用下标索引时，如果索引越界，程序会直接报错退出。

## 所有权

数组元素被引用时，无法进行其它涉及所有权的操作：
```rust
let mut v = vec![1, 2, 3, 4, 5];

let first = &v[0];

v.push(6);

println!("The first element is: {first}");
```
其中 `first = &v[0]` 进行了不可变借用，`v.push` 进行了可变借用，如果 `first` 在 `v.push` 之后不再使用，那么该段代码可以成功编译。

但在最后，`first`还是被使用了，因此编译器会报错。

## 遍历集合元素

如果想要依次访问数组中的元素，可以使用迭代的方式去遍历数组，这种方式比用下标的方式去遍历数组更安全也更高效（每次下标访问都会触发数组边界检查）：

```rust
let v = vec![1, 2, 3];
for i in &v {
    println!("{i}");
}
```
也可以在迭代过程中，修改 Vector 中的元素:

```rust
let mut v = vec![1, 2, 3];
for i in &mut v {
    *i += 10
}
```

## Vector 的排序


在 rust 里，实现了两种排序算法，分别为稳定的排序 sort 和 sort_by，以及非稳定排序 sort_unstable 和 sort_unstable_by。

当然，这个所谓的 非稳定 并不是指排序算法本身不稳定，而是指在排序过程中对相等元素的处理方式。在 稳定 排序算法里，对相等的元素，不会对其进行重新排序。而在 不稳定 的算法里则不保证这点。

总体而言，非稳定 排序的算法的速度会优于 稳定 排序算法，同时，稳定 排序还会额外分配原数组一半的空间。

```rust
fn main() {
    let mut vec = vec![1, 5, 10, 2, 15];    
    vec.sort_unstable();    
    assert_eq!(vec, vec![1, 2, 5, 10, 15]);
}
```

### 对结构体进行排序

```rust
#[derive(Debug)]
struct Person {
    name: String,
    age: u32,
}

impl Person {
    fn new(name: String, age: u32) -> Person {
        Person { name, age }
    }
}

fn main() {
    let mut people = vec![
        Person::new("Zoe".to_string(), 25),
        Person::new("Al".to_string(), 60),
        Person::new("John".to_string(), 1),
    ];
    // 定义一个按照年龄倒序排序的对比函数
    people.sort_unstable_by(|a, b| b.age.cmp(&a.age));

    println!("{:?}", people);
}
```

如果结构体实现了 `Ord` 特性，那么可以直接进行排序，但是实现 `Ord` 需要我们实现 `Ord`、`Eq`、`PartialEq`、`PartialOrd` 这些属性。

好在可以直接`derive`这些属性：
```rust
#[derive(Debug, Ord, Eq, PartialEq, PartialOrd)]
struct Person {
    name: String,
    age: u32,
}

impl Person {
    fn new(name: String, age: u32) -> Person {
        Person { name, age }
    }
}

fn main() {
    let mut people = vec![
        Person::new("Zoe".to_string(), 25),
        Person::new("Al".to_string(), 60),
        Person::new("Al".to_string(), 30),
        Person::new("John".to_string(), 1),
        Person::new("John".to_string(), 25),
    ];

    people.sort_unstable();

    println!("{:?}", people);
}
```

需要 `derive` `Ord` 相关特性，需要确保你的结构体中所有的属性均实现了 `Ord` 相关特性，否则会发生编译错误。`derive` 的默认实现会依据属性的顺序依次进行比较，如上述例子中，当 `Person` 的 `name` 值相同，则会使用 `age` 进行比较。


### 将类型转换成 Vec

只要为 Vec 实现了 From<T> 特征，那么 T 就可以被转换成 Vec。

```rust
struct Test {
    value: i32
}

impl From<i32> for Test {

    fn from(value: i32) -> Self {
        Test { value }
    }
}

impl Into<i32> for Test {
    fn into(self) -> i32 {
        self.value
    }
}

impl From<Test> for Vec<Test> {
    fn from(value: Test) -> Self {
        vec![value]
    }
}

// 填空
fn main() {
    let v = Test::from(1);
    // ok
    let val: Vec<Test> = v.into();

    let v2 = Test::from(1);
    // ok
    let val2: i32 = v2.into();
}
```

必须要加上类型声明，编译器不会为我们主动推断。

# 2. KV 存储 HashMap

## 创建HashMap

跟创建动态数组 Vec 的方法类似，可以使用 new 方法来创建 HashMap，然后通过 insert 方法插入键值对。

```rust
use std::collections::HashMap;

// 创建一个HashMap，用于存储宝石种类和对应的数量
let mut my_gems = HashMap::new();

// 将宝石类型和对应的数量写入表中
my_gems.insert("红宝石", 1);
my_gems.insert("蓝宝石", 2);
my_gems.insert("河边捡的误以为是宝石的破石头", 18);
```

任何实现了 `Eq` 和 `Hash` 特征的类型都可以用于 HashMap 的 key。

## 所有权转移

HashMap 的所有权规则与其它 Rust 类型没有区别：

- 若类型实现 Copy 特征，该类型会被复制进 HashMap，因此无所谓所有权
- 若没实现 Copy 特征，所有权将被转移给 HashMap 中

```rust
fn main() {
    use std::collections::HashMap;

    let name = String::from("Sunface");
    let age = 18;

    let mut handsome_boys = HashMap::new();
    handsome_boys.insert(name, age);

    // 错误，所有权已经被转移走了
    println!("{}", name);
    // 正确，age被复制了
    println!("还有，他的真实年龄远远不止{}岁", age);
}
```

## 查询HashMap

通过`get`方法可以获取元素：
```rust
use std::collections::HashMap;

let mut scores = HashMap::new();

scores.insert(String::from("Blue"), 10);
scores.insert(String::from("Yellow"), 50);

let team_name = String::from("Blue");
let score: Option<&i32> = scores.get(&team_name);
```

`get` 方法返回一个 `Option<&i32>` 类型：当查询不到时，会返回一个 `None`，查询到时返回 `Some(&i32)`

并且返回的是一个借用的值，而不是直接带着所有权返回原始的值。

如果需要获取不带引用的值，可以尝试使用`Optional`的`copied`方法：
```rust
let score: i32 = scores.get(&team_name).copied().unwrap_or(0);
```

如果需要调用`copied`，则必须保证实现了`Copy`方法，否则会报错。


### 遍历 HashMap

```rust
use std::collections::HashMap;

let mut scores = HashMap::new();

scores.insert(String::from("Blue"), 10);
scores.insert(String::from("Yellow"), 50);

for (key, value) in &scores {
    println!("{}: {}", key, value);
}
```

## 更新 HashMap 中的值

```rust
fn main() {
    use std::collections::HashMap;

    let mut scores = HashMap::new();

    scores.insert("Blue", 10);

    // 覆盖已有的值
    let old = scores.insert("Blue", 20);
    assert_eq!(old, Some(10));

    // 查询新插入的值
    let new = scores.get("Blue");
    assert_eq!(new, Some(&20));

    // 查询Yellow对应的值，若不存在则插入新值
    let v = scores.entry("Yellow").or_insert(5);
    assert_eq!(*v, 5); // 不存在，插入5

    // 查询Yellow对应的值，若不存在则插入新值
    let v = scores.entry("Yellow").or_insert(50);
    assert_eq!(*v, 5); // 已经存在，因此50没有插入
}
```

### 在已有值的基础上更新

另一个常用场景如下：查询某个 key 对应的值，若不存在则插入新值，若存在则对已有的值进行更新，例如在文本中统计词语出现的次数：

```rust
let v = scores.entry("Yellow").or_insert(50);
*v += 1;
```

也可以通过调用函数获取默认值：
```rust
let v = scores.entry("Yellow").or_insert_with(50);

fn random_stat_buff() -> u8 {
    // 为了简单，我们没有使用随机，而是返回一个固定的值
    42
}
```

### 为结构体实现 Hash 特征

使用`#[derive(Hash)]`可以将所有属性作为 Hash 结果的一部分计算。

也可以控制使用哪些字段进行计算：

```rust
use std::hash::{Hash, Hasher};

struct Person {
    id: u32,
    name: String,
    phone: u64,
}

impl Hash for Person {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.id.hash(state);
        self.phone.hash(state);
    }
}
```