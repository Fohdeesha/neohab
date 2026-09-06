/**
 * Tablet layout + per-surface visibility e2e.
 *
 * Covers: a dashboard without a tablet layout renders the desktop layout at tablet width exactly
 * as before (the feature is opt-in); switching the editor to the tablet layout materialises it,
 * moving a widget there leaves the desktop layout alone (and the other way round), the tablet
 * column count is its own, Save persists `layout.md` + `mdColumns`, the tablet band then renders
 * that layout, and removing it puts tablets back on the desktop layout. Plus hideOn: a widget
 * hidden on phones/tablets/desktops disappears at exactly that size in run mode, stays visible
 * (dimmed, marked) in edit mode so it can be un-hidden, and a dashboard whose widgets are all
 * hidden says so rather than rendering an empty grid.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-bp, deletes exactly that, and commands
 * NOTHING (clock/label/value widgets only).
 */
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const DASH = 'nh-e2e-bp'
const UID = 'dashboard:' + DASH
// Viewports that land in each band. The grid measures its container, so the dashboard surface is
// a little narrower than the window; these are comfortably inside each band either way.
const PHONE = { width: 393, height: 850 }
const TABLET = { width: 1000, height: 900 }
const DESKTOP = { width: 1500, height: 950 }

const del = async (u) => fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH }).catch(() => {})
const get = async (u) => {
  const r = await fetch(NS + '/' + encodeURIComponent(u), { headers: AUTH })
  return r.ok ? r.json() : null
}
const seed = async (widgets, extra = {}) => {
  await del(UID)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: DASH, name: 'E2E Breakpoints', columns: 12, rowHeight: 60, gap: 8, widgets, ...extra },
    }),
  })
  return r.ok
}
const W = (id, x, y, w, h, config = {}) => ({ id, type: 'clock', config, layout: { lg: { x, y, w, h } } })

const browser = await launch()
const ctx = await browser.newContext({ viewport: DESKTOP })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => void d.accept())
await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

/** Reload onto the dashboard (a hash-only goto would keep a stale configuration). */
const open = async () => {
  await page.goto(APP + `#/d/${DASH}`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-widget, .nh-dash__empty', { timeout: 20000 })
}
const enterEdit = async () => {
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit, .nh-grid--stackedit', { timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 15000 })
}
/** Grid geometry as rendered: id -> {col,row,span} plus the grid's column template. */
const rendered = () =>
  page.evaluate(() => {
    const grid = document.querySelector('.nh-grid, .nh-grid--edit')
    const cells = [...document.querySelectorAll('.nh-gcell, .nh-cell')].map((el) => {
      const cs = getComputedStyle(el)
      return { col: cs.gridColumnStart, row: cs.gridRowStart, type: el.querySelector('.nh-cell__type')?.textContent ?? null }
    })
    return {
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      stacked: Boolean(document.querySelector('.nh-grid--stacked, .nh-grid--stackedit')),
      cells,
      empty: document.querySelector('.nh-dash__empty')?.textContent ?? null,
    }
  })
const cellPoint = async (col, row) =>
  page.evaluate(
    ({ col, row }) => {
      const grid = document.querySelector('.nh-grid--edit')
      const box = grid.getBoundingClientRect()
      const cs = getComputedStyle(grid)
      const gap = parseFloat(cs.gap) || 0
      const cols = cs.gridTemplateColumns.split(' ').length
      const colWidth = (box.width - gap * (cols - 1)) / cols
      const rowHeight = parseFloat(cs.gridAutoRows) || 60
      return { x: box.left + col * (colWidth + gap) + colWidth / 2, y: box.top + row * (rowHeight + gap) + rowHeight / 2 }
    },
    { col, row }
  )
/** Drag a cell by its handle strip from one grid cell to another. */
const dragCell = async (fromCol, fromRow, toCol, toRow) => {
  const from = await cellPoint(fromCol, fromRow)
  const to = await cellPoint(toCol, toRow)
  // the handle strip sits along the top of the cell
  const handle = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y)?.closest('.nh-cell')
      const h = el?.querySelector('.nh-cell__handle')?.getBoundingClientRect()
      return h ? { x: h.left + 12, y: h.top + h.height / 2 } : null
    },
    from
  )
  if (!handle) throw new Error('no handle at the source cell')
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  await page.mouse.move(handle.x + 8, handle.y + 8, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

try {
  /* ---------- opt-in: no tablet layout means the tablet band is unchanged ---------- */
  ok('seed', await seed([W('w-a', 0, 0, 2, 2), W('w-b', 4, 0, 2, 2)]))
  await page.setViewportSize(TABLET)
  await open()
  const plainTablet = await rendered()
  ok('without a tablet layout the tablet band uses the desktop grid', plainTablet.columns === 12, String(plainTablet.columns))
  ok('and the desktop rects', plainTablet.cells.map((c) => c.col).join(',') === '1,5', JSON.stringify(plainTablet.cells))

  /* ---------- the switcher only exists on the grid surface ---------- */
  await enterEdit()
  ok('the layout switcher is offered while editing', (await page.locator('.nh-bpswitch').count()) === 1)
  ok('it starts on the desktop layout', (await page.textContent('.nh-bpswitch'))?.includes('Desktop') === true, String(await page.textContent('.nh-bpswitch')))
  ok('dashboard settings offer no tablet fields yet', (await page.locator('#nh-dash-mdcolumns').count()) === 0)

  /* ---------- switching materialises a tablet layout that looks identical ---------- */
  await page.click('.nh-bpswitch')
  await page.waitForSelector('.nh-bpswitch--md', { timeout: 10000 })
  const afterSwitch = await rendered()
  ok('the switcher now reads Tablet layout', (await page.textContent('.nh-bpswitch'))?.includes('Tablet') === true)
  ok('the tablet layout starts as a copy of the desktop one', afterSwitch.cells.map((c) => c.col).join(',') === '1,5', JSON.stringify(afterSwitch.cells))
  ok('the tablet grid starts with the same column count', afterSwitch.columns === 12, String(afterSwitch.columns))

  /* ---------- moving a widget on the tablet layout leaves the desktop one alone ---------- */
  await dragCell(4, 0, 8, 2)
  await sleep(300)
  const movedTablet = await rendered()
  ok('the widget moved on the tablet layout', movedTablet.cells.some((c) => c.col === '9' && c.row === '3'), JSON.stringify(movedTablet.cells))
  await page.click('.nh-bpswitch')
  await page.waitForFunction(() => !document.querySelector('.nh-bpswitch--md'), { timeout: 10000 })
  const desktopAfter = await rendered()
  ok('the desktop layout is untouched by a tablet move', desktopAfter.cells.map((c) => c.col + '/' + c.row).join(',') === '1/1,5/1', JSON.stringify(desktopAfter.cells))

  /* ---------- a tablet column count of its own ---------- */
  await page.click('.nh-bpswitch')
  await page.waitForSelector('.nh-bpswitch--md', { timeout: 10000 })
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-mdcolumns', { timeout: 10000 })
  ok('tablet fields appear once a tablet layout exists', (await page.inputValue('#nh-dash-mdcolumns')) === '12', await page.inputValue('#nh-dash-mdcolumns'))
  await page.fill('#nh-dash-mdcolumns', '6')
  await sleep(400)
  const sixCols = await rendered()
  ok('the tablet grid takes its own column count', sixCols.columns === 6, String(sixCols.columns))
  ok('rects were clamped into the narrower grid', sixCols.cells.every((c) => Number(c.col) <= 6), JSON.stringify(sixCols.cells))
  ok('the desktop column field is still 12', (await page.inputValue('#nh-dash-columns')) === '12')

  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const saved = await get(UID)
  ok('mdColumns persisted', saved?.config.mdColumns === 6, String(saved?.config.mdColumns))
  ok('every widget carries a tablet rect', saved?.config.widgets.every((w) => w.layout.md), JSON.stringify(saved?.config.widgets.map((w) => w.layout)))
  ok('desktop rects persisted unchanged', saved?.config.widgets.map((w) => w.layout.lg.x).join(',') === '0,4', JSON.stringify(saved?.config.widgets.map((w) => w.layout.lg)))

  /* ---------- run mode: each band renders its own layout ---------- */
  await open()
  const runTablet = await rendered()
  ok('the tablet band renders the tablet grid', runTablet.columns === 6, String(runTablet.columns))
  await page.setViewportSize(DESKTOP)
  await open()
  const runDesktop = await rendered()
  ok('the desktop band still renders 12 columns', runDesktop.columns === 12, String(runDesktop.columns))
  ok('and the desktop rects', runDesktop.cells.map((c) => c.col).join(',') === '1,5', JSON.stringify(runDesktop.cells))
  await page.setViewportSize(PHONE)
  await open()
  ok('phones still stack', (await rendered()).stacked === true)

  /* ---------- removing the tablet layout ---------- */
  await page.setViewportSize(DESKTOP)
  await open()
  await enterEdit()
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-mdcolumns', { timeout: 10000 })
  await page.click('button:has-text("Remove the tablet layout")')
  await sleep(300)
  ok('the tablet fields go away with the layout', (await page.locator('#nh-dash-mdcolumns').count()) === 0)
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const cleared = await get(UID)
  ok('mdColumns was cleared', cleared?.config.mdColumns === undefined, String(cleared?.config.mdColumns))
  ok('tablet rects were cleared', cleared?.config.widgets.every((w) => w.layout.md === undefined), JSON.stringify(cleared?.config.widgets.map((w) => w.layout)))
  await page.setViewportSize(TABLET)
  await open()
  ok('tablets are back on the desktop layout', (await rendered()).columns === 12)

  /* ---------- hideOn ---------- */
  ok(
    'seed with per-surface visibility',
    await seed([
      W('w-all', 0, 0, 2, 2),
      W('w-nophone', 2, 0, 2, 2, { hideOn: ['phone'] }),
      W('w-notablet', 4, 0, 2, 2, { hideOn: ['tablet'] }),
      W('w-nodesktop', 6, 0, 2, 2, { hideOn: ['desktop'] }),
    ])
  )
  await page.setViewportSize(DESKTOP)
  await open()
  ok('a desktop-hidden widget is gone on the desktop', (await rendered()).cells.length === 3, JSON.stringify((await rendered()).cells.length))
  await page.setViewportSize(TABLET)
  await open()
  const tabletShown = await rendered()
  ok('a tablet-hidden widget is gone on a tablet', tabletShown.cells.length === 3, String(tabletShown.cells.length))
  ok('and the desktop-hidden one is back', tabletShown.cells.some((c) => c.col === '7'), JSON.stringify(tabletShown.cells))
  await page.setViewportSize(PHONE)
  await open()
  ok('a phone-hidden widget is gone on a phone', (await page.locator('.nh-gcell').count()) === 3, String(await page.locator('.nh-gcell').count()))

  /* ---------- hidden widgets are still editable ---------- */
  await page.setViewportSize(DESKTOP)
  await open()
  await enterEdit()
  const editCells = await page.locator('.nh-cell').count()
  ok('edit mode shows every widget, hidden or not', editCells === 4, String(editCells))
  ok('hidden widgets are marked', (await page.locator('.nh-cell--hidden').count()) === 3, String(await page.locator('.nh-cell--hidden').count()))
  ok('the marker explains itself', (await page.locator('.nh-cell__hidden').first().getAttribute('title'))?.includes('Hidden on') === true, String(await page.locator('.nh-cell__hidden').first().getAttribute('title')))

  // un-hide through the settings panel
  await page.locator('.nh-cell--hidden').first().locator('.nh-cell__overlay').click()
  await page.waitForSelector('.nh-hideon', { timeout: 10000 })
  const pressed = await page.locator('.nh-hideon .nh-chip[aria-pressed="true"]').count()
  ok('the panel shows which sizes are hidden', pressed === 1, String(pressed))
  await page.locator('.nh-hideon .nh-chip[aria-pressed="true"]').click()
  await sleep(300)
  ok('clearing the chip un-hides the widget', (await page.locator('.nh-hideon .nh-chip[aria-pressed="true"]').count()) === 0)
  await page.locator('.nh-hideon .nh-chip').nth(0).click() // hide on phones
  await sleep(300)
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const hidSaved = await get(UID)
  const changed = hidSaved?.config.widgets.find((w) => w.id !== 'w-all' && Array.isArray(w.config.hideOn) && w.config.hideOn.includes('phone'))
  ok('the chip choice persisted', changed !== undefined, JSON.stringify(hidSaved?.config.widgets.map((w) => [w.id, w.config.hideOn])))

  /* ---------- an empty dashboard still explains itself ---------- */
  ok('seed empty', await seed([]))
  await open()
  const emptyDash = await rendered()
  ok('an empty dashboard shows its hint', /no widgets yet/.test(emptyDash.empty ?? ''), String(emptyDash.empty))

  /* ---------- the editor survives crossing the stacked threshold ---------- */
  ok('seed for a resize', await seed([W('w-a', 0, 0, 2, 2), W('w-b', 4, 0, 2, 2)]))
  await page.setViewportSize(DESKTOP)
  await open()
  await enterEdit()
  await page.setViewportSize(PHONE)
  await page.waitForSelector('.nh-grid--stackedit', { timeout: 10000 })
  ok('narrowing while editing switches to the stacked surface', (await page.locator('.nh-cell').count()) === 2, String(await page.locator('.nh-cell').count()))
  await page.setViewportSize(DESKTOP)
  await page.waitForSelector('.nh-grid--edit', { timeout: 10000 })
  await sleep(500)
  const backToGrid = await page.locator('.nh-grid--edit .nh-cell').count()
  ok('widening again gives a working grid, not an empty one', backToGrid === 2, String(backToGrid))
  await page.click('button:has-text("Exit")')

  /* ---------- everything hidden says so ---------- */
  ok('seed all-hidden', await seed([W('w-x', 0, 0, 2, 2, { hideOn: ['phone', 'tablet', 'desktop'] })]))
  await open()
  const allHidden = await rendered()
  ok('a fully hidden dashboard explains itself', /hidden at this screen size/.test(allHidden.empty ?? ''), String(allHidden.empty))
  ok('and does not claim to be empty', !/no widgets yet/.test(allHidden.empty ?? ''))

  ok('console clean', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err).slice(0, 200))
} finally {
  await del(UID)
  const uids = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  ok('cleanup: no leftovers', !uids.includes(UID), uids.filter((u) => u.includes('nh-e2e')).join(','))
  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
