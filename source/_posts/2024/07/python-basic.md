---
title: Python 快速入门
date: 2024-07-30 16:31:21
categories: "python"
---

因为自己偶尔才会用用 Python 写写脚本，但是每次想写的时候就要查半天的语法...所以在这里记录一下 Python 基础的快速入门的一些东西。

# 高级

## 虚拟环境

[创建虚拟环境](https://docs.python.org/zh-cn/3/tutorial/venv.html#creating-virtual-environments).

```shell
python -m venv <project_name>/.venv
source <project_name>/.venv/bin/activate
```

> 如果你去官网看的话这里是直接将虚拟环境创建在了项目目录中，也就是直接调用了 `python -m venv <project_name>`，这样也可以，
> 但是会导致项目根目录会多出很多虚拟环境的配置文件，并且这些文件都是不会进版本控制的，所以在这里创建一个子文件夹 `.venv` 来管理会更好！

运行完后命令左边会出现`<env_name>`：

```shell
(my_env) [root@192.168.0.1 my_env]# 
```

在这种状况下，所有 Python 环境均与外界隔离，包括 `pip` 的版本。

### 退出虚拟环境

使用下面的指令退出虚拟环境：

```shell
deactivate
```

### 分发虚拟环境

由于 `.venv` 目录一般不会进入版本控制系统，所以如果想要想生产，则需要所有需要的依赖。

使用下面的指令导出/导入依赖：

```bash
# 导出
pip freeze >requirements.txt
# 导入
pip install -r requirements.txt
```

---

更新 `pip`：

```python
python3 -m pip install --upgrade pip
```

# 类型定义

## 定义主函数

```python
def main():
    print("hello")


if __name__ == "__main__":
    main()
```

## 函数类型定义

```python
from typing import Mapping

def hello(val: str, map: Mapping[str, str]) -> str:
    pass
```

## 枚举

```python
from enum import Enum
class Server(Enum):
    SERVER_1 = ('192.168.0.1', 'root', '123456')
    SERVER_2 = ('192.168.0.2', 'root', '123456')

    def __init__(self, host: str, user: str, password: str):
        self.host = host
        self.user = user
        self.password = password


printf(Server.SERVER_1.host)
```

## 鸭子类型

```python
from typing import Protocol
from typing import List

# 任何拥有 close 方法的实例都可以被推进去
closeable_list: List[Closeable] = []

class Closeable(Protocol):
    def close(self) -> None:
        pass
```

# 常用库

## 远程 ssh

```python
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.1', username='root', password='123456')

# 这里需要看情况决定是否执行 source /etc/profile，这里不会主动加载环境变量，在外面传 env 参数也没用...
_, stdout, _ = ssh.exec_command('source /etc/profile; env')
print(''.join(stdout.readlines()))
```

## Jenkins API

使用前要给用户生成一个 token。

```python
from jenkinsapi.jenkins import Jenkins

JOB_NAME = 'xxx'
SERVER = 'http://192.168.0.1:8080'
jenkins = Jenkins('http://192.168.0.1:8080', 'user', 'token')


params = {
    'Branch': 'master'
}
jenkins.build_job(JOB_NAME, params)
job = jenkins[JOB_NAME]
qi = job.invoke(build_params=params)

if qi.is_queued() or qi.is_running():
    print('等待任务构建完成...')
    qi.block_until_complete()

build = qi.get_build()
if not build.is_good():
    raise RuntimeError(f'Build failed, check {server}/job/{JOB_NAME}/{build.buildno}/pipeline-graph/ for more details.')
```

# 工具类

## 压缩文件夹

```python
import zipfile
import os
import sys

def zip_dir(directory_path: str, output_path=None):
    # Get the base name of the directory to include in the zip
    base_name = os.path.basename(directory_path)

    # Create a zip file at the specified output path
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Walk through the directory and add each file or directory to the zip file
        for root, dirs, files in os.walk(directory_path):
            # Create an archive name with the top-level directory included
            arcname_root = os.path.join(base_name, os.path.relpath(root, start=directory_path))

            # Add directory entries
            if not files and not dirs:
                # Handle the case of empty directories
                zipf.write(root, arcname=arcname_root + '/')

            for file in files:
                # Get the full path of the file
                full_path = os.path.join(root, file)
                # Create the relative path for the file in the zip
                arcname = os.path.join(arcname_root, file)
                zipf.write(full_path, arcname)
```

## Y/N 输入确认

```python
def input_bool(text: str, default: bool = False):
    tip: str
    exp: str
    if default:
        tip = '(Y/n)'
    else:
        tip = '(y/N)'
    out = input(f'{text} {tip}')
    if out == '':
        return default
    elif out == 'Y' or out == 'y':
        return True
    elif out == 'N' or out == 'n':
        return False
    else:
        return input_bool(text, default)
```