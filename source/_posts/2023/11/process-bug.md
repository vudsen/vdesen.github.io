---
title: 记一次Runtime.exec遇到的坑
date: 2023-11-10 15:24:36
categories: 线上问题排查
---

首先来看一段代码(Java17, Java8同样也有这个问题)：
```java
Runtime runtime = Runtime.getRuntime();
runtime.exec("docker exec mysql-test2 mysql -ubim -pxx -h11.11.11.11 -P3306 bim -e \"use bim;source bim.sql;\"");
```

这段代码是用来执行mysqldump备份出来的mysql文件，咋一看好像没问题。

运行后，byd好像也确实没什么问题👿👿👿


如果真的没问题就好了，那么也不会有这篇博客了。

写完后打包丢到Linux上去跑的时候，你就会发现。。。

运行后发现执行失败了，exitCode为1，看了一下它的输出，它居然直接把mysql的帮助菜单给打印出来了？？？

见过离谱的，没见过这么离谱的，我这个指令可是跟帮助菜单一点关系都没有啊？

---

如果大家去搜java怎么去执行命令行指令的时候，可能会得到两个结果，一种就是用`Runtime`，另外一个就是用`ProcessBuilder`，大部分人可能都会用`Runtime`，因为这玩意给`ProcessBuilder`封装了一层，用起来方便，直接一个exec把指令丢进去就可以了。

也就是因为这个，突然想起来之前在python里面，想要执行shell命令必须要把指令以数组的形式传进去(其实也可以使用`shell=True`参数)，而`ProcessBuilder`也是这样，你直接丢一个字符串进去是执行不了的，必须要传数组进去。

到这里就怀疑`Runtime`是不是直接暴力调用了`split(" ")`，然后把参数丢给`ProcessBuilder`，结果看了下源码，还真是这样：

```java
public Process exec(String command, String[] envp, File dir)
    throws IOException {
    if (command.isEmpty())
        throw new IllegalArgumentException("Empty command");

    StringTokenizer st = new StringTokenizer(command);
    String[] cmdarray = new String[st.countTokens()];
    for (int i = 0; st.hasMoreTokens(); i++)
        cmdarray[i] = st.nextToken();
    return exec(cmdarray, envp, dir);
}
```

`StringTokenizer`可能大家没见过，但是如果你用java写算法，并且了解过输入优化，你就会知到这玩意是干嘛的。简单点来说它的效果和`Scanner`一样，但是效率更高(如果你写过算法就知道这玩意速度吊打`Scanner`)，`Scanner`就不多讲了，感觉是个人就用过。。。

如果你还看不懂，没事，我直接给你上图：
![debug](https://selfb.asia/public/2023-9/Snipaste_2023-11-10_16-06-22.webp)

可以发现我们后面用双引号包裹起来的参数被分开了，实际传到mysql那里就会导致执行失败。

但是这玩意在windows上能执行成功也是很离谱的。

知到原因后，直接改用`ProcessBuilder`手动控制参数：
```java
Process process = new ProcessBuilder(backupConfig.getMysqlPath(),
                    "-u" + backupConfig.getUsername(),
                    "-p" + backupConfig.getPassword(),
                    "-h" + backupConfig.getHost(),
                    "-P" + backupConfig.getPort(),
                    "-e",
                    String.format("\"use %s;source %s;\"", ignore, ignore))
                    // 标准错误流重定向到标准输出，方便拿错误信息
                    .redirectErrorStream(true)
                    .start();
```
看到我的String.format没，我这里用引号包起来了好让他们是一个整体。

完？。。

---

丢到服务器上跑，结果又报错了👿，不过至少这次没打帮助菜单，提示`""use %s;source %s;""`不是一个mysql指令。

byd原来引号是自作多情多加上了，最后把引号给删掉就能跑起来了。。

这bug也是花了我挺多时间的吧，一开始以为是mysql的问题，结果居然是jdk自己的问题。