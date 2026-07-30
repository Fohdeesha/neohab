/**
 * Palette drag-to-place e2e.
 *
 * Covers: dragging a palette card onto the grid previews the exact target cell (named, and red
 * when occupied), the palette steps aside while the drag is in flight, the drop lands the widget
 * at that cell rather than at the first free spot, an occupied cell or a release outside the grid
 * cancels without adding anything, one undo removes a placed widget, Save persists the dropped
 * rect, tapping a card still adds at the first free spot, and the phone (stacked) surface offers
 * no drag at all.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-place, deletes exactly that, and
 * commands NOTHING (clock/label widgets only).
 */
import { chromium } from 'playwright-core'
import { APP, NS, TOKEN, AUTH } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

const DASH = 'nh-e2e-place'
const UID = 'dashboard:' + DASH

const del = async (u) => fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH }).catch(() => {})
const get = async (u) => {
  const r = await fetch(NS + '/' + encodeURIComponent(u), { headers: AUTH })
  return r.ok ? r.json() : null
}

/** Two widgets in the top-left corner, so the first free spot is nowhere near where we drop. */
const seed = async () => {
  await del(UID)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: DASH, name: 'E2E Place', columns: 12, rowHeight: 60, gap: 8,
        widgets: [
          { id: 'w-a', type: 'clock', config: { label: 'A' }, layout: { lg: { x: 0, y: 0, w: 2, h: 2 } } },
          { id: 'w-b', type: 'label', config: { text: 'B' }, layout: { lg: { x: 2, y: 0, w: 2, h: 2 } } },
        ],
      },
    }),
  })
  return r.ok
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => void d.accept())
await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

const enterEdit = async () => {
  await page.goto(APP + `#/d/${DASH}`, { waitUntil: 'domcontentloaded' })
  // a goto that only changes the hash is a same-document navigation, so the app would keep the
  // configuration it loaded before this suite re-seeded the dashboard
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 })
  // the edit grid paints empty for one frame
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 15000 })
}
const openPalette = async () => {
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette__card', { timeout: 10000 })
}
const cellCount = () => page.$$eval('.nh-cell', (els) => els.length)
/** Centre of grid cell (col,row), in page coordinates, from the live grid geometry. */
const cellPoint = async (col, row) =>
  page.evaluate(
    ({ col, row }) => {
      const grid = document.querySelector('.nh-grid--edit')
      const box = grid.getBoundingClientRect()
      const cs = getComputedStyle(grid)
      const gap = parseFloat(cs.gap) || 0
      const colWidth = (box.width - gap * 11) / 12
      const rowHeight = parseFloat(cs.gridAutoRows) || 60
      return {
        x: box.left + col * (colWidth + gap) + colWidth / 2,
        y: box.top + row * (rowHeight + gap) + rowHeight / 2,
      }
    },
    { col, row }
  )
const dropInfo = () =>
  page.evaluate(() => {
    const el = document.querySelector('.nh-drop--place')
    if (!el) return null
    const cs = getComputedStyle(el)
    return {
      col: cs.gridColumnStart,
      row: cs.gridRowStart,
      span: cs.gridColumnEnd,
      invalid: el.classList.contains('nh-drop--invalid'),
      label: el.textContent,
    }
  })
const card = (name) => page.locator('.nh-palette__card', { hasText: new RegExp('^' + name) }).first()

/** Press a palette card and move to a point in steps, leaving the button held. */
const dragCardTo = async (name, point) => {
  const box = await card(name).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 - 12, { steps: 3 })
  await page.mouse.move(point.x, point.y, { steps: 8 })
  await page.mouse.move(point.x, point.y)
}

try {
  ok('seed dashboard', await seed())

  /* --------------------------- drag onto an empty cell --------------------------- */
  await enterEdit()
  await openPalette()
  ok('palette explains the drag on a wide screen', (await page.locator('.nh-palette__hint').count()) === 1)

  const before = await cellCount()
  const target = await cellPoint(7, 3) // far from the first free spot (which is x=4,y=0)
  await dragCardTo('Value', target)
  const preview = await dropInfo()
  ok('a drag previews the target cell', preview !== null, JSON.stringify(preview))
  ok('preview is at the pointed-at column', preview?.col === '8', String(preview?.col))
  ok('preview is at the pointed-at row', preview?.row === '4', String(preview?.row))
  ok('preview is valid over free space', preview?.invalid === false)
  ok('preview names the widget', (preview?.label ?? '').includes('Value'), String(preview?.label))
  ok('the palette steps aside while dragging', (await page.locator('.nh-sheet--collapsed').count()) === 1)

  await page.mouse.up()
  await page.waitForFunction((n) => document.querySelectorAll('.nh-cell').length === n + 1, before, { timeout: 10000 })
  ok('the drop added a widget', (await cellCount()) === before + 1)
  const placed = await page.evaluate(() => {
    const el = document.querySelector('.nh-cell--selected')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { col: cs.gridColumnStart, row: cs.gridRowStart, type: el.querySelector('.nh-cell__type')?.textContent }
  })
  ok('the widget landed where it was dropped, not at the first free spot', placed?.col === '8' && placed?.row === '4', JSON.stringify(placed))
  ok('the dropped widget is selected', placed !== null)
  ok('the palette closed after the drop', (await page.locator('.nh-palette__card').count()) === 0)
  ok('the settings panel opened for it', (await page.locator('.nh-sheet--side').count()) === 1)

  /* --------------------------- undo is one step --------------------------- */
  await page.click('[aria-label="Undo"]')
  await page.waitForFunction((n) => document.querySelectorAll('.nh-cell').length === n, before, { timeout: 10000 })
  ok('one undo removes the placed widget', (await cellCount()) === before)
  await page.click('[aria-label="Redo"]')
  await page.waitForFunction((n) => document.querySelectorAll('.nh-cell').length === n + 1, before, { timeout: 10000 })
  ok('redo puts it back', (await cellCount()) === before + 1)

  /* --------------------------- Save persists the dropped rect --------------------------- */
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const saved = await get(UID)
  const added = saved?.config.widgets.find((w) => !['w-a', 'w-b'].includes(w.id))
  ok('the dropped widget persisted', added !== undefined, JSON.stringify(saved?.config.widgets.map((w) => w.id)))
  ok('with the rect it was dropped at', added?.layout.lg.x === 7 && added?.layout.lg.y === 3, JSON.stringify(added?.layout.lg))
  ok('its type is the dragged one', added?.type === 'value', String(added?.type))

  /* --------------------------- an occupied cell refuses --------------------------- */
  await seed()
  await enterEdit()
  await openPalette()
  const occupied = await cellPoint(0, 0)
  await dragCardTo('Clock', occupied)
  const badPreview = await dropInfo()
  ok('preview over an occupied cell is invalid', badPreview?.invalid === true, JSON.stringify(badPreview))
  await page.mouse.up()
  await sleep(400)
  ok('dropping on an occupied cell adds nothing', (await cellCount()) === 2, String(await cellCount()))
  ok('the palette stays open after a refused drop', (await page.locator('.nh-palette__card').count()) > 0)
  ok('the palette is no longer stepped aside', (await page.locator('.nh-sheet--collapsed').count()) === 0)

  /* --------------------------- releasing off the grid cancels --------------------------- */
  const offGrid = await page.evaluate(() => {
    const bar = document.querySelector('.nh-dash__bar').getBoundingClientRect()
    return { x: bar.left + bar.width / 2, y: bar.top + bar.height / 2 }
  })
  await dragCardTo('Clock', offGrid)
  ok('no preview when the pointer is off the grid', (await dropInfo()) === null)
  await page.mouse.up()
  await sleep(400)
  ok('releasing off the grid adds nothing', (await cellCount()) === 2, String(await cellCount()))

  /* --------------------------- tapping still adds at the first free spot --------------------------- */
  await page.waitForSelector('.nh-palette__card', { timeout: 10000 })
  await card('Clock').click()
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length === 3, null, { timeout: 10000 })
  const tapped = await page.evaluate(() => {
    const el = document.querySelector('.nh-cell--selected')
    const cs = getComputedStyle(el)
    return { col: cs.gridColumnStart, row: cs.gridRowStart }
  })
  ok('a tap adds at the first free spot', tapped.col === '5' && tapped.row === '1', JSON.stringify(tapped))
  await page.click('button:has-text("Exit")')

  /* --------------------------- phones: no drag surface --------------------------- */
  await page.setViewportSize({ width: 393, height: 850 })
  await page.goto(APP + `#/d/${DASH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--stackedit', { timeout: 15000 })
  await openPalette()
  ok('phone palette offers no drag hint', (await page.locator('.nh-palette__hint').count()) === 0)
  const phoneBox = await card('Clock').boundingBox()
  await page.mouse.move(phoneBox.x + phoneBox.width / 2, phoneBox.y + phoneBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(phoneBox.x + 100, phoneBox.y - 200, { steps: 6 })
  ok('no drop preview on the stacked surface', (await dropInfo()) === null)
  ok('the phone palette does not step aside', (await page.locator('.nh-sheet--collapsed').count()) === 0)
  await page.mouse.up()
  await sleep(300)
  ok('a phone drag adds nothing unexpected', (await page.locator('.nh-cell').count()) <= 3, String(await page.locator('.nh-cell').count()))

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
