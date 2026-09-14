import { expect, it, vi } from 'vitest'
// suffixed, or the Italian catalog would import as `it` and shadow vitest's own
import deCatalog from './de.json'
import { TOKEN_SPECS } from '../themes/tokens'
import { CONTRAST_PAIRS } from '../themes/contrast'

/*
 * These labels reach the screen as t(someVariable) - a widget's field, a theme token's name, a
 * readability row - so no extractor can see them and nothing else checks they were ever
 * translated. They are the strings most likely to be forgotten, because adding one means editing a
 * widget or a token list rather than a catalog: 18 of the 19 token names had never been translated
 * at all when this check was written.
 *
 * German stands in for all six: catalogs.test.ts already requires the others to hold exactly the
 * same keys.
 */

const noopEvents = { addEventListener: () => {}, removeEventListener: () => {} }
vi.stubGlobal('document', { ...noopEvents, documentElement: {}, visibilityState: 'visible' })
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
vi.stubGlobal('window', {
  ...noopEvents,
  location: { hash: '', search: '', pathname: '/neohab/', origin: 'http://localhost', href: 'http://localhost/neohab/' },
  matchMedia: () => ({ matches: false, ...noopEvents })
})

const { registerBuiltinWidgets } = await import('../widgets/index')
const { listWidgetDefinitions } = await import('../widgets/registry')
registerBuiltinWidgets()

const translated = new Set(Object.keys(deCatalog).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')))

/*
 * Field and group labels only. A select's OPTIONS are a different population: most of them are
 * codes and product names that must not be translated (1h, 7d, HLS, MJPEG, go2rtc, ECMWF), and
 * telling those from prose needs a heuristic that would be wrong about the next one added.
 */
it('translates every field and group label a widget puts on the settings panel', () => {
  const widgets = listWidgetDefinitions()
  expect(widgets.length).toBeGreaterThan(15)

  const missing: string[] = []
  let checked = 0
  for (const def of widgets) {
    for (const field of def.settings ?? []) {
      checked++
      if (!translated.has(field.label)) missing.push(`${def.type}.${field.key}: ${JSON.stringify(field.label)}`)
    }
  }
  expect(missing).toEqual([])
  expect(checked).toBeGreaterThan(200)
})

it('translates every name the theme editor puts on a token', () => {
  expect(TOKEN_SPECS.length).toBeGreaterThan(15)
  const missing = TOKEN_SPECS.filter((spec) => !translated.has(spec.label)).map((spec) => `${spec.key}: ${spec.label}`)
  expect(missing).toEqual([])
})

it('translates every row of the theme editor’s readability panel', () => {
  expect(CONTRAST_PAIRS.length).toBeGreaterThan(3)
  const missing = CONTRAST_PAIRS.filter((pair) => !translated.has(pair.label)).map((pair) => pair.label)
  expect(missing).toEqual([])
})
