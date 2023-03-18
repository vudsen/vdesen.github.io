---
title: 矩阵遍历常用手法
date: 2023-03-14 13:47:03
categories:
  data:
    - { name: '算法', path: '/2023/03/14/alogorithm/' }
---

[题目详情 - 阿里巴巴-2022.11.5-超级对称矩阵 - Hydro](http://101.43.147.120/p/P1022)

首先这道题很明显，我们只需要将每4个对应的位置加到最大值即可，这么说可能不好理解，假设矩阵长度为`n`，坐标从[1, 1]开始(<font color=red>这个很重要，最好不要从零开始，从1开始可以省掉一些数组越界的判断</font>)，打个比方：

- [1, 1]这个点对应[1, n]，[n, 1]，[n, n]这三个点
- [1, 2]这个点对应[2, n]，[n, n - 1]，[n - 1, 1]这三个点

所以，我们只需要让这四个点的值相同，那么这四个点在旋转时，值一定是相同的。

这里的问题是要怎么去遍历这四个点，咱们思路有，但是写不出来。

这时候可以考数组"打表"的方式来处理：

```c++
const int POINTER_CNT = 4;
// 左上 右上 右下 左下
int MOVE[][2] = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
int pointer[POINTER_CNT][2];
```

其中`pointer`包括了我们四个点的位置，数组第二维保存了坐标，在遍历完成一次后这样对点进行移动：

```c++
for (int j = 0; j < POINTER_CNT; ++j) {
    pointer[j][0] += MOVE[j][0];
    pointer[j][1] += MOVE[j][1];
}
```

遍历处理完了，现在我们需要处理边界问题。

不难发现，对于长度为`n`的矩阵，第一次遍历需要`n - 1`次，第二次遍历则是`n - 1 - 2`次，第三次则是`n - 1 - 2 - 2`次...

有这个思路这道题就解出来了：

```c++
#include <iostream>
#define ll long long
inline int read()
{
    int x=0,f=1;char ch=getchar();
    while (ch<'0'||ch>'9'){if (ch=='-') f=-1;ch=getchar();}
    while (ch>='0'&&ch<='9'){x=x*10+ch-48;ch=getchar();}
    return x*f;
}

template<typename T> T max(T a, T b) {
    return a > b ? a : b;
}
template<typename T> T max4(T a, T b, T c, T d) {
    return max(max(a, b), max(c, d));
}
template<typename T> T min(T a, T b) {
    return a < b ? a : b;
}
const int MAX_N = 102;
const int POINTER_CNT = 4;
int matrix[MAX_N][MAX_N];
// 左上 右上 右下 左下
int MOVE[][2] = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
int pointer[POINTER_CNT][2];
int n;
// 根据遍历了多少次，我们可以得到每个点的起始坐标。
void reinit(int offset) {
    pointer[0][0] = 1 + offset;
    pointer[0][1] = 1 + offset;
    pointer[1][0] = 1 + offset;
    pointer[1][1] = n - offset;
    pointer[2][0] = n - offset;
    pointer[2][1] = n - offset;
    pointer[3][0] = n - offset;
    pointer[3][1] = 1 + offset;
}

int main(){
    n = read();
    // 8 + 6 + 6 + 2 + 2 + 4
    for (int i = 1; i <= n; ++i) {
        for (int j = 1; j <= n; ++j) {
            matrix[i][j] = read();
        }
    }
    reinit(0);
    ll ans = 0;
    int len = n;
    int offset = 0;
    // 这里也可以用len是否小于等于0判断
    while (pointer[0][0] < pointer[2][0] && pointer[0][1] < pointer[2][1]) {
        for (int i = 1; i < len; ++i) {
            int x1 = pointer[0][0], y1 = pointer[0][1];
            int x2 = pointer[1][0], y2 = pointer[1][1];
            int x3 = pointer[2][0], y3 = pointer[2][1];
            int x4 = pointer[3][0], y4 = pointer[3][1];
            int val1 = matrix[x1][y1], val2 = matrix[x2][y2], val3 = matrix[x3][y3], val4 = matrix[x4][y4];
            int mx = max4(val1, val2, val3, val4);
            ans += (mx - val1) + (mx - val2) + (mx - val3) + (mx - val4);
            for (int j = 0; j < POINTER_CNT; ++j) {
                pointer[j][0] += MOVE[j][0];
                pointer[j][1] += MOVE[j][1];
            }
        }
        len -= 2;
        offset++;
        reinit(offset);
    }
    printf("%lld", ans);
    return 0;
}
```

