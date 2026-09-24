// Resize-preview e2e: a corner resize must stretch the widget's box in place (no translate), with the
// placeholder anchored at the widget's own column/row.
// SAFE with a live config: creates only dashboard:nh-e2e-resize, deletes exactly that in cleanup, commands
// nothing (clock widgets only).
import { launchChromium } from './lib/browser.mjs'
import { BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-resize'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

const zoomOf = () =>
  page.$eval('.nh-grid--edit', (el) => (el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1))

const cellStyle = (i) =>
  page.$$eval('.nh-cell', (els, idx) => {
    const el = els[idx]
    const r = el.getBoundingClientRect()
    return {
      transform: el.style.transform || '',
      width: r.width,
      height: r.height,
      inlineWidth: el.style.width || '',
      col: el.style.gridColumn,
      row: el.style.gridRow,
    }
  }, i)

try {
  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID, component: 'neohab:dashboard',
      config: {
        version: 1, id: 'nh-e2e-resize', name: 'E2E Resize', columns: 12, rowHeight: 40,
        widgets: [
          { id: 'w-a', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 3 } } },
          { id: 'w-b', type: 'clock', config: {}, layout: { lg: { x: 6, y: 0, w: 3, h: 3 } } },
        ],
      },
    }),
  })
  await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-resize', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-grid')
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)

  const before = await cellStyle(0)
  const grip = await (await page.$('.nh-cell .nh-cell__resize')).boundingBox()
  const gx = grip.x + grip.width / 2, gy = grip.y + grip.height / 2
  await page.mouse.move(gx, gy)
  await page.mouse.down()
  await page.mouse.move(gx + 160, gy + 90, { steps: 6 })
  await sleep(150)
  const mid = await cellStyle(0)
  ok('mid-resize: no translate on the cell', mid.transform === '', mid.transform || '(none)')
  ok('mid-resize: box stretches with the pointer (width)', Math.abs(mid.width - (before.width + 160)) < 3, `${before.width} -> ${mid.width}`)
  ok('mid-resize: box stretches with the pointer (height)', Math.abs(mid.height - (before.height + 90)) < 3, `${before.height} -> ${mid.height}`)
  ok('mid-resize: stretch is inline width, not a move', mid.inlineWidth.includes('max('), mid.inlineWidth)
  const drop = await page.$eval('.nh-drop', (el) => ({ col: el.style.gridColumn, row: el.style.gridRow }))
  ok('mid-resize: placeholder stays anchored at the widget origin', drop.col.startsWith('1 /') && drop.row.startsWith('1 /'), JSON.stringify(drop))
  await page.mouse.up()
  await sleep(300)
  const after = await cellStyle(0)
  ok('drop commits the snapped size', after.col === '1 / span 4' && after.row === '1 / span 5', JSON.stringify(after))
  ok('after drop: inline stretch removed', after.inlineWidth === '' && after.transform === '', JSON.stringify({ w: after.inlineWidth, t: after.transform }))

  const grip2 = await (await page.$('.nh-cell .nh-cell__resize')).boundingBox()
  await page.mouse.move(grip2.x + 4, grip2.y + 4)
  await page.mouse.down()
  await page.mouse.move(grip2.x - 600, grip2.y - 600, { steps: 6 })
  await sleep(150)
  const shrunk = await cellStyle(0)
  const kShrink = await zoomOf()
  ok(
    'shrink clamps at a visible minimum',
    shrunk.width >= 38 * kShrink && shrunk.height >= 38 * kShrink,
    `${Math.round(shrunk.width)}x${Math.round(shrunk.height)} at zoom ${kShrink.toFixed(3)}`
  )
  await page.mouse.up()
  await sleep(300)

  const handle = await (await page.$$('.nh-cell__grip'))[1].boundingBox()
  const hx = handle.x + handle.width / 2, hy = handle.y + handle.height / 2
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx + 120, hy + 60, { steps: 6 })
  await sleep(150)
  const midMove = await cellStyle(1)
  const kMove = await zoomOf()
  const moved = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(midMove.transform)
  ok(
    'mid-move: cell translates with the pointer',
    !!moved && Math.abs(+moved[1] * kMove - 120) < 2 && Math.abs(+moved[2] * kMove - 60) < 2,
    `${midMove.transform || '(none)'} at zoom ${kMove.toFixed(3)}`
  )
  ok('mid-move: no stretch during a move', midMove.inlineWidth === '', midMove.inlineWidth || '(none)')
  await page.mouse.up()
  await sleep(300)

  await page.click('button:has-text("Exit")')
  await sleep(500)
  const comp = await (await fetch(NS + '/' + UID, { headers: AUTH })).json()
  ok('Exit leaves the server config untouched', comp?.config?.widgets?.[0]?.layout?.lg?.w === 3, JSON.stringify(comp?.config?.widgets?.[0]?.layout))
  ok('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  const del = await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
  const gone = (await fetch(NS + '/' + UID, { headers: AUTH })).status === 404
  ok('cleanup: suite dashboard deleted', (del.ok || del.status === 404) && gone, `del=${del.status}`)
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks passed`)
process.exitCode = pass === results.length ? 0 : 1
