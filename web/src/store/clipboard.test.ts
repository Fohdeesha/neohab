import { describe, expect, it } from 'vitest'
import { parseClipboard, serializeClipboard, type ClipboardWidget } from './clipboard'

const widget = (over: Partial<ClipboardWidget> = {}): ClipboardWidget => ({
  type: 'label',
  config: { label: 'A' },
  rect: { x: 1, y: 2, w: 3, h: 4 },
  ...over
})

const payload = (widgets: unknown[]) => JSON.stringify({ app: 'neohab', kind: 'neohab/widgets', version: 1, widgets })

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

  it('rejects a rect whose numbers are not finite', () => {
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
    expect(parseClipboard(payload([{ type: 'label', config: [], rect: { x: 0, y: 0, w: 1, h: 1 } }]))).toBeNull()
  })

  it('rejects the whole payload when one entry is bad, rather than pasting a partial group', () => {
    const good = '{"type":"label","config":{},"rect":{"x":0,"y":0,"w":1,"h":1}}'
    const bad = '{"type":"label","config":{},"rect":{"x":0,"y":0,"w":1e999,"h":1}}'
    const text = `{"app":"neohab","kind":"neohab/widgets","version":1,"widgets":[${good},${bad}]}`
    expect(Number.isFinite(JSON.parse(text).widgets[1].rect.w)).toBe(false)
    expect(parseClipboard(text)).toBeNull()
  })
})
