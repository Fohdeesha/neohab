// Dragging a multi-selection moves the whole of it: by the handle or the body with a mouse, by a held touch
// on a tablet, and as a block in the phone stack. The group keeps its shape at the grid's edge, pushes what it
// lands on down rather than swapping with it, is one undo step, and a press on a widget outside the selection
// still draws a selection box. SAFE with a live config: creates dashboard:nh-e2e-groupdrag and
// -groupstack and deletes exactly those; label widgets only, so it commands nothing. The surface bounds it
// needs are shown to this browser only (lib/sandbox.mjs). Saves once through the app, to its own dashboard.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DASH = 'nh-e2e-groupdrag'
const STACK = 'nh-e2e-groupstack'
const UIDS = [DASH, STACK].map((d) => 'dashboard:' + d)
const HOLD = 700 // past LONG_PRESS_MS (500) and the 400ms bump dwell
const DESKTOP = { width: 1500, height: 950 }
const TABLET = { width: 1000, height: 900 }
const PHONE = { width: 393, height: 850 }

const label = (id, text, lg) => ({ id, type: 'label', config: { text, fontSize: 20 }, layout: { lg } })
const del = (uid) => fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
const get = async (uid) => {
  const r = await fetch(NS + '/' + encodeURIComponent(uid), { headers: AUTH })
  return r.ok ? r.json() : null
}
const seed = async (id, name, widgets) => {
  await del('dashboard:' + id)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: 'dashboard:' + id,
      component: 'neohab:dashboard',
      config: { version: 3, id, name, columns: 12, rowHeight: 60, gap: 8, widgets }
    })
  })
  return r.ok
}

// GA and GB are the selection; OO is what the group lands on; QQ is outside the selection
const GRID = [
  label('w-ga', 'GA', { x: 0, y: 0, w: 2, h: 2 }),
  label('w-gb', 'GB', { x: 2, y: 2, w: 2, h: 2 }),
  label('w-oo', 'OO', { x: 8, y: 0, w: 2, h: 2 }),
  label('w-qq', 'QQ', { x: 0, y: 9, w: 2, h: 2 })
]
const ROWS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((t, i) => label('w-' + t, t, { x: 0, y: i * 2, w: 12, h: 2 }))

const sb = await sharedSettings({ phoneBelow: 840, tabletBelow: 1200 })
const browser = await launchChromium({ channel: 'chrome', headless: true }).catch(() => launchChromium({ headless: true }))
const errs = []

async function newPage(viewport, touch) {
  const ctx = await browser.newContext({ viewport, ...(touch ? { hasTouch: true } : {}) })
  await sb.install(ctx)
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
    } catch {}
  }, TOKEN)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const at = m.location?.()?.url
    if (!isAppResource(at)) return
    errs.push(m.text() + (at ? ' <- ' + at : ''))
  })
  page.on('dialog', (d) => void d.accept())
  const cdp = touch ? await ctx.newCDPSession(page) : null
  const finger = {
    down: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }),
    move: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }),
    up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  return { ctx, page, finger }
}

const open = async (page, id) => {
  await page.goto(APP + '#/d/' + id, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-gcell', { timeout: 20000 })
  await sleep(400)
}
const enterEdit = async (page) => {
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit .nh-cell, .nh-grid--stackedit .nh-cell', { timeout: 15000 })
  await sleep(300)
}
const exitEdit = async (page) => {
  await page.click('button:has-text("Exit")', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 10000 }).catch(() => {})
}
// the cell's own text also carries the handle's type label, so match the widget inside it
const cellOf = (page, text) =>
  page
    .locator('.nh-cell')
    .filter({ has: page.locator('.nh-widget', { hasText: new RegExp('^' + text + '$') }) })
    .first()
const placeOf = (page, text) =>
  cellOf(page, text)
    .evaluate((el) => getComputedStyle(el).gridColumnStart + ',' + getComputedStyle(el).gridRowStart)
    .catch(() => null)
// 1-based column and row, as the grid draws them
const places = async (page, ...texts) => {
  const out = {}
  for (const t of texts) out[t] = await placeOf(page, t)
  return out
}
const centre = async (page, text) => {
  const b = await cellOf(page, text).boundingBox()
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null
}
const pitch = (page) =>
  page.evaluate(() => {
    const grid = document.querySelector('.nh-grid--edit')
    const box = grid.getBoundingClientRect()
    const cs = getComputedStyle(grid)
    const gap = parseFloat(cs.columnGap) || 0
    const cols = cs.gridTemplateColumns.split(' ').length
    const colWidth = (box.width - gap * (cols - 1)) / cols
    return { x: colWidth + gap, y: (parseFloat(cs.gridAutoRows) || 60) + gap }
  })
const handleOf = async (page, text) => {
  const b = await cellOf(page, text).locator('.nh-cell__handle').boundingBox()
  return b ? { x: b.x + 12, y: b.y + b.height / 2 } : null
}
// a mouse drag from a point, by whole cells, past the marquee threshold first
const mouseDrag = async (page, from, cells, p, holdMs = 0) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 })
  await page.mouse.move(from.x + cells.x * p.x, from.y + cells.y * p.y, { steps: 12 })
  if (holdMs) await sleep(holdMs)
  const during = await page.evaluate(() => ({
    drops: document.querySelectorAll('.nh-drop').length,
    invalid: document.querySelectorAll('.nh-drop--invalid').length,
    dragging: document.querySelectorAll('.nh-cell--dragging').length,
    marquee: document.querySelectorAll('.nh-marquee').length
  }))
  await page.mouse.up()
  await sleep(400)
  return during
}
const selectedCount = (page) => page.locator('.nh-cell--selected').count()
const panelOpen = async (page) => (await page.locator('.nh-sheet--side').count()) > 0

try {
  ok('seed', (await seed(DASH, 'E2E Group drag', GRID)) && (await seed(STACK, 'E2E Group stack', ROWS)))

  // ---- 1. a mouse: select two, drag one by its handle -----------------------------------------------
  const desk = await newPage(DESKTOP, false)
  await open(desk.page, DASH)
  await enterEdit(desk.page)
  await cellOf(desk.page, 'GA').locator('.nh-cell__overlay').click({ modifiers: ['Control'] })
  await cellOf(desk.page, 'GB').locator('.nh-cell__overlay').click({ modifiers: ['Control'] })
  await sleep(200)
  ok('two widgets are selected', (await selectedCount(desk.page)) === 2, String(await selectedCount(desk.page)))
  const p = await pitch(desk.page)
  const d1 = await mouseDrag(desk.page, await handleOf(desk.page, 'GA'), { x: 2, y: 1 }, p)
  const at1 = await places(desk.page, 'GA', 'GB', 'OO')
  ok('both are drawn moving, each with its own drop zone', d1.dragging === 2 && d1.drops === 2, JSON.stringify(d1))
  ok('dragging one by its handle moves the whole selection', at1.GA === '3,2' && at1.GB === '5,4', JSON.stringify(at1))
  ok('and leaves the rest of the board alone', at1.OO === '9,1', JSON.stringify(at1))
  ok('the selection survives the drop, with the panel shut', (await selectedCount(desk.page)) === 2 && !(await panelOpen(desk.page)))
  await desk.page.keyboard.press('Control+z')
  await sleep(300)
  const undone = await places(desk.page, 'GA', 'GB')
  // the group has to have moved first, or there is nothing for the undo to put back
  ok('one undo puts the whole group back', at1.GA === '3,2' && undone.GA === '1,1' && undone.GB === '3,3', JSON.stringify({ at1, undone }))

  // ---- 2. drag by the body of a selected widget -----------------------------------------------------
  const d2 = await mouseDrag(desk.page, await centre(desk.page, 'GB'), { x: 0, y: 3 }, p)
  const at2 = await places(desk.page, 'GA', 'GB')
  ok('pressing a selected widget and dragging moves the selection', at2.GA === '1,4' && at2.GB === '3,6', JSON.stringify(at2))
  ok('rather than drawing a selection box', d2.marquee === 0 && d2.dragging === 2, JSON.stringify(d2))
  ok('and the selection is still both', (await selectedCount(desk.page)) === 2, String(await selectedCount(desk.page)))

  // ---- 3. the grid's edge stops the whole group, keeping its shape ----------------------------------
  await mouseDrag(desk.page, await handleOf(desk.page, 'GB'), { x: -5, y: 1 }, p)
  const at3 = await places(desk.page, 'GA', 'GB')
  ok('at the left edge the group stops together and keeps its shape', at3.GA === '1,5' && at3.GB === '3,7', JSON.stringify(at3))

  // ---- 4. landing on another widget: red first, then it is pushed down, never swapped ---------------
  const before4 = await mouseDrag(desk.page, await handleOf(desk.page, 'GA'), { x: 8, y: -4 }, p)
  ok('a group dropped straight onto a widget is refused', (await places(desk.page, 'GA')).GA === '1,5', JSON.stringify(before4))
  ok('and its drop zones say so while it is held there', before4.invalid === 2, JSON.stringify(before4))
  const d4 = await mouseDrag(desk.page, await handleOf(desk.page, 'GA'), { x: 8, y: -4 }, p, HOLD)
  const at4 = await places(desk.page, 'GA', 'GB', 'OO')
  ok('held there, the group lands', at4.GA === '9,1' && at4.GB === '11,3', JSON.stringify({ at4, d4 }))
  ok('and what it landed on is pushed below it rather than swapped', at4.OO === '9,3', JSON.stringify(at4))
  await desk.page.click('button:has-text("Save")', { timeout: 5000 }).catch(() => {})
  await desk.page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 }).catch(() => {})
  const saved = await get('dashboard:' + DASH)
  const lg = (id) => JSON.stringify(saved?.config.widgets.find((w) => w.id === id)?.layout.lg)
  ok(
    'saving keeps every member and the pushed widget where they were drawn',
    lg('w-ga') === JSON.stringify({ x: 8, y: 0, w: 2, h: 2 }) && lg('w-gb') === JSON.stringify({ x: 10, y: 2, w: 2, h: 2 }) && lg('w-oo') === JSON.stringify({ x: 8, y: 2, w: 2, h: 2 }),
    [lg('w-ga'), lg('w-gb'), lg('w-oo')].join(' ')
  )

  // ---- 5. a press on a widget outside the selection still draws a box --------------------------------
  await enterEdit(desk.page)
  await cellOf(desk.page, 'GA').locator('.nh-cell__overlay').click({ modifiers: ['Control'] })
  await cellOf(desk.page, 'GB').locator('.nh-cell__overlay').click({ modifiers: ['Control'] })
  await sleep(200)
  const q = await centre(desk.page, 'QQ')
  const d5 = await mouseDrag(desk.page, q, { x: 3, y: 0 }, p)
  const qSelected = await cellOf(desk.page, 'QQ').evaluate((el) => el.classList.contains('nh-cell--selected'))
  ok('a press on a widget outside the selection still draws a box', d5.marquee === 1 && d5.dragging === 0, JSON.stringify(d5))
  ok('which selects what it covers instead', qSelected && (await selectedCount(desk.page)) === 1, `QQ selected=${qSelected}, ${await selectedCount(desk.page)} selected`)
  ok('and moves nothing', (await placeOf(desk.page, 'QQ')) === '1,10', String(await placeOf(desk.page, 'QQ')))
  await exitEdit(desk.page)
  await desk.ctx.close()

  // ---- 6. a tablet: hold each to select, then hold one and drag ---------------------------------------
  const tab = await newPage(TABLET, true)
  await open(tab.page, DASH)
  await enterEdit(tab.page)
  for (const t of ['GA', 'GB']) {
    const c = await centre(tab.page, t)
    await tab.finger.down(c.x, c.y)
    await sleep(HOLD)
    await tab.finger.up()
    await sleep(300)
  }
  ok('holding each in turn selects both', (await selectedCount(tab.page)) === 2, String(await selectedCount(tab.page)))
  const tp = await pitch(tab.page)
  const ga = await centre(tab.page, 'GA')
  await tab.finger.down(ga.x, ga.y)
  await sleep(HOLD)
  const to = { x: ga.x - 4 * tp.x, y: ga.y }
  for (let i = 1; i <= 10; i++) {
    await tab.finger.move(ga.x + ((to.x - ga.x) * i) / 10, ga.y)
    await sleep(30)
  }
  const touchDragging = await tab.page.locator('.nh-cell--dragging').count()
  await tab.finger.up()
  await sleep(400)
  const at6 = await places(tab.page, 'GA', 'GB')
  ok('holding a selected widget lifts the whole selection', touchDragging === 2, `dragging=${touchDragging}`)
  ok('and dragging it moves them all', at6.GA === '5,1' && at6.GB === '7,3', JSON.stringify(at6))
  ok('the selection survives, with the panel shut', (await selectedCount(tab.page)) === 2 && !(await panelOpen(tab.page)))
  await exitEdit(tab.page)
  await tab.ctx.close()

  // ---- 7. the phone stack: a selection moves as a block, in its own order ----------------------------
  const ph = await newPage(PHONE, true)
  await open(ph.page, STACK)
  await enterEdit(ph.page)
  const order = () => ph.page.$$eval('.nh-grid--stackedit .nh-cell .nh-widget__body', (els) => els.map((e) => e.textContent?.trim()))
  for (const t of ['S2', 'S4']) {
    const c = await centre(ph.page, t)
    await ph.finger.down(c.x, c.y)
    await sleep(HOLD)
    await ph.finger.up()
    await sleep(300)
  }
  ok('two rows in the stack are selected', (await selectedCount(ph.page)) === 2, String(await selectedCount(ph.page)))
  const s4 = await centre(ph.page, 'S4')
  const s1box = await cellOf(ph.page, 'S1').boundingBox()
  const target = { x: s4.x, y: s1box.y + 6 }
  await ph.finger.down(s4.x, s4.y)
  await sleep(HOLD)
  for (let i = 1; i <= 12; i++) {
    await ph.finger.move(s4.x, s4.y + ((target.y - s4.y) * i) / 12)
    await sleep(30)
  }
  const rowsMoving = await ph.page.locator('.nh-cell--dragging').count()
  await ph.finger.up()
  await sleep(400)
  const o = await order()
  ok('holding a selected row lifts every selected row', rowsMoving === 2, `dragging=${rowsMoving}`)
  ok('and they land together, in the order they had', o.join(',') === 'S2,S4,S1,S3,S5,S6', o.join(','))
  await exitEdit(ph.page)
  await ph.ctx.close()

  ok('console clean', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err?.stack ?? err).slice(0, 300))
} finally {
  for (const uid of UIDS) await del(uid)
  const untouched = await sb.verify().catch((e) => ({ ok: false, detail: String(e) }))
  ok('cleanup: the shared settings on the server were never written', untouched.ok, untouched.detail)
  const left = ((await (await fetch(NS, { headers: AUTH })).json()) ?? []).map((c) => c.uid).filter((u) => UIDS.includes(u))
  ok('cleanup: no leftovers', left.length === 0, left.join(','))
  await browser.close().catch(() => {})
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
