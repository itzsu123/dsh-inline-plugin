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

const VERSION = '0.2.0'
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
  return { target, text }
}

/* ---------- 剪贴板 / 打开浏览器 ---------- */

async function copyToClipboard(text) {
  const { spawn } = await import('node:child_process')
  const plat = process.platform

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

  let defineTool = null
  try {
    ({ defineTool } = await import('@deepseek-ai/dsh-tools'))
  } catch {
    // 宿主里找不到 dsh-tools:不注册,别把 profile 弄挂
  }

  if (!defineTool) {
    console.log('[inline-plugin] 已加载,但找不到 @deepseek-ai/dsh-tools,工具未注册')
    return
  }

  ctx.tools.register(defineTool({
    name: 'inline_doc',
    description:
      '把一篇 markdown 文章写成 Inline 可导入的存档,同时放进剪贴板并打开 Inline。' +
      'Inline 是单文件 AI 阅读工具:读的时候选中任意句子就能就地提问。' +
      '适合「先帮我整理一份材料,我再慢慢读」。',
    parameters: {
      title: { type: 'string', required: true, description: '文章标题' },
      markdown: {
        type: 'string',
        required: true,
        description: '正文,markdown 格式。支持标题、列表、引用、代码块、粗体、行内代码、链接。',
      },
      outPath: {
        type: 'string',
        description: '保存路径(可选,默认当前目录下 <标题>.inline.json)',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const { target, text } = await writeDoc(args)

      const copied = await copyToClipboard(text)
      let opened = false
      if (autoOpen) opened = await openUrl(inlineUrl)

      const lines = ['已生成:' + target]
      if (copied) lines.push('存档已放进剪贴板。')
      if (opened) lines.push('Inline 已打开 —— 在页面上按一次 Ctrl+V,文章就进去了。')
      if (!copied && opened) lines.push('剪贴板没写成功,请用「导入」选这个文件。')
      if (!opened) lines.push('请在 Inline 里用「导入」选这个文件。')
      return lines.join('\n')
    },
  }))

  console.log('[inline-plugin] loaded! 工具 inline_doc 已注册(v' + VERSION + ')')
}
