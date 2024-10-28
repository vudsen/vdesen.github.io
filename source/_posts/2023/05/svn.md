---
title: svn
date: 2023-05-04 21:43:53
tags:
---

# 1. 下载安装

[下载 · TortoiseSVN](https://www.tortoisesvn.net/downloads.zh.html)

直接下载安装包即可，下载完成后不需要配置环境变量之类的，SVN也不需要你去命令行里去敲哪些什么指令，它自己有很丰富的图形客户端，这点是比GIT好一点点的。

直接对着任意地方右键，如果出现`TortoiseSVN`的选项，就说明安装成功了（对着桌面按是没有的，需要进随便一个文件夹）。

# 2. 创建仓库

SVN不支持离线操作，也就是说你想要创建一个仓库，你必须先去服务器支棱一个起来，这里我们直接用码云（[工作台 - Gitee.com](https://gitee.com/)）就好了。

随便创建一个项目，点击管理 -> 功能设置 -> 启用SVN访问。

之后克隆项目，记得要选SVN的协议：

![克隆地址](https://5j9g3t.site/public/svn/2023-4-4-f7e03d78-69bd-4d0e-99dd-7f795e9bb813.webp)

之后进入任意文件夹，鼠标右键，点击`Checkout`，之后会弹出来这个：

![Checkout](https://5j9g3t.site/public/svn/2023-4-4-4c484952-5b77-4b8f-a1e0-d608c149731d.webp)

第一个表单就是我们的仓库地址，第二个就是我们要将项目拉到的地方，第三`Checkout Depth`就是你克隆的深度，你可以选择全部复制（Fully recursive），也可以选择部分，一般配合下面的`Choose items`按钮使用。

Omit externals表示忽略外部设备，目前不是很清楚有什么用。

最后一个框（Revision）就是版本信息选择了，你可以直接选择最新分支（HEAD revision），也可以通过`Show log`选择历史分支来进行克隆。

选好后点击OK进行克隆。

# 3. 提交修改

我们在本地进行任意修改，修改完后在任意子目录或者根目录鼠标右键，在`TortoiseSVN`选项下找到`Commit`选项，点开会出现这个：

![Commit](https://5j9g3t.site/public/svn/2023-4-4-f6b3b8a9-a01e-4918-8f6d-5febeaba9268.webp)

最上面的`Message`就是提交信息，没有什么好说的。

下面那个框就是选择你需要提交的文件。

<font color=red>**注意：SVN的Commit会直接提交到服务器，它不是跟Git一样本地提交！！！千万不要乱提交。**</font>

下面有个按钮，分别的作用是：

- Show unversioned files：显示被排除的文件（不受版本控制的文件）

其它的暂时用不上，我们选好后，直接提交，然后再去码云上看，就可以看到提交结果了。

# 4. 解决冲突

这里我们先在码云上修改一下，然后也在本地修改同样的文件，然后在本地提交：

![Commit failed](https://5j9g3t.site/public/svn/2023-4-4-be381ad9-6523-406d-9d22-494a2fc9dc81.webp)

提交失败了，可以发现它让我们去更新：

```text
You have to update your working copy first
```

那我们就更新，直接项目目录下右键，点击`Update`，结果又报错了：

![Update failed](https://5j9g3t.site/public/svn/2023-4-4-f69a5b86-d6c6-42d8-a8e4-ba19423d7380.webp)

可以发现是因为出现了文件冲突，和Git一样，我们需要先解决冲突后再提交。

这里是我本地的文件内容：

```text
hello world
hello world
hello world
hello world

12312
312
3
12
3
12
3
12
3
hello world
```

这是服务器的：

```text
hello world

12312
312
3
12
3
12
3
12
3
12312
312
3
12
3
12
3
12
3
123312312
```

这是发生冲突后的文件：

```text
hello world
hello world
hello world
hello world

<<<<<<< .mine
hello world





||||||| .r3
12312
312
3
12
3
12
3
12
3=======
12312
312
3
12
3
12
3
12
3
123312312>>>>>>> .r4
```

这特么谁看得懂，别急，还记得之前我说过SVN有丰富的图形客户端吗？这里就还真有解决冲突用的玩意：

![Edit conflicts](https://5j9g3t.site/public/svn/2023-4-4-bd001ea3-fca1-4b2d-9950-64f0e52cc430.webp)

打开后就非常直观了，这里就不放图了，修改完后点击左上角的`Save`保存，这时它会问你冲突是否已经解决完毕了，如果选择解决完了（Mark as resolved），就可以直接提交了。当然如果又冲突了，就又需要重复上述过程。

# 5. 代码暂存

待补坑。
