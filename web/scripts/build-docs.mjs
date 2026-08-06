/**
 * Render `docs/*.md` into `web/public/docs/*.html`, so the documentation ships inside the add-on.
 *
 * The theme editor links to `docs/theming.html`; on a jar install that link is the only route to
 * the documentation there is. Generating it from the Markdown at build time keeps one source of
 * truth, and the strict renderer means a doc using unsupported Markdown fails the build rather
 * than shipping a mangled page.
 *
 * Runs from `prebuild` and `predev`. Output is generated, so it is git-ignored.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMarkdown, renderPage } from './markdown.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const docsDir = join(here, '..', '..', 'docs')
const outDir = join(here, '..', 'public', 'docs')

/** The first `# Heading` is the page title; without one, the file name has to do. */
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
  // A link between docs is written to the .md; in the shipped copy it has to point at the .html.
  const html = renderMarkdown(src, file).replace(/href="([^"]+)\.md(#[^"]*)?"/g, 'href="$1.html$2"')
  writeFileSync(join(outDir, `${name}.html`), renderPage(titleOf(src, name), html), 'utf8')
  console.log(`docs: ${file} -> public/docs/${name}.html`)
}
