---
title: 关于 GoLang 何时使用引用的研究
date: 2024-09-03 22:14:50
categories: GoLang
seo:
  description: 关于 GoLang 引用的研究，何时应该使用引用，不使用引用会怎么样？本文将为你解决你的所有疑惑，带你全面了解 GoLang 的引用。
---

> [!NOTE]
> [太长不看，直接看总结](#总结)

# 前言

由于我原本是一个搞 Java 的，未来想要转型搞 GoLang。结果在使用的时候发现一个对我这种搞 Java 的非常难以理解的情况：

```go
type Object struct {
	data int
}

func updateObj(obj Object) {
	obj.data++
}

func main() {
	var obj Object
	// expect 0
	fmt.Println(obj.data)
	updateObj(obj)
	// expect 1
	fmt.Println(obj.data)
}
```

"正常情况"下，这段代码应该依次打印 `0` 和 `1`. 但是实际却是:

![执行结果](https://5j9g3t.site/images/2024/11/go1.webp)\

可以发现输出了两个 `0`.

可以发现 GoLang 里面参数传递没有和 Java 一样那么无脑。。。很显然，这里直接把对象复制了一遍然后传给了函数，如果大家对 C/C++ 稍微了解过的话，就可以发现这个逻辑是一样的：**调用函数是值传递**。

## 什么是引用

这里我直接说结论了，对于一个变量来说，它有两个关键属性：

- 值
- 地址

例如下面的代码:

```go
var obj Object

var objRef = &obj
```

对 `obj` 来说，它的值为结构体的数据，这里为了方便我们称它为 `a`, `obj` 的地址这里假设为 `b`。那么对于 `objRef` 来说，它的值就是 `b`，地址就是内存中的另外一块地址。

![示意图](https://5j9g3t.site/images/2024/11/QQ20241110-203642.webp)

如上图所示，蓝色方框里面代表变量当前的值。

对于 `obj` 的值具体是什么样的，**个人猜测**这里应该是一个 `8` 字节的指针指向结构体内存地址开始的位置(不一定都是全部表示开始位置，可能还会有其它信息)，然后底层根据结构体大小信息读取相应范围内的数据，就能够表示一个结构体了。

但是我们在复制这个 *值* 的时候，不能仅只复制第一个 `8` 字节，也就是那个指针，也必须要把后面跟着的那一大块全部全部复制。


> [!IMPORTANT]
> 这里只是我为了方便记忆根据个人经验写出来的！没有依据！没有依据！没有依据！



# 切片是否需要引用

再来看一个例子(`Object`结构体省略了): 

```go
func updateObj(arr []Object) {
	arr[0] = Object{data: 1}
}

func main() {
	arr := make([]Object, 1)

	fmt.Println(arr[0].data)
	updateObj(arr)
	fmt.Println(arr[0].data)
}
```

输出:

```log
0
1
```

可以发现**切片**使用函数传递后还能够影响原来的值。其实根据切片的结构就可以发现(`internal/unsafeheader/unsafeheader.go`)：

```go
type Slice struct {
	Data unsafe.Pointer
	Len  int
	Cap  int
}
```

可以发现这个结构体里面还有一个指针指向了真正的数据。这一点让我想起当初刚学 C 语言的时候用 `malloc` **声明一串连续的内存地址然后用来当数组**的时候。。。

所以我们将切片传给函数时，其实也复制了值，但是复制的没这么多，就只有结构体这三个字段，在 64 位系统上也就 `24` 字节。


所以切片你想用引用就用，**但是一般的习惯是不用，因为也浪费不了多少空间，而且后面用的时候解引用也麻烦**。

除了切片外 `string`、`map` 和 `chan` 也可以这样使用。

## 真的不用引用吗

再来看个有意思的例子：

```go
func updateObj(arr []Object) {
	arr[0].data++
}

func main() {
	arr := make([]Object, 1)
	val := Object{data: 0}

	arr[0] = val

	updateObj(arr)
	fmt.Println(val.data)
}
```

输出：

```log
0
```

理论上这里应该输出 `1`，但是却输出了 `0`，这不是和我们之前得出的结论相违背吗？

---

不知道你还记不记得我之前说在 C 里面声明一串**连续的内存地址**，在这里，切片元素的类型是 `Object`，所以**这一串内存中存的就是 `Object` 具体的值，而不是 `val` 的内存地址**。

如果你将 `arr[0].data` 打印，可以发现它的值确实自增了。

所以说我们**将值添加到切片中时，也会发生值的复制**。

# 方法返回值

那么既然入参会复制值，那么返回值会怎么样呢？

```go
type Object struct {
	data  int
	data2 int
	data3 int
}

func createObj() Object {
	var obj = Object{data: 2}
	fmt.Printf("函数中的内存地址为: %p\n", &obj)
	return obj
}

func main() {
	r := createObj()
	fmt.Printf("函数返回后的内存地址为: %p\n", &r)
	fmt.Println(&r)
}
```

输出：

```go
函数中的内存地址为: 0xc0000ae018
函数返回后的内存地址为: 0xc0000ae000
```

可以发现两个内存地址相差 `18`, 转换为十进制，就是 `24`, 而我们的结构体也正好是 24 字节，说明**返回时也发生了复制**。

# 总结

1. 能用引用就用引用，不管是返回值还是方法参数
2. 切片、`map`、`string` 和 `chan` 可以用引用直接传递
3. 在更新切片、`map`等第二点提到的数据结构前，应该将值更新至最新状态后再添加，因为每次添加到这些结构中都会发生一次复制