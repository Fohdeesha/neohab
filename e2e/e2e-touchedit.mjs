// Editing on a touch screen: the editor opens on the layout the screen was showing, a widget is picked up
// by holding it and then dragged, a quick swipe still scrolls, a drop never opens the settings panel, and
// the page scrolls when a dragged widget is held near its top or bottom edge (touch and mouse, grid and
// phone stack). SAFE with a live config: creates dashboard:nh-e2e-touchedit, -touchedit2 and -touchstack
// and deletes exactly those; label widgets only, so it commands nothing. The surface bounds it needs are
// shown to this browser only (lib/sandbox.mjs). Saves once through the app, to its own dashboard.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DASH = 'nh-e2e-touchedit'
const PLAIN = 'nh-e2e-touchedit2'
const STACK = 'nh-e2e-touchstack'
const UIDS = [DASH, PLAIN, STACK].map((d) => 'dashboard:' + d)
const HOLD = 700 // past LONG_PRESS_MS (500)
const TABLET = { width: 1000, height: 900 }
const DESKTOP = { width: 1500, height: 950 }
const PHONE = { width: 393, height: 850 }

const label = (id, text, lg, md) => ({ id, type: 'label', config: { text, fontSize: 20 }, layout: md ? { lg, md } : { lg } })
const del = (uid) => fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
const get = async (uid) => {
  const r = await fetch(NS + '/' + encodeURIComponent(uid), { headers: AUTH })
  return r.ok ? r.json() : null
}
const seed = async (id, name, widgets, extra = {}) => {
  await del('dashboard:' + id)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: 'dashboard:' + id,
      component: 'neohab:dashboard',
      config: { version: 3, id, name, columns: 12, rowHeight: 60, gap: 8, widgets, ...extra }
    })
  })
  return r.ok
}

// the tablet layout pins A, B and D; C has no tablet rect, so run mode fits it around them (at 4,0)
const GRID_WIDGETS = [
  label('w-a', 'AAA', { x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 0, w: 2, h: 2 }),
  label('w-b', 'BBB', { x: 4, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 }),
  label('w-c', 'CCC', { x: 8, y: 0, w: 2, h: 2 }),
  label('w-d', 'DDD', { x: 0, y: 14, w: 2, h: 2 }, { x: 0, y: 14, w: 2, h: 2 })
]
const STACK_WIDGETS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'].map((t, i) => label('w-' + t, t, { x: 0, y: i * 3, w: 12, h: 3 }))

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
const columns = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('.nh-grid--edit, .nh-grid')
    return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : 0
  })
// the cell's own text also carries the handle's type label, so match the widget inside it
const cellOf = (page, text) =>
  page
    .locator('.nh-cell')
    .filter({ has: page.locator('.nh-widget', { hasText: new RegExp('^' + text + '$') }) })
    .first()
const placeOf = (page, text) =>
  cellOf(page, text)
    .evaluate((el) => ({ col: getComputedStyle(el).gridColumnStart, row: getComputedStyle(el).gridRowStart }))
    .catch(() => null)
const centre = async (page, text) => {
  const b = await cellOf(page, text).boundingBox()
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null
}
// the middle of grid cell (col, row), 0-based, in viewport pixels
const gridPoint = (page, col, row) =>
  page.evaluate(
    ({ col, row }) => {
      const grid = document.querySelector('.nh-grid--edit')
      const box = grid.getBoundingClientRect()
      const cs = getComputedStyle(grid)
      const gap = parseFloat(cs.columnGap) || 0
      const cols = cs.gridTemplateColumns.split(' ').length
      const colWidth = (box.width - gap * (cols - 1)) / cols
      const rowHeight = parseFloat(cs.gridAutoRows) || 60
      return { x: box.left + col * (colWidth + gap) + colWidth / 2, y: box.top + row * (rowHeight + gap) + rowHeight / 2 }
    },
    { col, row }
  )
const glide = async (finger, from, to, steps = 10, ms = 30) => {
  for (let i = 1; i <= steps; i++) {
    await finger.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await sleep(ms)
  }
}
const scrollY = (page) => page.evaluate(() => window.scrollY)
// records whether anything was ever drawn as being dragged, so a swipe that briefly picked a widget up shows
const watchDrags = (page) =>
  page.evaluate(() => {
    window.__nhDragSeen = false
    new MutationObserver(() => {
      if (document.querySelector('.nh-cell--dragging, .nh-cell--lifted')) window.__nhDragSeen = true
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
  })
const panelOpen = async (page) => (await page.locator('.nh-sheet--side').count()) > 0
const selectedCount = (page) => page.locator('.nh-cell--selected').count()

try {
  ok(
    'seed',
    (await seed(DASH, 'E2E Touch edit', GRID_WIDGETS, { mdColumns: 6 })) &&
      (await seed(PLAIN, 'E2E Touch plain', GRID_WIDGETS.map((w) => ({ ...w, layout: { lg: w.layout.lg } })))) &&
      (await seed(STACK, 'E2E Touch stack', STACK_WIDGETS))
  )

  // ---- 1. the editor opens on the layout run mode was drawing ----------------------------------------
  const tab = await newPage(TABLET, true)
  await open(tab.page, DASH)
  ok('run mode on a tablet draws the tablet layout', (await columns(tab.page)) === 6, String(await columns(tab.page)))
  await enterEdit(tab.page)
  const sw = await tab.page.locator('.nh-bpswitch').textContent().catch(() => null)
  ok('editing on a tablet opens on the tablet layout', (await tab.page.locator('.nh-bpswitch--md').count()) === 1, String(sw))
  ok('and draws its 6-column grid', (await columns(tab.page)) === 6, String(await columns(tab.page)))
  const saveOff = await tab.page.locator('button:has-text("Save")').isDisabled()
  ok('opening on it is not a change', saveOff, `Save disabled=${saveOff}`)
  const cAt = await placeOf(tab.page, 'CCC')
  ok('a widget with no tablet rect sits where run mode fitted it', cAt?.col === '5' && cAt?.row === '1', JSON.stringify(cAt))
  ok(
    'the touch hint describes holding to drag',
    /Hold a widget/.test((await tab.page.locator('.nh-dash__edithint').textContent().catch(() => '')) ?? ''),
    String(await tab.page.locator('.nh-dash__edithint').textContent().catch(() => ''))
  )

  // ---- 2. hold, then drag ---------------------------------------------------------------------------
  await watchDrags(tab.page)
  const y0 = await scrollY(tab.page)
  const a = await centre(tab.page, 'AAA')
  await tab.finger.down(a.x, a.y)
  await sleep(HOLD)
  const liftedNow = await tab.page.locator('.nh-cell--lifted').filter({ has: tab.page.locator('.nh-widget', { hasText: 'AAA' }) }).count()
  ok('holding a widget still picks it up', liftedNow === 1, `lifted=${liftedNow}`)
  const pitch = (await gridPoint(tab.page, 0, 1)).y - (await gridPoint(tab.page, 0, 0)).y
  await glide(tab.finger, a, { x: a.x, y: a.y + 3 * pitch })
  const dragging = await tab.page.locator('.nh-cell--dragging', { hasText: 'AAA' }).count()
  const yDuring = await scrollY(tab.page)
  await tab.finger.up()
  await sleep(400)
  const aAt = await placeOf(tab.page, 'AAA')
  ok('and moving the finger then drags it', dragging === 1, `dragging=${dragging}`)
  ok('the page does not scroll under a dragged widget', Math.abs(yDuring - y0) < 2, `scrollY ${y0} -> ${yDuring}`)
  ok('the widget lands where it was dropped', aAt?.col === '1' && aAt?.row === '4', JSON.stringify(aAt))
  ok('dropping it does not open the settings panel', !(await panelOpen(tab.page)))
  ok('and does not select it', (await selectedCount(tab.page)) === 0, String(await selectedCount(tab.page)))
  const cAfter = await placeOf(tab.page, 'CCC')
  ok('the fitted widget stays put when another one moves', cAfter?.col === '5' && cAfter?.row === '1', JSON.stringify(cAfter))
  ok('the move made the draft dirty', !(await tab.page.locator('button:has-text("Save")').isDisabled()))

  // ---- 3. a quick swipe still scrolls ---------------------------------------------------------------
  await tab.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(200)
  await watchDrags(tab.page)
  const bBefore = await placeOf(tab.page, 'BBB')
  const b = await centre(tab.page, 'BBB')
  const sy0 = await scrollY(tab.page)
  await tab.finger.down(b.x, b.y + 30)
  await glide(tab.finger, { x: b.x, y: b.y + 30 }, { x: b.x, y: b.y - 220 }, 8, 12)
  await tab.finger.up()
  await sleep(700)
  const sy1 = await scrollY(tab.page)
  const swipeDrag = await tab.page.evaluate(() => window.__nhDragSeen)
  ok('a quick swipe on a widget scrolls the page', sy1 > sy0 + 40, `scrollY ${sy0} -> ${sy1}`)
  ok('and picks nothing up', swipeDrag === false && JSON.stringify(await placeOf(tab.page, 'BBB')) === JSON.stringify(bBefore))

  // ---- 4. hold and let go selects, a tap opens the settings ---------------------------------------
  await tab.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(200)
  const b2 = await centre(tab.page, 'BBB')
  await tab.finger.down(b2.x, b2.y)
  await sleep(HOLD)
  await tab.finger.up()
  await sleep(300)
  ok(
    'holding a widget and letting go without moving selects it',
    (await cellOf(tab.page, 'BBB').evaluate((el) => el.classList.contains('nh-cell--selected'))) && (await tab.page.locator('.nh-selbar').count()) === 1
  )
  ok('and leaves the settings panel shut', !(await panelOpen(tab.page)))
  await tab.page.click('.nh-selbar button:has-text("Deselect")').catch(() => {})
  await sleep(200)
  const c = await centre(tab.page, 'CCC')
  await tab.page.touchscreen.tap(c.x, c.y)
  await tab.page.waitForSelector('.nh-sheet--side', { timeout: 4000 }).catch(() => {})
  ok('a tap on a widget still opens its settings', await panelOpen(tab.page))
  await tab.page.click('.nh-sheet--side .nh-sheet__close').catch(() => {})
  await tab.page.waitForFunction(() => !document.querySelector('.nh-sheet--side'), { timeout: 4000 }).catch(() => {})

  // ---- 5. Android raises contextmenu for its own long press, sometimes before our timer -------------
  const c2 = await centre(tab.page, 'CCC')
  await tab.finger.down(c2.x, c2.y)
  await sleep(250)
  const prevented = await tab.page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })
      el?.dispatchEvent(ev)
      return { hit: el?.className ?? null, prevented: ev.defaultPrevented }
    },
    c2
  )
  await sleep(50)
  const liftedByMenu = await tab.page.locator('.nh-cell--lifted', { hasText: 'CCC' }).count()
  await tab.finger.up()
  await sleep(300)
  ok("the browser's own long press picks the widget up too", liftedByMenu === 1, JSON.stringify({ liftedByMenu, ...prevented }))
  ok('and its menu is kept off the screen', prevented.prevented === true, JSON.stringify(prevented))
  await tab.page.click('.nh-selbar button:has-text("Deselect")').catch(() => {})

  // ---- 6. holding a dragged widget near the top edge scrolls the page up ----------------------------
  await tab.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(300)
  const yBottom = await scrollY(tab.page)
  const dBefore = await placeOf(tab.page, 'DDD')
  const d = await centre(tab.page, 'DDD')
  const barBottom = await tab.page.evaluate(() => document.querySelector('.nh-dash__bar')?.getBoundingClientRect().bottom ?? 0)
  await tab.finger.down(d.x, d.y)
  await sleep(HOLD)
  await glide(tab.finger, d, { x: d.x, y: barBottom + 6 }, 12, 30)
  await sleep(1500)
  const yTop = await scrollY(tab.page)
  const rowNear = await gridPoint(tab.page, 0, 6)
  await glide(tab.finger, { x: d.x, y: barBottom + 6 }, { x: d.x, y: Math.max(barBottom + 80, rowNear.y) }, 6, 30)
  await tab.finger.up()
  await sleep(400)
  const dAfter = await placeOf(tab.page, 'DDD')
  ok('page room to scroll was there', yBottom > 150, `scrollY at the bottom ${yBottom}`)
  ok('holding a lifted widget at the top edge scrolls the page up', yTop < yBottom - 150, `scrollY ${yBottom} -> ${yTop}`)
  ok(
    'and it is dropped further up than the screen showed when it was picked up',
    Number(dAfter?.row) < Number(dBefore?.row) - 6,
    JSON.stringify({ dBefore, dAfter })
  )

  // ---- 7. saving keeps the tablet moves and pins the fitted widget where it was drawn ---------------
  // bounded, so a build where nothing moved fails the checks below rather than stopping the suite here
  await tab.page.click('button:has-text("Save")', { timeout: 5000 }).catch(() => {})
  await tab.page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 }).catch(() => {})
  const saved = await get('dashboard:' + DASH)
  const sw2 = (id) => saved?.config.widgets.find((w) => w.id === id)
  ok('the tablet move was saved to the tablet layout', sw2('w-a')?.layout.md?.y === 3 && sw2('w-a')?.layout.lg?.y === 0, JSON.stringify(sw2('w-a')?.layout))
  ok('and the fitted widget got the tablet rect it was drawn at', JSON.stringify(sw2('w-c')?.layout.md) === JSON.stringify({ x: 4, y: 0, w: 2, h: 2 }), JSON.stringify(sw2('w-c')?.layout))
  ok('the desktop layout is untouched', JSON.stringify(sw2('w-c')?.layout.lg) === JSON.stringify({ x: 8, y: 0, w: 2, h: 2 }))
  await tab.ctx.close()

  // ---- 8. the desktop width, and a dashboard with no tablet layout, open on the desktop layout ------
  const desk = await newPage(DESKTOP, false)
  await open(desk.page, DASH)
  await enterEdit(desk.page)
  ok('editing at desktop width opens on the desktop layout', (await desk.page.locator('.nh-bpswitch--md').count()) === 0 && (await columns(desk.page)) === 12, String(await columns(desk.page)))
  await exitEdit(desk.page)
  await desk.page.setViewportSize(TABLET)
  await open(desk.page, PLAIN)
  await enterEdit(desk.page)
  ok(
    'a tablet with no tablet layout to show opens on the desktop layout',
    (await desk.page.locator('.nh-bpswitch--md').count()) === 0 && (await columns(desk.page)) === 12,
    String(await columns(desk.page))
  )
  ok('and that is not a change either', await desk.page.locator('button:has-text("Save")').isDisabled())

  // ---- 9. the mouse: a handle drag leaves the panel shut, a click on the handle opens it -----------
  await desk.page.setViewportSize(DESKTOP)
  await exitEdit(desk.page)
  await open(desk.page, PLAIN)
  await enterEdit(desk.page)
  const handle = await cellOf(desk.page, 'AAA').locator('.nh-cell__handle').boundingBox()
  const g0 = await gridPoint(desk.page, 0, 0)
  const g1 = await gridPoint(desk.page, 1, 1)
  const hx = handle.x + 12
  const hy = handle.y + handle.height / 2
  await desk.page.mouse.move(hx, hy)
  await desk.page.mouse.down()
  await desk.page.mouse.move(hx + 8, hy + 8, { steps: 3 })
  await desk.page.mouse.move(hx + 2 * (g1.x - g0.x), hy + 3 * (g1.y - g0.y), { steps: 10 })
  await desk.page.mouse.up()
  await sleep(400)
  const aMouse = await placeOf(desk.page, 'AAA')
  ok('a mouse drag by the handle moves the widget', aMouse?.col === '3' && aMouse?.row === '4', JSON.stringify(aMouse))
  ok('and dropping it leaves the settings panel shut', !(await panelOpen(desk.page)))
  await cellOf(desk.page, 'AAA').locator('.nh-cell__handle').click({ position: { x: 12, y: 8 } })
  await desk.page.waitForSelector('.nh-sheet--side', { timeout: 4000 }).catch(() => {})
  ok('a click on the handle is a tap, and opens the settings', await panelOpen(desk.page))
  await desk.page.click('.nh-sheet--side .nh-sheet__close').catch(() => {})
  await desk.page.waitForFunction(() => !document.querySelector('.nh-sheet--side'), { timeout: 4000 }).catch(() => {})

  // the same edge scroll with the mouse, dragging by the handle
  await desk.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(300)
  const myBottom = await scrollY(desk.page)
  const dh = await cellOf(desk.page, 'DDD').locator('.nh-cell__handle').boundingBox()
  const mBar = await desk.page.evaluate(() => document.querySelector('.nh-dash__bar')?.getBoundingClientRect().bottom ?? 0)
  await desk.page.mouse.move(dh.x + 12, dh.y + dh.height / 2)
  await desk.page.mouse.down()
  await desk.page.mouse.move(dh.x + 12, dh.y - 30, { steps: 3 })
  await desk.page.mouse.move(dh.x + 12, mBar + 6, { steps: 12 })
  await sleep(1500)
  const myTop = await scrollY(desk.page)
  await desk.page.mouse.move(dh.x + 12, mBar + 120, { steps: 4 })
  await desk.page.mouse.up()
  await sleep(300)
  ok('dragging by the handle to the top edge scrolls the page up', myBottom > 150 && myTop < myBottom - 150, `scrollY ${myBottom} -> ${myTop}`)
  await exitEdit(desk.page)
  await desk.ctx.close()

  // ---- 10. the phone stack: hold to drag, edge scroll, a swipe still scrolls ------------------------
  const ph = await newPage(PHONE, true)
  await open(ph.page, STACK)
  await enterEdit(ph.page)
  const order = () => ph.page.$$eval('.nh-grid--stackedit .nh-cell .nh-widget__body', (els) => els.map((e) => e.textContent?.trim()))
  ok('the phone edits the stack', (await ph.page.locator('.nh-grid--stackedit').count()) === 1)
  // both rows on screen: a touch outside the window lands on nothing
  const s4 = await centre(ph.page, 'S4')
  const s2 = await centre(ph.page, 'S2')
  await ph.finger.down(s4.x, s4.y)
  await sleep(HOLD)
  const stackLifted = await ph.page.locator('.nh-cell--lifted').filter({ has: ph.page.locator('.nh-widget', { hasText: 'S4' }) }).count()
  await glide(ph.finger, s4, { x: s4.x, y: s2.y - 10 })
  await ph.finger.up()
  await sleep(400)
  const o1 = await order()
  ok('a held row in the stack lifts', stackLifted === 1, `on screen at y=${Math.round(s4.y)} of ${PHONE.height}`)
  ok('and drags to a new place', o1.indexOf('S4') === 1, o1.join(','))
  ok('and dropping it leaves the panel shut', !(await panelOpen(ph.page)) && (await selectedCount(ph.page)) === 0)

  await ph.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(300)
  const pyBottom = await scrollY(ph.page)
  const s9 = await centre(ph.page, 'S9')
  const pBar = await ph.page.evaluate(() => document.querySelector('.nh-dash__bar')?.getBoundingClientRect().bottom ?? 0)
  await ph.finger.down(s9.x, s9.y)
  await sleep(HOLD)
  await glide(ph.finger, s9, { x: s9.x, y: pBar + 6 }, 12, 30)
  await sleep(1800)
  const pyTop = await scrollY(ph.page)
  await glide(ph.finger, { x: s9.x, y: pBar + 6 }, { x: s9.x, y: pBar + 40 }, 3, 30)
  await ph.finger.up()
  await sleep(400)
  const o2 = await order()
  ok('holding a stack row at the top edge scrolls the page up', pyBottom > 150 && pyTop < pyBottom - 150, `scrollY ${pyBottom} -> ${pyTop}`)
  ok('and it drops near the top of the stack', o2.indexOf('S9') >= 0 && o2.indexOf('S9') <= 2, o2.join(','))

  await ph.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(200)
  await watchDrags(ph.page)
  const before3 = (await order()).join(',')
  const s3 = await centre(ph.page, 'S3')
  const py0 = await scrollY(ph.page)
  await ph.finger.down(s3.x, s3.y + 20)
  await glide(ph.finger, { x: s3.x, y: s3.y + 20 }, { x: s3.x, y: s3.y - 200 }, 8, 12)
  await ph.finger.up()
  await sleep(700)
  ok('a quick swipe on the stack scrolls it', (await scrollY(ph.page)) > py0 + 40, `scrollY ${py0} -> ${await scrollY(ph.page)}`)
  ok('and reorders nothing', (await order()).join(',') === before3 && (await ph.page.evaluate(() => window.__nhDragSeen)) === false)
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
