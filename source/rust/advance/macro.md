---
title: Macro 宏编程
date: 2024-06-24 22:48:26
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

在 Rust 中宏分为两大类：声明式宏( declarative macros ) `macro_rules!` 和三种过程宏( procedural macros ):

- `#[derive]`，在之前多次见到的派生宏，可以为目标结构体或枚举派生指定的代码，例如 `Debug` 特征
- 类属性宏(Attribute-like macro)，用于为目标添加自定义的属性
- 类函数宏(Function-like macro)，看上去就像是函数调用

# 宏和函数的区别

## 元编程

从根本上来说，宏是通过一种代码来生成另一种代码，例如 `derive` 属性，就会自动为结构体派生出相应特征所需的代码，例如 `#[derive(Debug)]`，还有熟悉的 `println!` 和 `vec!`，所有的这些宏都会展开成相应的代码，且很可能是长得多的代码。

总之，元编程可以帮我们减少所需编写的代码，也可以一定程度上减少维护的成本，虽然函数复用也有类似的作用，但是宏依然拥有自己独特的优势。

## 可变参数

Rust 的函数签名是固定的：定义了两个参数，就必须传入两个参数，多一个少一个都不行。

而宏就可以拥有可变数量的参数，例如可以调用一个参数的 `println!("hello")`，也可以调用两个参数的 `println!("hello {}", name)`。

## 宏展开

由于宏会被展开成其它代码，且这个展开过程是发生在编译器对代码进行解释之前。因此，宏可以为指定的类型实现某个特征：先将宏展开成实现特征的代码后，再被编译。

而函数就做不到这一点，因为它直到运行时才能被调用，而特征需要在编译期被实现。

## 宏的缺点

相对函数来说，由于宏是基于代码再展开成代码，因此实现相比函数来说会更加复杂，再加上宏的语法更为复杂，最终导致定义宏的代码相当地难读，也难以理解和维护。

# 声明式宏 macro_rules!

在 Rust 中使用最广的就是声明式宏，它们也有一些其它的称呼，例如示例宏( macros by example )、`macro_rules!` 或干脆直接称呼为宏。

声明式宏允许我们写出类似 match 的代码。宏也是将一个值跟对应的模式进行匹配，且该模式会与特定的代码相关联。但是与 match 不同的是，宏里的值是一段 Rust 源代码(字面量)，模式用于跟这段源代码的结构相比较，一旦匹配，传入宏的那段源代码将被模式关联的代码所替换，最终实现宏展开。值得注意的是，所有的这些都是在编译期发生，并没有运行期的性能损耗。

## 简化版的 vec!

使用 `macro_rules!` 实现一个简单的 `vec!`:

```rust
#[macro_export]
macro_rules! vec {
    ( $( $x:expr ),* ) => {
        {
            let mut temp_vec = Vec::new();
            $(
                temp_vec.push($x);
            )*
            temp_vec
        }
    };
}
```

`#[macro_export]` 注释将宏进行了导出，这样其它的包就可以将该宏引入到当前作用域中，然后才能使用。

紧接着，就使用 `macro_rules!` 进行了宏定义，需要注意的是宏的名称是 `vec`，而不是 `vec!`，后者的感叹号只在调用时才需要。

`vec` 的定义结构跟 `match` 表达式很像，但这里我们只有一个分支，其中包含一个模式 `( $( $x:expr ),* )`，跟模式相关联的代码就在 `=>` 之后。一旦模式成功匹配，那这段相关联的代码就会替换传入的源代码。

由于 `vec` 宏只有一个模式，因此它只能匹配一种源代码，其它类型的都将导致报错，而更复杂的宏往往会拥有更多的分支。

## 模式解析

现在来简单理解下 `( $( $x:expr ),* )` 的含义。

首先使用圆括号 `()` 将整个宏模式包裹其中。紧随其后的是 `$()`，跟括号中模式相匹配的值(传入的 Rust 源代码)会被捕获，然后用于代码替换。在这里，模式 `$x:expr` 会匹配任何 Rust 表达式并给予该模式一个名称：`$x`。

`$()` 之后的逗号说明在 `$()` 所匹配的代码的后面会有一个可选的逗号分隔符，紧随逗号之后的 `*` 说明 `*` 之前的模式会被匹配零次或任意多次(类似正则表达式)。

当使用 `vec![1, 2, 3]` 来调用该宏时，`$x` 模式将被匹配三次，分别是 `1`、`2`、`3`。

总结一下：

1. `$()` 中包含的是模式 `$x:expr`，该模式中的 `expr` 表示会匹配任何 Rust 表达式，并给予该模式一个名称 `$x`
2. 因此 `$x` 模式可以跟整数 `1` 进行匹配，也可以跟字符串 `"hello"` 进行匹配: `vec!["hello", "world"]`
3. `$()` 之后的逗号，意味着 `1` 和 `2` 之间可以使用逗号进行分割，也意味着 `3` 既可以没有逗号，也可以有逗号：`vec![1, 2, 3,]`
4. `*` 说明之前的模式可以出现零次也可以任意次，这里出现了三次


接下来再来看看与模式相关联、在 `=>` 之后的代码：

```rust
{
    {
        let mut temp_vec = Vec::new();
        $(
            temp_vec.push($x);
        )*
        temp_vec
    }
};
```

这里就比较好理解了，`$()` 中的 `temp_vec.push()` 将根据模式匹配的次数生成对应的代码，当调用 `vec![1, 2, 3]` 时，下面这段生成的代码将替代传入的源代码，也就是替代 `vec![1, 2, 3]`:

```rust
{
    let mut temp_vec = Vec::new();
    temp_vec.push(1);
    temp_vec.push(2);
    temp_vec.push(3);
    temp_vec
}
```

# 用过程宏为属性标记生成代码

第二种常用的宏就是过程宏 ( *procedural macros* )，从形式上来看，过程宏跟函数较为相像，但过程宏是使用源代码作为输入参数，基于代码进行一系列操作后，再输出一段全新的代码。

注意，过程宏中的 derive 宏输出的代码并不会替换之前的代码，这一点与声明宏有很大的不同！

当创建过程宏时，它的定义必须要放入一个独立的包中，且包的类型也是特殊的，这么做的原因相当复杂，只要知道这种限制在未来可能会有所改变即可。

> 事实上，根据[这个说法](https://www.reddit.com/r/rust/comments/t1oa1e/what_are_the_complex_technical_reasons_why/)，过程宏放入独立包的原因在于它必须先被编译后才能使用，如果过程宏和使用它的代码在一个包，就必须先单独对过程宏的代码进行编译，然后再对我们的代码进行编译，但悲剧的是 Rust 的编译单元是包，因此你无法做到这一点。

## 自定义 derive 过程宏

假设我们有一个特征 `HelloMacro`，现在有两种方式让用户使用它：

- 为每个类型手动实现该特征
- 使用过程宏来统一实现该特征，这样用户只需要对类型进行标记即可：`#[derive(HelloMacro)]`

如果不同的类型都可以使用同样的默认特征实现，那么使用过程宏的方式可以减少很多代码实现：

```rust
use hello_macro::HelloMacro;
use hello_macro_derive::HelloMacro;

#[derive(HelloMacro)]
struct Sunfei;

#[derive(HelloMacro)]
struct Sunface;

fn main() {
    Sunfei::hello_macro();
    Sunface::hello_macro();
}
```

在使用宏之前，需要创建一个新的工程：

```sh
$ cargo new hello_macro
$ cd hello_macro/
$ touch src/lib.rs
```

之后在 `src/lib.rs` 中定义过程宏所需的 `HelloMacro` 特征和其关联函数:

```rust
pub trait HelloMacro {
    fn hello_macro();
}
```

然后需要创建过程宏，对于 hello_macro 宏而言，包名就应该是 hello_macro_derive。在之前创建的 hello_macro 项目根目录下，运行如下命令，创建一个单独的 lib 包:

```sh
cargo new hello_macro_derive --lib
```

至此， hello_macro 项目的目录结构如下：

```
hello_macro
├── Cargo.toml
├── src
│   ├── main.rs
│   └── lib.rs
└── hello_macro_derive
    ├── Cargo.toml
    ├── src
        └── lib.rs
```

但是直接这样还是无法使用，还需要我们手动导入模块，修改 `hello_macro/Cargo.toml` 文件添加以下内容:

```toml
[dependencies]
hello_macro_derive = { path = "../hello_macro/hello_macro_derive" }
# 也可以使用下面的相对路径
# hello_macro_derive = { path = "./hello_macro_derive" }
```

这里需要用到一个 cargo-expand 的工具，用来调试宏，可以通过下面的命令安装:

```sh
cargo install cargo-expand
```

### 定义过程宏

首先，在 hello_macro_derive/Cargo.toml 文件中添加以下内容：

```rust
[lib]
proc-macro = true

[dependencies]
syn = "1.0"
quote = "1.0"
```

其中 `syn` 和 `quote` 依赖包都是定义过程宏所必需的，同时，还需要在 `[lib]` 中将过程宏的开关开启 : `proc-macro = true`。

其次，在 `hello_macro_derive/src/lib.rs` 中添加如下代码：

```rust
extern crate proc_macro;

use proc_macro::TokenStream;
use quote::quote;
use syn;
use syn::DeriveInput;

#[proc_macro_derive(HelloMacro)]
pub fn hello_macro_derive(input: TokenStream) -> TokenStream {
    // 基于 input 构建 AST 语法树
    let ast:DeriveInput = syn::parse(input).unwrap();

    // 构建特征实现代码
    impl_hello_macro(&ast)
}
```

首先有一点，对于绝大多数过程宏而言，这段代码往往只在 `impl_hello_macro(&ast)` 中的实现有所区别，对于其它部分基本都是一致的，如包的引入、宏函数的签名、语法树构建等。

`proc_macro` 包是 Rust 自带的，因此无需在 `Cargo.toml` 中引入依赖，它包含了相关的编译器 API，可以用于读取和操作 Rust 源代码。

由于我们为 `hello_macro_derive` 函数标记了 `#[proc_macro_derive(HelloMacro)]`，当用户使用 `#[derive(HelloMacro)]` 标记了他的类型后，`hello_macro_derive` 函数就将被调用。这里的秘诀就是特征名 `HelloMacro`，它就像一座桥梁，将用户的类型和过程宏联系在一起。

`syn` 将字符串形式的 Rust 代码解析为一个 AST 树的数据结构，该数据结构可以在随后的 `impl_hello_macro` 函数中进行操作。最后，操作的结果又会被 `quote` 包转换回 Rust 代码。这些包非常关键，可以帮我们节省大量的精力，否则你需要自己去编写支持代码解析和还原的解析器，这可不是一件简单的任务！

`derive` 过程宏只能用在 `struct/enum/union` 上，多数用在结构体上，我们先来看一下一个结构体由哪些部分组成:

```rust
// vis，可视范围             ident，标识符     generic，范型    fields: 结构体的字段
pub              struct    User            <'a, T>          {

// vis   ident   type
   pub   name:   &'a T,

}
```

其中 `type` 还可以细分，具体请阅读 `syn` 文档或源码.

`syn::parse` 调用会返回一个 `DeriveInput` 结构体来代表解析后的 Rust 代码:

```rust
DeriveInput {
    // --snip--
    vis: Visibility,
    ident: Ident {
        ident: "Sunfei",
        span: #0 bytes(95..103)
    },
    generics: Generics,
    // Data是一个枚举，分别是DataStruct，DataEnum，DataUnion，这里以 DataStruct 为例
    data: Data(
        DataStruct {
            struct_token: Struct,
            fields: Fields,
            semi_token: Some(
                Semi
            )
        }
    )
}
```

以上就是源代码 `struct Sunfei`; 解析后的结果，里面有几点值得注意:

- `fields: Fields` 是一个枚举类型，`Fields::Named`, `Fields::Unnamed`, `Fields::Unit` 分别表示结构体中的显式命名字段（如例子所示），元组或元组变体中的匿名字段(例如`Some(T)`)，单元类型或单元变体字段（例如`None` ）。
- `ident: "Sunfei"` 说明类型名称为 `Sunfei`， `ident` 是标识符 `identifier` 的简写

[syn文档](https://docs.rs/syn/1.0/syn/struct.DeriveInput.html)。

下面来看看如何构建特征实现的代码，也是过程宏的核心目标:

```rust
fn impl_hello_macro(ast: &syn::DeriveInput) -> TokenStream {
    let name = &ast.ident;
    let gen = quote! {
        impl HelloMacro for #name {
            fn hello_macro() {
                println!("Hello, Macro! My name is {}!", stringify!(#name));
            }
        }
    };
    gen.into()
}
```

首先，将结构体的名称赋予给 `name`，也就是 `name` 中会包含一个字段，它的值是字符串 `"Sunfei"`。

其次，使用 `quote!` 可以定义我们想要返回的 Rust 代码。由于编译器需要的内容和 `quote!` 直接返回的不一样，因此还需要使用 `.into` 方法其转换为 `TokenStream`。

大家注意到 `#name` 的使用了吗？这也是 `quote!` 提供的功能之一，如果想要深入了解 `quote`，可以看看[官方文档](https://docs.rs/quote)。

其中 `stringify!` 是 Rust 提供的内置宏，可以将一个表达式(例如 1 + 2)在编译期转换成一个字符串字面值`("1 + 2")`，该字面量会直接打包进编译出的二进制文件中，具有 `'static` 生命周期。而 `format!` 宏会对表达式进行求值，最终结果是一个 `String` 类型。在这里使用 `stringify!` 有两个好处:

- `#name` 可能是一个表达式，我们需要它的字面值形式
- 可以减少一次 String 带来的内存分配

在运行之前，可以先用 `expand` 展开宏，观察是否有错误或符合预期:

```sh
cargo expand --bin hello_macro
```

运行后会显示编译后的代码。

