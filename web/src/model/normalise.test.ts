import { describe, expect, it } from 'vitest'
import { normaliseConfig } from './normalise'
import { hasTabletLayout, projectDashboard, stackedOrder, tabletRects } from './layout'
import type { Dashboard } from './dashboard'

describe('names', () => {
  it('leaves a normal config as it is', () => {
    const config = { version: 1, id: 'kitchen', name: 'Kitchen', columns: 12, rowHeight: 'match', widgets: [] }
    expect(normaliseConfig('dashboard', 'dashboard:kitchen', config)).toEqual(config)
  })

  it('coerces a name that is not a string, so every screen can still draw it', () => {
    expect(normaliseConfig('dashboard', 'dashboard:a', { name: { not: 'a string' } }).name).toBe('[object Object]')
    expect(normaliseConfig('dashboard', 'dashboard:a', { name: 42 }).name).toBe('42')
    expect(normaliseConfig('theme', 'theme:a', { name: ['x'] }).name).toBe('x')
  })

  it('answers with something usable for a config that is not an object at all', () => {
    expect(normaliseConfig('dashboard', 'dashboard:a', undefined)).toMatchObject({ id: 'a', widgets: [] })
    expect(normaliseConfig('settings', 'settings', 'nonsense')).toEqual({})
  })

  it('never changes the object it was given', () => {
    const stored = { name: 5, widgets: [{ id: 'w', config: { series: [null] } }] }
    const copy = JSON.parse(JSON.stringify(stored))
    normaliseConfig('dashboard', 'dashboard:a', stored)
    expect(stored).toEqual(copy)
  })
})

describe('the id comes from the uid', () => {
  it('whatever the stored config says', () => {
    expect(normaliseConfig('dashboard', 'dashboard:shared', { id: 'home', name: 'Shared' }).id).toBe('shared')
    expect(normaliseConfig('theme', 'theme:mine', { id: 'dark' }).id).toBe('mine')
    expect(normaliseConfig('widgetdef', 'widgetdef:x', {}).id).toBe('x')
    expect(normaliseConfig('background', 'background:b1', { id: 7 }).id).toBe('b1')
  })

  it('settings carries no id', () => {
    expect(normaliseConfig('settings', 'settings', { theme: 'dark' })).toEqual({ theme: 'dark' })
  })
})

describe('dashboards', () => {
  const load = (stored: unknown) => normaliseConfig('dashboard', 'dashboard:d', stored) as unknown as Dashboard

  it('a widget with no layout or config reaches the grid as one that has them', () => {
    const d = load({
      columns: 12,
      rowHeight: 'match',
      widgets: [
        { id: 'a', type: 'label' },
        { id: 'b', type: 'label', layout: 'x', config: 5 }
      ]
    })
    expect(d.widgets.map((w) => w.layout)).toEqual([{}, {}])
    expect(d.widgets.map((w) => w.config)).toEqual([{}, {}])
    expect(() => hasTabletLayout(d)).not.toThrow()
    expect(() => tabletRects({ ...d, mdColumns: 6 })).not.toThrow()
    expect(() => projectDashboard(d, 'md')).not.toThrow()
  })

  it('drops rows that are not widgets, and gives every widget an id of its own', () => {
    const d = load({ widgets: [null, 'x', { type: 'label' }, { id: 'a', type: 1 }, { id: 'a', type: 'label' }] })
    expect(d.widgets.map((w) => w.id)).toEqual(['w-2', 'a', 'a-2'])
    expect(d.widgets[1].type).toBe('')
  })

  it('widgets that are not a list become an empty one', () => {
    expect(load({ widgets: null }).widgets).toEqual([])
    expect(load({ widgets: { a: 1 } }).widgets).toEqual([])
  })

  it('keeps only rect-shaped layouts', () => {
    const d = load({ widgets: [{ id: 'a', type: 'label', layout: { lg: { x: 1, y: 2, w: 3, h: 4 }, md: 'nope', xl: {} } }] })
    expect(d.widgets[0].layout).toEqual({ lg: { x: 1, y: 2, w: 3, h: 4 } })
  })

  it('a stack order that is not a list of ids is dropped, and one with junk in it is cleaned', () => {
    expect(load({ widgets: [], stackOrder: 'a' }).stackOrder).toBeUndefined()
    expect(load({ widgets: [], stackOrder: ['a', 5, null, 'b'] }).stackOrder).toEqual(['a', 'b'])
    expect(() => stackedOrder(load({ widgets: [{ id: 'a', type: 'x' }], stackOrder: 7 }))).not.toThrow()
  })

  it('an icon, background or flag of the wrong type is dropped', () => {
    const d = load({ widgets: [], icon: 5, background: { url: 'x' }, hideInSidebar: 'yes' })
    expect(d.icon).toBeUndefined()
    expect(d.background).toBeUndefined()
    expect(d.hideInSidebar).toBeUndefined()
  })

  it('null rows are taken out of every list in a widget config, at any depth', () => {
    const d = load({
      widgets: [
        {
          id: 'a',
          type: 'chart',
          config: { series: [null, { item: 'x', thresholds: [undefined, { value: 1 }] }], hideOn: ['phone', null] }
        }
      ]
    })
    expect(d.widgets[0].config).toEqual({ series: [{ item: 'x', thresholds: [{ value: 1 }] }], hideOn: ['phone'] })
  })

  it('a stored key called __proto__ stays a key and pollutes nothing', () => {
    const stored = JSON.parse('{"widgets":[{"id":"a","type":"template","config":{"__proto__":{"polluted":true},"v":1}}]}')
    const d = load(stored)
    const config = d.widgets[0].config as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(config, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((config as { polluted?: unknown }).polluted).toBeUndefined()
  })
})

describe('themes', () => {
  it('a theme with no tokens gets an empty set rather than taking the app down', () => {
    expect(normaliseConfig('theme', 'theme:t', { name: 'T' }).tokens).toEqual({})
    expect(normaliseConfig('theme', 'theme:t', { tokens: 'red' }).tokens).toEqual({})
  })

  it('keeps string tokens and drops the rest', () => {
    expect(normaliseConfig('theme', 'theme:t', { tokens: { bg: '#000', radius: 12, text: null } }).tokens).toEqual({ bg: '#000' })
  })

  it('an unknown scheme is dark, and a stylesheet that is not text is dropped', () => {
    const t = normaliseConfig('theme', 'theme:t', { scheme: 'purple', css: 5, cssModule: {} })
    expect(t.scheme).toBe('dark')
    expect(t.css).toBeUndefined()
    expect(t.cssModule).toBeUndefined()
  })
})

describe('custom widgets, images and settings', () => {
  it('a custom widget keeps only settings with an id', () => {
    const d = normaliseConfig('widgetdef', 'widgetdef:w', {
      template: 5,
      settings: [null, { id: 'a' }, { label: 'no id' }],
      kind: 'python'
    })
    expect(d.template).toBeUndefined()
    expect(d.settings).toEqual([{ id: 'a' }])
    expect(d.kind).toBeUndefined()
  })

  it('an image whose data is not text has none', () => {
    expect(normaliseConfig('icon', 'icon:i', { dataUri: 5 }).dataUri).toBeUndefined()
    expect(normaliseConfig('background', 'background:b', { dataUri: 'data:,x' }).dataUri).toBe('data:,x')
  })

  it('settings of the wrong type are dropped so the defaults apply', () => {
    const s = normaliseConfig('settings', 'settings', { theme: 3, background: ['x'], controlItem: 'Lamp', sidebar: 'no', liveDrag: false })
    expect(s).toEqual({ controlItem: 'Lamp', liveDrag: false })
  })
})
