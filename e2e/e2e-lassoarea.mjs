/**
 * Lasso-below-the-grid fix verification.
 *
 * The reported repro: in edit mode, a lasso could not be started anywhere below the "Drag by the
 * handle" hint — that area was outside the grid (dead page background, .nh-dash never actually
 * filled the viewport). After the fix the edit grid stretches down to the hint, which itself
 * sits at the bottom of the page, so a marquee can start anywhere below the widgets.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-lasso and deletes exactly that uid in
 * cleanup (guarded). NO item commands anywhere — seeded widgets are clocks/labels only.
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-lasso'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()
const VP = { width: 1400, height: 950 }
const context = await browser.newContext({ viewport: VP })
const page = await context.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

const box = (sel) => page.locator(sel).first().boundingBox()

try {
  // ---------- seed ----------
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: 'nh-e2e-lasso', name: 'E2E Lasso', columns: 12, rowHeight: 40, gap: 8,
        widgets: [
          { id: 'w-a', type: 'clock', config: { showDate: false }, layout: { lg: { x: 0, y: 0, w: 2, h: 2 } } },
          { id: 'w-b', type: 'clock', config: { showDate: false }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
          { id: 'w-c', type: 'label', config: { text: 'C' }, layout: { lg: { x: 0, y: 3, w: 2, h: 2 } } },
        ],
      },
    }),
  })
  ok('seed', r.ok, String(r.status))

  await page.goto(APP + '#/d/nh-e2e-lasso', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.nh-grid', { timeout: 15000 })

  // ---------- run mode: the height chain fills the viewport, rows stay content-sized ----------
  const dash = await box('.nh-dash')
  ok('run: .nh-dash fills the viewport', dash && Math.abs(dash.height - VP.height) < 2, JSON.stringify(dash))
  const runGrid = await box('.nh-grid')
  ok('run: grid stays content-sized (no stretch in run mode)', runGrid && runGrid.height < 300, String(runGrid?.height))

  // ---------- edit mode: grid fills down to the hint, hint at the bottom ----------
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 5000 })

  const grid = await box('.nh-grid--edit')
  const hint = await box('.nh-dash__edithint')
  ok('edit: hint sits at the bottom of the page', hint && hint.y + hint.height > VP.height - 40, JSON.stringify(hint))
  ok('edit: grid fills down to the hint', grid && hint && hint.y - (grid.y + grid.height) < 24,
    `grid bottom ${grid && (grid.y + grid.height)}, hint top ${hint && hint.y}`)
  const cell = await box('.nh-cell')
  ok('edit: widget rows keep their fixed height', cell && Math.abs(cell.height - 88) < 2, String(cell?.height))

  // ---------- THE repro: lasso started from the empty area near the page bottom ----------
  // Press well below where the hint used to sit (the reported dead area), drag up over the widgets.
  const startX = 700, startY = VP.height - 80
  ok('repro press point is inside the (now stretched) grid',
    grid && startY > grid.y && startY < grid.y + grid.height && startY > (await (async () => 0)()),
    `press y ${startY}, grid ${grid && Math.round(grid.y)}..${grid && Math.round(grid.y + grid.height)}`)
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(500, 400, { steps: 5 })
  const midMarquee = await page.locator('.nh-marquee').count()
  const midBox = await box('.nh-marquee')
  await page.mouse.move(40, grid.y + 10, { steps: 8 })
  await page.mouse.up()
  ok('marquee box appears during the drag', midMarquee === 1)
  ok('marquee box extends into the area below the widgets', midBox && midBox.y + midBox.height > 500, JSON.stringify(midBox))
  await sleep(150)
  const selTxt = await page.locator('.nh-selbar__count').textContent().catch(() => '')
  ok('lasso from the bottom area selects all 3 widgets',
    (await page.locator('.nh-cell--selected').count()) === 3 && /^3 /.test(selTxt || ''), selTxt || '(no selbar)')

  // ---------- a bare click down there clears the selection (background semantics) ----------
  await page.mouse.click(startX, startY)
  await sleep(150)
  ok('bare click in the bottom area clears the selection', (await page.locator('.nh-cell--selected').count()) === 0)

  // ---------- marquee from a widget body still works (regression guard) ----------
  const cellBox = await box('.nh-cell')
  await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(cellBox.x + 450, cellBox.y + 60, { steps: 6 })
  await page.mouse.up()
  await sleep(150)
  ok('marquee from a widget body still selects', (await page.locator('.nh-cell--selected').count()) >= 2,
    String(await page.locator('.nh-cell--selected').count()))

  // Leave edit mode without saving (nothing to keep).
  await page.click('button:has-text("Exit")')
  await sleep(200)

  ok('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite crashed', false, String(e && e.message))
} finally {
  const d = await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
  ok('cleanup: seeded dashboard deleted', d.ok || d.status === 404, String(d.status))
  await browser.close()
}

let fails = 0
for (const r of results) {
  if (!r.pass) fails++
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(`\n${results.length - fails}/${results.length} checks passed`)
process.exitCode = fails === 0 ? 0 : 1
