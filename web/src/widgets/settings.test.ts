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
import { lookOf as thermostatLookOf } from './thermostat/model'
import { orientOf as sliderOrientOf, styleOf as sliderStyleOf } from './slider/model'
import { keepOf as logKeepOf, minLevelOf as logMinLevelOf, sourceSetting as logSourceOf } from './log/model'

// The registry is a tree of .tsx modules, so importing it drags in React and i18next even though
// only the settings DATA is read here. i18next touches `document` when it activates a language.
// Two stubs keep this in the DOM-free unit tier instead of pulling in jsdom for a schema check.
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
  instanceMinHeight,
  itemsForInstance,
  listWidgetDefinitions
} = await import('./registry')

registerBuiltinWidgets()
const widgets = listWidgetDefinitions()

/** Keys SettingsPanel adds itself, for every widget, after the widget's own fields. */
const UNIVERSAL_KEYS = ['labelMode', 'labelAlign', 'labelPosition', 'accent', 'accentColor', 'textSize', 'hideOn']

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

/** The items a widget declares it only READS (`readOnly` on the field), as `boundConfig` names them. */
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

  /**
   * The name a widget carries is called the same thing everywhere, and every widget that has one
   * can be told not to draw it - that consistency was reported missing (one widget said "Label"
   * where the rest said "Name", and only two of twenty offered a way to hide it). Both halves are
   * mechanical, so they are checked rather than remembered.
   */
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
    // The panel appends the choice to every hasHeader widget, so what has to hold here is that
    // a widget claiming a header really does declare a name to hide.
    const headerless = widgets.filter((def) => def.hasHeader && !(def.settings ?? []).some((f) => f.key === 'label'))
    expect(headerless.map((d) => d.type)).toEqual([])
    // ...and that an extra choice never shadows one of the two the panel always offers.
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
    expect(instanceCommands('thermostat', { currentItem: 'x', setpointItem: 'y' })).toBe(true)
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
    const silent = widgets.filter((def) => instanceCommands(def.type, boundConfig(def)) && !def.controlFor).map((def) => def.type)
    expect(silent).toEqual([])
  })

  it('offers a control for every item a commandable instance binds', () => {
    const missing: string[] = []
    for (const def of widgets) {
      const config = boundConfig(def)
      if (!instanceCommands(def.type, config)) continue
      // An item the widget declares read-only is bound to be read, not written - the converse
      // check below holds those to offering nothing.
      const readOnly = readOnlyItems(def)
      for (const item of itemsForInstance(def.type, config)) {
        if (readOnly.includes(item)) continue
        if (!instanceControl(def.type, config, item)) missing.push(`${def.type} binds ${item} and offers nothing`)
      }
    }
    expect(missing).toEqual([])
  })

  /**
   * The other half of that declaration: a thermostat's room temperature is a sensor its tile
   * never commands, and a hold on the tile must not hand out a slider for it. The check requires
   * the declaration to be in use somewhere, or a widget that dropped its `readOnly` flags would
   * leave nothing here to fail.
   */
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
      unit: ' K'
    })
    // A dial, per ring - and nothing for a marker item it only reads.
    const dial = { item: 'x', item2: 'y', min: 10, max: 30, step: 0.5, min2: 0, max2: 5, markers: [{ item: 'm' }] }
    expect(instanceControl('dial', dial, 'x')).toMatchObject({ kind: 'range', min: 10, max: 30, step: 0.5 })
    expect(instanceControl('dial', dial, 'y')).toMatchObject({ kind: 'range', min: 0, max: 5 })
    expect(instanceControl('dial', dial, 'm')).toBeUndefined()
    // A transport, which no state shape could have produced.
    expect(instanceControl('player', { item: 'x' }, 'x')).toMatchObject({ kind: 'choices' })
    expect((instanceControl('player', { item: 'x' }, 'x') as { choices: { command: string }[] }).choices.map((c) => c.command)).toEqual([
      'PREVIOUS',
      'PLAY',
      'PAUSE',
      'NEXT'
    ])
    // Up/stop/down: a rollershutter's state is a percentage, and dragging one on a garage door
    // moves a real door.
    expect(
      (instanceControl('rollershutter', { item: 'x' }, 'x') as { choices: { command: string }[] }).choices.map((c) => c.command)
    ).toEqual(['UP', 'STOP', 'DOWN'])
    // The author's own choices, with their own labels, never translated.
    expect(instanceControl('selection', { item: 'x', choices: 'HDMI1=Apple TV\nHDMI2=Xbox' }, 'x')).toEqual({
      kind: 'choices',
      choices: [
        { command: 'HDMI1', label: 'Apple TV' },
        { command: 'HDMI2', label: 'Xbox' }
      ]
    })
    // No manual list: the same command options the widget itself falls back to.
    expect(instanceControl('selection', { item: 'x' }, 'x')).toEqual({ kind: 'auto' })
    // Whatever this switch calls on and off.
    expect(instanceControl('switch', { item: 'x', onCommand: 'OPEN', offCommand: 'CLOSE' }, 'x')).toEqual({
      kind: 'onoff',
      on: 'OPEN',
      off: 'CLOSE'
    })
    expect(instanceControl('switch', { item: 'x' }, 'x')).toEqual({ kind: 'onoff', on: 'ON', off: 'OFF' })
    // A button sends what it was configured to send. Its alternate command is dead unless the
    // button toggles, so a plain one offers exactly the command it sends and no more.
    expect(instanceControl('button', { item: 'x', command: '55', commandAlt: '0' }, 'x')).toEqual({
      kind: 'choices',
      choices: [{ command: '55', label: '55' }]
    })
    expect(instanceControl('button', { item: 'x', command: '55', commandAlt: '0', toggle: true }, 'x')).toEqual({
      kind: 'choices',
      choices: [
        { command: '55', label: '55' },
        { command: '0', label: '0' }
      ]
    })
    expect(instanceControl('button', { item: 'x', command: 'ON', commandAlt: '', toggle: true }, 'x')).toMatchObject({
      choices: [{ command: 'ON' }]
    })
    expect(instanceControl('button', { item: 'x', command: 'ON', action: 'navigate' }, 'x')).toBeUndefined()
    // A read-only gauge is an instrument: it offers nothing, whatever its scale says.
    expect(instanceControl('dial', { item: 'x', readOnly: true }, 'x')).toBeUndefined()
    // A colour picker even when the item is NULL and has no colour to read a shape from, and its
    // on/off buttons by default, so a long press offers what the tile draws.
    expect(instanceControl('color', { item: 'x' }, 'x')).toEqual({ kind: 'color', power: true })
    expect(instanceControl('color', { item: 'x', powerButtons: true }, 'x')).toEqual({ kind: 'color', power: true })
    // Anything but `true` leaves them off, which is what unticking the box stores.
    for (const stored of [false, 'true', 1, null, undefined]) {
      expect(instanceControl('color', { item: 'x', powerButtons: stored }, 'x')).toEqual({ kind: 'color' })
    }
    // A plan's lights are whatever the house has, and only the state can say.
    const plan = { lights: [{ item: 'lamp' }] }
    expect(instanceControl('floorplan', plan, 'lamp')).toEqual({ kind: 'auto' })
    expect(instanceControl('floorplan', plan, 'other')).toBeUndefined()
    // A thermostat: the setpoint on its own scale (the Celsius defaults here, with no item state
    // or configured range to read), the mode and the fan as the two commands each was given, aux
    // as on and off - and nothing at all for the two items it only reads.
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
    // The gesture is armed from this one question, so what it answers IS the feature: a widget
    // with an item opens that item, a widget with a view of its own opens the view, and one with
    // neither keeps the browser's context menu rather than an empty sheet. Weather and clock are
    // named because they are the two that had nothing and were reported as broken.
    expect(instanceHasDetail('weather', { source: 'openmeteo', location: { lat: 1, lon: 2 } })).toBe(true)
    expect(instanceHasDetail('clock', { mode: 'digital' })).toBe(true)
    // A log tile answers with a page rather than a sheet, and the gesture is armed for it too.
    expect(instanceHasDetail('log', {})).toBe(true)
    expect(instanceHasDetail('switch', { item: 'x' })).toBe(true)
    // Nothing configured yet, and nothing of its own to draw.
    expect(instanceHasDetail('switch', {})).toBe(false)
    expect(instanceHasDetail('label', { text: 'Kitchen' })).toBe(false)
    expect(instanceHasDetail('image', { url: 'x.png' })).toBe(false)
    // A type that is not registered at all cannot be held either.
    expect(instanceHasDetail('nonesuch', {})).toBe(false)
  })

  it('offers the gesture on every widget that declares a view or a page, whatever its config', () => {
    // A view nothing can open is a view nobody sees. Driven with an EMPTY config on purpose: a
    // widget with a view of its own has to answer before anything is configured, which is the
    // difference between the two questions the gesture used to conflate.
    const declaring = widgets.filter((d) => d.DetailView || d.detailRoute)
    expect(declaring.length).toBeGreaterThan(0)
    const unreachable = declaring.filter((d) => !instanceHasDetail(d.type, {})).map((d) => d.type)
    expect(unreachable).toEqual([])
  })

  it('sends a hold on a log tile to the full-screen log route, and a hold on the rest to the sheet', () => {
    // The route carries both ids, since the page reads the widget's own settings back out of the
    // dashboard; a widget with a sheet answers no route at all, which is what keeps it a sheet.
    expect(instanceDetailRoute('log', 'kitchen', 'w-1')).toEqual({ name: 'log', dashboard: 'kitchen', widget: 'w-1' })
    expect(instanceDetailRoute('weather', 'kitchen', 'w-1')).toBeUndefined()
    expect(instanceDetailRoute('switch', 'kitchen', 'w-1')).toBeUndefined()
    expect(instanceDetailRoute('nonesuch', 'kitchen', 'w-1')).toBeUndefined()
  })

  it('starts a log widget where its readers fall back to', () => {
    // A default that drifted from its reader would draw one source and offer another in the form.
    const def = widgets.find((d) => d.type === 'log')
    expect(def?.defaultConfig().source).toBe(logSourceOf(undefined))
    expect(def?.defaultConfig().minLevel).toBe(logMinLevelOf(undefined))
    expect(def?.defaultConfig().keep).toBe(logKeepOf(undefined))
    // It binds no item, so the sheet's questions about commanding do not arise.
    expect(def?.itemKeys).toBeUndefined()
    expect(instanceCommands('log', {})).toBe(false)
  })

  it('lets an instance ask for the stacked height its own settings need', () => {
    // The floor is the only lever a widget has over a stacked row, and a colour picker showing
    // its on and off buttons needs more room than one without them. Both answers are read from
    // the registry rather than from the widget module, so a definition that stopped declaring it
    // would fail here.
    const off = instanceMinHeight('color', { powerButtons: false })
    const on = instanceMinHeight('color', { powerButtons: true })
    expect(off).toBeGreaterThan(0)
    expect(on).toBeGreaterThan(off)
    // Only `true` switches the buttons on, so only `true` may ask for the taller row.
    expect(instanceMinHeight('color', { powerButtons: 'yes' })).toBe(off)
  })

  it('starts a thermostat as the look its reader falls back to, and asks for a taller row with its button row', () => {
    // The pure half of both rules is in thermostat/model.test.ts; this is the definition half,
    // read through the registry, which is what the grids and the sheet actually ask.
    const def = widgets.find((d) => d.type === 'thermostat')
    expect(def?.defaultConfig().look).toBe(thermostatLookOf(undefined))
    const bare = instanceMinHeight('thermostat', { currentItem: 'a', setpointItem: 'b' })
    expect(bare).toBeGreaterThan(0)
    expect(instanceMinHeight('thermostat', { currentItem: 'a', setpointItem: 'b', modeItem: 'm' })).toBeGreaterThan(bare)
  })

  it('starts a slider as the style its reader falls back to, and asks for a taller row on end', () => {
    // The pure half of both rules is in slider/model.test.ts; this is the definition half, read
    // through the registry, which is what the grids and the settings panel actually ask. A
    // default that drifted from its reader would draw one style and offer another in the form.
    const def = widgets.find((d) => d.type === 'slider')
    expect(def?.defaultConfig().style).toBe(sliderStyleOf(undefined))
    expect(def?.defaultConfig().orient).toBe(sliderOrientOf(undefined))
    const flat = instanceMinHeight('slider', { item: 'x' })
    expect(flat).toBeGreaterThan(0)
    // A fader needs travel, and a stacked row is the only place a widget can ask for it.
    expect(instanceMinHeight('slider', { item: 'x', orient: 'vertical' })).toBeGreaterThan(flat)
  })

  it('resolves a definition default before asking the widget', () => {
    // The grids hand these readers a stored config and the detail sheet hands them a merged one,
    // so the merge belongs here or the two disagree: a picker that stores nothing draws the
    // buttons, and the row beneath it has to be the height that fits them.
    expect(instanceMinHeight('color', {})).toBe(instanceMinHeight('color', { powerButtons: true }))
    expect(instanceControl('color', { item: 'X' }, 'X')).toEqual({ kind: 'color', power: true })
    // And a stored key still wins over the default it is filling in for.
    expect(instanceControl('color', { item: 'X', powerButtons: false }, 'X')).toEqual({ kind: 'color' })
  })

  it('answers a plain number, and nothing at all for a type it does not know', () => {
    const fixed = widgets.filter((d) => typeof d.minPixelHeight === 'number')
    expect(fixed.length).toBeGreaterThan(0)
    for (const def of fixed) expect(instanceMinHeight(def.type, {})).toBe(def.minPixelHeight)
    // A widget that declares no floor, and a type that is not registered, both ask for none -
    // which is what the grids' `Math.max` expects rather than NaN or undefined.
    expect(instanceMinHeight('label', {})).toBe(0)
    expect(instanceMinHeight('nonesuch', {})).toBe(0)
  })

  /**
   * An address the page LOADS cannot be `http://` while the page is `https://`: the browser
   * blocks it without an error anyone can catch, so the widget draws an empty frame or a dead
   * stream. The settings form says so as the address is typed, but only for a field that has
   * declared itself one - and the fields that open an address in a NEW TAB (a button's navigate
   * target, a camera's tap target) are a navigation rather than mixed content, so warning about
   * those would be wrong.
   *
   * Neither answer is safe to leave to a default, so a field whose label reads like an address
   * has to say which it is. The cost of forgetting is this check, not a widget that quietly
   * misleads somebody.
   */
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
    // Both answers are really used, or the check would be satisfied by a registry that always
    // says the same thing.
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
