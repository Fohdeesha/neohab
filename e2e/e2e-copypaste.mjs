// Copy/paste + multi-select + exit-edit-mode e2e.
// SAFE with a live config: creates only dashboard:nh-e2e-cpa and dashboard:nh-e2e-cpb and deletes exactly
// those in cleanup (guarded, runs even if a section throws).
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH } from './lib/target.mjs'

const UID_A = 'dashboard:nh-e2e-cpa'
const UID_B = 'dashboard:nh-e2e-cpb'
const GAP = 8
const ROW = 40
const COLS = 12

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getComp = async (uid) => {
  const r = await fetch(NS + '/' + uid, { headers: AUTH })
  return r.ok ? r.json() : null
}
const widgetCount = async (uid) => {
  const c = await getComp(uid)
  return c?.config?.widgets?.length ?? -1
}

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
try { await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }) } catch {}
const page = await context.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
const acceptDialogs = (d) => d.accept()
page.on('dialog', acceptDialogs)
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

const seed = async (uid, id, name, widgets) =>
  fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid,
      component: 'neohab:dashboard',
      config: { version: 1, id, name, columns: COLS, rowHeight: ROW, gap: GAP, widgets },
    }),
  })

const cellCount = () => page.locator('.nh-cell').count()
const selCount = async () => {
  const t = await page.locator('.nh-selbar__count').textContent().catch(() => null)
  if (!t) return 0
  const m = t.match(/^(\d+)/)
  return m ? +m[1] : 0
}
const selectedCells = () => page.locator('.nh-cell--selected').count()

const rects = () =>
  page.$$eval('.nh-cell', (els) =>
    els.map((e) => {
      const col = e.style.gridColumn.match(/^(\d+) \/ span (\d+)$/)
      const row = e.style.gridRow.match(/^(\d+) \/ span (\d+)$/)
      return col && row ? { x: +col[1] - 1, y: +row[1] - 1, w: +col[2], h: +row[2] } : null
    })
  )
const anyOverlap = (rs) => {
  const v = rs.filter(Boolean)
  for (let i = 0; i < v.length; i++)
    for (let j = i + 1; j < v.length; j++) {
      const a = v[i], b = v[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return true
    }
  return false
}

const enterEdit = async () => {
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 5000 })
}
const ctrlClickCell = (i) =>
  page.locator('.nh-cell').nth(i).locator('.nh-cell__overlay').click({ modifiers: ['Control'] })
const clickCell = (i) => page.locator('.nh-cell').nth(i).locator('.nh-cell__overlay').click()

try {
  const wA = [
    { id: 'w-a', type: 'clock', config: { showDate: false }, layout: { lg: { x: 0, y: 0, w: 2, h: 2 } } },
    { id: 'w-c', type: 'clock', config: { showDate: false }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
    { id: 'w-b', type: 'label', config: { text: 'B' }, layout: { lg: { x: 0, y: 3, w: 2, h: 2 } } },
  ]
  const rA = await seed(UID_A, 'nh-e2e-cpa', 'E2E Copy A', wA)
  const rB = await seed(UID_B, 'nh-e2e-cpb', 'E2E Copy B', [
    { id: 'w-x', type: 'label', config: { text: 'X' }, layout: { lg: { x: 0, y: 0, w: 2, h: 1 } } },
  ])
  ok('seed A', rA.ok, String(rA.status))
  ok('seed B', rB.ok, String(rB.status))

  await page.goto(APP + '#/d/nh-e2e-cpa', { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.nh-grid', { timeout: 15000 })

  await enterEdit()
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  await page.click('.nh-sheet button:has-text("Clock")')
  await sleep(300)
  ok('add via palette bumps the count', (await cellCount()) === 4, String(await cellCount()))
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })
  ok('Save returns to run mode', (await page.locator('.nh-grid--edit').count()) === 0)
  ok('Save persisted the added widget', (await widgetCount(UID_A)) === 4, String(await widgetCount(UID_A)))

  await enterEdit()
  await page.locator('.nh-cell').nth(0).hover()
  await page.locator('.nh-cell').nth(0).locator('.nh-cell__delete').click()
  await sleep(200)
  ok('delete drops a cell in the draft', (await cellCount()) === 3, String(await cellCount()))
  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })
  ok('Cancel returns to run mode', (await page.locator('.nh-grid--edit').count()) === 0)
  ok('Cancel did not persist the delete', (await widgetCount(UID_A)) === 4, String(await widgetCount(UID_A)))

  await enterEdit()
  let dialogs = 0
  const countDialog = () => dialogs++
  page.on('dialog', countDialog)
  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })
  page.off('dialog', countDialog)
  ok('clean Cancel needs no confirm', dialogs === 0, `dialogs=${dialogs}`)

  await enterEdit()
  ok('nothing selected at first', (await selectedCells()) === 0)
  await clickCell(0)
  await sleep(150)
  ok('plain click selects one', (await selectedCells()) === 1)
  ok('single selection opens the settings panel', (await page.locator('.nh-sheet--side').count()) === 1)
  await ctrlClickCell(1)
  await sleep(150)
  ok('ctrl-click adds a second', (await selectedCells()) === 2)
  ok('multi-selection closes the settings panel', (await page.locator('.nh-sheet--side').count()) === 0)
  ok('selection bar shows the count', (await selCount()) === 2, String(await selCount()))
  await ctrlClickCell(1)
  await sleep(150)
  ok('ctrl-click toggles the second off', (await selectedCells()) === 1)
  await page.locator('.nh-cell').nth(2).locator('.nh-cell__overlay').click({ modifiers: ['Shift'] })
  await sleep(150)
  ok('shift-click adds', (await selectedCells()) === 2)

  await page.keyboard.press('Escape')
  await sleep(120)
  await ctrlClickCell(0)
  await sleep(200)
  ok('FIRST ctrl-click selects without opening the panel', (await selectedCells()) === 1 && (await page.locator('.nh-sheet--side').count()) === 0, `sel=${await selectedCells()} panel=${await page.locator('.nh-sheet--side').count()}`)
  await ctrlClickCell(1)
  await sleep(150)
  ok('second ctrl-click reaches 2 with no panel ever shown', (await selectedCells()) === 2 && (await page.locator('.nh-sheet--side').count()) === 0)
  await page.keyboard.press('Escape')
  await sleep(120)
  await page.locator('.nh-cell').nth(0).locator('.nh-cell__overlay').click({ modifiers: ['Shift'] })
  await sleep(200)
  ok('first shift-click selects without opening the panel', (await selectedCells()) === 1 && (await page.locator('.nh-sheet--side').count()) === 0)
  await page.keyboard.press('Escape')
  await sleep(120)

  await page.locator('.nh-cell').nth(0).locator('.nh-cell__handle').click({ modifiers: ['Control'], position: { x: 8, y: 8 } })
  await sleep(200)
  ok('ctrl-click on the handle toggles into selection (no panel)', (await selectedCells()) === 1 && (await page.locator('.nh-sheet--side').count()) === 0, `sel=${await selectedCells()}`)
  await page.locator('.nh-cell').nth(1).locator('.nh-cell__handle').click({ modifiers: ['Control'], position: { x: 8, y: 8 } })
  await sleep(200)
  ok('ctrl-click a second handle reaches 2', (await selectedCells()) === 2)
  await page.locator('.nh-cell').nth(0).locator('.nh-cell__handle').click({ position: { x: 8, y: 8 } })
  await sleep(200)
  ok('plain handle click single-selects and opens the panel', (await selectedCells()) === 1 && (await page.locator('.nh-sheet--side').count()) === 1)
  await page.locator('.nh-sheet--side .nh-sheet__close').click()
  await sleep(150)

  ok('closing the settings panel cleared the selection', (await selectedCells()) === 0)
  {
    const a = await page.locator('.nh-cell').nth(0).boundingBox()
    const b = await page.locator('.nh-cell').nth(1).boundingBox()
    await page.mouse.move(a.x + a.width * 0.5, a.y + a.height * 0.7) // body, below the handle
    await page.mouse.down()
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.7, { steps: 6 })
    const boxShown = (await page.locator('.nh-marquee').count()) === 1
    await page.mouse.up()
    await sleep(200)
    ok('lasso from a widget body shows the box', boxShown)
    ok('lasso from a widget body selects both widgets', (await selectedCells()) === 2, String(await selectedCells()))
    ok('lasso from a widget body opens no panel', (await page.locator('.nh-sheet--side').count()) === 0)
  }
  await clickCell(2)
  await sleep(200)
  ok('plain body click after a lasso still single-selects + panel', (await selectedCells()) === 1 && (await page.locator('.nh-sheet--side').count()) === 1)
  await page.locator('.nh-sheet--side .nh-sheet__close').click()
  await sleep(150)
  await ctrlClickCell(0)
  await sleep(120)
  await ctrlClickCell(2)
  await sleep(120)
  ok('selection rebuilt for the copy flow', (await selectedCells()) === 2, String(await selectedCells()))

  const before = await cellCount()
  await page.click('.nh-selbar button:has-text("Copy")')
  await sleep(150)
  await page.click('.nh-selbar button:has-text("Paste")')
  await sleep(250)
  ok('paste adds the copied widgets', (await cellCount()) === before + 2, `${before} -> ${await cellCount()}`)
  ok('pasted widgets become the selection', (await selectedCells()) === 2)
  ok('no overlap after paste', !anyOverlap(await rects()), JSON.stringify(await rects()))

  const beforeDel = await cellCount()
  await page.click('.nh-selbar button:has-text("Delete")')
  await sleep(200)
  ok('delete removes the whole selection', (await cellCount()) === beforeDel - 2, `${beforeDel} -> ${await cellCount()}`)
  ok('selection is empty after delete', (await selectedCells()) === 0)

  await page.evaluate(() => window.scrollTo(0, 0))
  const g = await page.locator('.nh-grid--edit').boundingBox()
  const cellW = (g.width - GAP * (COLS - 1)) / COLS
  const emptyX = g.x + 8 * (cellW + GAP) + cellW / 2
  const emptyY = g.y + ROW / 2
  {
    const ex = g.x + cellW / 2
    const ey = g.y + 1.5 * (ROW + GAP)
    await page.mouse.move(emptyX, emptyY)
    await page.mouse.down()
    await page.mouse.move((emptyX + ex) / 2, (emptyY + ey) / 2, { steps: 4 })
    const marqueeShown = (await page.locator('.nh-marquee').count()) === 1
    await page.mouse.move(ex, ey, { steps: 4 })
    await page.mouse.up()
    await sleep(200)
    ok('marquee box renders while dragging', marqueeShown)
    ok('marquee selects the enclosed widgets', (await selectedCells()) >= 2, String(await selectedCells()))
  }
  await page.mouse.click(emptyX, emptyY)
  await sleep(150)
  ok('clicking empty space clears the selection', (await selectedCells()) === 0)

  await clickCell(0)
  await sleep(120)
  const beforeKb = await cellCount()
  await page.keyboard.press('Control+c')
  await sleep(150)
  await page.keyboard.press('Control+v')
  await sleep(250)
  ok('Ctrl+C then Ctrl+V pastes', (await cellCount()) === beforeKb + 1, `${beforeKb} -> ${await cellCount()}`)

  await page.keyboard.press('Control+a')
  await sleep(150)
  const total = await cellCount()
  ok('Ctrl+A selects all', (await selectedCells()) === total, `${await selectedCells()}/${total}`)
  await page.keyboard.press('Escape')
  await sleep(120)
  ok('Escape clears the selection', (await selectedCells()) === 0)
  ok('and that Escape did not also leave edit mode', (await page.locator('.nh-grid--edit').count()) === 1)

  let asked = 0
  const dismiss = (d) => {
    asked++
    d.dismiss()
  }
  page.off('dialog', acceptDialogs)
  page.on('dialog', dismiss)
  await page.keyboard.press('Escape')
  await sleep(250)
  page.off('dialog', dismiss)
  page.on('dialog', acceptDialogs)
  ok('Escape on a dirty draft asks before discarding', asked === 1, `dialogs=${asked}`)
  ok('and dismissing it keeps you editing', (await page.locator('.nh-grid--edit').count()) === 1)

  await page.keyboard.press('Escape') // the suite's own handler accepts this one
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 }).catch(() => {})
  ok('Escape leaves edit mode', (await page.locator('.nh-grid--edit').count()) === 0)
  ok('and discarded the draft, exactly as the Exit button does', (await widgetCount(UID_A)) === 4, String(await widgetCount(UID_A)))

  await enterEdit()
  let cleanAsked = 0
  const countClean = () => cleanAsked++
  page.on('dialog', countClean)
  await page.keyboard.press('Escape')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 }).catch(() => {})
  page.off('dialog', countClean)
  ok('a clean draft leaves on Escape with no question', cleanAsked === 0 && (await page.locator('.nh-grid--edit').count()) === 0, `dialogs=${cleanAsked}`)

  await enterEdit()
  await clickCell(0)
  await sleep(120)
  await page.click('.nh-selbar button:has-text("Copy")')
  await sleep(150)
  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })

  await page.goto(APP + '#/d/nh-e2e-cpb', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-grid', { timeout: 15000 })
  await enterEdit()
  const bBefore = await cellCount()
  ok('clipboard survived the dashboard switch (Paste button present)', (await page.locator('.nh-selbar button:has-text("Paste")').count()) === 1)
  await page.click('.nh-selbar button:has-text("Paste")')
  await sleep(250)
  ok('cross-dashboard paste adds a widget', (await cellCount()) === bBefore + 1, `${bBefore} -> ${await cellCount()}`)
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })
  ok('cross-dashboard paste persisted to B', (await widgetCount(UID_B)) === 2, String(await widgetCount(UID_B)))

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/' + UID_A, { method: 'DELETE', headers: AUTH })
await fetch(NS + '/' + UID_B, { method: 'DELETE', headers: AUTH })
ok('cleanup: A removed', (await getComp(UID_A)) === null)
ok('cleanup: B removed', (await getComp(UID_B)) === null)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks`)
console.log(allPass ? 'ALL PASS' : 'SOME FAILED')
process.exitCode = allPass ? 0 : 1
