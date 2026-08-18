/**
 * Template engine e2e. SAFE with a live config: adds only nh-e2e-* components additively and
 * deletes exactly those afterwards; never wipes the namespace. Commands only the approved
 * test items and restores their states.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { getSettings, patchSettings, restoreSettings } from './lib/components.mjs'

const JSON_HDR = { ...AUTH, 'Content-Type': 'application/json' }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => await (await fetch(`${BASE}/rest/items/${item}/state`)).text()
const sendCmd = (item, cmd) =>
  fetch(`${BASE}/rest/items/${item}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: cmd })

// ---- original states + settings to restore ----
const origSwitch = await getState(ITEMS.switch)
const origLevel = await getState(ITEMS.dimmer)
const origSettings = await getSettings()

const TEMP_UIDS = ['widgetdef:nh-e2e-tpl', 'widgetdef:nh-e2e-js', 'dashboard:nh-e2e-tpltest']
const post = (body) => fetch(NS, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(body) })

await post({
  uid: 'widgetdef:nh-e2e-tpl',
  component: 'neohab:widgetdef',
  config: {
    version: 1,
    id: 'nh-e2e-tpl',
    name: 'E2E Template',
    template: [
      '<div class="tw">',
      "  <span id=\"st\">{{itemState(config.item)}}</span>",
      "  <span id=\"up\">{{itemState(config.item) | lowercase}}</span>",
      '  <button id="go" ng-click="sendCmd(config.item, itemState(config.item) == \'ON\' ? \'OFF\' : \'ON\')">flip</button>',
      '  <div id="cond" x-if="itemState(config.item) == \'ON\'">lit</div>',
      '  <ul><li x-for="n in [1,2,3]">row{{n}}-{{$index}}</li></ul>',
      '  <button id="tap" x-on:tap="sendCmd(config.item, \'ON\')">tap</button>',
      '</div>',
    ].join('\n'),
    settings: [{ id: 'item', type: 'item', label: 'Item' }],
  },
})
await post({
  uid: 'widgetdef:nh-e2e-js',
  component: 'neohab:widgetdef',
  config: {
    version: 1,
    id: 'nh-e2e-js',
    name: 'E2E JS',
    kind: 'js',
    script: [
      'oh.onReady(function () {',
      "  var el = document.createElement('div'); el.id = 'val'; el.textContent = 'boot'; document.body.appendChild(el)",
      "  oh.onChange(oh.config.item, function (s) { el.textContent = 'level=' + s.state })",
      "  oh.getItem(oh.config.item).then(function (s) { el.textContent = 'level=' + (s ? s.state : '?') })",
      "  var b = document.createElement('button'); b.id = 'set'; b.textContent = 'set42'",
      "  b.addEventListener('click', function () { oh.sendCommand(oh.config.item, '42') })",
      '  document.body.appendChild(b)',
      '})',
    ].join('\n'),
    settings: [{ id: 'item', type: 'item', label: 'Item' }],
  },
})
await post({
  uid: 'dashboard:nh-e2e-tpltest',
  component: 'neohab:dashboard',
  config: {
    version: 1,
    id: 'nh-e2e-tpltest',
    name: 'nh-e2e-tpltest',
    columns: 12,
    rowHeight: 90,
    gap: 8,
    widgets: [
      {
        id: 'w1',
        type: 'template',
        config: { label: 'tpl', customwidget: 'nh-e2e-tpl', config: { item: ITEMS.switch } },
        layout: { lg: { x: 0, y: 0, w: 5, h: 3 } },
      },
      {
        id: 'w2',
        type: 'template',
        config: { label: 'js', customwidget: 'nh-e2e-js', config: { item: ITEMS.dimmer } },
        layout: { lg: { x: 5, y: 0, w: 5, h: 3 } },
      },
      {
        id: 'w3',
        type: 'button',
        config: { label: 'plainbtn', command: 'ON' },
        layout: { lg: { x: 10, y: 0, w: 2, h: 2 } },
      },
    ],
  },
})

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return chromium.launch({ channel, headless: true })
    } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
// try/catch: init scripts also run inside the sandboxed widget iframe, where localStorage throws
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
  } catch {}
}, TOKEN)

try {
  await sendCmd(ITEMS.switch, 'OFF')
  await sleep(800)

  await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-tpltest', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-template__host', { timeout: 15000 })
  await sleep(2000)

  const sr = (sel) => page.locator('.nh-template__host').first().locator(sel) // playwright pierces shadow DOM

  // Tier 1: interpolation, filter, x-if, x-for
  ok('template shows raw state', (await sr('#st').textContent()) === 'OFF')
  ok('lowercase filter works', (await sr('#up').textContent()) === 'off')
  ok('x-if false removes node', (await sr('#cond').count()) === 0)
  const rows = await sr('li').allTextContents()
  ok('x-for renders 3 rows with $index', JSON.stringify(rows) === JSON.stringify(['row1-0', 'row2-1', 'row3-2']), JSON.stringify(rows))

  // ng-click sends command; SSE pushes new state back into the template
  await sr('#go').click()
  await sleep(1500)
  ok('ng-click sendCmd flips item', (await getState(ITEMS.switch)) === 'ON')
  ok('template re-rendered from SSE', (await sr('#st').textContent()) === 'ON')
  ok('x-if true shows node', (await sr('#cond').count()) === 1)

  // server-side change also updates the template (pure SSE path)
  await sendCmd(ITEMS.switch, 'OFF')
  await sleep(1500)
  ok('server-side change reflected', (await sr('#st').textContent()) === 'OFF')

  // x-on:tap alias
  await sr('#tap').click()
  await sleep(1200)
  ok('x-on:tap sends command', (await getState(ITEMS.switch)) === 'ON')

  // Tier 2: on by default (they only ever run sandboxed), so no settings write is needed
  await page.waitForSelector('iframe.nh-template__frame', { timeout: 15000 })
  ok('js widget runs by default (no notice)', (await page.locator('.nh-template__text:has-text("disabled")').count()) === 0)
  ok('sandbox iframe present by default', (await page.locator('iframe.nh-template__frame').count()) === 1)

  // an administrator can still stop them running
  await patchSettings(origSettings, { allowJsWidgets: false })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(1500)
  ok('turning them off shows the notice', await page.locator('.nh-template__text:has-text("disabled")').isVisible())
  ok('no sandbox iframe while off', (await page.locator('iframe.nh-template__frame').count()) === 0)

  // back to the stored settings (no key at all = the default, on)
  await restoreSettings(origSettings)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('iframe.nh-template__frame', { timeout: 15000 })
  const frame = page.frameLocator('iframe.nh-template__frame')
  await sleep(1500)
  ok('js widget boots and reads item', /^level=/.test((await frame.locator('#val').textContent()) ?? ''), await frame.locator('#val').textContent())
  ok('js iframe is sandboxed allow-scripts only', (await page.locator('iframe.nh-template__frame').getAttribute('sandbox')) === 'allow-scripts')

  await frame.locator('#set').click()
  await sleep(1500)
  ok('js sendCommand works', (await getState(ITEMS.dimmer)) === '42')
  ok('js onChange live update', (await frame.locator('#val').textContent()) === 'level=42')

  // Button Action dropdown fix: select shows effective default, no blank first row
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.click('.nh-cell:has(.nh-cell__type:text-is("button")) .nh-cell__overlay')
  await page.waitForSelector('.nh-sheet--side')
  const actionValue = await page.locator('.nh-sheet--side select').first().inputValue()
  ok('button Action dropdown shows default (not blank)', actionValue === 'command', `value=${actionValue}`)
  await page.click('button:has-text("Exit")')

  ok('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

// ---- cleanup: remove ONLY our temp components, restore settings + item states ----
for (const uid of TEMP_UIDS) {
  await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })
}
await sendCmd(ITEMS.switch, origSwitch)
await sendCmd(ITEMS.dimmer, origLevel)
await sleep(1500)
const settingsBack = await restoreSettings(origSettings)
ok(`settings ${settingsBack.mode}`, settingsBack.ok, settingsBack.detail)
// Scoped to what THIS suite made: asserting on every `nh-e2e` component made one suite's stray
// leftover fail three unrelated suites in the same battery run.
const left = (await (await fetch(NS)).json()).filter((c) => TEMP_UIDS.includes(c.uid))
ok('temp components removed', left.length === 0, `left=${left.map((c) => c.uid).join(',')}`)
ok('item states restored', (await getState(ITEMS.switch)) === origSwitch && (await getState(ITEMS.dimmer)) === origLevel)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
