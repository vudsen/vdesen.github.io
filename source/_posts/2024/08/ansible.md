---
title: Ansible 快速入门
date: 2024-08-06 11:28:17
tags: ansible
seo:
  description: Ansible 快速入门，用例子快速入门。从简到难。
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

# 基础概念

ansible 中有下面几种常用的特殊名词：

- [Inventory](https://docs.ansible.com/ansible/latest/inventory_guide/intro_inventory.html): "物品栏"(不知道该怎么翻译...)，包含了一组或多组远程服务器
- Play: 剧本，可以理解为一个完整的工作流程，一般由多个 `Task` 组成。其中每个 `Play` 都会指定 `Inventory` 中的一组服务器。
- Task: 任务，通常同来定义一个操作.
- Role: 与 `Play` 类似，但是在声明时不需要指定 `Inventory`，所以一般不会直接写 `Play`，而是直接使用 `Role` 来编写，方便多次复用。

可以这样理解: 一个 `Play` 代表已经编辑好的一部电影。通过指定好角色(`Inventory`)和剧情(`Task`)，构成一部电影(`Play`)。

所以通常一个 `Play` 文件包含了 `Inventory` 和 `Task`。由于 `Inventory` 在这里直接写死了，一般会直接使用 `Role` 来代替 `Play`，在实际运行的时候指定对应的 `Inventory`。

## 创建 Inventory

创建一个 Inventory(`inventory.ini`)：

```ini
[myhosts]
192.0.2.50
192.0.2.51
192.0.2.52
```

测试连接：

```sh
# verify
ansible-inventory -i inventory.ini --list
# ping
ansible myhosts -m ping -i inventory.ini
```


# 使用 ansible

- [ansible.builtin.template](https://docs.ansible.com/ansible/latest/collections/ansible/builtin/template_module.html).

- [Ansible Configuration Settings](https://docs.ansible.com/ansible/latest/reference_appendices/config.html)


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


## 自定义 filter


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

### 传递多个参数

上面的代码中，我们使用 filter 传递了一个参数进去，然后返回一个值。但是如果要传递多个参数该怎么办？

解决方法如下：

```python
# filter_plugins/custom_filters.py

def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

class FilterModule(object):
    def filters(self):
        return {
            'greet': greet,
        }
```

使用：

```yaml
# playbook.yml

- hosts: localhost
  tasks:
    - name: Use custom greet filter with multiple arguments
      debug:
        msg: "{{ 'World' | greet('Good morning') }}"
```

~~巨奇怪有木有...~~

## 加载外部参数

[developing-lookup-plugins](https://docs.ansible.com/ansible/latest/dev_guide/developing_plugins.html#developing-lookup-plugins)

在前面我们说过可以通过 ansible-runner 来提前获取好参数来提供给 ansible 使用，但是 ansible 自己也可以主动通过调用 Python 脚本来动态获取外部参数。

和 filter 插件一样，创建一个 Python 文件：

```python
# lookup_plugins/my_custom_lookup.py

from ansible.plugins.lookup import LookupBase

class LookupModule(LookupBase):

    def run(self, terms, variables=None, **kwargs):
        # Custom logic here
        return [f"Hello, {terms[0]}!"]
```

然后使用环境变量指向这个目录：

```bash
export ANSIBLE_LOOKUP_PLUGINS=/path/to/custom/filter_plugins
```

使用：

```yaml
# playbook.yml

- hosts: localhost
  tasks:
    - name: Use custom lookup plugin
      debug:
        msg: "{{ lookup('my_custom_lookup', 'World') }}"
```

输出：

```text
TASK [Use custom lookup plugin] *************************************
ok: [localhost] => {
    "msg": "Hello, World!"
}
```

### 每个参数的意思

这里文档非常🌿🥚，完全没讲每个参数是什么意思，这里就详细记一下，防止以后忘了。

#### terms 参数

`terms` 代表在使用 `lookup` 时后面的列表参数。

使用时这样传：

```yaml
# In a playbook or template
{{ lookup('my_custom_lookup', 'argument1', 'argument2') }}
```

`terms` 就是 `['argument1', 'argument2']`。



#### variables 参数

这个很好理解，就是可以获取到上下文中的参数：

```python
# In the lookup plugin
def run(self, terms, variables=None, **kwargs):
  # 获取上下文中的 my_var 参数
  value_from_var = variables.get('my_var')
  return [f"{value_from_var}, {terms[0]}"]
```

#### kwargs 参数

这个可以理解为具名参数，类型是一个字典：

```yaml
# In a playbook or template
{{ lookup('my_custom_lookup', 'term', option1='value1', option2='value2') }}
```

对于 `option1` 和 `option2` 就可以直接在 `kwargs` 通过字典的方式获取到。

## 动态加载模板文件并转移

例如在上面一个 role 的目录中，我们有一个 templates 模板，一般这个文件夹里面放的都是配置文件，如果我们想要一口气全部发送到远程服务器里面，
除了可以一个一个写，还可以这样写：

```yaml
- name: Transfer Template
  with_fileglob:
    - "templates/*.j2"
  ansible.builtin.template:
    src: "{{ item }}"
    dest: "/dest/{{ item | template_glob_path_to_dest }}"
```

这里需要声明一个 filter 来去掉多余的路径：

```python
def template_glob_path_to_dest(string: str):
    target = 'templates/'
    pos = string.rfind(target)
    if pos == -1:
        raise RuntimeError('Could not find template relative path')
    return string[pos + len(target):-3]

  
class FilterModule(object):
    def filters(self):
        return {
            'template_glob_path_to_dest': template_glob_path_to_dest
        }
```

## 注入参数

### 在 task 中注入参数

在 task 中注入参数需要使用 `set_fact`，而不是 `vars`:

```yaml
- name: My  play
  hosts: localhost
  tasks:
    - name: Ping my hosts
      set_fact:
        who: world

    - name: Print message
      debug:
        msg: "hello {{ who }}"
```

对于 `vars` 声明的参数，**仅在当前任务中有效**。

## 组合多个 role

- [Playbook 角色(Roles) 和 Include 语句](http://www.ansible.com.cn/docs/playbooks_roles.html)

一般在多个 role 中，可能会出现通用的逻辑，例如多个 Tomcat 应用，每个应用都需要单独的 Tomcat 目录，如果每个服务都写一遍会导致十分臃肿，所以我们完全可以将通用的 role 抽离出来，供其它的 role 使用。

假设我们已经有了一个安装 Tomcat 的 role：`roles/common/tasks/main.yaml`， 详细代码见 [安装 tomcat](#安装-tomcat)。

假设我们有服务 A 和 B 都需要安装 Tomcat，分别编辑 `roles/A/meta/main.yaml` 和 `roles/B/meta/main.yaml`:

```yaml
dependencies:
  - { role: common, service_root: "{{ Values.metadata.rootPath }}/xxx" }
```

上面的内容两个应用需要指定不同的 `service_root` 参数，否则对应的 role 只会执行一遍。

> `common` 具体的代码可以看下面的 [安装 tomcat](#安装-tomcat)


# 例子

## 安装 tomcat

这个例子会在本地缓存一份 `tomcat` 包，只要文件名称满足 `apache-tomcat-*.tar.gz` 就可以被自动获取，并安装到远程服务器。
如果本地不存在任何包时，将会自动从远程服务器中下载。

需要提供下面两个参数：

- `ansible_cache_directory`: 存放 tomcat 包的位置
- `service_root`: 远程服务器的应用根路径

创建文件 `roles/common/tasks/main.yaml`:

```yaml
- name: Check Tomcat Exist
  stat:
    path: "{{ service_root }}/tomcat"
  register: tomcat

- name: Init Tomcat
  when: not tomcat.stat.exists
  import_tasks: install.yaml

- name: Fail if tomcat occupied
  when:
    - tomcat.stat.exists
    - not tomcat.stat.isdir
  fail:
    msg: "Tomcat directory '{{ tomcat_directory }}' exist, but it's a file!"
```

具体的安装逻辑(`roles/common/tasks/install.yaml`)：

```yaml
- name: Search local Tomcat
  vars:
    search_path: "{{ ansible_cache_directory }}/apache-tomcat-*.tar.gz"
  set_fact:
    tomcat_files: "{{ lookup('ansible.builtin.fileglob', search_path, wantlist = True ) }}"
- name: Download tomcat
  delegate_to: localhost
  when: tomcat_files.__len__() == 0
  block:
    - shell:
        cmd: "mkdir -p {{ ansible_cache_directory }}"
    - vars:
        dest: "{{ ansible_cache_directory }}/apache-tomcat-10.1.28.tar.gz"
      get_url:
        url: 'https://mirrors.huaweicloud.com/apache/tomcat/tomcat-10/v10.1.28/bin/apache-tomcat-10.1.28.tar.gz'
        checksum: sha512:b3177fb594e909364abc8074338de24f0441514ee81fa13bcc0b23126a5e3980cc5a6a96aab3b49798ba58d42087bf2c5db7cee3e494cc6653a6c70d872117e5
        dest: "{{ dest }}"
    - vars:
        dest: "{{ ansible_cache_directory }}/apache-tomcat-10.1.28.tar.gz"
      set_fact:
        tomcat_files: "{{ [dest] }}"
  rescue:
    - name: Tip how to fix
      fail:
        msg: 'Failed to download Tomcat. You need to download Tomcat manually and then place it in `{{ ansible_cache_directory }}`. Please ensure that the file name follows the pattern `apache-tomcat-*.tar.gz`.'
- name: Fail if multi package
  fail:
    msg: 'Multiply Tomcat packages found: {{ tomcat_files }}. Either rename it to not follow the pattern `apache-tomcat-*.tar.gz` or keep only one file there.'
  when: tomcat_files.__len__() > 1
- name: Send and unzip file.
  unarchive:
    src: "{{ tomcat_files[0] }}"
    dest: "{{ service_root }}"
- name: Adjust folder name
  vars:
    zip_name: "{{ tomcat_files[0] | to_file_name }}"
  shell:
    cmd: >
      cd {{ service_root }} &&
      rm -f {{ service_root }}/{{ zip_name }} && 
      mv {{ zip_name[:-7] }} tomcat
```

`install.yaml` 每一步具体的功能如下:

1. `Search local Tomcat`：使用 `ansible.builtin.fileglob` 模块搜索管理节点的缓存目录中的 tomcat 文件，注意需要提供`wantlist = True`参数，否则返回的将会是一个用逗号分割的字符串，而不是数据。

2. `Download tomcat`：首先使用 `when` 判断上一步中搜素到的 tomcat 文件列表是否为空，如果为空，则从远程下载。这里使用 `block` 将具体的下载任务组合为一个整体，任意一个步骤发生错误都会触发 `rescue` 中的代码。同时这里使用了 `delegate_to: localhost` 来将这个任务交给管理节点处理，而不是远程节点。

    2.1. 这是一个脚本，确保远程服务器的目录存在

    2.2. 从远程下载 tomcat

    2.3. 覆盖 `tomcat_files` 变量，以便后续运行

3. `Fail if multi package`: 判断 tomcat 文件是否有多个，如果有，发出提示并报错返回。

4. `Send and unzip file`：将 tomcat 发送到远程服务器并解压

5. `Adjust folder name`：删除多余的压缩包并且重命名 tomcat 目录以便于后续升级

这里还用到了一个 `filter`：`to_file_name`。代码如下：


```python
import os

def to_file_name(path: str) -> str:
    return os.path.basename(path)

class FilterModule(object):
    def filters(self):
        return {
            'to_file_name': to_file_name,
        }

```

## 自定义模块创建文件夹

在这里自定义一个模块，用于递归创建文件夹，如果文件夹已经存在，返回 Unchanged 状态。

> 这里实际 ansible 已经提供了响应的模块:
> 
> ```yaml
>- name: Recrusion create directory
>  ansible.builtin.file:
>    path: /opt/app/work
>    state: directory
> ```

```python
# recursion_mkdir.py
import os.path

from ansible.module_utils.basic import AnsibleModule


def run_module():
    module_args = dict(
        path=dict(type='list', required=True)
    )

    result = dict(
        changed=False
    )

    module = AnsibleModule(
        argument_spec=module_args,
        supports_check_mode=True
    )

    paths = module.params['path']
    if isinstance(paths, str):
        paths = [paths]

    for path in paths:
        if not os.path.isdir(path):
            os.makedirs(path, exist_ok=True)
            result['changed'] = True

    module.exit_json(**result)


def main():
    run_module()


if __name__ == '__main__':
    main()
```

上面的代码中，虽然指定了 `path` 的类型为 `list`，但实际上是可以直接传一个字符串进来的，所以在代码中要做兼容。

之后使用环境变量指定模块目录：

```bash
ANSIBLE_LIBRARY=/your/module/directory/
```

使用模块：

```yaml
- name: Create required directory
  recursion_mkdir:
    path:
      - "/opt/app/home"
      - "/opt/app/configuration"
```

# 碰见的坑

## 使用 shell 启动后台服务立即退出

起因是我打算使用 shell 模块来启动 tomcat 服务：

```yaml
- name: 'Restart Tomcat'
  shell:
    chdir: "{{ service_root }}/{{ tomcat_directory_name }}/bin"
    cmd: sh startup.sh
```

结构执行后，ansible 没保存，tomcat 这里没有运行，也没有日志...

最后查了一下，这里是需要用 nohup 直接在外面启动服务：

```yaml
- name: 'Restart Tomcat'
  shell:
    chdir: "{{ service_root }}/{{ tomcat_directory_name }}/bin"
    cmd: nohup sh startup.sh 2>&1 > last-boot-log.log &
```

# 使用 ansible-runner

ansible-runner 可以帮助我们通过 Python 代码来调用 ansible 的 API，当需要从外部传入非常多的参数时可以考虑使用这个库。

安装依赖：

```shell
# python latest
python3 -m pip install ansible-runner

# python 3.6
python3 -m pip install ansible-runner==2.2.2
```

运行一个 role：

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

所有的参数需要自己点开 `run` 方法看里面的注释。

详见：[Introduction to Ansible Runner](https://ansible.readthedocs.io/projects/runner/en/stable/intro/)

在上面，我们有一个 `private_data_dir`，只需要将其指向目录结构的根目录，就可以不输入目录，直接使用文件名称就可以读取到相关的文件了。
