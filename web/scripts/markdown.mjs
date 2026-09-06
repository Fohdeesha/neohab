// a strict subset: anything it does not implement throws with a line number rather than shipping mangled

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MARK = ''

function inline(text, where) {
  const codes = []
  let s = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`)
    return `${MARK}${codes.length - 1}${MARK}`
  })
  if (s.includes('`')) throw new Error(`${where}: unclosed backtick - ${text}`)

  s = escapeHtml(s)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${escapeHtml(href)}">${label}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  if (/\]\(/.test(s)) throw new Error(`${where}: a link did not parse - ${text}`)
  return s.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (_, i) => codes[Number(i)])
}

const cells = (row) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/

export function renderMarkdown(src, name = 'markdown') {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  const where = () => `${name}:${i + 1}`

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i++
      continue
    }

    if (/^---+\s*$/.test(line)) {
      out.push('<hr>')
      i++
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2].trim(), where())}</h${level}>`)
      i++
      continue
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const body = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      if (i >= lines.length) throw new Error(`${where()}: unterminated code fence`)
      i++
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : ''
      out.push(`<pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`)
      continue
    }

    if (line.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const head = cells(line)
      i += 2
      const body = []
      while (i < lines.length && lines[i].trim().startsWith('|')) body.push(cells(lines[i++]))
      const th = head.map((c) => `<th>${inline(c, where())}</th>`).join('')
      const rows = body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, where())}</td>`).join('')}</tr>`).join('')
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`)
      continue
    }

    const bullet = LIST_ITEM.exec(line)
    if (bullet) {
      const ordered = /\d/.test(bullet[2])
      const items = []
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i])
        if (!m || /\d/.test(m[2]) !== ordered) break
        items.push(m[3])
        i++
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim()
          i++
        }
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it, where())}</li>`).join('')}</${tag}>`)
      continue
    }

    if (/^\s*>/.test(line)) throw new Error(`${where()}: blockquotes are not supported - ${line.trim()}`)
    if (/^!\[/.test(line.trim())) throw new Error(`${where()}: images are not supported - ${line.trim()}`)

    const para = []
    while (i < lines.length && lines[i].trim() !== '') {
      const l = lines[i]
      if (/^#{1,4}\s/.test(l) || l.startsWith('```') || /^---+\s*$/.test(l)) break
      if (LIST_ITEM.test(l) || l.trim().startsWith('|')) break
      para.push(l.trim())
      i++
    }
    if (para.length > 0) out.push(`<p>${inline(para.join(' '), where())}</p>`)
    else i++
  }

  return out.join('\n')
}

export function renderPage(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; --fg: #1d242c; --bg: #ffffff; --soft: #f2f4f7; --line: #d8dee6; --link: #0b5fa5; }
@media (prefers-color-scheme: dark) {
  :root { --fg: #dde3ea; --bg: #12171d; --soft: #1a212a; --line: #2c3844; --link: #6cc6ff; }
}
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 32px 20px 96px; max-width: 46rem; background: var(--bg); color: var(--fg);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
h1, h2, h3, h4 { line-height: 1.25; margin: 2em 0 0.6em; }
h1 { margin-top: 0; font-size: 1.9rem; }
h2 { font-size: 1.35rem; border-bottom: 1px solid var(--line); padding-bottom: 0.3em; }
h3 { font-size: 1.1rem; }
a { color: var(--link); }
code { background: var(--soft); border: 1px solid var(--line); border-radius: 4px; padding: 0.1em 0.35em;
  font: 0.875em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
pre { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
pre code { background: none; border: 0; padding: 0; font-size: 0.85rem; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
th { background: var(--soft); }
hr { border: 0; border-top: 1px solid var(--line); margin: 2.5em 0; }
ul, ol { padding-left: 1.4em; }
li { margin: 0.3em 0; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`
}
