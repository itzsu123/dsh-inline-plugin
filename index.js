/**
 * dsh-inline-plugin —— 把文章交给 Inline 读
 *
 * 提供一个给模型用的工具 inline_doc:
 *   接收 markdown 正文,转成 Inline 的存档 JSON 写到磁盘,
 *   用户在 Inline 里点「导入」就能读,选中就能问。
 *
 * 为什么是"生成存档"而不是直接改 Inline:
 *   Inline 是单文件、数据在浏览器 localStorage 里,外面碰不到。
 *   存档 JSON 是它唯一对外的入口,也正好是"把材料递进去"的入口。
 */

export const name = 'inline-plugin'

// 需要工具注册表就绪
export const inject = ['tools']

const VERSION = '0.1.0'

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

/* ---------- 写存档 ---------- */

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

  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(snapshot, null, 2), 'utf8')
  return target
}

/* ---------- 注册工具 ---------- */

export async function apply(ctx) {
  let defineTool = null
  try {
    ({ defineTool } = await import('@deepseek-ai/dsh-tools'))
  } catch {
    // 找不到就不注册,别把 profile 弄挂
  }

  if (!defineTool) {
    console.log('[inline-plugin] 已加载,但找不到 @deepseek-ai/dsh-tools,工具未注册')
    return
  }

  ctx.tools.register(defineTool({
    name: 'inline_doc',
    description:
      '把一篇 markdown 文章写成 Inline 可导入的存档文件。' +
      'Inline 是单文件 AI 阅读工具:导入后在浏览器里读,选中任意句子就能就地提问。' +
      '适合「先帮我整理一份材料,我再慢慢读」的场景。',
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
      const file = await writeDoc(args)
      return '已生成:' + file + '\n在 Inline 里点「导入」选这个文件即可。'
    },
  }))

  console.log('[inline-plugin] loaded! 工具 inline_doc 已注册')
}
