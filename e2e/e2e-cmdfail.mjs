// Rejected-command e2e: a command the server refuses must (a) tell the user and (b) stop the control from
// showing a value the device never took.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-cmdfail'
const COLOR = ITEMS.color
const DIM = ITEMS.dimmer

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stateOf = async (i) => (await (await fetch(`${BASE}/rest/items/${i}`, { headers: AUTH })).json()).state

let browser, dimInitial

try {
  dimInitial = await stateOf(DIM)
  console.log('initial ' + DIM + ' = ' + dimInitial)

  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seedRes = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: 'nh-e2e-cmdfail', name: 'E2E Cmdfail', columns: 12, rowHeight: 'match', gap: 8,
        widgets: [
          { id: 'w-color', type: 'color', config: { item: COLOR, label: 'Colour' }, layout: { lg: { x: 0, y: 0, w: 3, h: 5 } } },
          { id: 'w-slider', type: 'slider', config: { item: DIM, label: 'Dimmer', min: 0, max: 100, step: 1 }, layout: { lg: { x: 4, y: 0, w: 3, h: 2 } } },
        ],
      },
    }),
  })
  ok('seed dashboard created', seedRes.ok, 'HTTP ' + seedRes.status)

  browser = await launchChromium({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto(APP + '#/d/nh-e2e-cmdfail', { waitUntil: 'domcontentloaded', timeout: 20000 })
  const slider = page.locator('.nh-fader__input')
  const hue = page.locator('input[aria-label="h"]')
  await slider.waitFor({ state: 'visible', timeout: 10000 })
  await sleep(1500)

  const liveDim = await slider.inputValue()
  const liveHue = await hue.inputValue()
  console.log('live: dimmer=' + liveDim + ' hue=' + liveHue)

  let intercepted = 0
  const reject400 = async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    intercepted++
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Simulated rejection', 'http-code': 400 } }) })
  }
  await page.route('**/rest/items/' + DIM, reject400)
  await page.route('**/rest/items/' + COLOR, reject400)

  const sb = await slider.boundingBox()
  await page.mouse.move(sb.x + sb.width * 0.15, sb.y + sb.height / 2)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width * 0.92, sb.y + sb.height / 2, { steps: 10 })
  await page.mouse.up()
  await sleep(1200)

  const toast = page.locator('.nh-toast')
  ok('slider rejection raises a toast', (await toast.count()) > 0, 'toasts=' + (await toast.count()))
  const toastText = (await toast.first().textContent()) || ''
  console.log('toast: ' + toastText.trim())
  ok('toast names the item', toastText.includes(DIM), toastText.trim())
  ok('toast carries the server’s reason', /Simulated rejection/.test(toastText), toastText.trim())
  ok('toast shows no bare HTTP status', !/\b(400|401|403|404|5\d\d)\b/.test(toastText), toastText.trim())
  ok('slider reverted to the live value', (await slider.inputValue()) === liveDim, 'shows ' + (await slider.inputValue()) + ' want ' + liveDim)
  ok('device untouched (request never left the browser)', (await stateOf(DIM)) === dimInitial, 'state=' + (await stateOf(DIM)))

  const before = await toast.count()
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(sb.x + sb.width * 0.92, sb.y + sb.height / 2)
    await page.mouse.down(); await page.mouse.up()
    await sleep(400)
  }
  await sleep(800)
  ok('identical failures de-duped', (await toast.count()) <= Math.max(before, 3), 'toasts=' + (await toast.count()))

  const hb = await hue.boundingBox()
  await page.mouse.move(hb.x + hb.width * 0.4, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width + 60, hb.y + hb.height / 2, { steps: 10 })
  await page.mouse.up()
  await sleep(1200)
  ok('colour rejection toasts too', (await page.locator('.nh-toast', { hasText: COLOR }).count()) > 0)
  ok('hue reverts instead of sticking at 360', (await hue.inputValue()) === liveHue, 'shows ' + (await hue.inputValue()) + ' want ' + liveHue)

  ok('no unhandled rejection', pageErrors.length === 0, pageErrors.join(' ~ ') || '(clean)')

  await page.screenshot({ path: 'toast.png' })
  const openToasts = await toast.count()
  await page.locator('.nh-toast__close').first().click()
  await sleep(300)
  const afterClose = await toast.count()
  ok('close button removes exactly one toast', openToasts >= 1 && afterClose === openToasts - 1, `${openToasts} -> ${afterClose}`)

  await sleep(6500)
  ok('toasts auto-dismiss', (await toast.count()) === 0, 'toasts=' + (await toast.count()))

  ok('failures were injected, not real', intercepted > 0, 'intercepted=' + intercepted)

  await page.unroute('**/rest/items/' + DIM)
  await page.unroute('**/rest/items/' + COLOR)
  const target = liveDim === '70' ? '40' : '70'
  await slider.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  }, target)
  await sleep(2500)
  ok('accepted command raises NO toast', (await toast.count()) === 0, 'toasts=' + (await toast.count()))
  ok('accepted command reaches the device', (await stateOf(DIM)) === target, 'state=' + (await stateOf(DIM)) + ' want ' + target)
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  if (dimInitial) {
    for (let i = 0; i < 4; i++) {
      await fetch(`${BASE}/rest/items/${DIM}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: dimInitial })
      await sleep(1200)
      if ((await stateOf(DIM)) === dimInitial) break
    }
    const now = await stateOf(DIM)
    console.log('restored ' + DIM + ' = ' + now + (now === dimInitial ? ' (exact)' : ' (WANT ' + dimInitial + ')'))
  }
  console.log(COLOR + ' = ' + (await stateOf(COLOR)) + ' (never commanded here)')
  if (browser) await browser.close()
  console.log('\n=== e2e-cmdfail results')
  for (const r of results) console.log((r.pass ? ' PASS ' : ' FAIL ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''))
  const failed = results.filter((r) => !r.pass).length
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
}
