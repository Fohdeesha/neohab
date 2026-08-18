// Core smoke suite. Assumes an EMPTY neohab:config namespace (run inside wipe→restore):
// checks the first-run welcome, then creates its own dashboard via REST (the in-code demo
// no longer exists), exercises the core widgets against the three approved items, and
// cleans up the component + item states.
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'


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


const DASH_UID = 'dashboard:nh-e2e-demo'
const SWITCH_ITEM = ITEMS.switch
const SLIDER_ITEM = ITEMS.dimmer
const COLOR_ITEM = ITEMS.color

const demoDashboard = {
  version: 1,
  id: 'nh-e2e-demo',
  name: 'E2E Demo',
  columns: 12,
  rowHeight: 40,
  widgets: [
    { id: 'w-switch', type: 'switch', config: { item: SWITCH_ITEM, label: 'Guest Bedroom' }, layout: { lg: { x: 0, y: 0, w: 3, h: 3 } } },
    { id: 'w-button', type: 'button', config: { item: SWITCH_ITEM, label: 'Toggle', command: 'ON', commandAlt: 'OFF', toggle: true }, layout: { lg: { x: 3, y: 0, w: 3, h: 3 } } },
    { id: 'w-slider', type: 'slider', config: { item: SLIDER_ITEM, label: 'Main Lights', min: 0, max: 100, step: 1 }, layout: { lg: { x: 6, y: 0, w: 6, h: 3 } } },
    { id: 'w-value', type: 'value', config: { item: SLIDER_ITEM, label: 'Level' }, layout: { lg: { x: 0, y: 3, w: 3, h: 2 } } },
    { id: 'w-label', type: 'label', config: { text: 'neohab', fontSize: 28 }, layout: { lg: { x: 3, y: 3, w: 3, h: 2 } } },
    { id: 'w-clock', type: 'clock', config: { showDate: true }, layout: { lg: { x: 6, y: 3, w: 3, h: 3 } } },
    { id: 'w-color', type: 'color', config: { item: COLOR_ITEM, label: 'Colour Bulb' }, layout: { lg: { x: 9, y: 3, w: 3, h: 5 } } },
    { id: 'w-image', type: 'image', config: { url: '', label: 'Image', refresh: 0 }, layout: { lg: { x: 0, y: 5, w: 6, h: 4 } } },
  ],
}

const getState = async (item) => (await fetch(`${BASE}/rest/items/${item}/state`)).text()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return chromium.launch({ channel, headless: true })
    } catch {
      /* try next */
    }
  }
  return chromium.launch({ headless: true })
}

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })

// Record initial states so cleanup restores what the owner actually had.
const initial = {
  switch: await getState(SWITCH_ITEM),
  slider: await getState(SLIDER_ITEM),
  color: await getState(COLOR_ITEM),
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

const consoleErrors = []
const failedUrls = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
page.on('response', (r) => {
  if (r.status() >= 400) failedUrls.push(r.status() + ' ' + r.url())
})

try {
  // --- First-run welcome (empty namespace) ---
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.nh-wordmark', { timeout: 10000 })
  ok('home wordmark renders', (await page.textContent('.nh-wordmark'))?.includes('neohab'))
  ok('brand-colored n present', (await page.$('.nh-wordmark__n')) !== null)
  await page.waitForSelector('.nh-welcome', { timeout: 10000 })
  ok('first-run welcome shows on empty config', true)
  // This page is signed out, and signed out is a view-only device by default - the welcome
  // must offer a sign-in and nothing that edits.
  ok(
    'signed out, the welcome offers exactly a sign-in',
    (await page.locator('.nh-welcome__actions .nh-btn').count()) === 1 &&
      (await page.locator('.nh-welcome__actions .nh-btn:text-is("Sign in")').count()) === 1
  )
  ok(
    'signed out, no setup actions',
    (await page.locator('.nh-welcome__actions .nh-btn:has-text("Generate from my items")').count()) === 0
  )
  ok('no dashboard tiles yet', (await page.locator('.nh-tile').count()) === 0)

  // Signed in as an administrator, the same screen offers the four ways to start.
  {
    const adminPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await adminPage.addInitScript((t) => {
      try { localStorage.setItem('neohab:apiToken', t) } catch {}
    }, TOKEN)
    await adminPage.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await adminPage.waitForSelector('.nh-welcome', { timeout: 10000 })
    // The buttons appear once the token has proven itself an administrator - wait for one.
    const offered = await adminPage
      .waitForSelector('.nh-welcome__actions .nh-btn:has-text("Generate from my items")', { timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    ok('signed in, welcome offers generating from the server’s items', offered)
    ok(
      'signed in, welcome offers create/generate/import/restore',
      (await adminPage.locator('.nh-welcome__actions .nh-btn').count()) === 4
    )
    await adminPage.close()
  }

  // --- Create the suite's dashboard via REST, reload home ---
  const resp = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: DASH_UID, component: 'neohab:dashboard', config: demoDashboard }),
  })
  ok('dashboard component created', resp.ok, String(resp.status))
  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile:not(.nh-tile--new)', { timeout: 10000 })
  ok('welcome replaced by tiles', (await page.locator('.nh-welcome').count()) === 0)

  await page.click('.nh-tile:not(.nh-tile--new)')
  await page.waitForSelector('.nh-grid', { timeout: 10000 })

  const widgetCount = await page.$$eval('.nh-widget', (els) => els.length)
  ok('all 8 widgets render', widgetCount >= 8, `found ${widgetCount}`)

  // Wait for SSE state to arrive
  await sleep(2500)

  // --- Switch control --- (assert it toggles, whatever the starting state)
  const beforeSwitch = await getState(SWITCH_ITEM)
  await page.click('.nh-switch')
  await sleep(1200)
  const afterSwitch = await getState(SWITCH_ITEM)
  const expected = beforeSwitch === 'ON' ? 'OFF' : 'ON'
  ok('switch toggles item', afterSwitch === expected, `${beforeSwitch} -> ${afterSwitch}`)
  await sleep(600)
  const switchUiOn = await page.$eval('.nh-switch', (el) => el.classList.contains('nh-switch--on'))
  ok('switch reflects live state', switchUiOn === (afterSwitch === 'ON'), `ui-on=${switchUiOn}`)

  // --- Slider control --- (mirror a drag-release: set value, dispatch input + pointerup)
  await page.$eval('.nh-slider__input', (el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, '60')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await sleep(1200)
  const sliderState = parseFloat(await getState(SLIDER_ITEM))
  ok('slider sets item', sliderState === 60, `level=${sliderState}`)

  // --- Color control --- 10 keyboard steps must coalesce into exactly ONE command with the
  // stepped hue. Assert on the POST itself (route-capture, passed through): some bindings (DMX
  // for one) echo the pre-fade state right back, so "item state changed" is not a reliable
  // signal even when everything works.
  const beforeColor = await getState(COLOR_ITEM)
  const beforeHue = Math.round(parseFloat(beforeColor))
  // Step away from whichever end the live hue sits near. The track clamps at 360 and the widget
  // wraps that to 0 (openHAB rejects hue 360 outright), so a blind +10 near the top would assert
  // on a value that can never be sent - the same trap the saturation check fell into.
  const stepUp = beforeHue <= 340
  const expectedHue = stepUp ? beforeHue + 10 : beforeHue - 10
  const colorPosts = []
  await page.route('**/rest/items/' + COLOR_ITEM, (route) => {
    if (route.request().method() === 'POST') colorPosts.push(route.request().postData())
    route.continue()
  })
  const hue = await page.$('.nh-color__h')
  await hue.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press(stepUp ? 'ArrowRight' : 'ArrowLeft')
  await sleep(1500) // debounced commit fires 500ms after the last step
  await page.unroute('**/rest/items/' + COLOR_ITEM)
  ok('color sends exactly one coalesced command', colorPosts.length === 1, JSON.stringify(colorPosts))
  ok(
    'color command carries the stepped hue',
    colorPosts.length === 1 && Math.round(parseFloat(colorPosts[0])) === expectedHue,
    `${beforeColor} -> ${colorPosts[0] ?? 'none'} (want hue ${expectedHue}, stepped ${stepUp ? 'up' : 'down'})`
  )

  const realFails = failedUrls.filter((u) => !/favicon/.test(u))
  ok('no failed requests', realFails.length === 0, realFails.join(' | ') || 'only favicon')
  ok('no console/page errors', consoleErrors.length === 0, consoleErrors.join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

// --- Cleanup: remove the suite's dashboard, restore approved items ---
const del = await fetch(NS + '/' + encodeURIComponent(DASH_UID), { method: 'DELETE', headers: AUTH })
ok('cleanup: dashboard component deleted', del.ok || del.status === 404, String(del.status))

const restore = (item, val) =>
  fetch(BASE + '/rest/items/' + item, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'text/plain' },
    body: val,
  })
await restore(SWITCH_ITEM, initial.switch)
await restore(SLIDER_ITEM, initial.slider)
for (let i = 0; i < 3; i++) {
  await restore(COLOR_ITEM, initial.color)
  await sleep(4000)
  if ((await getState(COLOR_ITEM)) === initial.color) break
}
ok(
  'cleanup: item states restored',
  (await getState(COLOR_ITEM)) === initial.color && (await getState(SLIDER_ITEM)) === initial.slider,
  `color=${await getState(COLOR_ITEM)} slider=${await getState(SLIDER_ITEM)}`
)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
