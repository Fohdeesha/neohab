// Tablet layout + per-surface visibility e2e.
// SAFE with a live config: creates only dashboard:nh-e2e-bp, deletes exactly that, and commands NOTHING
// (clock/label/value widgets only). It does patch the SHARED settings component for the breakpoint
// section - snapshotted first and put back in the finally, deleted again if the server had none.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH } from './lib/target.mjs'
import { getSettings, patchSettings, restoreSettings } from './lib/components.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const DASH = 'nh-e2e-bp'
const UID = 'dashboard:' + DASH
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

// declared out here so the finally can put them back whatever fails in between
let settingsSnapshot = null
let settingsTouched = false

const browser = await launch()
const ctx = await browser.newContext({ viewport: DESKTOP })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => void d.accept())
await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

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
const dragCell = async (fromCol, fromRow, toCol, toRow) => {
  const from = await cellPoint(fromCol, fromRow)
  const to = await cellPoint(toCol, toRow)
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
  ok('seed', await seed([W('w-a', 0, 0, 2, 2), W('w-b', 4, 0, 2, 2)]))
  await page.setViewportSize(TABLET)
  await open()
  const plainTablet = await rendered()
  ok('without a tablet layout the tablet band uses the desktop grid', plainTablet.columns === 12, String(plainTablet.columns))
  ok('and the desktop rects', plainTablet.cells.map((c) => c.col).join(',') === '1,5', JSON.stringify(plainTablet.cells))

  await enterEdit()
  ok('the layout switcher is offered while editing', (await page.locator('.nh-bpswitch').count()) === 1)
  ok('it starts on the desktop layout', (await page.textContent('.nh-bpswitch'))?.includes('Desktop') === true, String(await page.textContent('.nh-bpswitch')))
  ok('dashboard settings offer no tablet fields yet', (await page.locator('#nh-dash-mdcolumns').count()) === 0)

  await page.click('.nh-bpswitch')
  await page.waitForSelector('.nh-bpswitch--md', { timeout: 10000 })
  const afterSwitch = await rendered()
  ok('the switcher now reads Tablet layout', (await page.textContent('.nh-bpswitch'))?.includes('Tablet') === true)
  ok('the tablet layout starts as a copy of the desktop one', afterSwitch.cells.map((c) => c.col).join(',') === '1,5', JSON.stringify(afterSwitch.cells))
  ok('the tablet grid starts with the same column count', afterSwitch.columns === 12, String(afterSwitch.columns))

  await dragCell(4, 0, 8, 2)
  await sleep(300)
  const movedTablet = await rendered()
  ok('the widget moved on the tablet layout', movedTablet.cells.some((c) => c.col === '9' && c.row === '3'), JSON.stringify(movedTablet.cells))
  await page.click('.nh-bpswitch')
  await page.waitForFunction(() => !document.querySelector('.nh-bpswitch--md'), { timeout: 10000 })
  const desktopAfter = await rendered()
  ok('the desktop layout is untouched by a tablet move', desktopAfter.cells.map((c) => c.col + '/' + c.row).join(',') === '1/1,5/1', JSON.stringify(desktopAfter.cells))

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

  // A widget taken off the desktop layout lives on the tablet one. Take the tablet layout away as
  // well and it has nowhere left to draw, which is the state the scoped delete refuses to create -
  // so removing the layout brings those back rather than leaving them invisible.
  ok(
    'seed a widget kept only for the tablet layout',
    await seed(
      [W('w-a', 0, 0, 2, 2), W('w-tabletonly', 4, 0, 2, 2, { hideOn: ['desktop', 'phone'] })],
      { mdColumns: 8 }
    )
  )
  await page.setViewportSize(DESKTOP)
  await open()
  ok('it is not on the desktop to start with', (await page.locator('.nh-gcell').count()) === 1, String(await page.locator('.nh-gcell').count()))
  await enterEdit()
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-mdcolumns', { timeout: 10000 })
  await page.click('button:has-text("Remove the tablet layout")')
  await sleep(400)
  const rescue = await page.locator('.nh-toast__text').first().textContent().catch(() => null)
  ok('removing the layout says what it did to them', /showing again/i.test(rescue ?? ''), String(rescue))
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const rescued = await get(UID)
  ok(
    'and no widget is left showing on no screen at all',
    rescued?.config.widgets.every((wg) => !Array.isArray(wg.config?.hideOn) || wg.config.hideOn.length < 3),
    JSON.stringify(rescued?.config.widgets.map((wg) => [wg.id, wg.config?.hideOn]))
  )
  await open()
  ok('the widget that was tablet-only is on the desktop now', (await page.locator('.nh-gcell').count()) === 2, String(await page.locator('.nh-gcell').count()))

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

  await page.setViewportSize(DESKTOP)
  await open()
  await enterEdit()
  const editCells = await page.locator('.nh-cell').count()
  ok('edit mode shows every widget, hidden or not', editCells === 4, String(editCells))
  ok('hidden widgets are marked', (await page.locator('.nh-cell--hidden').count()) === 3, String(await page.locator('.nh-cell--hidden').count()))
  ok('the marker explains itself', (await page.locator('.nh-cell__hidden').first().getAttribute('title'))?.includes('Hidden on') === true, String(await page.locator('.nh-cell__hidden').first().getAttribute('title')))

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

  // --- Delete is scoped to the layout being edited, once there is more than one -----------------
  //
  // Reported from a real board: deleting a widget while the TABLET layout was on screen took it off
  // the desktop one as well, with nothing on screen saying it would. The two layouts are meant to
  // share their widgets, so adding puts a widget on both and removing takes it off the one in front
  // of you.
  const storedHideOn = async (id) => {
    const c = await get(UID)
    return c?.config.widgets.find((w) => w.id === id)?.config?.hideOn ?? null
  }
  const stillThere = async (id) => {
    const c = await get(UID)
    return c?.config.widgets.some((w) => w.id === id) === true
  }
  const deleteCell = async (id) => {
    await page.locator(`.nh-cell:has(.nh-cell__type)`).first().waitFor({ timeout: 10000 })
    await page.evaluate((wid) => {
      const cells = [...document.querySelectorAll('.nh-cell')]
      const el = cells[Number(wid)]
      el.querySelector('.nh-cell__delete').click()
    }, id)
    await sleep(300)
  }

  ok('seed for scoped deletes', await seed([W('w-a', 0, 0, 2, 2), W('w-b', 4, 0, 2, 2)]))
  await page.setViewportSize(DESKTOP)
  await open()
  await enterEdit()
  await deleteCell(1)
  ok('with one layout, delete is still a delete', (await page.locator('.nh-cell').count()) === 1, String(await page.locator('.nh-cell').count()))
  ok('and it says nothing about layouts', (await page.locator('.nh-toast').count()) === 0)
  await page.keyboard.press('Control+z')
  await sleep(300)
  ok('undo brings it back', (await page.locator('.nh-cell').count()) === 2)

  await page.click('.nh-bpswitch')
  await page.waitForSelector('.nh-bpswitch--md', { timeout: 10000 })
  await deleteCell(1)
  ok('on the tablet layout the widget stays on the board', (await page.locator('.nh-cell').count()) === 2, String(await page.locator('.nh-cell').count()))
  ok('it is drawn as off this layout', (await page.locator('.nh-cell--offhere').count()) === 1, String(await page.locator('.nh-cell--offhere').count()))
  const toast = await page.locator('.nh-toast__text').first().textContent()
  ok('a notice says which layout kept it', /tablet layout/i.test(toast ?? '') && /desktop layout/i.test(toast ?? ''), String(toast))
  ok('and offers to remove it everywhere', (await page.locator('.nh-toast__action').count()) === 1, String(await page.locator('.nh-toast__action').count()))

  // a scoped delete is an ordinary change to the draft, so undo has to take it back
  await page.keyboard.press('Control+z')
  await sleep(300)
  ok('undo puts it back on the tablet layout', (await page.locator('.nh-cell--offhere').count()) === 0)
  await page.keyboard.press('Control+Shift+z')
  await sleep(300)
  ok('and redo takes it off again', (await page.locator('.nh-cell--offhere').count()) === 1)

  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  ok('the widget is still stored', await stillThere('w-b'))
  ok('stored as hidden on tablets only', JSON.stringify(await storedHideOn('w-b')) === '["tablet"]', JSON.stringify(await storedHideOn('w-b')))

  await page.setViewportSize(TABLET)
  await open()
  ok('a tablet no longer draws it', (await page.locator('.nh-gcell').count()) === 1, String(await page.locator('.nh-gcell').count()))
  await page.setViewportSize(DESKTOP)
  await open()
  ok('the desktop still draws it', (await page.locator('.nh-gcell').count()) === 2, String(await page.locator('.nh-gcell').count()))

  // the way back: the badge on the handle of a widget that is off this layout
  await enterEdit()
  await page.click('.nh-bpswitch')
  await page.waitForSelector('.nh-bpswitch--md', { timeout: 10000 })
  ok('the off-layout widget carries a restore button', (await page.locator('.nh-cell__restore').count()) === 1)
  // it is inert until the handle strip is visible, exactly like the delete beside it, so hover
  // first - a force click would pass against a build where nobody could ever press it
  ok(
    'and it is inert until the strip is shown',
    (await page.locator('.nh-cell__restore').first().evaluate((el) => getComputedStyle(el).pointerEvents)) === 'none'
  )
  await page.locator('.nh-cell--offhere').first().hover()
  await sleep(200)
  await page.locator('.nh-cell__restore').first().click()
  await sleep(300)
  ok('pressing it puts the widget back on this layout', (await page.locator('.nh-cell--offhere').count()) === 0)
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  ok('and clears the stored hideOn rather than emptying it', (await storedHideOn('w-b')) === null, JSON.stringify(await storedHideOn('w-b')))

  // the mirror: taking it off the DESKTOP layout leaves it on the tablet one, and takes the phone
  // stack with it, because the stack is the desktop layout reflowed
  await enterEdit()
  await deleteCell(1)
  ok('a desktop delete also keeps the widget', (await page.locator('.nh-cell').count()) === 2, String(await page.locator('.nh-cell').count()))
  const toast2 = await page.locator('.nh-toast__text').first().textContent()
  ok('and names the tablet layout as the keeper', /desktop layout/i.test(toast2 ?? '') && /tablet layout/i.test(toast2 ?? ''), String(toast2))
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const both = await storedHideOn('w-b')
  ok('the phone stack goes with the desktop layout', Array.isArray(both) && both.includes('desktop') && both.includes('phone') && both.length === 2, JSON.stringify(both))
  await page.setViewportSize(PHONE)
  await open()
  ok('so a phone does not draw it either', (await page.locator('.nh-gcell').count()) === 1, String(await page.locator('.nh-gcell').count()))

  // and a removal that would leave it showing on no screen at all is a real delete instead
  await page.setViewportSize(DESKTOP)
  await open()
  await enterEdit()
  await page.click('.nh-bpswitch')
  await page.waitForSelector('.nh-bpswitch--md', { timeout: 10000 })
  await deleteCell(1)
  ok('the last layer off deletes the widget outright', (await page.locator('.nh-cell').count()) === 1, String(await page.locator('.nh-cell').count()))
  ok('with no notice promising it was kept', (await page.locator('.nh-toast').count()) === 0)
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  ok('and it is gone from the stored config', (await stillThere('w-b')) === false)

  // --- A widget added on the tablet layout has to land free on the DESKTOP one too ---------------
  ok('seed two layouts that have drifted apart', await seed([W('w-a', 0, 0, 4, 4)], { mdColumns: 8 }))
  const drifted = await get(UID)
  drifted.config.widgets[0].layout = { lg: { x: 0, y: 0, w: 4, h: 4 }, md: { x: 4, y: 0, w: 4, h: 4 } }
  await fetch(NS + '/' + encodeURIComponent(UID), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(drifted),
  })
  await open()
  await enterEdit()
  await page.click('.nh-bpswitch')
  await page.waitForSelector('.nh-bpswitch--md', { timeout: 10000 })
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette__card', { timeout: 10000 })
  await page.fill('.nh-palette__search', 'label')
  await sleep(300)
  await page.locator('.nh-palette__card').first().click()
  await sleep(500)
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const added = await get(UID)
  const rects = (bp) =>
    added.config.widgets.map((w) => ({ id: w.id, r: bp === 'md' ? (w.layout.md ?? w.layout.lg) : w.layout.lg }))
  const overlapping = (bp) => {
    const list = rects(bp)
    const hits = []
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].r
        const b = list[j].r
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) hits.push(list[i].id + '/' + list[j].id)
      }
    return hits
  }
  ok('the new widget is on both layouts', added.config.widgets.length === 2 && added.config.widgets.every((w) => w.layout.lg && w.layout.md), JSON.stringify(added.config.widgets.map((w) => w.layout)))
  ok('and overlaps nothing on the tablet layout', overlapping('md').length === 0, JSON.stringify(rects('md')))
  ok('nor on the desktop layout it was not added from', overlapping('lg').length === 0, JSON.stringify(rects('lg')))

  // --- Where the layouts change over is a setting, not a constant ---------------------------------
  ok('seed for the breakpoint settings', await seed([W('w-a', 0, 0, 2, 2), W('w-b', 4, 0, 2, 2)], { mdColumns: 6 }))
  const withMd = await get(UID)
  for (const wg of withMd.config.widgets) wg.layout.md = { ...wg.layout.lg }
  await fetch(NS + '/' + encodeURIComponent(UID), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(withMd),
  })

  settingsSnapshot = await getSettings()
  settingsTouched = true
  await page.setViewportSize(TABLET)
  await open()
  ok('a 1000px window is a tablet by default', (await rendered()).columns === 6, String((await rendered()).columns))

  ok('narrowing the tablet threshold saves', (await patchSettings(settingsSnapshot, { tabletBelow: 900 })).ok)
  await open()
  ok('the same window is now a desktop', (await rendered()).columns === 12, String((await rendered()).columns))

  // 1500px of window is a 1476px dashboard area once the surface padding is off it, so the
  // threshold has to clear THAT, not the window
  ok('widening it again saves', (await patchSettings(settingsSnapshot, { tabletBelow: 1600 })).ok)
  await page.setViewportSize(DESKTOP)
  await open()
  const wide = await rendered()
  ok('and a 1500px window becomes a tablet', wide.columns === 6, `${wide.columns} cols at ${await page.evaluate(() => document.querySelector('.nh-grid')?.clientWidth)}px of grid`)

  // the stacking threshold is the same setting group, and the editor has to agree with run mode or
  // it would draw a stack of a board that renders as a grid
  ok('raising the stacking threshold saves', (await patchSettings(settingsSnapshot, { phoneBelow: 1600, tabletBelow: 1700 })).ok)
  await open()
  ok('a 1500px window now stacks', (await rendered()).stacked === true)
  await enterEdit()
  ok('and the editor stacks with it', (await page.locator('.nh-grid--stackedit').count()) === 1)
  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })

  // a hand-edited settings component can hold a tablet threshold BELOW the phone one, which read
  // literally would put every width in two bands at once
  ok('a contradictory pair saves', (await patchSettings(settingsSnapshot, { phoneBelow: 900, tabletBelow: 500 })).ok)
  await page.setViewportSize(DESKTOP)
  await open()
  ok('a wide window is still a desktop', (await rendered()).columns === 12, JSON.stringify(await rendered()))
  await page.setViewportSize(PHONE)
  await open()
  ok('and a narrow one still stacks', (await rendered()).stacked === true)
  await page.setViewportSize(DESKTOP)

  // the field somebody typed into wins, rather than snapping back to clear the other one
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#nh-set-tabletbelow', { timeout: 20000 })
  await page.fill('#nh-set-tabletbelow', '700')
  await page.locator('#nh-set-tabletbelow').blur()
  await sleep(800)
  ok('lowering the tablet threshold pulls the stacking one down with it', (await page.inputValue('#nh-set-phonebelow')) === '699', `${await page.inputValue('#nh-set-phonebelow')} / ${await page.inputValue('#nh-set-tabletbelow')}`)
  await page.fill('#nh-set-phonebelow', '1100')
  await page.locator('#nh-set-phonebelow').blur()
  await sleep(800)
  ok('and raising the stacking one pushes the tablet one up', (await page.inputValue('#nh-set-tabletbelow')) === '1101', `${await page.inputValue('#nh-set-phonebelow')} / ${await page.inputValue('#nh-set-tabletbelow')}`)

  const restored = await restoreSettings(settingsSnapshot)
  settingsTouched = !restored.ok
  ok('the shared settings went back exactly as they were', restored.ok, restored.mode + ' ' + restored.detail)
  await open()
  ok('and a 1500px window is a desktop again', (await rendered()).columns === 12, String((await rendered()).columns))
  await page.setViewportSize(DESKTOP)

  ok('seed empty', await seed([]))
  await open()
  const emptyDash = await rendered()
  ok('an empty dashboard shows its hint', /no widgets yet/.test(emptyDash.empty ?? ''), String(emptyDash.empty))

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

  // the shape a real board reaches: one widget moved on the tablet layout and one added later while
  // editing the desktop layout, which has no tablet rect of its own and used to land on top of it
  const moved = { ...W('w-moved', 0, 0, 6, 2), layout: { lg: { x: 0, y: 0, w: 6, h: 2 }, md: { x: 0, y: 0, w: 7, h: 2 } } }
  ok('seed a half-pinned tablet layout', await seed([moved, W('w-added', 6, 0, 6, 2)]))
  await page.setViewportSize(TABLET)
  await open()
  const halfPinned = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.nh-gcell')].map((c) => {
      const r = c.getBoundingClientRect()
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
    })
    let overlaps = 0
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps++
      }
    return { count: boxes.length, overlaps }
  })
  ok(
    'a widget with no tablet rect is fitted around one that was moved, not laid on top of it',
    halfPinned.count === 2 && halfPinned.overlaps === 0,
    JSON.stringify(halfPinned)
  )
  await page.setViewportSize(DESKTOP)

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
  // the shared settings belong to whoever runs this server, so they go back whatever happened above
  if (settingsTouched) {
    const put = await restoreSettings(settingsSnapshot)
    ok('cleanup: the shared settings are back as they were', put.ok, put.mode + ' ' + put.detail)
  }
  const uids = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  ok('cleanup: no leftovers', !uids.includes(UID), uids.filter((u) => u.includes('nh-e2e')).join(','))
  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
