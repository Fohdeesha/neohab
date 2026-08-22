/**
 * Every icon name the condition tables can produce must exist in the bundled Meteocons pack,
 * in BOTH drawing styles the widget offers (line, and the "-fill" variant). A name that does
 * not exist renders as a hidden broken image - a widget that silently shows no icon for one
 * particular weather condition, which nobody notices until that weather happens.
 *
 * Read from the @iconify-json source package (what stage-assets.mjs stages from) rather than
 * the staged web/public copy, so the check runs on a fresh clone before any build.
 */
import { icons as meteocons } from '@iconify-json/meteocons'
import { describe, expect, it } from 'vitest'
import { OWM_ICON_CONDITIONS, OWM_ID_CONDITIONS, UNKNOWN_ICON, WMO_CONDITIONS } from './model'

const names = new Set(Object.keys(meteocons.icons))

function allTableIcons(): string[] {
  const out = new Set<string>([UNKNOWN_ICON])
  for (const spec of WMO_CONDITIONS.values()) {
    out.add(spec.day)
    out.add(spec.night)
  }
  for (const spec of OWM_ICON_CONDITIONS.values()) {
    out.add(spec.day)
    out.add(spec.night)
  }
  for (const spec of OWM_ID_CONDITIONS.values()) {
    out.add(spec.day)
    out.add(spec.night)
  }
  return [...out]
}

describe('weather condition icons', () => {
  it('has the Meteocons pack to check against', () => {
    expect(names.size).toBeGreaterThan(400)
  })

  it('exist in the pack in the line style', () => {
    const missing = allTableIcons().filter((n) => !names.has(n))
    expect(missing).toEqual([])
  })

  it('exist in the pack in the fill style', () => {
    const missing = allTableIcons().filter((n) => !names.has(n + '-fill'))
    expect(missing).toEqual([])
  })
})
