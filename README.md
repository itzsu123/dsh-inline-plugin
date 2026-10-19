# dsh-inline-plugin

npm: [dsh-inline-plugin](https://www.npmjs.com/package/dsh-inline-plugin)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 加了一个插件：**说一句带 `/inline` 的话，它就把内容整理成一篇文章，递进 [Inline](https://github.com/itzsu123/Inline) 让你读。**

## 怎么用

**在发给 Agent 的消息里，带上 `/inline` 这个标记。**

> 帮我把这篇技术文档整理成文章 /inline

然后就三步：

```
1   Agent 自己整理成一篇可读的文章(不用你再说格式)
2   浏览器弹出 Inline —— 文章已经在剪贴板里
3   在页面上按一次 Ctrl+V,文章就进去了
```

**进去之后:选中任意句子 → 点「问」→ 答案出现在你提问的地方。**

### 更多说法

```
把上面聊的内容整理一下 /inline
讲讲复利为什么反直觉 /inline
帮我读懂的这篇整理成文章 /inline
```

### 写法细则：`/inline` 要带斜杠

**斜杠是关键：只有 `inline`、没有斜杠，不触发。**

```
✔  帮我把这篇整理成文章 /inline
✔  把上面聊的整理一下 /inline
✔  讲讲复利 /inline

✘  帮我把这篇整理成文章 inline      ← 没斜杠,不触发(可能是在聊这个工具)
✘  /inline                         ← 不要单独发:行首的斜杠会被当成命令
```

**前后不用特意留空格** —— 斜杠已经把它和中文隔开了：

```
✔  把这篇整理成文章/inline
✔  把这篇整理成文章 /inline 谢谢
```

**唯一要记的是：别把 `/inline` 放在消息最开头** —— 桌面端会把行首的 `/xxx` 当作命令处理。放句中或句尾都行。

### 不会触发的情况

```
写一篇公众号文章          ← 没有 /inline,不触发
帮我看看这句话什么意思      ← 直接回答,不触发
```

**触发只认这一个标记:普通的写作、问答、写代码都不会动它。**

> 触发靠模型判断,偶尔会漏。漏了就在句子里再说一次 `/inline`。

## 前提

- **Inline 要是新版**（2026-10-19 之后的那份）。旧版不认存档粘贴，会把它当普通文本贴进来 —— 不会坏，只是不会自动导入。
- **DSH 里已经配好 DeepSeek key**（插件会顺手把它带过去；没配就不带，Inline 里再填一次也行）。

## 为什么是"生成存档"

Inline 是单文件工具，正文和问答都存在浏览器 `localStorage` 里，外面碰不到。
存档 JSON 是它唯一对外的入口，也就成了「把材料递进去」的入口。

插件不试图改 Inline，只负责**准备材料**。分工干净：

```
Agent   收集、整理、写成文章
插件    转成 Inline 能读的存档(并递过去)
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

**方式三：直接从仓库装**（想跟 GitHub 上的最新提交时用）

```sh
dsh plugin --profile <你的 profile> add github:itzsu123/dsh-inline-plugin
```

装完重启，日志里会出现：

```
[inline-plugin] loaded! 工具 inline_doc 已注册(v0.3.2)
```

## 顺手把 key 也带过去

**DSH 里已经配好的 DeepSeek key，不用在 Inline 里再填一遍。**

插件从 `$DSH_HOME/.credentials.yaml` 读 `DEEPSEEK_API_KEY`，塞进剪贴板那份存档的 `api.key`；Inline 导入时接住，存进自己的 `localStorage`。

**只写剪贴板，不写文件** —— 落盘的 `.inline.json` 里没有凭证。

## 为什么只要一次 Ctrl+V

Inline 认得粘贴进来的是它自己的存档（带 `v` 和 `html` 字段的 JSON），会直接导入，不再走「导入」选文件那条路。

所以整条链路是：

```
Agent 写文章 → 插件转存档 + 复制 + 打开 Inline → 你按 Ctrl+V
```

剪贴板内容就是那份 JSON，粘贴完就还原成一篇正常的文章。

> 粘贴必须由人来做：浏览器不允许网页自己读剪贴板，除非有用户手势。这是安全模型，不是省事。

## 支持的 markdown

```
# 标题          →  h2
## 小标题       →  h3
- 列表 / 1. 列表
> 引用
代码块(三个反引号)
**粗体**  `行内代码`  [链接](url)
```

粗体、行内代码、链接在 Inline 里会保留；Inline 只认这些，因为它不是排版工具。

## 注意

- 生成的是**干净的文章**，不带预置问答——问题应该由你在读的时候自己提。
- 插件**不直接改 Inline 的数据**：它只写那个 JSON 文件、把内容放进剪贴板。真正写进 Inline 的是你自己按的那次 `Ctrl+V`。
- **key 只在剪贴板里**：写盘的文件里没有凭证。剪贴板内容粘完就被替换掉了。
- 「已打开 Inline」是"已请求打开"，浏览器有没有弹出来，插件并不知道。
- 触发靠模型判断，偶尔会漏：漏了就在句子里再说一次 `/inline`。

## 许可

MIT
