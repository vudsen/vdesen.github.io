---
title: 自动引用绑定
date: 2024-06-06 23:35:22
categories:
  data:
    - { name: "Rust", path: "/2023/12/04/rust/" }
---

# 自动引用绑定

## 自动解引用

来看下面的代码：

```rust
#[derive(Debug)]
enum CustomError {
    ParseError(ParseIntError),
    ReadError(IoError),
}

impl Error for CustomError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match *self {
            CustomError::ParseError(ref e) => Some(e),
            CustomError::ReadError(ref e) => Some(e),
        }
    }
}

// 省略了无关代码
```

