/**
 * Rules every widget's settings schema has to satisfy, checked across the whole registry rather
 * than one widget at a time.
 *
 * These are the mistakes that pass review and are obvious to whoever opens the panel:
 *
 *  - A select renders a BLANK row when no option matches the value in effect (SettingsPanel adds
 *    an empty placeholder in exactly that case). The floor plan shipped with a blank "Plan style"
 *    because the renderer defaulted to blueprint and `defaultConfig` did not, and the button
 *    widget shipped the same bug in July. It is mechanical, so it is checked here.
 *  - SettingsPanel appends its own universal fields to every widget. A widget declaring one of
 *    those keys would render the field twice, with two controls writing the same value.
 *  - A field the panel cannot render, or an option list with nothing in it, is a dead control.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SettingField } from './types'

// The registry is a tree of .tsx modules, so importing it drags in React and i18next even though
// only the settings DATA is read here. i18next touches `document` when it activates a language.
// Two stubs keep this in the DOM-free unit tier instead of pulling in jsdom for a schema check.
const noopEvents = { addEventListener: () => {}, removeEventListener: () => {} }
vi.stubGlobal('document', { ...noopEvents, documentElement: {}, visibilityState: 'visible' })
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
vi.stubGlobal('window', {
  ...noopEvents,
  location: { hash: '', search: '', pathname: '/neohab/', origin: 'http://localhost', href: 'http://localhost/neohab/' },
  matchMedia: () => ({ matches: false, ...noopEvents }),
})

const { registerBuiltinWidgets } = await import('./index')
const { instanceCommands, instanceControl, itemsForInstance, listWidgetDefinitions } = await import('./registry')

registerBuiltinWidgets()
const widgets = listWidgetDefinitions()

/** Keys SettingsPanel adds itself, for every widget, after the widget's own fields. */
const UNIVERSAL_KEYS = ['labelAlign', 'labelPosition', 'accent', 'accentColor', 'textSize', 'hideOn']

/**
 * Every field kind, with a case in SettingsPanel's switch to draw it. Typed as a Record over the
 * union, so ADDING a kind to SettingField stops compiling here until it is listed - which is the
 * moment to check that SettingsPanel can actually draw it. A kind the panel does not handle
 * renders nothing at all: a setting the user cannot see, let alone change.
 */
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
  gaugezones: true,
}

const effectiveOf = (def: (typeof widgets)[number]): Record<string, unknown> => ({
  ...(def.defaultConfig?.() as Record<string, unknown>),
})

/**
 * A widget's defaults with a distinctive name bound to every item-typed setting it declares, so
 * the registry-wide checks below have something to ask about. Widgets whose items come from a
 * list rather than a field (a plan's lights, a chart's series) bind nothing here and are covered
 * by the named cases instead.
 */
const boundConfig = (def: (typeof widgets)[number]): Record<string, unknown> => {
  const config = effectiveOf(def)
  for (const field of def.settings ?? []) if (field.type === 'item') config[field.key] = 'nh_' + field.key
  return config
}

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
        // this is SettingsPanel's own condition for drawing the empty placeholder row
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

  it('only uses field kinds the settings panel can draw', () => {
    const unknown: string[] = []
    for (const def of widgets) {
      for (const field of def.settings ?? []) {
        if (!RENDERABLE[field.type]) unknown.push(`${def.type}.${field.key}: ${field.type}`)
      }
    }
    expect(unknown).toEqual([])
  })

  /**
   * The detail sheet offers a control only where the widget commands its items, and a definition
   * that forgets to say so is read as "display" - which is safe, but silently drops a control the
   * widget should have had. Any widget binding items therefore has to answer, either way.
   */
  it('says whether it commands the items it binds', () => {
    const silent = widgets.filter((def) => def.itemKeys && !def.canCommand).map((def) => def.type)
    expect(silent).toEqual([])
  })

  /**
   * The answer that started this: a gauge whose author ticked "Read-only gauge" is a display, and
   * holding it must not hand out the slider the tile itself refuses to be. The same question
   * separates a readout from a control, whatever each is bound to.
   */
  it('answers per instance, not per widget type', () => {
    expect(instanceCommands('dial', { item: 'x' })).toBe(true)
    expect(instanceCommands('dial', { item: 'x', readOnly: true })).toBe(false)
    expect(instanceCommands('button', { item: 'x', action: 'command' })).toBe(true)
    expect(instanceCommands('button', { item: 'x', action: 'navigate' })).toBe(false)
    for (const display of ['value', 'stat', 'chart', 'timeline', 'compass', 'weather']) {
      expect(instanceCommands(display, { item: 'x' }), display).toBe(false)
    }
    for (const control of ['switch', 'slider', 'color', 'selection', 'rollershutter', 'player']) {
      expect(instanceCommands(control, { item: 'x' }), control).toBe(true)
    }
  })

  it('says no for a widget type nobody registered', () => {
    expect(instanceCommands('not-a-widget', {})).toBe(false)
  })

  /**
   * ...and WHICH control, which is the half that was missing. The sheet used to work it out from
   * the item's state, so a slider set to 2000-6500 K was handed a 0-100 track that commanded 47 to
   * a lamp, a rollershutter got a position slider instead of up/stop/down, and a media player got
   * no buttons at all. A widget that can command has to answer.
   */
  it('says which control it offers, not only that it offers one', () => {
    const silent = widgets
      .filter((def) => instanceCommands(def.type, boundConfig(def)) && !def.controlFor)
      .map((def) => def.type)
    expect(silent).toEqual([])
  })

  it('offers a control for every item a commandable instance binds', () => {
    const missing: string[] = []
    for (const def of widgets) {
      const config = boundConfig(def)
      if (!instanceCommands(def.type, config)) continue
      for (const item of itemsForInstance(def.type, config)) {
        if (!instanceControl(def.type, config, item)) missing.push(`${def.type} binds ${item} and offers nothing`)
      }
    }
    expect(missing).toEqual([])
  })

  /** A gauge's marker follows an item to draw a line on the face; the gauge never writes to it. */
  it('claims no item it does not bind', () => {
    const claimed: string[] = []
    for (const def of widgets) {
      const config = boundConfig(def)
      // The question the sheet actually asks, and only of a widget that commands anything at all.
      if (!instanceCommands(def.type, config)) continue
      const control = instanceControl(def.type, config, 'nh_not_bound_to_anything')
      if (control) claimed.push(`${def.type}: ${control.kind}`)
    }
    expect(claimed).toEqual([])
  })

  /**
   * Stored configuration is untrusted input, and a range control's numbers become a range input's
   * own attributes: a step of zero makes it inert, and a maximum below the minimum leaves nothing
   * to drag along.
   */
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

  /** The reports that started this, each as the control the widget actually asks for. */
  it('offers the widget its own control, whatever the item happens to hold', () => {
    // The slider's own scale, not 0-100.
    expect(instanceControl('slider', { item: 'x', min: 2000, max: 6500, step: 50, unit: ' K' }, 'x')).toEqual({
      kind: 'range',
      min: 2000,
      max: 6500,
      step: 50,
      unit: ' K',
    })
    // A dial, per ring - and nothing for a marker item it only reads.
    const dial = { item: 'x', item2: 'y', min: 10, max: 30, step: 0.5, min2: 0, max2: 5, markers: [{ item: 'm' }] }
    expect(instanceControl('dial', dial, 'x')).toMatchObject({ kind: 'range', min: 10, max: 30, step: 0.5 })
    expect(instanceControl('dial', dial, 'y')).toMatchObject({ kind: 'range', min: 0, max: 5 })
    expect(instanceControl('dial', dial, 'm')).toBeUndefined()
    // A transport, which no state shape could have produced.
    expect(instanceControl('player', { item: 'x' }, 'x')).toMatchObject({ kind: 'choices' })
    expect((instanceControl('player', { item: 'x' }, 'x') as { choices: { command: string }[] }).choices.map((c) => c.command))
      .toEqual(['PREVIOUS', 'PLAY', 'PAUSE', 'NEXT'])
    // Up/stop/down: a rollershutter's state is a percentage, and dragging one on a garage door
    // moves a real door.
    expect((instanceControl('rollershutter', { item: 'x' }, 'x') as { choices: { command: string }[] }).choices.map((c) => c.command))
      .toEqual(['UP', 'STOP', 'DOWN'])
    // The author's own choices, with their own labels, never translated.
    expect(instanceControl('selection', { item: 'x', choices: 'HDMI1=Apple TV\nHDMI2=Xbox' }, 'x')).toEqual({
      kind: 'choices',
      choices: [
        { command: 'HDMI1', label: 'Apple TV' },
        { command: 'HDMI2', label: 'Xbox' },
      ],
    })
    // No manual list: the same command options the widget itself falls back to.
    expect(instanceControl('selection', { item: 'x' }, 'x')).toEqual({ kind: 'auto' })
    // Whatever this switch calls on and off.
    expect(instanceControl('switch', { item: 'x', onCommand: 'OPEN', offCommand: 'CLOSE' }, 'x')).toEqual({
      kind: 'onoff',
      on: 'OPEN',
      off: 'CLOSE',
    })
    expect(instanceControl('switch', { item: 'x' }, 'x')).toEqual({ kind: 'onoff', on: 'ON', off: 'OFF' })
    // A button sends what it was configured to send. Its alternate command is dead unless the
    // button toggles, so a plain one offers exactly the command it sends and no more.
    expect(instanceControl('button', { item: 'x', command: '55', commandAlt: '0' }, 'x')).toEqual({
      kind: 'choices',
      choices: [{ command: '55', label: '55' }],
    })
    expect(instanceControl('button', { item: 'x', command: '55', commandAlt: '0', toggle: true }, 'x')).toEqual({
      kind: 'choices',
      choices: [
        { command: '55', label: '55' },
        { command: '0', label: '0' },
      ],
    })
    expect(instanceControl('button', { item: 'x', command: 'ON', commandAlt: '', toggle: true }, 'x')).toMatchObject({
      choices: [{ command: 'ON' }],
    })
    expect(instanceControl('button', { item: 'x', command: 'ON', action: 'navigate' }, 'x')).toBeUndefined()
    // A read-only gauge is an instrument: it offers nothing, whatever its scale says.
    expect(instanceControl('dial', { item: 'x', readOnly: true }, 'x')).toBeUndefined()
    // A colour picker even when the item is NULL and has no colour to read a shape from.
    expect(instanceControl('color', { item: 'x' }, 'x')).toEqual({ kind: 'color' })
    // A plan's lights are whatever the house has, and only the state can say.
    const plan = { lights: [{ item: 'lamp' }] }
    expect(instanceControl('floorplan', plan, 'lamp')).toEqual({ kind: 'auto' })
    expect(instanceControl('floorplan', plan, 'other')).toBeUndefined()
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
