---
title: 通过环境变量传递Tomcat https证书密码
date: 2023-08-30 13:50:36
tags:
---

# 1. 起因

由于最近公司要求给tomcat配置https，本来以为只是简单的塞个证书和私钥就行了：
```xml
&lt;Connector port="8443" protocol="org.apache.coyote.http11.Http11NioProtocol" SSLEnabled="true" &gt;
    &lt;SSLHostConfig protocols="TLSv1.2" sslProtocol="TLS"&gt;
        &lt;Certificate certificateKeyFile="conf/server.key"
                    certificateFile="conf/server.crt"
                    type="RSA"/&gt;
    &lt;/SSLHostConfig&gt;
&lt;/Connector&gt;
```

结果要求用jks证书文件，彳亍：
```xml
&lt;Connector port="8443" protocol="org.apache.coyote.http11.Http11NioProtocol" 
    sslProtocol="TLS" 
    protocols="TLSv1.2"
    SSLEnabled="true"
    keystoreFile="conf/server.keystore"
    keystorePass="xxxx"/&gt;
```
本以为万事大吉，结果甲方爸爸因为密码是直接写的明文，要求我们必须把密码穿成加密的🥲。

不过还好顺带也给了我份博客：[tomcat安全配置之证书密码加密存储](https://www.cnblogs.com/suncoolcat/p/3292252.html)

# 2. tomcat配置https

## 2.1 编写实现类
其实这份博客已经说的很清楚了，只需要继承`Http11NioProtocol`这个类就可以了

> 博客里用的`Http11Protocol`，这个类已经被标记为`@Deprecated`的了，所以我们直接用它的父类，效果是一样的。

但是这个博客还是不太完整，这个类怎么打jar包？`Http11Protocol`从哪里来？打了的jar包丢在哪里？博客里都没有说明。

这里我自己研究了一下，首先创建一个maven项目，pom.xml添加依赖：
```xml
&lt;dependency&gt;
    &lt;groupId&gt;org.apache.tomcat&lt;/groupId&gt;
    &lt;artifactId&gt;tomcat-coyote&lt;/artifactId&gt;
    &lt;version&gt;8.5.87&lt;/version&gt;
    &lt;scope&gt;provided&lt;/scope&gt;
&lt;/dependency&gt;
```
注意scope是provided。

之后就可以直接写代码了：

```java
import org.apache.coyote.http11.Http11NioProtocol;

public class EncryptedHttp11Protocol extends Http11NioProtocol {

    @Override
    public void init() throws Exception {
        // 进行你自己的密码获取逻辑
        setKeystorePass("xxx");
        super.init();
    }

}
```

写完直接用maven打包：
```shell
mvn package -DskipTests
```

然后丢到tomcat目录的lib文件夹里就可以了。

最后配置server.xml：
```xml
 &lt;Connector port="8443" protocol="xxxxxxx.EncryptedHttp11Protocol" SSLEnabled="true"
    keystoreFile="conf/server.keystore"
    sslProtocol="TLS"&gt;
&lt;/Connector&gt;
```
**注意protocol属性要改成你自己的实现类**

## 2.2 设置环境变量

由于jks被加密，需要提供密码，因此推荐的方法是通过系统环境变量来提供（这里直接根据自己的机器设置即可）。
在java代码里这样获取系统环境变量：

```java
String value = System.getenv(key);
```

## 2.3 设置命令行参数

也可以通过设置tomcat命令行参数来传输秘钥，
在tomcat的bin目录下创建setenv.bat(windows) / setenv.sh (linux)文件，并且配置相关参数即可。

windows: 
```bat
set "JAVA_OPTS=-DsecretKey=xxxx -DsercretKey2=xxxx"
```

linux:
```shell
JAVA_OPTS="-DsecretKey=xxxx -DsercretKey2=xxxx"
```

之后在代码中这样获取：
```java
String value = System.getProperty(key);
```

# 3. SpringBoot内嵌tomcat配置https

你说的对，但是我是SpringBoot内嵌tomcat！

公司的众多模块中，偏偏就是有一个SpringBoot项目，这玩意用的内嵌tomcat，上面的方法都用不了👎👎👎。

首先我们要知道SpringBoot项目怎么开启https：
```yaml
server:
    ssl:
        enabled: true
        key-store: classpath:server.keystore
        key-store-password: xxxxxx
```

我们只需要找到一个方法在配置ssl前修改配置，提供密码即可。

你别说，还真被我找到了，在启动类添加下面的代码：
```java
@Bean
public WebServerFactoryCustomizer<UndertowServletWebServerFactory> webServerFactoryCustomizer() {
    return factory -> {
        Ssl ssl = factory.getSsl();
        if (ssl == null || !ssl.isEnabled()) {
            return;
        }
        
        // ... 获取秘钥

        ssl.setKeyStorePassword("xxxx");
    };
}
```

甚至你在这里还可以引用刚才为tomcat准备的jar包，直接使用里面的秘钥获取逻辑，就不用再写一遍了√。

# 4. 其它：由证书和私钥生成jks文件

首先执行命令生成p12文件（输入后会要求输入密码，直接填上你要的密码就行）：
```shell
openssl pkcs12 -export -in server.crt -inkey server.key -out server.p12
```

输完后执行：
```shell
keytool -importkeystore -v -srckeystore server.p12 -srcstoretype pkcs12 -srcstorepass 上面的密码 -destkeystore server.keystore -destoretype jks -deststorepass 上面的密码
```

这里如果jdk版本过低会报错：
```java
keytool 错误: java.io.IOException: parseAlgParameters failed: ObjectIdentifier() -- data isn't an object ID (tag = 48)
java.io.IOException: parseAlgParameters failed: ObjectIdentifier() -- data isn't an object ID (tag = 48)
        at sun.security.pkcs12.PKCS12KeyStore.parseAlgParameters(PKCS12KeyStore.java:816)
        at sun.security.pkcs12.PKCS12KeyStore.engineLoad(PKCS12KeyStore.java:2018)
        at java.security.KeyStore.load(KeyStore.java:1445)
        at sun.security.tools.keytool.Main.loadSourceKeyStore(Main.java:2040)
        at sun.security.tools.keytool.Main.doCommands(Main.java:1067)
        at sun.security.tools.keytool.Main.run(Main.java:366)
        at sun.security.tools.keytool.Main.main(Main.java:359)
Caused by: java.io.IOException: ObjectIdentifier() -- data isn't an object ID (tag = 48)
        at sun.security.util.ObjectIdentifier.<init>(ObjectIdentifier.java:257)
        at sun.security.util.DerInputStream.getOID(DerInputStream.java:314)
        at com.sun.crypto.provider.PBES2Parameters.engineInit(PBES2Parameters.java:267)
        at java.security.AlgorithmParameters.init(AlgorithmParameters.java:293)
        at sun.security.pkcs12.PKCS12KeyStore.parseAlgParameters(PKCS12KeyStore.java:812)
        ... 6 more
```
这里用的jdk1.8.0_241导致的报错，换成jdk-11.0.18可以正常执行，其它版本暂未测试。