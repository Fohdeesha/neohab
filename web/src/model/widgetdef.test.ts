import { describe, expect, it } from 'vitest'
import { coerceSettingValue, mergedSettingValues, settingChoices, settingKind, type CustomWidgetDef } from './widgetdef'

describe('custom widget settings', () => {
  it("reads HABPanel's own type names as the kinds they are", () => {
    expect(settingKind({ id: 'a', type: 'checkbox' })).toBe('boolean')
    expect(settingKind({ id: 'a', type: 'choice' })).toBe('choices')
    expect(settingKind({ id: 'a', type: 'color' })).toBe('color')
    expect(settingKind({ id: 'a' })).toBe('string')
  })

  it('gives a checkbox stored as the string "false" to a template as false', () => {
    expect(coerceSettingValue({ id: 'a', type: 'checkbox' }, 'false')).toBe(false)
    expect(coerceSettingValue({ id: 'a', type: 'checkbox' }, 'true')).toBe(true)
    const def: CustomWidgetDef = { version: 1, id: 'x', name: 'X', habpanel: { settings: [{ id: 'show', type: 'checkbox' }] } }
    expect(mergedSettingValues(def, { show: 'false' }).show).toBe(false)
  })

  it('reads choices written the HABPanel way, and ignores anything else in the field', () => {
    expect(settingChoices({ id: 'a', choices: 'Low, Medium ,High,,Low' })).toEqual(['Low', 'Medium', 'High'])
    expect(settingChoices({ id: 'a', choices: ['A', 5, 'B'] })).toEqual(['A', 'B'])
    expect(settingChoices({ id: 'a', choices: { a: 1 } })).toEqual([])
  })
})
