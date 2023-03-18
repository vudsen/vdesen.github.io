---
title: 常见背包dp
date: 2023-03-17 22:52:03
categories:
  data:
    - { name: '算法', path: '/2023/03/14/alogorithm/' }
---

# 完全背包

[322. 零钱兑换 - 力扣（Leetcode）](https://leetcode.cn/problems/coin-change/description/)

```python
有N种物品和一个容量为V的背包，每种物品都有无限件可用。
第i种物品的费用是c[i]，价值是w[i]。
求解将哪些物品装入背包可使这些物品的费用总和不超过背包容量，且价值总和最大。
```

为了方便，我就拿上面力扣的题说了。正常情况下dp方程如下：

​	`f[i][j]`表示第`i`个硬币，凑齐`j`元时花费的最少硬币数

转移方程为：

​	`f[i][j] = min(f[i - 1][j], f[i][j - coin[i] * k] + k)`

可以发现用这个转移方程需要三层遍历(分别枚举`i`、`j`和`k`)，正常情况肯定是会直接T掉的。

但是仔细观察一下可以发现，`k`其实没必要遍历，来看一下下面这个转移方程：

​	`f[i][j] = min(f[i - 1][j], f[i][j - coin[i]] + 1)`

可能还看不出来，我们把它套进循环里：

```java
for (int i = 1; i <= coins.length; i++) {
    int last = i - 1;
    int coin = coins[last];
    for (int j = 1; j <= amount; j++) {
        int val = j >= coin ? f[i][j - coin] + 1 : Integer.MAX_VALUE;
        f[i][j] = Math.min(f[last][j], val);
    }
}
```

有没有那种感觉了？我们枚举`k`会导致很大一部分被重复计算了！

当然，这个dp方程可以把`i`这一纬给优化掉，而且还不需要倒着遍历。

# 多重背包

多重背包需要和完全背包区分，多重背包是每个物品只能选有限个，而完全背包则是无限个

完全背包的题目可以使用多重背包来解，不过一般会超时？

[P1776 宝物筛选 - 洛谷 | 计算机科学教育新生态 (luogu.com.cn)](https://www.luogu.com.cn/problem/P1776)

这道题如果暴力dp，那么转移方程和上面完全背包差不多，也是三重遍历：

```java
for (int i = 1; i <= n; ++i) {
    for (int j = maxWeight; j >= w[i]; --j) {
        for (int k = 1; k <= m[i]; ++k) {
            int last = j - k * w[i];
            if (last < 0) {
                break;
            }
            f[j] = max(f[j], f[last] + k * v[i]);
        }
    }
}
```

