---
title: TypeScript骚操作
date: 2023-11-27 10:40:12
categories: 前端
---


# 可变参数

写过ReactNative的都知道，ReactNavigation库里面有一个非常牛逼的类型声明，它可以根据你传入的参数，来判断是否需要第二个参数。

例如下面的定义：
```typescript
interface RouteDef {
    home: undefined
    shop: {
        time: number
    }
}
```

那么它的路由方法就变得很牛逼了：
```typescript
// 实际的泛型肯定不是这么传的，因为我写的时候没用RN了，所有忘了咋用的了
const nav = useNavigation<RouteDef>()

// 正确
nav('home')

// 错误: ts提示这里只需要一个参数 
nav('home', undefined)

// 错误，ts提示这里需要两个参数
nav('shop')

// 正确
nav('shop', { time: Date.now() })

// 错误: 第二个参数需要{ time: number }类型，而提供的是number
nav('shop', Date.now())
```

很牛逼啊有没有，连参数的数量都给你变了！而且还能根据属性的定义来决定参数。

那么这玩意具体是咋写的呢？我仔细研究了一下，研究完后，仿佛开启了新大门！

我这里直接写一个Demo来看：

```typescript
type EmitFuncArgs<Events, Key extends keyof Events> = void extends Events[Key]
  ? [evt: Key]
  : [evt: Key, data: Events[Key]]

type EmitFunc<Events> = <T extends keyof Events> (...args: EmitFuncArgs<Events, T>) => string

export interface AppEvents {
  ON_LOGOUT: string
  ON_LOGIN: void
}

```

先来看下面的`EmitFunc`定义，首先这玩意的泛型接收一个Events类型(直接把它看成下面的AppEvents接口就行)，然后它的参数是`EmitFuncArgs`
决定的。

来看`EmitFuncArgs`，可以发现这玩意居然返回了一个数组，并且还用上了三目运算符。

到了这里，大伙都应该可以理解是怎么玩的了，就是首先判断值是不是void，如果是，则返回一个长度为1的数组，反之则返回长度为2的数组，其中的第二个
参数为接口定义的类型。