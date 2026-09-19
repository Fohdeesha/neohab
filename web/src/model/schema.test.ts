import { describe, expect, it } from 'vitest'
import { kindOf, migrateConfig, MIGRATIONS, SCHEMA_VERSIONS, versionOf, type ComponentKind, type Migration } from './schema'

const table = (steps: Migration[]): Record<ComponentKind, Migration[]> => ({
  dashboard: steps,
  theme: [],
  widgetdef: [],
  icon: [],
  background: [],
  settings: []
})

const versions = (v: number): Record<ComponentKind, number> => ({
  dashboard: v,
  theme: 1,
  widgetdef: 1,
  icon: 1,
  background: 1,
  settings: 1
})

const trail = (): { steps: Migration[]; seen: string[] } => {
  const seen: string[] = []
  const step =
    (name: string): Migration =>
    (c) => {
      seen.push(name)
      return { ...c, [name]: true }
    }
  return { steps: [step('one'), step('two'), step('three')], seen }
}

describe('the version a config claims', () => {
  it('reads a plain number', () => {
    expect(versionOf({ version: 3 })).toBe(3)
  })

  it('reads Gson’s float echo as the whole number it is', () => {
    expect(versionOf({ version: 1.0 })).toBe(1)
    expect(versionOf({ version: 2.0 })).toBe(2)
  })

  it('reads a quoted version, which a hand edit produces', () => {
    expect(versionOf({ version: '2' })).toBe(2)
  })

  it('treats anything unreadable as version 1, never as newer', () => {
    expect(versionOf({})).toBe(1)
    expect(versionOf({ version: null })).toBe(1)
    expect(versionOf({ version: 'tomorrow' })).toBe(1)
    expect(versionOf({ version: NaN })).toBe(1)
    expect(versionOf({ version: Infinity })).toBe(1)
    expect(versionOf({ version: -5 })).toBe(1)
    expect(versionOf({ version: 0 })).toBe(1)
    expect(versionOf(null)).toBe(1)
    expect(versionOf('dashboard')).toBe(1)
    expect(versionOf(undefined)).toBe(1)
  })
})

describe('which kind a uid names', () => {
  it('names each of the six', () => {
    expect(kindOf('dashboard:kitchen')).toBe('dashboard')
    expect(kindOf('theme:mine')).toBe('theme')
    expect(kindOf('widgetdef:clock')).toBe('widgetdef')
    expect(kindOf('icon:bulb')).toBe('icon')
    expect(kindOf('background:plan')).toBe('background')
    expect(kindOf('settings')).toBe('settings')
  })

  it('does not claim a uid that is not ours', () => {
    expect(kindOf('snap:12345')).toBeNull()
    expect(kindOf('index')).toBeNull()
    expect(kindOf('')).toBeNull()
  })
})

describe('migrating forward', () => {
  it('does nothing when the config is already current', () => {
    const result = migrateConfig('dashboard', { version: SCHEMA_VERSIONS.dashboard, name: 'Kitchen' })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.migrated).toBe(false)
    expect(result.config.name).toBe('Kitchen')
  })

  it('runs the whole chain in order when the config is at the very bottom', () => {
    const { steps, seen } = trail()
    const result = migrateConfig('dashboard', { version: 1, keep: 'me' }, table(steps), versions(4))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(seen).toEqual(['one', 'two', 'three'])
    expect(result.config).toMatchObject({ keep: 'me', one: true, two: true, three: true, version: 4 })
    expect(result.migrated).toBe(true)
    expect(result.from).toBe(1)
  })

  it('starts partway when the config is partway', () => {
    const { steps, seen } = trail()
    const result = migrateConfig('dashboard', { version: 3 }, table(steps), versions(4))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(seen).toEqual(['three'])
    expect(result.config.version).toBe(4)
  })

  it('does not mutate what it was given', () => {
    const { steps } = trail()
    const original = { version: 1, keep: 'me' }
    migrateConfig('dashboard', original, table(steps), versions(4))
    expect(original).toEqual({ version: 1, keep: 'me' })
  })

  it('still advances the version across a gap with no step for it', () => {
    const result = migrateConfig('dashboard', { version: 1 }, table([]), versions(3))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.config.version).toBe(3)
  })

  it('migrates a config that has no version field at all', () => {
    const { steps, seen } = trail()
    const result = migrateConfig('dashboard', { name: 'hand written' }, table(steps), versions(2))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(seen).toEqual(['one'])
    expect(result.config).toMatchObject({ name: 'hand written', version: 2 })
  })
})

describe('refusing a config from the future', () => {
  it('refuses rather than guessing', () => {
    const result = migrateConfig('dashboard', { version: SCHEMA_VERSIONS.dashboard + 1, name: 'Kitchen' })
    expect(result.status).toBe('future')
    if (result.status !== 'future') return
    expect(result.from).toBe(SCHEMA_VERSIONS.dashboard + 1)
    expect(result.expected).toBe(SCHEMA_VERSIONS.dashboard)
  })

  it('refuses per kind, so one component cannot condemn the others', () => {
    expect(migrateConfig('theme', { version: 9 }).status).toBe('future')
    expect(migrateConfig('dashboard', { version: 1 }).status).toBe('ok')
  })
})

describe('folding the switch widget into the button (dashboard 1 -> 2)', () => {
  const dash = (widgets: unknown[]): Record<string, unknown> => ({ version: 1, id: 'kitchen', name: 'Kitchen', widgets })
  const run = (widgets: unknown[]): Record<string, unknown> => {
    const result = migrateConfig('dashboard', dash(widgets))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('refused')
    return result.config
  }
  const first = (widgets: unknown[]) => (run(widgets).widgets as Record<string, unknown>[])[0]
  const sw = (config: Record<string, unknown>) => ({ id: 'w-1', type: 'switch', config, layout: { lg: { x: 1, y: 2, w: 3, h: 4 } } })

  it('turns a switch into a button in switch style', () => {
    const w = first([sw({ item: 'Hall_Light', label: 'Hall' })])
    expect(w.type).toBe('button')
    expect(w.config).toMatchObject({ style: 'switch', item: 'Hall_Light', label: 'Hall' })
  })

  it('writes out the two behaviours the old widget implied, so the tile acts as it did', () => {
    // the switch always toggled and read any value above zero as on; both are settings now, and a
    // migration that left them off would turn every stored switch into a tile that never lights up
    const w = first([sw({ item: 'i' })])
    expect(w.config).toMatchObject({ toggle: true, nonZeroIsOn: true })
  })

  it('pins a button written before the merge to the behaviour it had', () => {
    // toggling is the default for a NEW widget now, so a stored button with no toggle key would start
    // alternating with the default alternate command the day it was loaded
    const btn = (config: Record<string, unknown>) => ({ id: 'w-b', type: 'button', config, layout: {} })
    expect(first([btn({ item: 'i', command: '55' })]).config).toMatchObject({ toggle: false, command: '55' })
    expect(first([btn({ item: 'i', command: '55', toggle: true })]).config).toMatchObject({ toggle: true })
    expect(first([btn({ item: 'i', command: '55', toggle: false })]).config).toMatchObject({ toggle: false })
  })

  it('keeps the widget where it was, under the id it had', () => {
    const w = first([sw({ item: 'i' })])
    expect(w.id).toBe('w-1')
    expect(w.layout).toEqual({ lg: { x: 1, y: 2, w: 3, h: 4 } })
  })

  it('renames the two commands to the pair the button keeps', () => {
    const w = first([sw({ item: 'i', onCommand: 'OPEN', offCommand: 'CLOSE' })])
    expect(w.config).toMatchObject({ command: 'OPEN', commandAlt: 'CLOSE' })
    expect(w.config).not.toHaveProperty('onCommand')
    expect(w.config).not.toHaveProperty('offCommand')
  })

  it('falls back to ON and OFF when the switch never named them, or named them empty', () => {
    expect(first([sw({ item: 'i' })]).config).toMatchObject({ command: 'ON', commandAlt: 'OFF' })
    expect(first([sw({ item: 'i', onCommand: '', offCommand: '' })]).config).toMatchObject({ command: 'ON', commandAlt: 'OFF' })
  })

  it('writes an empty name for a switch that had none, so the button default cannot name it', () => {
    expect(first([sw({ item: 'i' })]).config).toMatchObject({ label: '' })
    expect(first([sw({ item: 'i', label: 42 })]).config).toMatchObject({ label: '' })
  })

  it('carries every other setting across untouched', () => {
    const w = first([sw({ item: 'i', label: 'L', icon: 'mdi:lightbulb', iconSize: 48, accent: 'filled', textSize: 120 })])
    expect(w.config).toMatchObject({ icon: 'mdi:lightbulb', iconSize: 48, accent: 'filled', textSize: 120 })
  })

  it('leaves every other widget type exactly as it was', () => {
    const slider = { id: 'w-2', type: 'slider', config: { item: 'd', min: 0, max: 100 }, layout: {} }
    const widgets = run([slider, sw({ item: 'i' })]).widgets as Record<string, unknown>[]
    expect(widgets[0]).toEqual(slider)
    expect(widgets[1].type).toBe('button')
  })

  it('lands the dashboard on the current version either way', () => {
    expect(run([sw({ item: 'i' })]).version).toBe(SCHEMA_VERSIONS.dashboard)
    expect(run([{ id: 'w-2', type: 'clock', config: {}, layout: {} }]).version).toBe(SCHEMA_VERSIONS.dashboard)
  })

  it('does not touch a dashboard already written at the current version', () => {
    const stored = { version: SCHEMA_VERSIONS.dashboard, widgets: [sw({ item: 'i' })] }
    const result = migrateConfig('dashboard', stored)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.migrated).toBe(false)
    expect((result.config.widgets as Record<string, unknown>[])[0].type).toBe('switch')
  })

  it('survives a stored shape no editor would ever write', () => {
    expect(() => migrateConfig('dashboard', { version: 1, widgets: 'not a list' })).not.toThrow()
    expect(migrateConfig('dashboard', { version: 1 }).status).toBe('ok')
    const odd = run([null, 'nope', 7, { type: 'switch' }, { type: 'switch', config: ['array'] }])
    const widgets = odd.widgets as unknown[]
    expect(widgets.slice(0, 3)).toEqual([null, 'nope', 7])
    expect((widgets[3] as Record<string, unknown>).config).toMatchObject({ style: 'switch', label: '', command: 'ON' })
    expect((widgets[4] as Record<string, unknown>).config).toMatchObject({ style: 'switch', commandAlt: 'OFF' })
  })
})

describe('folding the stat widget into the value (dashboard 2 -> 3)', () => {
  const dash = (widgets: unknown[]): Record<string, unknown> => ({ version: 2, id: 'kitchen', name: 'Kitchen', widgets })
  const run = (widgets: unknown[]): Record<string, unknown> => {
    const result = migrateConfig('dashboard', dash(widgets))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('refused')
    return result.config
  }
  const first = (widgets: unknown[]) => (run(widgets).widgets as Record<string, unknown>[])[0]
  const stat = (config: Record<string, unknown>) => ({ id: 'w-1', type: 'stat', config, layout: { lg: { x: 1, y: 2, w: 3, h: 4 } } })

  it('turns a stat into a value in stat style', () => {
    const w = first([stat({ item: 'Grid_Power', label: 'Power' })])
    expect(w.type).toBe('value')
    expect(w.config).toMatchObject({ style: 'stat', item: 'Grid_Power', label: 'Power' })
  })

  it('writes the style out rather than letting the merged default decide', () => {
    // a stat carries no style key of its own and the value's default is the plain look, so a
    // migration that left it off would redraw every stored stat as a centred readout
    expect(first([stat({ item: 'i' })]).config).toMatchObject({ style: 'stat' })
  })

  it('pins the alignment a stat laid its column out with', () => {
    // the stat column started from the left whatever it had stored, so one written without the key
    // has to say so - the value offers the same three alignments and must not move it
    expect(first([stat({ item: 'i' })]).config).toMatchObject({ align: 'left' })
    expect(first([stat({ item: 'i', align: 'center' })]).config).toMatchObject({ align: 'center' })
    expect(first([stat({ item: 'i', align: 'right' })]).config).toMatchObject({ align: 'right' })
  })

  it('keeps the widget where it was, under the id it had', () => {
    const w = first([stat({ item: 'i' })])
    expect(w.id).toBe('w-1')
    expect(w.layout).toEqual({ lg: { x: 1, y: 2, w: 3, h: 4 } })
  })

  it('carries every setting the stat had across untouched', () => {
    const w = first([
      stat({
        item: 'i',
        unit: 'W',
        caption: 'grid draw',
        badge: 'PEAK',
        badgeColor: '#ff0000',
        trend: 'history',
        trendPeriod: '7d',
        goodDirection: 'down',
        subItem: 'other',
        subCaption: 'yesterday',
        color: '#00ff00',
        severity: [{ value: 10, color: '#111111' }],
        icon: 'mdi:flash',
        iconSize: 48,
        accent: 'filled',
        textSize: 120
      })
    ])
    expect(w.config).toMatchObject({
      unit: 'W',
      caption: 'grid draw',
      badge: 'PEAK',
      badgeColor: '#ff0000',
      trend: 'history',
      trendPeriod: '7d',
      goodDirection: 'down',
      subItem: 'other',
      subCaption: 'yesterday',
      color: '#00ff00',
      severity: [{ value: 10, color: '#111111' }],
      icon: 'mdi:flash',
      iconSize: 48,
      accent: 'filled',
      textSize: 120
    })
  })

  it('leaves a stored value exactly as it was, so it keeps falling through to the plain look', () => {
    const value = { id: 'w-2', type: 'value', config: { item: 'd', label: 'Level', unit: '%' }, layout: { lg: { x: 0, y: 0, w: 2, h: 2 } } }
    const widgets = run([value, stat({ item: 'i' })]).widgets as Record<string, unknown>[]
    expect(widgets[0]).toEqual(value)
    expect(widgets[0].config).not.toHaveProperty('style')
    expect(widgets[1].type).toBe('value')
  })

  it('leaves every other widget type exactly as it was', () => {
    const slider = { id: 'w-3', type: 'slider', config: { item: 'd', min: 0, max: 100 }, layout: {} }
    const widgets = run([slider, stat({ item: 'i' })]).widgets as Record<string, unknown>[]
    expect(widgets[0]).toEqual(slider)
  })

  it('lands the dashboard on the current version either way', () => {
    expect(run([stat({ item: 'i' })]).version).toBe(SCHEMA_VERSIONS.dashboard)
    expect(run([{ id: 'w-4', type: 'clock', config: {}, layout: {} }]).version).toBe(SCHEMA_VERSIONS.dashboard)
  })

  it('runs both steps for a dashboard stored before either merge', () => {
    const widgets = migrateConfig('dashboard', {
      version: 1,
      widgets: [
        { id: 'a', type: 'switch', config: { item: 'i' }, layout: {} },
        { id: 'b', type: 'stat', config: { item: 'j' }, layout: {} }
      ]
    })
    expect(widgets.status).toBe('ok')
    if (widgets.status !== 'ok') return
    const list = widgets.config.widgets as Record<string, unknown>[]
    expect(list[0]).toMatchObject({ type: 'button', config: { style: 'switch' } })
    expect(list[1]).toMatchObject({ type: 'value', config: { style: 'stat' } })
    expect(widgets.config.version).toBe(SCHEMA_VERSIONS.dashboard)
  })

  it('survives a stored shape no editor would ever write', () => {
    expect(() => migrateConfig('dashboard', { version: 2, widgets: 'not a list' })).not.toThrow()
    expect(migrateConfig('dashboard', { version: 2 }).status).toBe('ok')
    const odd = run([null, 'nope', 7, { type: 'stat' }, { type: 'stat', config: ['array'] }, { type: 'stat', config: { align: 9 } }])
    const widgets = odd.widgets as unknown[]
    expect(widgets.slice(0, 3)).toEqual([null, 'nope', 7])
    expect((widgets[3] as Record<string, unknown>).config).toMatchObject({ style: 'stat', align: 'left' })
    expect((widgets[4] as Record<string, unknown>).config).toMatchObject({ style: 'stat', align: 'left' })
    expect((widgets[5] as Record<string, unknown>).config).toMatchObject({ style: 'stat', align: 'left' })
  })
})

describe('the table and the declared versions agree', () => {
  it('has exactly one step per version above the first, for every kind', () => {
    for (const kind of Object.keys(SCHEMA_VERSIONS) as ComponentKind[]) {
      expect(`${kind}: ${MIGRATIONS[kind].length}`).toBe(`${kind}: ${SCHEMA_VERSIONS[kind] - 1}`)
    }
  })

  it('covers every kind in both tables', () => {
    expect(Object.keys(MIGRATIONS).sort()).toEqual(Object.keys(SCHEMA_VERSIONS).sort())
  })
})
