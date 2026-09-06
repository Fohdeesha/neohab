import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMarkdown, renderPage } from './markdown.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const docsDir = join(here, '..', '..', 'docs')
const outDir = join(here, '..', 'public', 'docs')

function titleOf(markdown, fallback) {
  const m = /^#\s+(.+)$/m.exec(markdown)
  return m ? m[1].trim() : fallback
}

rmSync(outDir, { recursive: true, force: true, maxRetries: 10 })
mkdirSync(outDir, { recursive: true })

const files = readdirSync(docsDir).filter((f) => f.endsWith('.md'))
if (files.length === 0) throw new Error(`no .md files in ${docsDir}`)

for (const file of files) {
  const src = readFileSync(join(docsDir, file), 'utf8')
  const name = basename(file, '.md')
  const html = renderMarkdown(src, file).replace(/href="([^"]+)\.md(#[^"]*)?"/g, 'href="$1.html$2"')
  writeFileSync(join(outDir, `${name}.html`), renderPage(titleOf(src, name), html), 'utf8')
  console.log(`docs: ${file} -> public/docs/${name}.html`)
}
