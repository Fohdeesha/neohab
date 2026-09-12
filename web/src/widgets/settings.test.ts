import { describe, expect, it, vi } from 'vitest'
import type { SettingField } from './types'
import { lookOf as thermostatLookOf } from './thermostat/model'
import { orientOf as sliderOrientOf, styleOf as sliderStyleOf } from './slider/model'
import { keepOf as logKeepOf, minLevelOf as logMinLevelOf, sourceSetting as logSourceOf } from './log/model'
import { colorModeOf as batteryColorModeOf, styleOf as batteryStyleOf } from './battery/model'

const noopEvents = { addEventListener: () => {}, removeEventListener: () => {} }
vi.stubGlobal('document', { ...noopEvents, documentElement: {}, visibilityState: 'visible' })
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
vi.stubGlobal('window', {
  ...noopEvents,
  location: { hash: '', search: '', pathname: '/neohab/', origin: 'http://localhost', href: 'http://localhost/neohab/' },
  matchMedia: () => ({ matches: false, ...noopEvents })
})

const { registerBuiltinWidgets } = await import('./index')
const {
  instanceCommands,
  instanceControl,
  instanceDetailRoute,
  instanceHasDetail,
  instanceHasHeader,
  instanceMinHeight,
  itemsForInstance,
  listWidgetDefinitions
} = await import('./registry')

registerBuiltinWidgets()
const widgets = listWidgetDefinitions()

const UNIVERSAL_KEYS = ['labelMode', 'labelAlign', 'labelPosition', 'accent', 'accentColor', 'textSize', 'hideOn']

const RENDERABLE: Record<SettingField['type'], true> = {
  item: true,
  icon: true,
  text: true,
  multiline: true,
  number: true,
  boolean: true,
  color: true,
  select: true,
  multiselect: true,
  dashboard: true,
  hideon: true,
  planimage: true,
  planlights: true,
  clockzones: true,
  timezone: true,
  weatherlocation: true,
  itempattern: true,
  camerastream: true,
  stateicons: true,
  chartseries: true,
  chartthresholds: true,
  statecolors: true,
  timelineseries: true,
  gaugeseverity: true,
  gaugemarkers: true,
  gaugezones: true
}

const effectiveOf = (def: (typeof widgets)[number]): Record<string, unknown> => ({
  ...(def.defaultConfig?.() as Record<string, unknown>)
})

const boundConfig = (def: (typeof widgets)[number]): Record<string, unknown> => {
  const config = effectiveOf(def)
  for (const field of def.settings ?? []) if (field.type === 'item') config[field.key] = 'nh_' + field.key
  return config
}

const readOnlyItems = (def: (typeof widgets)[number]): string[] =>
  (def.settings ?? []).filter((f) => f.type === 'item' && f.readOnly === true).map((f) => 'nh_' + f.key)

type SelectField = Extract<SettingField, { type: 'select' }>
const selectsOf = (def: (typeof widgets)[number]): SelectField[] =>
  (def.settings ?? []).filter((f): f is SelectField => f.type === 'select')

describe('every widget settings schema', () => {
  it('has widgets registered to check', () => {
    expect(widgets.length).toBeGreaterThan(15)
  })

  it('never leaves a select with nothing selected', () => {
    const blank: string[] = []
    for (const def of widgets) {
      const effective = effectiveOf(def)
      for (const field of selectsOf(def)) {
        const current = typeof effective[field.key] === 'string' ? (effective[field.key] as string) : ''
        if (!field.options.some((o) => o.value === current)) blank.push(`${def.type}.${field.key} (value ${JSON.stringify(current)})`)
      }
    }
    expect(blank).toEqual([])
  })

  it('offers real options in every select', () => {
    const bad: string[] = []
    for (const def of widgets) {
      for (const field of selectsOf(def)) {
        if (field.options.length === 0) bad.push(`${def.type}.${field.key} has no options`)
        for (const o of field.options) {
          if (typeof o.label !== 'string' || o.label === '') bad.push(`${def.type}.${field.key} has an unlabelled option`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('does not redeclare a field the panel appends to every widget', () => {
    const clashes: string[] = []
    for (const def of widgets) {
      for (const field of def.settings ?? []) {
        if (UNIVERSAL_KEYS.includes(field.key)) clashes.push(`${def.type}.${field.key}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('calls the name field "Name", on every widget that has one', () => {
    const named = widgets.filter((def) => (def.settings ?? []).some((f) => f.key === 'label'))
    expect(named.length).toBeGreaterThan(15)
    const odd = named
      .flatMap((def) => (def.settings ?? []).filter((f) => f.key === 'label').map((f) => ({ def, f })))
      .filter(({ f }) => f.type !== 'text' || f.label !== 'Name')
      .map(({ def, f }) => `${def.type}: ${f.type} "${'label' in f ? f.label : ''}"`)
    expect(odd).toEqual([])
  })

  it('lets every widget with a header row be told not to draw its name', () => {
    const headerless = widgets.filter((def) => def.hasHeader && !(def.settings ?? []).some((f) => f.key === 'label'))
    expect(headerless.map((d) => d.type)).toEqual([])
    const clashes: string[] = []
    for (const def of widgets) {
      if (!def.labelModes) continue
      if (!def.hasHeader) clashes.push(`${def.type} offers extra name modes without a header row`)
      for (const o of def.labelModes.options) {
        if (o.value === 'header' || o.value === 'none') clashes.push(`${def.type} redeclares "${o.value}"`)
        if (!o.value || !o.label) clashes.push(`${def.type} has an incomplete name mode`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('only uses field kinds the settings panel can draw', () => {
    const unknown: string[] = []
    for (const def of widgets) {
      for (const field of def.settings ?? []) {
        if (!RENDERABLE[field.type]) unknown.push(`${def.type}.${field.key}: ${field.type}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('says whether it commands the items it binds', () => {
    const silent = widgets.filter((def) => def.itemKeys && !def.canCommand).map((def) => def.type)
    expect(silent).toEqual([])
  })

  it('answers per instance, not per widget type', () => {
    expect(instanceCommands('dial', { item: 'x' })).toBe(true)
    expect(instanceCommands('dial', { item: 'x', readOnly: true })).toBe(false)
    expect(instanceCommands('button', { item: 'x', action: 'command' })).toBe(true)
    expect(instanceCommands('button', { item: 'x', action: 'navigate' })).toBe(false)
    for (const display of ['value', 'stat', 'chart', 'timeline', 'compass', 'weather', 'battery']) {
      expect(instanceCommands(display, { item: 'x' }), display).toBe(false)
    }
    for (const control of ['slider', 'color', 'selection', 'rollershutter', 'player']) {
      expect(instanceCommands(control, { item: 'x' }), control).toBe(true)
    }
    expect(instanceCommands('thermostat', { currentItem: 'x', setpointItem: 'y' })).toBe(true)
  })

  it('says no for a widget type nobody registered', () => {
    expect(instanceCommands('not-a-widget', {})).toBe(false)
  })

  it('has no switch widget of its own: the button draws that now', () => {
    expect(widgets.map((d) => d.type)).not.toContain('switch')
    expect(instanceCommands('switch', { item: 'x' })).toBe(false)
  })

  it('answers the header question per instance, not only per widget type', () => {
    expect(instanceHasHeader('button', {})).toBe(false)
    expect(instanceHasHeader('button', { style: 'switch' })).toBe(true)
    expect(instanceHasHeader('button', { style: 'nonsense' })).toBe(false)
    // a widget that declares a plain boolean still answers, and so does one that declares nothing
    expect(instanceHasHeader('value', {})).toBe(true)
    expect(instanceHasHeader('label', {})).toBe(false)
    expect(instanceHasHeader('nonesuch', {})).toBe(false)
  })

  it('gives the button the same behaviour in either style: the look decides nothing', () => {
    for (const style of ['button', 'switch']) {
      const bound = { item: 'x', style, command: 'OPEN', commandAlt: 'CLOSE' }
      expect(instanceCommands('button', bound), style).toBe(true)
      expect(instanceControl('button', bound, 'x'), style).toEqual({ kind: 'onoff', on: 'OPEN', off: 'CLOSE' })
      expect(instanceCommands('button', { ...bound, action: 'navigate' }), style).toBe(false)
      expect(instanceControl('button', { ...bound, action: 'navigate' }, 'x'), style).toBeUndefined()
      expect(itemsForInstance('button', bound), style).toEqual(['x'])
    }
  })

  it('says which control it offers, not only that it offers one', () => {
    const silent = widgets.filter((def) => instanceCommands(def.type, boundConfig(def)) && !def.controlFor).map((def) => def.type)
    expect(silent).toEqual([])
  })

  it('offers a control for every item a commandable instance binds', () => {
    const missing: string[] = []
    for (const def of widgets) {
      const config = boundConfig(def)
      if (!instanceCommands(def.type, config)) continue
      const readOnly = readOnlyItems(def)
      for (const item of itemsForInstance(def.type, config)) {
        if (readOnly.includes(item)) continue
        if (!instanceControl(def.type, config, item)) missing.push(`${def.type} binds ${item} and offers nothing`)
      }
    }
    expect(missing).toEqual([])
  })

  it('offers no control for an item it declares read-only', () => {
    const declaring = widgets.filter((def) => readOnlyItems(def).length > 0)
    expect(declaring.map((d) => d.type)).toContain('thermostat')
    const offered: string[] = []
    for (const def of declaring) {
      const config = boundConfig(def)
      for (const item of readOnlyItems(def)) {
        const control = instanceControl(def.type, config, item)
        if (control) offered.push(`${def.type} offers ${control.kind} for read-only ${item}`)
      }
    }
    expect(offered).toEqual([])
  })

  it('claims no item it does not bind', () => {
    const claimed: string[] = []
    for (const def of widgets) {
      const config = boundConfig(def)
      if (!instanceCommands(def.type, config)) continue
      const control = instanceControl(def.type, config, 'nh_not_bound_to_anything')
      if (control) claimed.push(`${def.type}: ${control.kind}`)
    }
    expect(claimed).toEqual([])
  })

  it('never offers a range a control could not work in', () => {
    const bad: string[] = []
    const junk = { min: 'abc', max: -5, step: 0, min2: {}, max2: null, step2: -3 }
    for (const def of widgets) {
      const config = { ...boundConfig(def), ...junk }
      for (const item of itemsForInstance(def.type, config)) {
        const control = instanceControl(def.type, config, item)
        if (control?.kind !== 'range') continue
        if (!(control.max > control.min) || !(control.step > 0)) {
          bad.push(`${def.type}: ${JSON.stringify(control)}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('offers the widget its own control, whatever the item happens to hold', () => {
    expect(instanceControl('slider', { item: 'x', min: 2000, max: 6500, step: 50, unit: ' K' }, 'x')).toEqual({
      kind: 'range',
      min: 2000,
      max: 6500,
      step: 50,
      unit: ' K'
    })
    const dial = { item: 'x', item2: 'y', min: 10, max: 30, step: 0.5, min2: 0, max2: 5, markers: [{ item: 'm' }] }
    expect(instanceControl('dial', dial, 'x')).toMatchObject({ kind: 'range', min: 10, max: 30, step: 0.5 })
    expect(instanceControl('dial', dial, 'y')).toMatchObject({ kind: 'range', min: 0, max: 5 })
    expect(instanceControl('dial', dial, 'm')).toBeUndefined()
    expect(instanceControl('player', { item: 'x' }, 'x')).toMatchObject({ kind: 'choices' })
    expect((instanceControl('player', { item: 'x' }, 'x') as { choices: { command: string }[] }).choices.map((c) => c.command)).toEqual([
      'PREVIOUS',
      'PLAY',
      'PAUSE',
      'NEXT'
    ])
    expect(
      (instanceControl('rollershutter', { item: 'x' }, 'x') as { choices: { command: string }[] }).choices.map((c) => c.command)
    ).toEqual(['UP', 'STOP', 'DOWN'])
    expect(instanceControl('selection', { item: 'x', choices: 'HDMI1=Apple TV\nHDMI2=Xbox' }, 'x')).toEqual({
      kind: 'choices',
      choices: [
        { command: 'HDMI1', label: 'Apple TV' },
        { command: 'HDMI2', label: 'Xbox' }
      ]
    })
    expect(instanceControl('selection', { item: 'x' }, 'x')).toEqual({ kind: 'auto' })
    expect(instanceControl('button', { item: 'x', style: 'switch' }, 'x')).toEqual({ kind: 'onoff', on: 'ON', off: 'OFF' })
    // emptied on purpose: it offers nothing rather than inventing a command the author removed
    expect(instanceControl('button', { item: 'x', command: '', commandAlt: '' }, 'x')).toBeUndefined()
    // two commands make an on/off pair; one command is the single thing it sends
    expect(instanceControl('button', { item: 'x', command: '55', commandAlt: '0' }, 'x')).toEqual({
      kind: 'onoff',
      on: '55',
      off: '0'
    })
    expect(instanceControl('button', { item: 'x', command: '55', commandAlt: '0', toggle: false }, 'x')).toEqual({
      kind: 'choices',
      choices: [{ command: '55', label: '55' }]
    })
    expect(instanceControl('button', { item: 'x', command: 'ON', commandAlt: '' }, 'x')).toEqual({
      kind: 'choices',
      choices: [{ command: 'ON', label: 'ON' }]
    })
    expect(instanceControl('button', { item: 'x', command: 'ON', action: 'navigate' }, 'x')).toBeUndefined()
    expect(instanceControl('dial', { item: 'x', readOnly: true }, 'x')).toBeUndefined()
    expect(instanceControl('color', { item: 'x' }, 'x')).toEqual({ kind: 'color', power: true })
    expect(instanceControl('color', { item: 'x', powerButtons: true }, 'x')).toEqual({ kind: 'color', power: true })
    for (const stored of [false, 'true', 1, null, undefined]) {
      expect(instanceControl('color', { item: 'x', powerButtons: stored }, 'x')).toEqual({ kind: 'color' })
    }
    const plan = { lights: [{ item: 'lamp' }] }
    expect(instanceControl('floorplan', plan, 'lamp')).toEqual({ kind: 'auto' })
    expect(instanceControl('floorplan', plan, 'other')).toBeUndefined()
    const thermo = { currentItem: 'cur', setpointItem: 'sp', modeItem: 'mode', fanItem: 'fan', auxItem: 'aux', statusItem: 'st' }
    expect(instanceControl('thermostat', thermo, 'sp')).toEqual({ kind: 'range', min: 10, max: 30, step: 0.5, unit: undefined })
    expect(instanceControl('thermostat', { ...thermo, min: 60, max: 80, step: 1, unit: '°F' }, 'sp')).toEqual({
      kind: 'range',
      min: 60,
      max: 80,
      step: 1,
      unit: '°F'
    })
    expect(instanceControl('thermostat', thermo, 'mode')).toEqual({
      kind: 'choices',
      choices: [
        { command: 'HEAT', labelKey: 'Heat' },
        { command: 'COOL', labelKey: 'Cool' }
      ]
    })
    expect(instanceControl('thermostat', { ...thermo, heatCommand: 'heat', coolCommand: 'cool' }, 'mode')).toMatchObject({
      choices: [{ command: 'heat' }, { command: 'cool' }]
    })
    expect(instanceControl('thermostat', thermo, 'fan')).toEqual({
      kind: 'choices',
      choices: [
        { command: 'AUTO', labelKey: 'Auto' },
        { command: 'ON', labelKey: 'On' }
      ]
    })
    expect(instanceControl('thermostat', thermo, 'aux')).toEqual({ kind: 'onoff', on: 'ON', off: 'OFF' })
    expect(instanceControl('thermostat', thermo, 'cur')).toBeUndefined()
    expect(instanceControl('thermostat', thermo, 'st')).toBeUndefined()
  })

  it('offers a multiselect nothing its own options do not list', () => {
    const bad: string[] = []
    for (const def of widgets) {
      for (const field of def.settings ?? []) {
        if (field.type !== 'multiselect') continue
        const known = new Set(field.options.map((o) => o.value))
        for (const v of field.defaultValue ?? []) {
          if (!known.has(v)) bad.push(`${def.type}.${field.key}: default ${JSON.stringify(v)} is not an option`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('answers the hold gesture wherever there is anything to show', () => {
    expect(instanceHasDetail('weather', { source: 'openmeteo', location: { lat: 1, lon: 2 } })).toBe(true)
    expect(instanceHasDetail('clock', { mode: 'digital' })).toBe(true)
    expect(instanceHasDetail('log', {})).toBe(true)
    expect(instanceHasDetail('button', { item: 'x' })).toBe(true)
    expect(instanceHasDetail('button', {})).toBe(false)
    expect(instanceHasDetail('label', { text: 'Kitchen' })).toBe(false)
    expect(instanceHasDetail('image', { url: 'x.png' })).toBe(false)
    expect(instanceHasDetail('nonesuch', {})).toBe(false)
  })

  it('offers the gesture on every widget that declares a view or a page, whatever its config', () => {
    const declaring = widgets.filter((d) => d.DetailView || d.detailRoute)
    expect(declaring.length).toBeGreaterThan(0)
    const unreachable = declaring.filter((d) => !instanceHasDetail(d.type, {})).map((d) => d.type)
    expect(unreachable).toEqual([])
  })

  it('sends a hold on a log tile to the full-screen log route, and a hold on the rest to the sheet', () => {
    expect(instanceDetailRoute('log', 'kitchen', 'w-1')).toEqual({ name: 'log', dashboard: 'kitchen', widget: 'w-1' })
    expect(instanceDetailRoute('weather', 'kitchen', 'w-1')).toBeUndefined()
    expect(instanceDetailRoute('button', 'kitchen', 'w-1')).toBeUndefined()
    expect(instanceDetailRoute('nonesuch', 'kitchen', 'w-1')).toBeUndefined()
  })

  it('starts a log widget where its readers fall back to', () => {
    const def = widgets.find((d) => d.type === 'log')
    expect(def?.defaultConfig().source).toBe(logSourceOf(undefined))
    expect(def?.defaultConfig().minLevel).toBe(logMinLevelOf(undefined))
    expect(def?.defaultConfig().keep).toBe(logKeepOf(undefined))
    expect(def?.itemKeys).toBeUndefined()
    expect(instanceCommands('log', {})).toBe(false)
  })

  it('lets an instance ask for the stacked height its own settings need', () => {
    const off = instanceMinHeight('color', { powerButtons: false })
    const on = instanceMinHeight('color', { powerButtons: true })
    expect(off).toBeGreaterThan(0)
    expect(on).toBeGreaterThan(off)
    expect(instanceMinHeight('color', { powerButtons: 'yes' })).toBe(off)
  })

  it('starts a thermostat as the look its reader falls back to, and asks for a taller row with its button row', () => {
    const def = widgets.find((d) => d.type === 'thermostat')
    expect(def?.defaultConfig().look).toBe(thermostatLookOf(undefined))
    const bare = instanceMinHeight('thermostat', { currentItem: 'a', setpointItem: 'b' })
    expect(bare).toBeGreaterThan(0)
    expect(instanceMinHeight('thermostat', { currentItem: 'a', setpointItem: 'b', modeItem: 'm' })).toBeGreaterThan(bare)
  })

  it('starts a battery where its readers fall back to, reads both its items and commands neither', () => {
    const def = widgets.find((d) => d.type === 'battery')
    expect(def?.defaultConfig().style).toBe(batteryStyleOf(undefined))
    expect(def?.defaultConfig().colorMode).toBe(batteryColorModeOf(undefined))
    expect(def?.defaultConfig()).toMatchObject({ min: 0, max: 100, showText: true })
    expect(itemsForInstance('battery', { item: 'cell', chargingItem: 'plug' })).toEqual(['cell', 'plug'])
    expect(itemsForInstance('battery', { item: 'cell' })).toEqual(['cell'])
    expect(instanceCommands('battery', { item: 'cell', chargingItem: 'plug' })).toBe(false)
    expect(instanceControl('battery', { item: 'cell', chargingItem: 'plug' }, 'cell')).toBeUndefined()
    expect(instanceHasDetail('battery', { item: 'cell' })).toBe(true)
    expect(readOnlyItems(def!)).toEqual(['nh_item', 'nh_chargingItem'])
  })

  it('starts a slider as the style its reader falls back to, and asks for a taller row on end', () => {
    const def = widgets.find((d) => d.type === 'slider')
    expect(def?.defaultConfig().style).toBe(sliderStyleOf(undefined))
    expect(def?.defaultConfig().orient).toBe(sliderOrientOf(undefined))
    const flat = instanceMinHeight('slider', { item: 'x' })
    expect(flat).toBeGreaterThan(0)
    expect(instanceMinHeight('slider', { item: 'x', orient: 'vertical' })).toBeGreaterThan(flat)
  })

  it('resolves a definition default before asking the widget', () => {
    expect(instanceMinHeight('color', {})).toBe(instanceMinHeight('color', { powerButtons: true }))
    expect(instanceControl('color', { item: 'X' }, 'X')).toEqual({ kind: 'color', power: true })
    expect(instanceControl('color', { item: 'X', powerButtons: false }, 'X')).toEqual({ kind: 'color' })
  })

  it('answers a plain number, and nothing at all for a type it does not know', () => {
    const fixed = widgets.filter((d) => typeof d.minPixelHeight === 'number')
    expect(fixed.length).toBeGreaterThan(0)
    for (const def of fixed) expect(instanceMinHeight(def.type, {})).toBe(def.minPixelHeight)
    expect(instanceMinHeight('label', {})).toBe(0)
    expect(instanceMinHeight('nonesuch', {})).toBe(0)
  })

  it('makes every address field say whether the page loads it', () => {
    const undecided: string[] = []
    let decided = 0
    for (const def of widgets) {
      for (const field of def.settings ?? []) {
        if (field.type !== 'text') continue
        const addressy = /\bURL\b|\baddress\b/i.test(field.label) || /^https?:\/\//i.test(field.placeholder ?? '')
        if (!addressy) continue
        if (field.subresource === undefined) undecided.push(`${def.type}.${field.key} (${field.label})`)
        else decided++
      }
    }
    expect(undecided).toEqual([])
    expect(decided).toBeGreaterThan(4)
    const all = widgets.flatMap((d) => (d.settings ?? []).filter((f) => f.type === 'text'))
    expect(all.some((f) => f.subresource === true)).toBe(true)
    expect(all.some((f) => f.subresource === false)).toBe(true)
  })

  it('gives every field a key and a label, and never the same key twice', () => {
    const bad: string[] = []
    for (const def of widgets) {
      const seen = new Set<string>()
      for (const field of def.settings ?? []) {
        if (!field.key) bad.push(`${def.type}: a field with no key`)
        if (!field.label) bad.push(`${def.type}.${field.key}: no label`)
        if (seen.has(field.key)) bad.push(`${def.type}.${field.key}: declared twice`)
        seen.add(field.key)
      }
    }
    expect(bad).toEqual([])
  })
})
