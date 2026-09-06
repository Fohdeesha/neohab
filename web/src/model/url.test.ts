import { describe, expect, it } from 'vitest'
import { isMixedContent, safeUrl } from './url'

describe('safeUrl', () => {
  it('allows the schemes a dashboard actually uses', () => {
    for (const url of [
      'https://example.org/page',
      'http://192.168.1.10:8080/basicui/app',
      'mailto:someone@example.org',
      'tel:+441234567890',
      'ftp://files.example.org/x',
      'blob:https://example.org/abc',
      'data:image/png;base64,iVBORw0KGgo='
    ]) {
      expect(safeUrl(url), url).toBe(url)
    }
  })

  it('allows relative and protocol-relative addresses', () => {
    for (const url of ['/basicui/app', 'static/page.html', '#/d/kitchen', '//cdn.example.org/x.png']) {
      expect(safeUrl(url), url).toBe(url)
    }
  })

  it('refuses a scheme that would execute in this page', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:application/javascript,alert(1)',
      'file:///etc/passwd'
    ]) {
      expect(safeUrl(url), url).toBeNull()
    }
  })

  it('refuses a scheme hidden by the characters the URL parser strips', () => {
    for (const url of [
      'jav\u0009ascript:alert(1)',
      'jav\u000aascript:alert(1)',
      'jav\u000dascript:alert(1)',
      'java\u0009script:alert(document.domain)',
      'vb\u0009script:msgbox(1)',
      'data\u0009:text/html,<script>alert(1)</script>',
      '\u0000javascript:alert(1)',
      '\u000bjavascript:alert(1)',
      '  \u0009 javascript:alert(1)'
    ]) {
      expect(safeUrl(url), JSON.stringify(url)).toBeNull()
    }
  })

  it('hands back the address the browser will actually use', () => {
    expect(safeUrl('  https://example.org/a  ')).toBe('https://example.org/a')
    expect(safeUrl('https://exa\u0009mple.org/a')).toBe('https://example.org/a')
  })

  it('treats nothing as nothing', () => {
    for (const url of ['', '   ', undefined]) expect(safeUrl(url)).toBeNull()
  })
})

describe('isMixedContent', () => {
  it('is only ever a question for an https page', () => {
    for (const p of ['http:', 'file:', 'about:']) expect(isMixedContent('http://192.168.1.10:1984/stream', p)).toBe(false)
  })

  it('catches an absolute http address on an https page', () => {
    expect(isMixedContent('http://192.168.1.10:1984/stream', 'https:')).toBe(true)
    expect(isMixedContent('HTTP://cam.lan/x.m3u8', 'https:')).toBe(true)
  })

  it('leaves alone everything the browser will actually load', () => {
    for (const url of ['/basicui/app', 'cam.lan/x', 'https://cam.lan/x', '//cam.lan/x', 'data:image/png;base64,AA', '', undefined])
      expect(isMixedContent(url, 'https:')).toBe(false)
  })

  it('normalises before deciding, exactly as safeUrl does', () => {
    expect(isMixedContent('  http://cam.lan/x', 'https:')).toBe(true)
    expect(isMixedContent('ht	tp://cam.lan/x', 'https:')).toBe(true)
  })
})
