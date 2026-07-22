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

  // ---------- edit mode: handle strip never covers content ----------
  const geo = await page.evaluate(() => {
    const out = []
    for (const cell of document.querySelectorAll('.nh-cell')) {
      const handle = cell.querySelector('.nh-cell__handle')?.getBoundingClientRect()
      const widget = cell.querySelector('.nh-widget')?.getBoundingClientRect()
      if (handle && widget) out.push({ hb: handle.bottom, wt: widget.top })
    }
    return out
  })
  ok(
    'widget content starts below the strip in every cell',
    geo.length === 3 && geo.every((g) => g.wt >= g.hb - 0.5),
    JSON.stringify(geo)
  )
  const chips = await page.evaluate(() => {
    const chip = document.querySelector('.nh-cell .nh-chart__chips')
    if (!chip) return null
    const c = chip.getBoundingClientRect()
    const h = chip.closest('.nh-cell').querySelector('.nh-cell__handle').getBoundingClientRect()
    return { top: c.top, hb: h.bottom, h: c.height }
  })
  ok('chart period chips visible below the strip', chips && chips.h > 0 && chips.top >= chips.hb - 0.5, JSON.stringify(chips))
  await page.click('button:has-text("Exit")')
  await sleep(500)

  // ---------- importer maps font_scale ----------
  await page.goto(APP + '#/settings')
  await page.waitForSelector('.nh-hpimport__row', { timeout: 15000 })
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
  await page
    .locator('section:has(.nh-hpimport__row) input[type="file"]')
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
