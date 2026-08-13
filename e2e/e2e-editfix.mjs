/**
 * Editor-fix e2e: dial step decimals, per-widget delete button, drag-to-bump (dwell-gated
 * swap + push-down cascade), and button Action field visibility.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-editfix and deletes exactly that in
 * cleanup (guarded, runs even if a section throws). The server's own dashboards are read ONLY.
 * No item commands anywhere: the dials are read-only gauges and no widget is ever pressed.
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-editfix'
const GAP = 8
const ROW = 40
const COLS = 12
const DWELL = 700 // comfortably past BUMP_DWELL_MS (400)

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getComp = async () => {
  const r = await fetch(NS + '/' + UID, { headers: AUTH })
  return r.ok ? r.json() : null
}

// Cell DOM order == the seeded widgets array order, and reordering never happens.
const A = 0, B = 1, C = 2, D = 3

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

/** Grid placement of the nth cell, as the rect it encodes: "4 / span 2" -> x:3, w:2. */
const rectOfCell = async (i) =>
  page.$$eval('.nh-cell', (els, idx) => {
    const e = els[idx]
    if (!e) return null
    const col = e.style.gridColumn.match(/^(\d+) \/ span (\d+)$/)
    const row = e.style.gridRow.match(/^(\d+) \/ span (\d+)$/)
    if (!col || !row) return null
    return { x: +col[1] - 1, y: +row[1] - 1, w: +col[2], h: +row[2] }
  }, i)
const same = (r, x, y, w, h) => !!r && r.x === x && r.y === y && r.w === w && r.h === h
const at = (r) => (r ? `${r.x},${r.y} ${r.w}x${r.h}` : 'null')

/**
 * Press the nth cell's handle and drag it by whole cells; caller dwells, asserts, releases.
 * The grid is re-measured every time: the settings panel takes 340px off the surface when it
 * is open, so the column pitch differs between drags.
 */
async function grabAndMove(i, dCols, dRows) {
  const g = await page.locator('.nh-grid--edit').boundingBox()
  const cellW = (g.width - GAP * (COLS - 1)) / COLS
  const box = await page.locator('.nh-cell').nth(i).locator('.nh-cell__handle').boundingBox()
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + dCols * (cellW + GAP), sy + dRows * (ROW + GAP), { steps: 6 })
}
const bumpedCount = () => page.locator('.nh-cell--bumped').count()
const invalidCount = () => page.locator('.nh-drop--invalid').count()

try {
  // ---------- seed ----------
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-editfix',
        name: 'E2E Editfix',
        columns: COLS,
        rowHeight: ROW,
        gap: GAP,
        widgets: [
          { id: 'w-a', type: 'clock', config: { showDate: false }, layout: { lg: { x: 0, y: 0, w: 2, h: 2 } } },
          { id: 'w-b', type: 'clock', config: { showDate: false }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
          { id: 'w-c', type: 'label', config: { text: 'C' }, layout: { lg: { x: 0, y: 4, w: 2, h: 1 } } },
          { id: 'w-d', type: 'label', config: { text: 'D' }, layout: { lg: { x: 0, y: 5, w: 2, h: 1 } } },
          // no `action` key on purpose: an imported-style button must still resolve to command
          { id: 'w-e', type: 'button', config: { label: 'Nav', command: 'ON' }, layout: { lg: { x: 6, y: 0, w: 2, h: 2 } } },
          { id: 'w-f', type: 'dial', config: { item: ITEMS.temperature, label: 'Tenths', min: 0, max: 200, step: 0.1, readOnly: true }, layout: { lg: { x: 6, y: 3, w: 3, h: 3 } } },
          { id: 'w-g', type: 'dial', config: { item: ITEMS.temperature, label: 'Whole', min: 0, max: 200, step: 1, readOnly: true }, layout: { lg: { x: 9, y: 3, w: 3, h: 3 } } },
        ],
      },
    }),
  })
  ok('suite dashboard created', seed.ok, String(seed.status))

  await page.goto(APP + '#/d/nh-e2e-editfix', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.nh-grid', { timeout: 15000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  // the grid renders empty for one frame while it measures itself; wait for the cells
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length === 7, { timeout: 5000 })

  // ---------- the drag must not reflow the grid under the pointer ----------
  {
    const wide = (await page.locator('.nh-grid--edit').boundingBox()).width
    const h = await page.locator('.nh-cell').nth(A).locator('.nh-cell__handle').boundingBox()
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await page.mouse.down()
    await sleep(250)
    const held = (await page.locator('.nh-grid--edit').boundingBox()).width
    const panelOpen = (await page.locator('.nh-sheet--side').count()) > 0
    await page.mouse.up()
    await sleep(250)
    ok('grabbing a widget does not resize the grid', held === wide, `${Math.round(wide)} -> ${Math.round(held)}`)
    ok('settings panel stays shut during the drag', !panelOpen)
    ok('dropping selects the widget (panel opens after)', (await page.locator('.nh-sheet--side').count()) === 1)
    await page.click('.nh-sheet--side .nh-sheet__close')
    await sleep(200)
    ok('panel closes again', (await page.locator('.nh-sheet--side').count()) === 0)
  }

  // ---------- delete button on every widget ----------
  ok('every cell has a delete button', (await page.locator('.nh-cell__delete').count()) === 7, String(await page.locator('.nh-cell__delete').count()))
  ok('delete button sits in the handle strip', (await page.locator('.nh-cell__handle .nh-cell__delete').count()) === 7)
  const dBox = await page.locator('.nh-cell').nth(A).locator('.nh-cell__delete').boundingBox()
  const aBox = await page.locator('.nh-cell').nth(A).boundingBox()
  ok('delete sits at the cell top-right', dBox.y < aBox.y + 30 && dBox.x + dBox.width > aBox.x + aBox.width - 12, `x+w=${Math.round(dBox.x + dBox.width)} cell right=${Math.round(aBox.x + aBox.width)}`)

  await page.locator('.nh-cell').nth(6).locator('.nh-cell__delete').click()
  await sleep(250)
  ok('delete removes the widget', (await page.locator('.nh-cell').count()) === 6, String(await page.locator('.nh-cell').count()))
  ok('delete does not open the settings panel', (await page.locator('.nh-sheet--side').count()) === 0)
  ok('delete did not start a drag', (await page.locator('.nh-cell--dragging').count()) === 0)
  await page.click('[aria-label="Undo"]')
  await sleep(250)
  ok('undo restores the deleted widget', (await page.locator('.nh-cell').count()) === 7)

  // ---------- bump: same-size swap, gated on the dwell ----------
  ok('seed: A at 0,0', same(await rectOfCell(A), 0, 0, 2, 2), at(await rectOfCell(A)))
  ok('seed: B at 3,0', same(await rectOfCell(B), 3, 0, 2, 2), at(await rectOfCell(B)))

  await grabAndMove(A, 3, 0) // exactly onto B
  await sleep(120)
  ok('before the dwell the drop is rejected', (await invalidCount()) === 1 && (await bumpedCount()) === 0, `invalid=${await invalidCount()} bumped=${await bumpedCount()}`)
  await sleep(DWELL)
  ok('dwell arms the bump (drop turns valid)', (await invalidCount()) === 0, String(await invalidCount()))
  ok('exactly one widget is previewed as bumped', (await bumpedCount()) === 1, String(await bumpedCount()))
  ok('bump preview puts B in the spot A vacates', same(await rectOfCell(B), 0, 0, 2, 2), at(await rectOfCell(B)))
  await page.mouse.up()
  await sleep(250)
  ok('swap: A took B\'s spot', same(await rectOfCell(A), 3, 0, 2, 2), at(await rectOfCell(A)))
  ok('swap: B took A\'s spot', same(await rectOfCell(B), 0, 0, 2, 2), at(await rectOfCell(B)))
  ok('nothing else moved (C)', same(await rectOfCell(C), 0, 4, 2, 1), at(await rectOfCell(C)))

  // one undo entry for the whole swap
  await page.click('[aria-label="Undo"]')
  await sleep(200)
  ok('one undo reverts both halves of the swap', same(await rectOfCell(A), 0, 0, 2, 2) && same(await rectOfCell(B), 3, 0, 2, 2), `${at(await rectOfCell(A))} / ${at(await rectOfCell(B))}`)
  await page.click('[aria-label="Redo"]')
  await sleep(200)
  ok('redo re-applies the swap', same(await rectOfCell(A), 3, 0, 2, 2) && same(await rectOfCell(B), 0, 0, 2, 2))

  // ---------- bump: no dwell = no bump ----------
  await grabAndMove(B, 3, 0) // B(0,0) onto A(3,0)
  await sleep(120)
  ok('a quick drag over a widget stays rejected', (await invalidCount()) === 1 && (await bumpedCount()) === 0)
  await page.mouse.up()
  await sleep(250)
  ok('rejected drop moves nothing', same(await rectOfCell(B), 0, 0, 2, 2) && same(await rectOfCell(A), 3, 0, 2, 2), `${at(await rectOfCell(B))} / ${at(await rectOfCell(A))}`)

  // ---------- bump: push-down cascade over two occupants ----------
  // A is at 3,0 (2x2); drop it on 0,4 which covers C(0,4) and D(0,5).
  await grabAndMove(A, -3, 4)
  await sleep(DWELL)
  ok('cascade previews both occupants as bumped', (await bumpedCount()) === 2, String(await bumpedCount()))
  ok('cascade drop is valid', (await invalidCount()) === 0)
  await page.mouse.up()
  await sleep(250)
  ok('push-down: A landed on the occupied spot', same(await rectOfCell(A), 0, 4, 2, 2), at(await rectOfCell(A)))
  ok('push-down: C cleared to row 6', same(await rectOfCell(C), 0, 6, 2, 1), at(await rectOfCell(C)))
  ok('push-down: D cascaded to row 7', same(await rectOfCell(D), 0, 7, 2, 1), at(await rectOfCell(D)))
  ok('push-down kept C above D', (await rectOfCell(C)).y < (await rectOfCell(D)).y)

  await page.click('[aria-label="Undo"]')
  await sleep(200)
  ok('one undo reverts the whole cascade', same(await rectOfCell(A), 3, 0, 2, 2) && same(await rectOfCell(C), 0, 4, 2, 1) && same(await rectOfCell(D), 0, 5, 2, 1), `${at(await rectOfCell(A))} / ${at(await rectOfCell(C))} / ${at(await rectOfCell(D))}`)
  await page.click('[aria-label="Redo"]')
  await sleep(200)

  // ---------- a bumped layout persists ----------
  await page.click('button:has-text("Save")')
  await sleep(1500)
  const saved = await getComp()
  const byId = Object.fromEntries((saved?.config?.widgets ?? []).map((w) => [w.id, w.layout.lg]))
  ok('saved: bumped layout persisted (A)', byId['w-a']?.x === 0 && byId['w-a']?.y === 4, JSON.stringify(byId['w-a']))
  ok('saved: bumped layout persisted (C)', byId['w-c']?.y === 6, JSON.stringify(byId['w-c']))
  ok('saved: bumped layout persisted (D)', byId['w-d']?.y === 7, JSON.stringify(byId['w-d']))
  ok('saved: no two widgets overlap', (() => {
    const rs = Object.values(byId)
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j]
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false
      }
    return true
  })(), JSON.stringify(byId))

  // ---------- button Action field visibility ----------
  // Save returned to run mode; re-enter to continue editing.
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length === 7, { timeout: 5000 })
  await page.locator('.nh-cell').nth(4).locator('.nh-cell__overlay').click()
  await page.waitForSelector('#f-w-e-action', { timeout: 5000 })
  const opts = await page.$eval('#f-w-e-action', (el) => [...el.options].map((o) => o.textContent))
  ok('Action options read Send command / Navigate (neohab)', JSON.stringify(opts) === JSON.stringify(['Send command', 'Navigate (neohab)']), JSON.stringify(opts))
  ok('a config without `action` still resolves to Send command', (await page.inputValue('#f-w-e-action')) === 'command', await page.inputValue('#f-w-e-action'))

  const shown = async (label) => (await page.locator(`.nh-sheet--side .nh-field__label:text-is("${label}")`).count()) > 0
  ok('command mode hides "Go to dashboard"', !(await shown('Go to dashboard')))
  ok('command mode hides "Open URL"', !(await shown('Open URL')))
  ok('command mode shows "Alternate command"', await shown('Alternate command'))

  await page.selectOption('#f-w-e-action', 'navigate')
  await sleep(200)
  ok('navigate mode shows "Go to dashboard"', await shown('Go to dashboard'))
  ok('navigate mode shows "Open URL"', await shown('Open URL'))
  ok('navigate mode hides "Alternate command"', !(await shown('Alternate command')))
  ok('navigate mode keeps Item (drives the active icon)', await shown('openHAB Item'))
  ok('navigate mode keeps Command', await shown('Command'))
  ok('navigate mode keeps Toggle with state', await shown('Toggle with state'))

  await page.selectOption('#f-w-e-action', 'command')
  await sleep(200)
  ok('switching back hides the navigate fields again', !(await shown('Open URL')) && (await shown('Alternate command')))

  // ---------- dial: step decides the displayed decimals ----------
  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })
  const dialText = async (label) =>
    (await page.locator(`.nh-gcell:has(.nh-widget__labeltext:text-is("${label}")) .nh-dial__value`).textContent())?.trim()
  // wait for the SSE state to land (both dials start at min = 0)
  for (let i = 0; i < 40 && (await dialText('Whole')) === '0'; i++) await sleep(250)
  const tenths = await dialText('Tenths')
  const whole = await dialText('Whole')
  ok('step 0.1 dial shows one decimal', /^\d+\.\d$/.test(tenths), String(tenths))
  ok('step 1 dial shows no decimal', /^\d+$/.test(whole), String(whole))
  ok('both dials agree on the value', Math.round(parseFloat(tenths)) === parseInt(whole, 10), `${tenths} vs ${whole}`)

  // ---------- a live fractional-step gauge, if this server has one (read-only) ----------
  // Look for any live dashboard carrying a dial with a fractional step - the original
  // complaint was such a gauge rounding its display. Skipped cleanly when none exists.
  const liveDashes = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid.startsWith('dashboard:'))
  let liveGauge = null
  for (const d of liveDashes) {
    for (const w of d.config.widgets ?? []) {
      if (w.type !== 'dial' || !(Number(w.config?.step) > 0) || Number(w.config?.step) >= 1 || !w.config?.label) continue
      // the bound item must exist and carry a numeric state, or the gauge shows nothing
      const state = await (await fetch(`${BASE}/rest/items/${w.config.item}/state`, { headers: AUTH })).text()
      if (!Number.isFinite(parseFloat(state))) continue
      liveGauge = { dash: d.config.id, label: w.config.label }
      break
    }
    if (liveGauge) break
  }
  if (liveGauge) {
    await page.goto(APP + '#/d/' + encodeURIComponent(liveGauge.dash), { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await sleep(2500) // let SSE deliver the bound item's state
    // Either renderer: the dial has a classic face AND five ring styles, and which one a live
    // dashboard uses is the user's choice. This scan takes whichever fractional-step dial the
    // server happens to list first, so pinning the classic class made the check depend on
    // component ordering - it passed for months and then landed on an LED gauge. Both honour
    // the step's precision, which is what is actually under test.
    const valueSel = '.nh-dial__value, .nh-gauge__value'
    const cell = `.nh-gcell:has(.nh-widget__labeltext:text-is("${liveGauge.label}"))`
    const text = (await page.locator(`${cell} :is(${valueSel})`).first().textContent().catch(() => null))?.trim()
    ok('live fractional-step gauge shows a decimal', /^-?\d+\.\d/.test(text ?? ''), `${liveGauge.dash}/${liveGauge.label}: ${text}`)
  } else {
    console.log('SKIP  no live dashboard with a fractional-step dial on this server')
  }

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

// cleanup guard: only ever this suite's dashboard, even if a section threw
await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
ok('cleanup: suite dashboard removed', (await getComp()) === null)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks`)
console.log(allPass ? 'ALL PASS' : 'SOME FAILED')
process.exit(allPass ? 0 : 1)
