/**
 * Text sizing e2e: per-dashboard Text size (settings panel + persistence + stacked view),
 * per-device Text size (Settings, localStorage, composition), per-widget Text size
 * (universal settings field, cell-scoped), HABPanel font_scale import mapping, and the
 * edit-mode handle-strip padding (widget content + chart period chips never covered).
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-textsize and (via the import flow)
 * dashboard:nh-tsimport; deletes exactly those in cleanup. Commands NOTHING (label/clock
 * widgets; the chart reads the temperature item history via GET only). Browser profile is throwaway,
 * so the device-scale localStorage key cannot leak into a real browser profile.
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-textsize'
const IMPORT_UID = 'dashboard:nh-tsimport'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try { localStorage.setItem('neohab:apiToken', t) } catch {}
}, TOKEN)

const cellFont = (sel) => page.$eval(sel, (el) => parseFloat(getComputedStyle(el).fontSize))

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
        id: 'nh-e2e-textsize',
        name: 'E2E TextSize',
        columns: 12,
        rowHeight: 'match',
        gap: 5,
        widgets: [
          { id: 'w-a', type: 'label', config: { text: 'Alpha widget' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
          { id: 'w-b', type: 'clock', config: {}, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
          {
            id: 'w-c',
            type: 'chart',
            config: { series: [{ item: ITEMS.temperature }], period: '24h', label: 'Chips Chart' },
            layout: { lg: { x: 0, y: 2, w: 9, h: 4 } },
          },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))

  await page.goto(APP + '#/d/nh-e2e-textsize', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-gcell', { timeout: 20000 })
  const baseFont = await cellFont('.nh-gcell')
  ok('baseline cell font sane (10..20px)', baseFont > 10 && baseFont < 20, String(baseFont))

  // ---------- per-dashboard text size ----------
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-textsize', { timeout: 10000 })
  ok('dashboard settings offer Text size', (await page.locator('#nh-dash-textsize').count()) === 1)
  await page.fill('#nh-dash-textsize', '150')
  await sleep(400)
  const editFont = await cellFont('.nh-cell')
  ok('150% live-previews in edit cells', Math.abs(editFont / baseFont - 1.5) < 0.02, `${baseFont} -> ${editFont}`)

  // one undo entry via coalescing: undo restores 100%
  await page.keyboard.press('Control+z')
  await sleep(300)
  const undone = await cellFont('.nh-cell')
  ok('undo restores normal size in one step', Math.abs(undone / baseFont - 1) < 0.02, String(undone))
  await page.keyboard.press('Control+Shift+z')
  await sleep(300)

  await page.click('button:has-text("Save")')
  await page.waitForSelector('.nh-grid--edit', { state: 'detached', timeout: 10000 })
  await page.waitForSelector('.nh-gcell')
  const runFont = await cellFont('.nh-gcell')
  ok('run mode at 1.5x after save', Math.abs(runFont / baseFont - 1.5) < 0.02, String(runFont))
  const comp = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  ok('textSize 150 persisted', Number(comp?.config?.textSize) === 150, String(comp?.config?.textSize))

  // ---------- stacked (phone) view multiplied too ----------
  const phone = await browser.newPage({ viewport: { width: 393, height: 851 } })
  await phone.goto(APP + '#/d/nh-e2e-textsize', { waitUntil: 'domcontentloaded' })
  await phone.waitForSelector('.nh-grid--stacked .nh-gcell', { timeout: 20000 })
  const phoneFont = await phone.$eval('.nh-grid--stacked .nh-gcell', (el) => parseFloat(getComputedStyle(el).fontSize))
  // these rows are tall enough for full-size text, so 16px * 1.5
  ok('stacked rows at 1.5x (24px)', Math.abs(phoneFont - 24) < 0.5, String(phoneFont))
  await phone.close()

  // ---------- per-device text size ----------
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#nh-set-textsize', { timeout: 10000 })
  await page.fill('#nh-set-textsize', '200')
  await sleep(200)
  ok('device size stored', (await page.evaluate(() => localStorage.getItem('neohab:textSize'))) === '200')
  await page.goto(APP + '#/d/nh-e2e-textsize')
  await page.waitForSelector('.nh-gcell')
  const composed = await cellFont('.nh-gcell')
  ok('device 200% composes with dashboard 150% (3x)', Math.abs(composed / baseFont - 3) < 0.05, String(composed))
  await page.reload()
  await page.waitForSelector('.nh-gcell')
  ok('survives reload', Math.abs((await cellFont('.nh-gcell')) / baseFont - 3) < 0.05)
  await page.goto(APP + '#/settings')
  await page.waitForSelector('#nh-set-textsize')
  await page.fill('#nh-set-textsize', '100')
  await sleep(200)
  ok('setting 100 clears the stored key', (await page.evaluate(() => localStorage.getItem('neohab:textSize'))) === null)

  // ---------- per-widget text size ----------
  await page.goto(APP + '#/d/nh-e2e-textsize')
  await page.waitForSelector('.nh-gcell')
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  await page.locator('.nh-cell').first().locator('.nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side')
  const tsField = page.locator('.nh-sheet--side label:has-text("Text size (%)") input')
  ok('widget settings offer Text size', (await tsField.count()) === 1)
  await tsField.fill('200')
  await sleep(400)
  const cellA = await cellFont('.nh-cell:nth-child(1)')
  const cellB = await cellFont('.nh-cell:nth-child(2)')
  ok('200% scales only that widget', Math.abs(cellA / cellB - 2) < 0.05, `${cellA} vs ${cellB}`)
  await tsField.fill('')
  await sleep(400)
  const cellA2 = await cellFont('.nh-cell:nth-child(1)')
  ok('clearing the field restores normal', Math.abs(cellA2 / cellB - 1) < 0.05, String(cellA2))

  // ---------- edit mode: the widget is drawn where a save will draw it ----------
  // The handle strip used to reserve a 26px band above every widget, so an editing dashboard drew
  // each one 26px shorter than the saved dashboard - enough to make a widget shed content the
  // finished one shows (a weather panel lost its readings that way). The strip overlays the
  // widget's own top edge now, and is only DRAWN on the cell being pointed at.
  // nothing selected and the pointer away, so what is measured is a cell at rest
  await page.click('.nh-sheet--side .nh-sheet__close')
  await page.mouse.move(5, 5)
  await sleep(300)
  const geo = await page.evaluate(() => {
    const out = []
    for (const cell of document.querySelectorAll('.nh-cell')) {
      const widget = cell.querySelector('.nh-widget')?.getBoundingClientRect()
      const handle = cell.querySelector('.nh-cell__handle')
      const c = cell.getBoundingClientRect()
      if (widget && handle) {
        out.push({
          dTop: Math.round(widget.top - c.top),
          dHeight: Math.round(c.height - widget.height),
          op: getComputedStyle(handle).opacity,
        })
      }
    }
    return out
  })
  ok(
    'a widget fills its whole cell while editing',
    geo.length === 3 && geo.every((g) => g.dTop === 0 && g.dHeight === 0),
    JSON.stringify(geo)
  )
  ok('editor chrome is not drawn until the cell is pointed at', geo.length === 3 && geo.every((g) => g.op === '0'), JSON.stringify(geo.map((g) => g.op)))
  await page.locator('.nh-cell').nth(0).hover()
  await sleep(250)
  const hovered = await page.$eval('.nh-cell .nh-cell__handle', (el) => getComputedStyle(el).opacity)
  ok('pointing at a cell draws its handle strip', hovered === '1', hovered)
  const chips = await page.evaluate(() => {
    const chip = document.querySelector('.nh-cell .nh-chart__chips')
    if (!chip) return null
    const c = chip.getBoundingClientRect()
    const w = chip.closest('.nh-widget').getBoundingClientRect()
    return { h: c.height, inside: c.top >= w.top - 0.5 && c.bottom <= w.bottom + 0.5 }
  })
  ok('chart period chips render inside the widget', chips && chips.h > 0 && chips.inside, JSON.stringify(chips))
  await page.click('button:has-text("Exit")')
  await sleep(500)

  // ---------- a number field can actually be typed into ----------
  // Every check above sets these fields with fill(), which delivers the whole value in one
  // event - and that is exactly the case that always worked. Typed a digit at a time, the field
  // rejected anything outside its range on every keystroke while being driven by the stored
  // value, so the leading digit of "150" was refused and the input snapped back. Row height
  // (minimum 8) and text size (minimum 50) had no reachable values below their own first digit.
  await page.goto(APP + '#/d/nh-e2e-textsize')
  await page.waitForSelector('.nh-gcell')
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-textsize', { timeout: 10000 })

  const typeInto = async (selector, text) => {
    await page.click(selector)
    await page.keyboard.press('Control+a')
    await page.keyboard.type(text, { delay: 40 })
    return page.inputValue(selector)
  }

  ok('text size can be typed digit by digit', (await typeInto('#nh-dash-textsize', '175')) === '175')
  // Switch to a fixed row height, whose minimum of 8 made "12" and "20" unreachable entirely.
  await page.selectOption('#nh-dash-rowmode', 'fixed')
  await page.waitForSelector('#nh-dash-rowpx', { timeout: 5000 })
  ok('a row height below its own first digit can be typed', (await typeInto('#nh-dash-rowpx', '12')) === '12')

  // Leaving the field with something out of range clamps it, rather than storing a value every
  // reader then has to guard: the min/max attributes only advise the browser.
  await typeInto('#nh-dash-rowpx', '2')
  await page.click('#nh-dash-name')
  await sleep(250)
  ok('an out-of-range value is clamped on leaving the field', (await page.inputValue('#nh-dash-rowpx')) === '8', await page.inputValue('#nh-dash-rowpx'))

  // An emptied field is not a zero: it leaves the setting alone and snaps back to it.
  await page.click('#nh-dash-rowpx')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await page.click('#nh-dash-name')
  await sleep(250)
  ok('an emptied field keeps the stored value', (await page.inputValue('#nh-dash-rowpx')) === '8', await page.inputValue('#nh-dash-rowpx'))

  await page.click('button:has-text("Exit")')
  await page.waitForSelector('.nh-grid--edit', { state: 'detached', timeout: 10000 })

  // ---------- importer maps font_scale ----------
  await page.goto(APP + '#/settings')
  // Anchor on the section's own heading, not on the "found on this server" row: that row only
  // renders when the server happens to have a HABPanel configuration, and this check imports a
  // FILE, which needs no such thing. Keyed on the row it could only ever run on a server that
  // had HABPanel installed.
  const hpSection = page.locator('section:has(h2:text-is("Migrate from HABPanel"))')
  await hpSection.waitFor({ timeout: 15000 })
  const synthetic = {
    dashboards: [
      {
        id: 'nh-tsimport',
        name: 'TS Import',
        font_scale: 1.5,
        widgets: [{ type: 'label', name: 'hello', col: 0, row: 0, sizeX: 2, sizeY: 1 }],
      },
    ],
  }
  await hpSection
    .locator('input[type="file"]')
    .setInputFiles({ name: 'habpanel-config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(synthetic)) })
  await page.waitForSelector('.nh-report__head', { timeout: 15000 })
  const imported = await (await fetch(NS + '/' + encodeURIComponent(IMPORT_UID), { headers: AUTH })).json()
  ok('font_scale 1.5 imports as textSize 150', Number(imported?.config?.textSize) === 150, String(imported?.config?.textSize))

  // ---------- console health ----------
  ok('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  for (const uid of [UID, IMPORT_UID]) {
    const del = await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })
    const gone = (await fetch(NS + '/' + encodeURIComponent(uid), { headers: AUTH })).status === 404
    ok('cleanup: ' + uid + ' deleted', gone, 'del=' + del.status)
  }
}

const fails = results.filter((r) => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
process.exitCode = fails.length === 0 ? 0 : 1
