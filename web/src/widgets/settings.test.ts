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
const { listWidgetDefinitions } = await import('./registry')

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
  dashboard: true,
  hideon: true,
  planimage: true,
  planlights: true,
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
