import { describe, expect, it } from 'vitest'
import { parseClipboard, serializeClipboard, type ClipboardWidget } from './clipboard'

const widget = (over: Partial<ClipboardWidget> = {}): ClipboardWidget => ({
  type: 'label',
  config: { label: 'A' },
  rect: { x: 1, y: 2, w: 3, h: 4 },
  ...over,
})

const payload = (widgets: unknown[]) =>
  JSON.stringify({ app: 'neohab', kind: 'neohab/widgets', version: 1, widgets })

describe('parseClipboard', () => {
  it('round-trips what serializeClipboard writes', () => {
    expect(parseClipboard(serializeClipboard([widget()]))).toEqual([widget()])
  })

  it('ignores text that is not ours', () => {
    for (const text of ['', 'hello', '{}', '[]', 'null', JSON.stringify({ app: 'other' })]) {
      expect(parseClipboard(text)).toBeNull()
    }
  })

  it('ignores a payload from another app that borrowed the shape', () => {
    expect(parseClipboard(JSON.stringify({ app: 'neohab', kind: 'other', version: 1, widgets: [] }))).toBeNull()
  })

  /*
   * The OS clipboard is untrusted input: anything at all can be in it, including a payload
   * hand-written to look like ours. JSON has no NaN literal, but `1e999` parses to Infinity, and
   * `typeof Infinity === 'number'` passed the old check. A non-finite size then reaches
   * `findFreeSpot`, whose loop condition is false for NaN, so the widget is written into the
   * dashboard - and onto the server - with a broken rect.
   */
  it('rejects a rect whose numbers are not finite', () => {
    // Written as raw JSON on purpose. `JSON.stringify` turns Infinity into `null`, so a payload
    // built the convenient way carries no Infinity at all and the check would pass against a
    // build that has no guard - which is what it did on the first attempt.
    for (const rect of ['{"x":1e999,"y":0,"w":2,"h":2}', '{"x":0,"y":0,"w":1e999,"h":2}', '{"x":0,"y":0,"w":2,"h":-1e999}']) {
      const text = `{"app":"neohab","kind":"neohab/widgets","version":1,"widgets":[{"type":"label","config":{},"rect":${rect}}]}`
      expect(JSON.parse(text).widgets[0].rect).toBeDefined()
      expect(parseClipboard(text)).toBeNull()
    }
  })

  it('rejects a rect with a missing or non-numeric field', () => {
    for (const rect of [{ x: 0, y: 0, w: 2 }, { x: '0', y: 0, w: 2, h: 2 }, { x: null, y: 0, w: 2, h: 2 }, {}]) {
      expect(parseClipboard(payload([{ type: 'label', config: {}, rect }]))).toBeNull()
    }
  })

  it('rejects an entry whose config is an array rather than an object', () => {
    // `typeof [] === 'object'`, so an array used to pass as a widget config and would be spread
    // into one, giving a widget numeric keys and no settings.
    expect(parseClipboard(payload([{ type: 'label', config: [], rect: { x: 0, y: 0, w: 1, h: 1 } }]))).toBeNull()
  })

  it('rejects the whole payload when one entry is bad, rather than pasting a partial group', () => {
    // Raw JSON again, for the same reason as above: written through `JSON.stringify` the bad
    // entry would carry `null` rather than Infinity and the check would pass unguarded.
    const good = '{"type":"label","config":{},"rect":{"x":0,"y":0,"w":1,"h":1}}'
    const bad = '{"type":"label","config":{},"rect":{"x":0,"y":0,"w":1e999,"h":1}}'
    const text = `{"app":"neohab","kind":"neohab/widgets","version":1,"widgets":[${good},${bad}]}`
    expect(Number.isFinite(JSON.parse(text).widgets[1].rect.w)).toBe(false)
    expect(parseClipboard(text)).toBeNull()
  })
})
