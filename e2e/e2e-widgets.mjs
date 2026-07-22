/**
 * Parity-widget e2e. SAFETY: commands are only ever sent to the three approved test items
 * (the switch item, the dimmer item, the color item). The Player widget is
 * bound to the player item for DISPLAY ONLY (never clicked); Garage_Door is never referenced.
 *
 * Flow: build the test dashboard in edit mode -> Save -> exit to run mode -> exercise the
 * widgets for real -> delete everything via REST so the VM stays pristine.
 */
import { chromium } from 'playwright-core'
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
const getState = async (item) => (await fetch(`${BASE}/rest/items/${item}/state`)).text()
const sendCmd = (item, cmd) =>
  fetch(`${BASE}/rest/items/${item}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: cmd })

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return chromium.launch({ channel, headless: true })
    } catch {}
  }
  return chromium.launch({ headless: true })
}

// Record initial states so cleanup restores what the owner actually had.
const initialStates = {
  sw: await getState(ITEMS.switch),
  lvl: await getState(ITEMS.dimmer),
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => localStorage.setItem('neohab:apiToken', t), TOKEN)

async function addWidget(name) {
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette__card')
  await page.click(`.nh-palette__card:has(.nh-palette__name:text-is("${name}"))`)
  await page.waitForSelector('.nh-sheet--side')
  await sleep(200)
}

async function pickItem(itemName) {
  // role=combobox targets the ItemPicker input specifically (the icon field is also a .nh-picker)
  const input = page.locator('.nh-sheet--side .nh-picker input[role="combobox"]')
  await input.click()
  await input.fill(itemName)
  await page.waitForSelector('.nh-picker__option')
  await page.click(`.nh-picker__option:has(.nh-picker__name:text-is("${itemName}"))`)
  await sleep(300)
}

try {
  // The suite's own base dashboard (the in-code demo no longer exists on empty namespaces).
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: 'dashboard:nh-e2e-widgets',
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-widgets',
        name: 'E2E Widgets',
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

  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile:not(.nh-tile--new)')
  await page.click('.nh-tile:not(.nh-tile--new)')
  await page.waitForSelector('.nh-grid')
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')

  // ---------- build: add + configure all six ----------
  await addWidget('Chart')
  // multi-series chart: items live in series cards now, added via "Add series"
  await page.click('.nh-sheet--side button:has-text("Add series")')
  await pickItem(ITEMS.dimmer)

  await addWidget('Selection')
  await pickItem(ITEMS.switch)
  await page.locator('.nh-sheet--side textarea').fill('ON=Lights On\nOFF=Lights Off')
  await sleep(200)

  await addWidget('Dial')
  await pickItem(ITEMS.dimmer)

  await addWidget('Frame')
  await page.locator('.nh-sheet--side input[type="text"]').first().fill('/basicui/app')
  await sleep(200)

  await addWidget('Player')
  await pickItem(ITEMS.player)

  await addWidget('Rollershutter')
  await sleep(200)

  const cellCount = await page.locator('.nh-cell').count()
  ok('all six widgets added (8+6 cells)', cellCount === 14, `cells=${cellCount}`)

  // ---------- save (returns to run mode) ----------
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]')
  await sleep(800)

  // ---------- run mode: exercise widgets for real ----------
  await page.waitForSelector('.nh-chart canvas', { timeout: 15000 })
  ok('chart renders persistence data (canvas)', true)

  await page.click('.nh-selection__btn:has-text("Lights On")')
  await sleep(1100)
  ok('selection sends command', (await getState(ITEMS.switch)) === 'ON')
  const activeHighlight = await page
    .locator('.nh-selection__btn--active')
    .textContent()
    .catch(() => null)
  ok('selection highlights current state', activeHighlight === 'Lights On', activeHighlight ?? 'none')
  await page.click('.nh-selection__btn:has-text("Lights Off")')
  await sleep(1000)
  ok('selection second command', (await getState(ITEMS.switch)) === 'OFF')

  await sendCmd(ITEMS.dimmer, '30')
  await sleep(1300)
  const dialText = await page.locator('.nh-dial__value').textContent()
  ok('dial reflects live state', dialText?.trim() === '30', dialText ?? '')

  const dial = await page.locator('.nh-dial').boundingBox()
  const scale = Math.min(dial.width, dial.height) / 100
  await page.mouse.move(dial.x + dial.width / 2 + 38 * scale, dial.y + dial.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await sleep(1200)
  const dialSet = parseFloat(await getState(ITEMS.dimmer))
  ok('dial tap sets value (~83)', dialSet >= 78 && dialSet <= 88, `level=${dialSet}`)

  const frameSrc = await page.locator('iframe.nh-frame').getAttribute('src')
  ok('frame embeds url', frameSrc === '/basicui/app', frameSrc ?? 'none')

  const playerBtns = await page.locator('.nh-player__btn').count()
  ok('player renders transport controls (not clicked)', playerBtns === 3, `buttons=${playerBtns}`)

  const rollerBtns = await page.locator('.nh-roller__btn').count()
  ok('rollershutter renders controls (unbound)', rollerBtns === 3, `buttons=${rollerBtns}`)

  ok('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

// ---------- cleanup: wipe namespace, restore approved items ----------
const list = await (await fetch(NS)).json()
for (const c of list) {
  await fetch(NS + '/' + encodeURIComponent(c.uid), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + TOKEN },
  })
}
const after = await (await fetch(NS)).json()
ok('cleanup: namespace empty', Array.isArray(after) && after.length === 0, `left=${after.length}`)

await sendCmd(ITEMS.switch, initialStates.sw)
await sendCmd(ITEMS.dimmer, initialStates.lvl)
await sleep(1200)
const s1 = await getState(ITEMS.switch)
const s2 = await getState(ITEMS.dimmer)
ok('states restored', s1 === initialStates.sw && parseFloat(s2) === parseFloat(initialStates.lvl), `${s1}, ${s2}`)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
