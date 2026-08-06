/**
 * The docs renderer. It runs at build time over files nobody re-reads afterwards, so the value
 * of these checks is that a mangled page is caught here rather than shipped.
 */
import { describe, expect, it } from 'vitest'
import { renderMarkdown, renderPage } from './markdown.mjs'

const md = (src) => renderMarkdown(src, 'test.md')

describe('the docs renderer', () => {
  it('renders headings, paragraphs and rules', () => {
    expect(md('# Title')).toBe('<h1>Title</h1>')
    expect(md('### Deep')).toBe('<h3>Deep</h3>')
    expect(md('one\ntwo')).toBe('<p>one two</p>')
    expect(md('a\n\nb')).toBe('<p>a</p>\n<p>b</p>')
    expect(md('---')).toBe('<hr>')
  })

  it('renders inline code, bold and links', () => {
    expect(md('use `a { b: c }`')).toBe('<p>use <code>a { b: c }</code></p>')
    expect(md('**bold** here')).toBe('<p><strong>bold</strong> here</p>')
    expect(md('[docs](theming.md)')).toBe('<p><a href="theming.md">docs</a></p>')
  })

  it('does not treat markup inside a code span as markup', () => {
    expect(md('`**not bold**`')).toBe('<p><code>**not bold**</code></p>')
    expect(md('`[a](b)`')).toBe('<p><code>[a](b)</code></p>')
  })

  it('leaves a number in prose alone next to a code span', () => {
    // The placeholder used to be the span's index wrapped in spaces, so " 0 " in the prose was
    // replaced by the first code span. Nothing about that failure was visible until it shipped.
    expect(md('set it to 0 and `x` is 1')).toBe('<p>set it to 0 and <code>x</code> is 1</p>')
    expect(md('`a` then 0 then `b`')).toBe('<p><code>a</code> then 0 then <code>b</code></p>')
  })

  it('escapes HTML in text and in code', () => {
    expect(md('a < b & c')).toBe('<p>a &lt; b &amp; c</p>')
    expect(md('`<script>`')).toBe('<p><code>&lt;script&gt;</code></p>')
    expect(md('```\n<b>x</b>\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>')
  })

  it('renders fenced code, keeping its language and its blank lines', () => {
    expect(md('```css\n.a {\n\n  color: red;\n}\n```')).toBe(
      '<pre><code class="lang-css">.a {\n\n  color: red;\n}</code></pre>'
    )
  })

  it('renders tables', () => {
    const out = md('| A | B |\n|---|---|\n| 1 | `2` |')
    expect(out).toBe('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td><code>2</code></td></tr></tbody></table>')
  })

  it('renders both kinds of list, and folds continuation lines', () => {
    expect(md('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>')
    expect(md('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>')
    expect(md('- one\n  continued\n- two')).toBe('<ul><li>one continued</li><li>two</li></ul>')
    // Switching kind starts a new list rather than silently merging them.
    expect(md('- a\n1. b')).toBe('<ul><li>a</li></ul>\n<ol><li>b</li></ol>')
  })

  it('refuses what it cannot render, naming the line', () => {
    expect(() => md('ok\n\n> quoted')).toThrow(/test\.md:3: blockquotes/)
    expect(() => md('![alt](x.png)')).toThrow(/images are not supported/)
    expect(() => md('```\nunterminated')).toThrow(/unterminated code fence/)
    expect(() => md('a `b')).toThrow(/unclosed backtick/)
  })

  it('wraps a page that stands on its own', () => {
    const page = renderPage('T & T', '<p>hi</p>')
    expect(page).toContain('<title>T &amp; T</title>')
    expect(page).toContain('<p>hi</p>')
    // No external requests: the openHAB server it is served from may have no internet.
    expect(page).not.toMatch(/https?:\/\//)
  })
})
