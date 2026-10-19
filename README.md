# dsh-inline-plugin

npm: [dsh-inline-plugin](https://www.npmjs.com/package/dsh-inline-plugin)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 加一个工具：**把一段 markdown 写成 Inline 能导入的文章**。

装好之后，你跟 Agent 说「把这份材料整理成一篇文章，我要慢慢读」，它就会调用 `inline_doc` 生成一个 `.inline.json`；你在 [Inline](https://github.com/itzsu123/Inline) 里点「导入」选中它，就能在浏览器里读——**选中任意句子就地提问，答案长在你提问的地方**。

## 为什么是"生成存档"

Inline 是单文件工具，正文和问答都存在浏览器 `localStorage` 里，外面碰不到。
存档 JSON 是它唯一对外的入口，也就成了「把材料递进去」的入口。

插件不试图改 Inline，只负责**准备材料**。分工干净：

```
Agent   收集、整理、写成文章
插件    转成 Inline 能读的存档
Inline  在浏览器里读,选中就问
```

## 安装

**方式一：插件面板(推荐)**

DSH 里打开「添加插件」，输入包名：

```
dsh-inline-plugin
```

来源选「中国大陆镜像源」更快。

**方式二：命令行**

```sh
dsh plugin --profile <你的 profile> add dsh-inline-plugin
```

**方式三：直接从仓库装**（npm 上还没新版本时用）

```sh
dsh plugin --profile <你的 profile> add github:itzsu123/dsh-inline-plugin
```

装完重启，日志里会出现：

```
[inline-plugin] loaded! 工具 inline_doc 已注册
```


## 用法

装好后直接对 Agent 说：

> 帮我把这篇文章整理好，我要在 Inline 里读：<链接或原文>

Agent 会调用 `inline_doc`，参数是：

| 参数 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 文章标题 |
| `markdown` | 是 | 正文，支持标题、列表、引用、代码块、粗体、行内代码、链接 |
| `outPath` | 否 | 保存路径，默认当前目录 `<标题>.inline.json` |

生成后再去 Inline 点「导入」。

## 支持的 markdown

```
# 标题          →  h2
## 小标题       →  h3
- 列表 / 1. 列表
> 引用
```代码块```
**粗体**  `行内代码`  [链接](url)
```

粗体、行内代码、链接在 Inline 里会保留；Inline 只认这些，因为它不是排版工具。

## 注意

- 生成的是**干净的文章**，不带预置问答——问题应该由你在读的时候自己提。
- 插件不给 Inline 写入任何数据，也不联网；它只写你指定的那个 JSON 文件。

## 许可

MIT
