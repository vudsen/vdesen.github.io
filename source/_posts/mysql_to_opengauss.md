---
title: MySQL迁移到高斯数据库
date: 2023-09-04 16:16:53
categories: 数据库迁移
  
---


# 1. 前言
公司要求项目去适配高斯数据库，看了一下，高斯数据库就可以当做postgresql用，有啥问题把高斯换成postgresql来查就行。
其实整个项目没有太大的变动，只是几个函数需要改一下，如果用mybatis就更简单了：

```java
@Bean
public VendorDatabaseIdProvider vendorDatabaseIdProvider() {
    VendorDatabaseIdProvider vendorDatabaseIdProvider = new VendorDatabaseIdProvider();
    Properties properties = new Properties();
    properties.put("MySQL", "mysql");
    properties.put("Oracle", "oracle");
    properties.put("PostgreSQL", "pgsql");
    properties.put("DM DBMS", "dm");
    vendorDatabaseIdProvider.setProperties(properties);
    return vendorDatabaseIdProvider;
}

@Bean
public SqlSessionFactoryBean sqlSessionFactoryBean(@Qualifier("dataSource") DataSource dataSource) throws Exception {
    SqlSessionFactoryBean factoryBean = new SqlSessionFactoryBean();
    factoryBean.setDataSource(dataSource);
    factoryBean.setDatabaseIdProvider(databaseIdProvider());
    factoryBean.setMapperLocations(new PathMatchingResourcePatternResolver().getResources(mapperLocations));
    return factoryBean;
}
```
添加上面配置后，碰到不兼容的函数可以这样处理：
```xml
<select id="maxid" databaseId="pgsql" resultType="int">
    select another_max(power_id) from tb_xx
</select>
<!-- 给一个默认的 -->
<select id="maxid" resultType="int">
    select max(power_id) from tb_xx
</select>
```
这样idea会爆红，可能看着有点不舒服。

也可以考虑这样写：
```xml
<choose>
    <when test="_databaseId == 'oracle'">
        xxx
    </when>
    <when test="_databaseId == 'dm'">
        xxx
    </when>
    <when test="_databaseId == 'mysql'">
        xxx
    </when>
    <when test="_databaseId == 'informix' or _databaseId == 'gbase8s'">
        xxx
    </when>
    <otherwise>
        xxx
    </otherwise>
</choose>
```

两种都可以，如果太复杂了建议用第一种。

---

本来到这，已经完事大吉了，就去mapper里面去检查一下有没有哪个函数是高斯没有的，然后改一下就行。

结果，万万没想到，项目里面有拿StringBuilder搞SQL拼串的代码，结果写的全是坑，这玩意狠狠折磨了我好几个星期！

# 2. 别名问题
```sql
SELECT id AS userId FROM user
```
上面这个SQL很简单，就是查用户id，然后起个别名叫`userId`，乍一看好像没什么，下面我放个图，大家来找不同：

![找不同](https://xds.asia/public/2023-9/Snipaste_2023-09-26_10-45-53.webp)

发现了吗？仔细看一下userId，有没有发现查出来全部变成小写了？

在我们项目代码里，直接从结果集里面拿userId，结果拿不到爆空指针！


原本我以为是配置问题，把大小写搞得不敏感了，结果去网上搜了一下，结果只有表名能修改大小写敏感。

所以要怎么改呢，其实只需要在别名的左右加上双引号就行了：
```sql
SELECT id AS "userId" FROM user
```
这个操作同样兼容mysql。

# 3. COUNT(*)
```sql
SELECT COUNT(*) FROM userId
```

又是一个非常简单的SQL，然后咱们又来找不同：

高斯的结果：

![gs-count](https://xds.asia/public/2023-9/gs-count.webp)

mysql的结果：

![mysql-count](https://xds.asia/public/2023-9/mysql-count.webp)

相信一眼就能看出来，mysql拿需要用`COUNT(*)`，而高斯则需要用`count`拿。

这里最好的解决办法就只有取别名了，全部都叫同一个就行了。

# 不兼容的函数/语法

| MySql函数名 | 高斯函数名  | 说明   |
|     :--:    |  :--:      | :--:  |
| LIMIT offset, size | LIMIT size OFFSET offset | 高斯不支持mysql的语法，Mysql支持高斯的语法，更换时注意offset和size的位置需要交换|
| group_concat(col) | array_to_string(array_agg(col), ',') | group_concat |
|date_format(col, '%Y-%m-%d') | to_char(col, 'yyyy-mm-dd') | 日期转字符串 |
| delete from tb1, tb2 | 不兼容，推荐使用子查询 | mysql 删除时选择两张表，高斯不支持|
| IFNULL(xx, fallback) | COALESCE(xx, fallback) | 当列为空时使用默认值