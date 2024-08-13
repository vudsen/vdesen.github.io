---
title: 快速入门
date: 2024-08-06 11:28:17
tags: ansible
seo:
  title: Ansible 快速入门
  description: Ansible 学习博客。
  keywords: 
   - ansible
   - 'ansible 入门'
   - 'ansible quick start'
---


# 安装

**Ansible 不支持在 windows 上作为控制节点使用，虽然可以安装，但是运行不了：** [Why no Ansible controller for Windows?](https://blog.rolpdog.com/2020/03/why-no-ansible-controller-for-windows.html)。

*但是 windows 可以作为被控制的节点来使用*。

创建虚拟环境并安装：

```shell
python3 -m venv ansible
source ansible/bin/activate
python3 -m pip install ansible-core
```

如果是 `python3.6` 最高只能装 `2.11` 更高的版本需要升级 python 版本。

同时安装 ansible-runner：

```shell
# python latest
python3 -m pip install ansible-runner

# python 3.6
python3 -m pip install ansible-runner==2.2.2
```

# 基础概念

> 因为主要是靠 Python 代码执行，所以这里基础没有讲很多。

ansible 中有下面几种常用的特殊名词：

- [Inventory](https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html): "物品栏"(不知道该怎么翻译...)，包含了一组或多组远程服务器
- Play: 剧本，可以理解为一个完整的工作流程，一般由多个 `Task` 组成。其中每个 `Play` 都会指定 `Inventory` 中的一组服务器。
- Task: 任务，通常同来定义一个操作.
- Role: 与 `Play` 类似，但是在声明时不需要指定 `Inventory`，所以一般不会直接写 `Play`，而是直接使用 `Role` 来编写，方便多次复用。

除此之外，在 Task 中有下面这些关键词也比较常用：

- [Ansible（十九）-- ansible 中的任务控制（四）--block、rescue、always块](https://blog.csdn.net/chitung_hsu/article/details/105579880)

## 基础指令


```shell
# Ping all inventory
ansible -m ping all -i inventory.yaml

# Run a play
ansible run play.yaml -i inventory.yaml
```
# 使用 ansible-runner

上面提到了 ansible-runner，这个东西可以让我通过 Python 代码的方式调用 ansible 的接口。

很多时候参数都是动态的：

```
ansible run play.yaml -i inventory.yaml -e USERNAME=abc -e PASSWORD=123456 -e HOST 127.0.0.1
```

一般情况下都是保存在一个配置中心，然后使用 Python 去读取，最终在这里作为参数传入。如果直接使用执行 shell 命令的方式来执行任务，可能对整个流程
难以控制。

对于上面的命令行代码，可以使用下面的 Python 代码实现：

```python
import ansible_runner

ansible_runner.interface.run(
    inventory=inventory_str,
    private_data_dir='./',
    playbook=play_yaml,
    extravars={
        'USERNAME': data.username,
        'PASSWORD': data.password,
        'HOST': data.host
    }
)
```

一个常用的目录结构如下：

```text
.
├── env
├── inventory
└── project
    └── roles
        └── my_role
            ├── handlers
            ├── tasks
            ├── templates
            └── vars
```

详见：[Introduction to Ansible Runner](https://ansible.readthedocs.io/projects/runner/en/stable/intro/)

在上面，我们有一个 `private_data_dir`，只需要将其执行目录结构的根目录，就可以不输入目录，直接使用文件名称就可以读取到相关的文件了。

## 自定义 filter

[Ansible Configuration Settings](https://docs.ansible.com/ansible/latest/reference_appendices/config.html)

想要创建一个 filter，首先在任意目录中创建一个 python 文件：

```python
def greet(name):
    return f"Hello, {name}!"


class FilterModule(object):
    def filters(self):
        return {
            'greet': greet,
        }
```

上面的代码就实现了一个 filter，然后使用环境变量来指向对应的目录：

```bash
export ANSIBLE_FILTER_PLUGINS=/path/to/custom/filter_plugins
```

使用：

```yaml
# playbook.yml

---
- hosts: localhost
  tasks:
    - name: Use global custom greet filter
      debug:
        msg: "{{ 'World' | greet }}"
```

输出：

```text
TASK [Use global custom greet filter] *********************************
ok: [localhost] => {
    "msg": "Hello, World!"
}
```

注意，这么调用是错误的：

```text
- name: Debug
  debug:
    msg: "{{ greet('World') }}"
```

必须使用前一种类似管道符的语法。