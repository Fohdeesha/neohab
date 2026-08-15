/**
 * URLs out of stored configuration.
 *
 * Where they land matters: an `<iframe src>` or a `window.open()` of a `javascript:` URL executes
 * in THIS page's origin, with its session and its token. A block-list version of this check was
 * written once and let `vbscript:` and `data:text/html` straight through, which is why it is an
 * allow-list, and why the widgets share it with the template engine rather than each having one.
 */
import { describe, expect, it } from 'vitest'
import { safeUrl } from './url'

describe('safeUrl', () => {
  it('allows the schemes a dashboard actually uses', () => {
    for (const url of [
      'https://example.org/page',
      'http://192.168.1.10:8080/basicui/app',
      'mailto:someone@example.org',
      'tel:+441234567890',
      'ftp://files.example.org/x',
      'blob:https://example.org/abc',
      'data:image/png;base64,iVBORw0KGgo=',
    ]) {
      expect(safeUrl(url), url).toBe(url)
    }
  })

  it('allows relative and protocol-relative addresses', () => {
    // openHAB's own paths are the common case, and they have no scheme at all.
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
      'file:///etc/passwd',
    ]) {
      expect(safeUrl(url), url).toBeNull()
    }
  })

  it('treats nothing as nothing', () => {
    for (const url of ['', '   ', undefined]) expect(safeUrl(url)).toBeNull()
  })
})
