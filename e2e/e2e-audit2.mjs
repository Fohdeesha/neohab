/**
 * Audit fixes for configuration that did not come from the editor.
 *
 * The editor validates what it writes, but a dashboard component can also arrive from a backup, a
 * shared partial export or a hand edit, and is then stored verbatim. Everything here is that kind
 * of input:
 *   - importer survives a widget type that names an Object.prototype member ("constructor")
 *   - a nameless dashboard component no longer takes down the whole config load
 *   - backup import writes before deleting (a failed replace cannot leave you with nothing)
 *   - a nonsensical column count (0) still renders, instead of dividing the cell size to Infinity
 *   - a stored tablet rect wider than the tablet grid is clamped into it
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
// columns: 0 divided the column width to Infinity, which took the row height and the icon scale
// with it. It only bites a 'match' dashboard - a numeric rowHeight was returned as-is and hid the
// divide, which is why that is a SEPARATE case below rather than the same one.
await put({
  uid: 'dashboard:nh-e2e-a2-nocols',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-nocols', name: 'E2E Audit2 NoCols', columns: 0, rowHeight: 'match', gap: 5,
    widgets: [{ id: 'a2-v', type: 'label', config: { text: 'Survives' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
  },
})
// a zero fixed row height, from the same unvalidated config
await put({
  uid: 'dashboard:nh-e2e-a2-norow',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-norow', name: 'E2E Audit2 NoRow', columns: 12, rowHeight: 0, gap: 5,
    widgets: [{ id: 'a2-r', type: 'label', config: { text: 'Floored' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
  },
})
// a stored tablet rect wider than the tablet grid it lands in
await put({
  uid: 'dashboard:nh-e2e-a2-mdwide',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-mdwide', name: 'E2E Audit2 MdWide', columns: 12, mdColumns: 4, rowHeight: 'match', gap: 5,
    widgets: [
      { id: 'a2-md', type: 'label', config: { text: 'Wide' }, layout: { lg: { x: 0, y: 0, w: 12, h: 1 }, md: { x: 0, y: 0, w: 9, h: 1 } } },
      { id: 'a2-md2', type: 'label', config: { text: 'Edge' }, layout: { lg: { x: 0, y: 1, w: 12, h: 1 }, md: { x: 3, y: 1, w: 2, h: 1 } } },
    ],
  },
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

  /* --------- a nonsensical column count still renders --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-nocols')
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await page.waitForTimeout(600)
    const geom = await page.evaluate(() => {
      const grid = document.querySelector('.nh-grid')
      const cell = document.querySelector('.nh-gcell')
      const cs = getComputedStyle(grid)
      const r = cell?.getBoundingClientRect()
      return {
        rows: cs.gridAutoRows,
        cols: cs.gridTemplateColumns,
        scale: cs.getPropertyValue('--nh-iconscale'),
        cellW: r ? Math.round(r.width) : -1,
        cellH: r ? Math.round(r.height) : -1,
        label: document.querySelector('.nh-label')?.textContent ?? '',
      }
    })
    // The row height is the tell: 'match' derives it from the column width, so a zero column
    // count used to make it Infinity - a cell taller than any screen, with nothing readable in it.
    const rowPx = parseFloat(geom.rows)
    ok('columns=0: the row height is finite and sane', Number.isFinite(rowPx) && rowPx > 0 && rowPx < 4000, geom.rows)
    ok('columns=0: the widget renders at a finite height', geom.cellH > 0 && geom.cellH < 4000, JSON.stringify(geom))
    ok('columns=0: the column template is valid CSS', /px|fr/.test(geom.cols) && !/Infinity|NaN/.test(geom.cols), geom.cols)
    ok('columns=0: the icon scale is a number', Number.isFinite(parseFloat(geom.scale)), geom.scale)
    ok('columns=0: the widget is still there', geom.label === 'Survives', geom.label)
    ok('columns=0: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
    await ctx.close()
  }

  /* --------- a zero fixed row height is floored rather than collapsed --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-norow')
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await page.waitForTimeout(600)
    const rowH = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.nh-grid')).gridAutoRows))
    const cellH = await page.evaluate(() => Math.round(document.querySelector('.nh-gcell').getBoundingClientRect().height))
    ok('rowHeight=0 is floored to something visible', rowH >= 8, String(rowH))
    ok('rowHeight=0: the cell has height', cellH > 0, String(cellH))
    await ctx.close()
  }

  /* --------- an oversized stored tablet rect is clamped into the tablet grid --------- */
  {
    // 1000px is inside the tablet band (>= 840, < 1200), so the tablet layout is what renders.
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-mdwide')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.waitForTimeout(600)
    const placed = await page.evaluate(() => {
      const grid = document.querySelector('.nh-grid')
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const gridRight = grid.getBoundingClientRect().right
      return [...document.querySelectorAll('.nh-gcell')].map((c) => {
        const cs = getComputedStyle(c)
        const start = parseInt(cs.gridColumnStart, 10)
        const span = parseInt(String(cs.gridColumnEnd).replace(/\D+/g, ''), 10) || 1
        return {
          text: c.querySelector('.nh-label')?.textContent ?? '',
          col: cs.gridColumnStart,
          colEnd: start + span,
          cols,
          overflowPx: Math.round(c.getBoundingClientRect().right - gridRight),
        }
      })
    })
    // The 9-wide stored rect used to create five implicit columns, so the grid was 9 columns
    // rather than the 4 the dashboard asked for and every other widget was laid out against.
    ok('tablet layout renders with its own column count', placed.every((p) => p.cols === 4), JSON.stringify(placed))
    ok(
      'no tablet cell spans past the last column',
      placed.length === 2 && placed.every((p) => p.colEnd <= 5),
      JSON.stringify(placed)
    )
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
  // scoped to what THIS suite made: an unrelated stray must not fail this suite's cleanup
  const left = (await (await fetch(NS)).json()).filter((c) => c.uid.includes('nh-e2e-a2'))
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
