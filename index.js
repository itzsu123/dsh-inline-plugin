/**
 * dsh-inline-plugin —— 把文章交给 Inline 读
 *
 * 工具 inline_doc:
 *   1. 把 markdown 转成 Inline 的存档 JSON 写到磁盘
 *   2. 把这份 JSON 放进系统剪贴板
 *   3. 打开 Inline
 *
 * 用户在 Inline 里按一次 Ctrl+V,文章就进去了 —— 不用点导入、不用找文件。
 * Inline 认得粘贴进来的是存档,会直接导入。
 */

export const name = 'inline-plugin'

export const inject = ['tools']

const VERSION = '0.3.6'
const DEFAULT_INLINE_URL = 'https://itzsu123.github.io/Inline/Inline.html'

/* ---------- markdown → Inline 的正文 html ---------- */

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineMd(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let buf = []
  let list = null
  let inCode = false
  let code = []

  const flushP = () => {
    if (buf.length) {
      out.push('<p>' + buf.map(inlineMd).join('<br>') + '</p>')
      buf = []
    }
  }
  const flushList = () => {
    if (list) { out.push('</' + list + '>'); list = null }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (/^```/.test(line)) {
      if (inCode) {
        out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>')
        code = []
        inCode = false
      } else {
        flushP(); flushList()
        inCode = true
      }
      continue
    }
    if (inCode) { code.push(raw); continue }

    if (!line.trim()) { flushP(); flushList(); continue }

    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      flushP(); flushList()
      const lvl = h[1].length + 1
      out.push('<h' + lvl + '>' + inlineMd(h[2]) + '</h' + lvl + '>')
      continue
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      flushP()
      if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul' }
      out.push('<li>' + inlineMd(ul[1]) + '</li>')
      continue
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      flushP()
      if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol' }
      out.push('<li>' + inlineMd(ol[1]) + '</li>')
      continue
    }

    const q = line.match(/^>\s?(.*)$/)
    if (q) {
      flushP(); flushList()
      out.push('<blockquote>' + inlineMd(q[1]) + '</blockquote>')
      continue
    }

    flushList()
    buf.push(line)
  }

  flushP(); flushList()
  if (inCode && code.length) {
    out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>')
  }
  return out.join('')
}

/* ---------- 写文件 ---------- */

async function writeDoc({ title, markdown, outPath }) {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')

  const html = mdToHtml(markdown || '')
  const snapshot = {
    v: 1,
    build: 'dsh-inline-plugin ' + VERSION,
    html: (title ? '<h1>' + esc(title) + '</h1>' : '') + html,
    boxes: [],
  }

  const safe = (title || 'inline-doc').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)
  const target = outPath && outPath.trim()
    ? path.resolve(outPath.trim())
    : path.resolve(process.cwd(), safe + '.inline.json')

  const text = JSON.stringify(snapshot, null, 2)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, text, 'utf8')
  return { target, text, snapshot }
}

/* ---------- 从 DSH 的配置里读 key ---------- */

/**
 * DSH 把 key 存在 $DSH_HOME/.credentials.yaml 的 refs.DEEPSEEK_API_KEY。
 * 读它、塞进剪贴板那份存档里 —— Inline 导入时顺手存下,用户就不用再填一次。
 * 只写剪贴板,不写文件:落盘的文件里不该有凭证。
 */
async function readDshKey() {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const os = await import('node:os')

  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const file = path.join(home, '.credentials.yaml')
  try {
    const txt = await fs.readFile(file, 'utf8')
    const m = txt.match(/DEEPSEEK_API_KEY:\s*(.+)/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {}
  return ''
}

/* ---------- 剪贴板 / 打开浏览器 ---------- */

async function copyToClipboard(text) {
  const { spawn } = await import('node:child_process')
  const plat = process.platform

  // Windows:不能直接喂 clip.exe —— 它按控制台代码页(GBK)解释字节,
  // UTF-8 的中文会变成乱码。改成先落一个临时文件,让 PowerShell 按 UTF-8 读再写剪贴板。
  if (plat === 'win32') {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const tmp = path.join(os.tmpdir(), 'inline-clip-' + process.pid + '.json')
    try {
      await fs.writeFile(tmp, text, 'utf8')
      const ok = await new Promise(resolve => {
        const ps = spawn('powershell', [
          '-NoProfile', '-NonInteractive', '-Command',
          `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 '${tmp}')`,
        ], { stdio: 'ignore' })
        ps.on('error', () => resolve(false))
        ps.on('close', code => resolve(code === 0))
      })
      await fs.rm(tmp, { force: true })
      if (ok) return true
    } catch {}
    // 兜底:有些环境没有 powershell,再退回 clip
  }

  const candidates = plat === 'win32'
    ? [['clip', []]]
    : plat === 'darwin'
      ? [['pbcopy', []]]
      : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']]]

  for (const [cmd, args] of candidates) {
    const ok = await new Promise(resolve => {
      let child
      try { child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] }) }
      catch { resolve(false); return }
      child.on('error', () => resolve(false))
      child.on('close', code => resolve(code === 0))
      try {
        child.stdin.write(text, 'utf8')
        child.stdin.end()
      } catch { resolve(false) }
    })
    if (ok) return true
  }
  return false
}

async function openUrl(url) {
  const { spawn } = await import('node:child_process')
  const plat = process.platform
  const [cmd, args] = plat === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : plat === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch { return false }
}

/* ---------- 注册工具 ---------- */

export async function apply(ctx, config) {
  const inlineUrl = (config && config.inlineUrl) || DEFAULT_INLINE_URL
  const autoOpen = !config || config.autoOpen !== false
  const syncKey = !config || config.syncKey !== false

  // 探针:桌面端的内置运行时看不到日志,让它把"加载到了哪一步"写到临时文件里
  try {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    await fs.writeFile(
      path.join(os.tmpdir(), 'inline-plugin-probe.json'),
      JSON.stringify({
        version: VERSION,
        at: new Date().toISOString(),
        hasCtxTools: !!(ctx && ctx.tools),
        hasRegister: !!(ctx && ctx.tools && typeof ctx.tools.register === 'function'),
      }, null, 2),
      'utf8',
    )
  } catch {}

  // 不用 defineTool 那个 helper —— 它要 import('@deepseek-ai/dsh-tools'),
  // 而不同宿主(桌面端 / npm 安装)里的 dsh-tools 可能不是同一份,
  // 装不上就静默不注册。这里直接给一个普通对象,不依赖任何宿主包。
  ctx.tools.register({
    name: 'inline_doc',
    description:
      '把当前内容整理成一篇可直接阅读的文章,写进 Inline(自动复制到剪贴板并打开)。' +
      '触发条件(严格):用户消息里出现 /inline 这个标记,而且它必须是独立出现的一处 —— ' +
      '前面是空格或行首,后面是空格、标点或行尾。' +
      '网址、文件路径、代码里出现的 /inline(比如 https://example.com/Inline/Inline.html)不算。' +
      '出现时自己总结,不要反问,直接调用一次,不要重复调用。' +
      '只有单词 inline 而没有斜杠时不要调用:那多半是在讨论 Inline 这个工具本身。' +
      '普通写作、回答问题、写代码都不算。',
    // 直接交给模型 API 的 JSON Schema(不是 defineTool 的糖):
    // required 必须在对象这一层写成数组,写在字段里会被服务端拒掉。
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '文章标题' },
        markdown: {
          type: 'string',
          description: '正文,markdown 格式。支持标题、列表、引用、代码块、粗体、行内代码、链接。',
        },
        outPath: {
          type: 'string',
          description: '保存路径(可选,默认当前目录下 <标题>.inline.json)',
        },
      },
      required: ['title', 'markdown'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const { target, snapshot } = await writeDoc(args)

      // 剪贴板那份会带上 key(来自 DSH 配置);写盘的那份不带 —— 凭证不落文件
      const key = syncKey ? await readDshKey() : ''
      const clipPayload = key
        ? JSON.stringify({ ...snapshot, api: { key } }, null, 2)
        : JSON.stringify(snapshot, null, 2)

      const copied = await copyToClipboard(clipPayload)
      let opened = false
      if (autoOpen) opened = await openUrl(inlineUrl)

      const lines = ['已生成:' + target]
      if (copied) lines.push(key ? '存档已放进剪贴板(含从 DSH 同步的 key)。' : '存档已放进剪贴板。')
      if (opened) lines.push('Inline 已打开 —— 在页面上按一次 Ctrl+V,文章就进去了。')
      if (!copied && opened) lines.push('剪贴板没写成功,请用「导入」选这个文件。')
      if (!opened) lines.push('请在 Inline 里用「导入」选这个文件。')
      return lines.join('\n')
    },
  })

  console.log('[inline-plugin] loaded! 工具 inline_doc 已注册(v' + VERSION + ')')
}
