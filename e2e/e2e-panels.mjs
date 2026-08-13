/**
 * Every widget's settings panel, checked as a class rather than one widget at a time.
 *
 * The panel is a fixed 340px column on a desktop, and a control that does not fit is not a
 * cosmetic problem: it is a control the user cannot reach. Both of these shipped in the floor
 * plan and both were reported rather than caught -
 *
 *   - the placement sheet's "Add" button was pushed off the panel's right edge, because the item
 *     picker wraps an <input>, whose min-content size is its default width, and a flex item is
 *     floored at that;
 *   - the plan image field was crushed to a few characters, because the row that is comfortable
 *     in the 720px Settings form has no room for everything on one line here.
 *
 * A select with nothing selected renders BLANK (SettingsPanel adds an empty placeholder row when
 * no option matches), which reads as broken; the schema half of that rule is a unit check, and
 * this is the rendered half - it also covers the universal fields the panel appends itself.
 *
 * The widget list comes from the palette, so a widget added later is covered without touching
 * this file.
 *
 * SAFE with a live config: creates and deletes exactly dashboard:nh-e2e-panels, saves NOTHING
 * through the app (so no restore point is minted), and commands nothing - every widget is added
 * unconfigured, with no item bound.
 */
import { chromium } from 'playwright-core'
import { APP, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-panels'
const PANEL_MIN_CONTROL = 110 // px: narrower than this is a box you cannot read or type into

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => ({}))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

/**
 * Runs IN THE PAGE. Reports every control in the settings panel that is outside the panel's
 * content box, too narrow to use, or - for a select - showing an empty row because nothing it
 * offers matches the value in effect.
 */
const measurePanel = (min) => {
  const panel = document.querySelector('.nh-sheet')
  if (!panel) return null
  const pr = panel.getBoundingClientRect()
  const cs = getComputedStyle(panel)
  const inner = { left: pr.left + (parseFloat(cs.paddingLeft) || 0), right: pr.right - (parseFloat(cs.paddingRight) || 0) }
  const label = (el) => {
    const field = el.closest('.nh-field, .nh-chartcard__cell, label')
    return field?.querySelector('.nh-field__label')?.textContent?.trim() || el.id || el.tagName.toLowerCase()
  }
  const clipped = []
  const crushed = []
  const blank = []
  const controls = [...panel.querySelectorAll('input, select, textarea, button')]
  for (const el of controls) {
    if (el.type === 'hidden' || el.type === 'file' || el.hidden) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue // not rendered
    if (r.right > inner.right + 1 || r.left < inner.left - 1) {
      clipped.push(`${label(el)} (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(inner.left)}..${Math.round(inner.right)})`)
    }
    // a box you type into has to be wide enough to read; checkboxes, colour swatches and icon
    // buttons are meant to be small
    const typed =
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      (el.tagName === 'INPUT' && ['text', 'number', 'search', 'url', ''].includes(el.type))
    if (typed && r.width < min) crushed.push(`${label(el)} ${Math.round(r.width)}px`)
    if (el.tagName === 'SELECT' && el.selectedOptions[0] && el.selectedOptions[0].textContent.trim() === '') {
      blank.push(label(el))
    }
  }
  return { controls: controls.length, overflow: panel.scrollWidth - panel.clientWidth, clipped, crushed, blank }
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // Name the resource - "Failed to load resource" alone is a failure nobody can act on - and
  // ignore the ones that belong to the user's own configuration. The palette lists their custom
  // widgets, whose icons legitimately point at iconsets and hosts this server does not have.
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark') // assert against the default theme's metrics
  } catch {}
}, TOKEN)

try {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: 'nh-e2e-panels', name: 'E2E Panels', columns: 12, rowHeight: 'match', widgets: [] },
    }),
  })
  ok('seed dashboard created', seed.status === 200 || seed.status === 201, 'status ' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-panels')
  await page.waitForSelector('.nh-dash', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-editbar, .nh-dash__bar', { timeout: 15000 }).catch(() => {})
  await sleep(600)

  // the palette IS the registry's own list, so this covers widgets added later too
  await page.click('[aria-label="Add widget"], button:has-text("+") >> nth=0')
  await page.waitForSelector('.nh-palette__card', { timeout: 10000 })
  const names = await page.$$eval('.nh-palette .nh-palette__card .nh-palette__name', (els) => els.map((e) => e.textContent.trim()))
  ok('the palette offers the built-in widgets', names.length >= 15, names.length + ' cards')
  await page.keyboard.press('Escape').catch(() => {})
  await page.click('.nh-dash__surface', { position: { x: 5, y: 5 } }).catch(() => {})
  await sleep(300)

  const offenders = { clipped: [], crushed: [], blank: [], overflow: [] }
  let inspected = 0
  const record = (name, m) => {
    if (m.clipped.length) offenders.clipped.push(`${name}: ${m.clipped.join('; ')}`)
    if (m.crushed.length) offenders.crushed.push(`${name}: ${m.crushed.join('; ')}`)
    if (m.blank.length) offenders.blank.push(`${name}: ${m.blank.join('; ')}`)
    if (m.overflow > 1) offenders.overflow.push(`${name}: ${m.overflow}px`)
  }

  for (const name of names) {
    // add this widget, then open its panel by clicking the new cell's handle
    await page.click('[aria-label="Add widget"], button:has-text("+") >> nth=0').catch(() => {})
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 }).catch(() => {})
    await page.click(`.nh-palette__card:has(.nh-palette__name:text-is(${JSON.stringify(name)}))`, { timeout: 8000 }).catch(() => {})
    await sleep(500)
    const cells = await page.locator('.nh-grid--edit .nh-cell').count()
    if (cells === 0) continue
    await page.click(`.nh-grid--edit .nh-cell >> nth=${cells - 1} >> .nh-cell__grip`).catch(() => {})
    await sleep(450)

    const m = await probe(page, measurePanel, PANEL_MIN_CONTROL)
    if (!m || !m.controls) continue
    inspected++
    record(name, m)

    // A field's chrome can GROW with its value: the background field adds a thumbnail and a
    // clear button once an image is set, and that is the state in which it was crushed to a few
    // characters. An empty panel would have looked fine, so fill it and measure again.
    const bg = page.locator('.nh-sheet .nh-bgfield input[type="text"]')
    if (await bg.count()) {
      await bg.first().fill('https://example.invalid/plan.png')
      await sleep(350)
      const m2 = await probe(page, measurePanel, PANEL_MIN_CONTROL)
      if (m2 && m2.controls) record(name + ' (image set)', m2)
    }
  }

  ok('every widget was inspected', inspected >= names.length - 1, `${inspected} of ${names.length}`)
  ok('no control is pushed outside the settings panel', offenders.clipped.length === 0, offenders.clipped.slice(0, 4).join(' | '))
  ok(`no editable box is narrower than ${PANEL_MIN_CONTROL}px`, offenders.crushed.length === 0, offenders.crushed.slice(0, 4).join(' | '))
  ok('no select renders blank', offenders.blank.length === 0, offenders.blank.slice(0, 4).join(' | '))
  ok('the settings panel never scrolls sideways', offenders.overflow.length === 0, offenders.overflow.slice(0, 4).join(' | '))

  // the draft is thrown away: this suite must not write a dashboard full of unconfigured widgets
  await page.click('button:has-text("Exit")').catch(() => {})
  await sleep(800)
  const stored = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  ok('nothing was saved to the server', (stored?.config?.widgets ?? []).length === 0, 'widgets=' + (stored?.config?.widgets ?? []).length)

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} finally {
  await browser.close().catch(() => {})
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid === UID)
  ok('cleanup: dashboard removed', left.length === 0)

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
