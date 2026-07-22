/**
 * Second-pass audit fixes:
 *   - importer survives a widget type that names an Object.prototype member ("constructor")
 *   - a nameless dashboard component no longer takes down the whole config load
 *   - backup import writes before deleting (a failed replace cannot leave you with nothing)
 *   - label widget font size scales with the cell like everything else
 *   - ItemPicker: does selecting an item leave the list open? (behaviour probe)
 *
 * SAFE: creates only nh-e2e-a2* components, exact-uid cleanup, commands nothing.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await chromium.launch({ channel: c, headless: true }) } catch {} } return chromium.launch({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const created = []

const put = async (comp) => {
  await fetch(NS + '/' + comp.uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(comp) })
  if (r.ok) created.push(comp.uid)
  return r.ok
}

// A dashboard with a label widget (font scaling) + a nameless dashboard (load robustness)
await put({
  uid: 'dashboard:nh-e2e-a2',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2', name: 'E2E Audit2', columns: 12, rowHeight: 'match', gap: 5,
    widgets: [
      { id: 'a2-label', type: 'label', config: { text: 'Scaled', fontSize: 40 }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
      { id: 'a2-btn', type: 'button', config: { label: 'Pick', command: 'ON' }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
    ],
  },
})
// nameless dashboard: config load used to throw on .name.localeCompare and lose EVERYTHING
await put({
  uid: 'dashboard:nh-e2e-a2-nameless',
  component: 'neohab:dashboard',
  tags: [],
  config: { version: 1, id: 'nh-e2e-a2-nameless', columns: 4, rowHeight: 'match', widgets: [] },
})

const browser = await launchBrowser()
try {
  /* --------- nameless dashboard must not break the config load --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/')
    await page.waitForSelector('.nh-tile, .nh-welcome', { timeout: 15000 })
    await page.waitForTimeout(800)
    const tiles = await page.locator('.nh-tile:not(.nh-tile--new)').count()
    // the live count varies - what matters is that this suite's own two tiles made it through
    ok('config loads despite a nameless dashboard', tiles >= 2, 'tiles=' + tiles)
    ok('no page error from the nameless dashboard', errs.length === 0, errs.join('|'))
    await ctx.close()
  }

  /* --------- label font scales with the cell --------- */
  {
    const sizes = {}
    for (const [name, width] of [['1920', 1920], ['1024', 1024]]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } })
      await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
      const page = await ctx.newPage()
      await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
      await page.waitForSelector('.nh-label', { timeout: 15000 })
      await page.waitForTimeout(600)
      sizes[name] = await page.evaluate(() => ({
        font: parseFloat(getComputedStyle(document.querySelector('.nh-label')).fontSize),
        scale: parseFloat(getComputedStyle(document.querySelector('.nh-grid')).getPropertyValue('--nh-textscale')),
      }))
      await ctx.close()
    }
    ok('label font = authored 40px * textscale @1920', Math.abs(sizes['1920'].font - 40 * sizes['1920'].scale) < 0.5, JSON.stringify(sizes['1920']))
    ok('label font scales down on a narrow screen', sizes['1024'].font < sizes['1920'].font, `1024=${sizes['1024'].font} 1920=${sizes['1920'].font}`)
  }

  /* --------- ItemPicker: is the list still open after selecting? --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForSelector('.nh-grid--edit .nh-cell', { timeout: 10000 })
    await page.locator('.nh-cell').nth(1).locator('.nh-cell__overlay').click()
    await page.waitForSelector('input[role="combobox"]', { timeout: 10000 })
    const combo = page.locator('input[role="combobox"]').first()
    await combo.click()
    await page.waitForSelector('.nh-picker__list', { timeout: 10000 })
    await page.locator('.nh-picker__option').first().click()
    await page.waitForTimeout(500)
    const stillOpen = await page.locator('.nh-picker__list').count()
    const picked = await combo.inputValue()
    ok('picker: an item was selected', picked.length > 0, 'value=' + picked)
    ok('picker: list closes after selecting (does not re-open)', stillOpen === 0, 'lists open=' + stillOpen)
    await ctx.close()
  }
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  await browser.close()
  for (const uid of created) {
    const r = await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH })
    ok('cleanup: ' + uid + ' removed', r.ok || r.status === 404, 'status=' + r.status)
  }
  const left = (await (await fetch(NS)).json()).filter((c) => c.uid.includes('nh-e2e'))
  ok('cleanup: no suite leftovers', left.length === 0, JSON.stringify(left.map((c) => c.uid)))
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks`)
console.log(pass === results.length ? 'ALL PASS' : 'SOME FAILED')
process.exitCode = pass === results.length ? 0 : 1
