import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, ITEMS } from './lib/target.mjs'


// WIPE-CYCLE GUARD: this suite assumes an EMPTY namespace and its cleanup DELETES EVERYTHING.
// Refuse to run against a live config - snapshot + wipe first, restore + verify after
// (tools/config-snapshot.mjs, config-wipe.mjs, config-restore.mjs - see the README). Running
// one of these against a live config once forced a full restore; the guard makes that
// mistake impossible.
{
  const pre = await (await fetch(NS)).json()
  if (pre.length > 0) {
    console.log('ABORT: namespace holds ' + pre.length + ' components - wipe-cycle suite needs an empty namespace (snapshot + wipe first).')
    process.exit(2)
  }
}


const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })

async function restGet(path) {
  const res = await fetch(path)
  return { status: res.status, body: res.ok ? await res.json() : null }
}
async function restDelete(path) {
  return (await fetch(path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } })).status
}

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
page.on('dialog', (d) => d.accept())

await page.addInitScript((token) => {
  localStorage.setItem('neohab:apiToken', token)
}, TOKEN)

try {
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: 'dashboard:nh-e2e-edit',
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-edit',
        name: 'E2E Editor',
        columns: 12,
        rowHeight: 40,
        widgets: [
          { id: 'w-switch', type: 'switch', config: { item: ITEMS.switch, label: 'Guest Bedroom' }, layout: { lg: { x: 0, y: 0, w: 3, h: 3 } } },
          { id: 'w-button', type: 'button', config: { item: ITEMS.switch, label: 'Toggle', command: 'ON', commandAlt: 'OFF', toggle: true }, layout: { lg: { x: 3, y: 0, w: 3, h: 3 } } },
          { id: 'w-slider', type: 'slider', config: { item: ITEMS.dimmer, label: 'Main Lights', min: 0, max: 100, step: 1 }, layout: { lg: { x: 6, y: 0, w: 6, h: 3 } } },
          { id: 'w-value', type: 'value', config: { item: ITEMS.dimmer, label: 'Level' }, layout: { lg: { x: 0, y: 3, w: 3, h: 2 } } },
          { id: 'w-label', type: 'label', config: { text: 'neohab', fontSize: 28 }, layout: { lg: { x: 3, y: 3, w: 3, h: 2 } } },
          { id: 'w-clock', type: 'clock', config: { showDate: true }, layout: { lg: { x: 6, y: 3, w: 3, h: 3 } } },
          { id: 'w-color', type: 'color', config: { item: ITEMS.color, label: 'Colour Bulb' }, layout: { lg: { x: 9, y: 3, w: 3, h: 5 } } },
          { id: 'w-image', type: 'image', config: { url: '', label: 'Image', refresh: 0 }, layout: { lg: { x: 0, y: 5, w: 6, h: 4 } } },
        ],
      },
    }),
  })
  ok('suite dashboard created', seed.ok, String(seed.status))

  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.nh-tile:not(.nh-tile--new)', { timeout: 10000 })
  await page.click('.nh-tile:not(.nh-tile--new)')
  await page.waitForSelector('.nh-grid', { timeout: 10000 })

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  ok('edit mode entered', true)
  ok('save disabled while clean', await page.$eval('button:has-text("Save")', (b) => b.disabled).catch(() => false))

  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 10000 })
  const before = await page.$$eval('.nh-cell', (els) => els.length)
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette__card')
  await page.click('.nh-palette__card:has-text("Clock")')
  await sleep(300)
  const after = await page.$$eval('.nh-cell', (els) => els.length)
  ok('palette adds widget', after === before + 1, `${before} -> ${after}`)
  ok('settings panel opened for new widget', (await page.$('.nh-sheet--side')) !== null)

  const secondsBox = page.locator('.nh-sheet--side label:has-text("Show seconds") input[type="checkbox"]')
  await secondsBox.check()
  ok('setting toggled', await secondsBox.isChecked())

  const handle = await page.$('.nh-cell--selected .nh-cell__handle')
  const box = await handle.boundingBox()
  const grid = await (await page.$('.nh-grid--edit')).boundingBox()
  const cellW = (grid.width - 8 * 11) / 12
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + cellW + 8, box.y + box.height / 2, { steps: 8 })
  await sleep(150)
  await page.mouse.up()
  await sleep(300)
  ok('drag moved widget (undo count grows)', await page.$eval('[aria-label="Undo"]', (b) => !b.disabled))

  await page.click('[aria-label="Undo"]')
  await sleep(150)
  ok('redo enabled after undo', await page.$eval('[aria-label="Redo"]', (b) => !b.disabled))
  await page.click('[aria-label="Redo"]')

  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })
  ok('Save returned to run mode', (await page.locator('.nh-grid--edit').count()) === 0)
  await sleep(800)
  const saved = await restGet(NS + '/dashboard:nh-e2e-edit')
  ok('dashboard persisted to server', saved.status === 200)
  const widgetCount = saved.body?.config?.widgets?.length
  ok('saved dashboard has 9 widgets', widgetCount === 9, `count=${widgetCount}`)

  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile:not(.nh-tile--new)', { timeout: 10000 })
  ok('no welcome card when dashboards exist', (await page.locator('.nh-welcome').count()) === 0)

  ok('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

const del = await restDelete(NS + '/dashboard:nh-e2e-edit')
const check = await restGet(NS)
ok(
  'cleanup: server namespace empty again',
  (del === 200 || del === 404) && Array.isArray(check.body) && check.body.length === 0,
  `delete=${del}`
)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
