/**
 * Icons + intuitive color picker e2e. SAFE with a live config: adds only the nh-icons-test
 * dashboard, deletes it afterwards, restores item states. No wipe.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => await (await fetch(`${BASE}/rest/items/${item}/state`)).text()

const origSwitch = await getState(ITEMS.switch)
// Record-and-restore, NEVER a hardcoded value: a hardcode silently stomps whatever the bulb
// was set to since the suite was written (it happened once, 2026-07-20).
const origColor = await getState(ITEMS.color)

// The brightness-track check needs saturation > 0: at S=0 the track ends white at EVERY hue,
// so moving hue cannot recolor it - structurally unsatisfiable when the bulb happens to sit
// at S=0 (exactly where it was found on 2026-08-03). Establish the precondition here; the
// recorded value above is restored at the end as always.
for (let i = 0; i < 3; i++) {
  await fetch(`${BASE}/rest/items/${ITEMS.color}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: '210,70,55' })
  await sleep(900)
  const s = Number((await getState(ITEMS.color)).split(',')[1])
  if (Number.isFinite(s) && s > 10) break
}

await fetch(NS, {
  method: 'POST',
  headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: 'dashboard:nh-icons-test',
    component: 'neohab:dashboard',
    config: {
      version: 1, id: 'nh-icons-test', name: 'nh-icons-test', columns: 12, rowHeight: 80, gap: 8,
      widgets: [
        { id: 'b1', type: 'button', config: { label: 'MDI', icon: 'mdi:lightbulb', iconSize: 40, command: 'ON', item: ITEMS.switch, toggle: true, commandAlt: 'OFF' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
        { id: 'b2', type: 'button', config: { label: 'OH', icon: 'oh:light', iconSize: 40, command: 'ON', item: ITEMS.switch }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
        { id: 'b3', type: 'button', config: { label: 'HiddenLabel', icon: 'mdi:garage', hideLabel: true, command: 'ON' }, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } },
        { id: 'c1', type: 'color', config: { label: 'Color', item: ITEMS.color }, layout: { lg: { x: 0, y: 2, w: 4, h: 3 } } },
      ],
    },
  }),
})

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

try {
  // mdi assets served from the jar
  const idx = await fetch(BASE + '/neohab/icons/mdi-index.json')
  ok('mdi index served from jar', idx.ok, String(idx.status))
  const names = await idx.json()
  ok('mdi index has ~7k entries', Array.isArray(names) && names.length > 7000, `n=${names.length}`)
  const one = await fetch(BASE + '/neohab/icons/mdi/lightbulb.svg')
  ok('mdi svg served from jar', one.ok && (await one.text()).includes('<svg'), String(one.status))
  const lic = await fetch(BASE + '/neohab/icons/mdi/LICENSE')
  ok('mdi license shipped', lic.ok)

  await page.goto(BASE + '/neohab/index.html#/d/nh-icons-test', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-button', { timeout: 15000 })
  await sleep(1500)

  // rendering
  const mdiIcon = page.locator('.nh-button:has-text("MDI") .nh-icon--mdi')
  ok('mdi icon renders as masked span', (await mdiIcon.count()) === 1)
  const maskSet = await mdiIcon.evaluate((el) => getComputedStyle(el).maskImage.includes('lightbulb'))
  ok('mdi mask points at the svg', maskSet)
  const ohIcon = page.locator('.nh-button:has-text("OH") img.nh-icon--oh')
  ok('oh icon renders as server img', (await ohIcon.count()) === 1)
  const src = await ohIcon.getAttribute('src')
  ok('oh icon url is state-aware', /\/icon\/light\?.*state=/.test(src ?? ''), src ?? '')
  ok('hideLabel hides text', (await page.locator('.nh-button:has-text("HiddenLabel")').count()) === 0)

  // active state recolors mdi icon: toggle ON
  await fetch(`${BASE}/rest/items/${ITEMS.switch}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: 'ON' })
  await sleep(1500)
  const activeNow = await page.locator('.nh-button--active .nh-icon--mdi').count()
  ok('active toggle button tints mdi icon', activeNow === 1)

  // color widget: gradient tracks reflect the real color
  const tracks = page.locator('.nh-color__track')
  ok('color widget has 3 gradient tracks', (await tracks.count()) === 3)
  const hueGradient = await tracks.nth(0).evaluate((el) => el.style.getPropertyValue('--nh-track'))
  ok('hue track is a rainbow gradient', /linear-gradient/.test(hueGradient) && hueGradient.split('rgb').length >= 6, hueGradient.slice(0, 60))
  // Wait for the bulb's SSE state to land: until it does, the widget renders defaults (S=0),
  // whose B-track endpoint is pure white at EVERY hue - the recolor check below would flake.
  for (let i = 0; i < 40; i++) {
    const g = await tracks.nth(2).evaluate((el) => el.style.getPropertyValue('--nh-track'))
    if (!g.includes('rgb(255, 255, 255)')) break
    await sleep(250)
  }
  const bBefore = await tracks.nth(2).evaluate((el) => el.style.getPropertyValue('--nh-track'))
  // arrow-step the hue and sample IMMEDIATELY (draft active) - the other tracks must
  // recolor live while adjusting, before any device round trip
  await tracks.nth(0).focus()
  for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowRight')
  const bDuring = await tracks.nth(2).evaluate((el) => el.style.getPropertyValue('--nh-track'))
  ok('brightness track recolors while hue moves', bBefore !== bDuring, `${bBefore.slice(-45)} -> ${bDuring.slice(-45)}`)
  await sleep(2500) // let the debounced commit land before cleanup restores the bulb

  // icon picker UI: open button settings, browse library, search, pick
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.click('.nh-cell:has(.nh-cell__type:text-is("button")) .nh-cell__overlay')
  await page.waitForSelector('.nh-sheet--side')
  const iconField = page.locator('.nh-sheet--side .nh-picker:has(.nh-iconpicker__preview), .nh-sheet--side .nh-picker').nth(1)
  // the icon field is the second picker-styled field (item picker is further down); target by input value instead
  // two icon fields exist since per-state icons (Icon + Icon when active) - use the base one
  const iconFields = page.locator('.nh-sheet--side input[placeholder*="mdi:name"]')
  ok('icon field present in settings', (await iconFields.count()) >= 1, `n=${await iconFields.count()}`)
  const iconInput = iconFields.first()
  await iconInput.focus()
  await page.waitForSelector('.nh-iconpicker__pop', { timeout: 5000 })
  ok('icon popover opens', true)
  await page.fill('.nh-iconpicker__search', 'garage')
  await sleep(600)
  const cells = await page.locator('.nh-iconpicker__cell').count()
  ok('search narrows the library', cells > 0 && cells < 60, `cells=${cells}`)
  await page.locator('.nh-iconpicker__cell[title="garage-variant"]').first().click()
  await sleep(400)
  ok('picking sets the value', (await iconInput.inputValue()) === 'mdi:garage-variant')
  const liveIcon = await page.locator('.nh-cell:has(.nh-cell__type:text-is("button"))').first().locator('.nh-icon--mdi').evaluate((el) => getComputedStyle(el).maskImage)
  ok('widget re-renders with picked icon', liveIcon.includes('garage-variant'), liveIcon.slice(0, 80))
  // openHAB tab
  await iconInput.focus()
  await page.waitForSelector('.nh-iconpicker__pop')
  await page.click('.nh-iconpicker__tab:has-text("openHAB")')
  await page.fill('.nh-iconpicker__search', 'garage')
  await sleep(400)
  ok('openHAB tab lists classic icons', (await page.locator('.nh-iconpicker__cell[title="garagedoor"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.click('button:has-text("Exit")')

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

// cleanup
await fetch(NS + '/dashboard:nh-icons-test', { method: 'DELETE', headers: AUTH })
await fetch(`${BASE}/rest/items/${ITEMS.switch}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: origSwitch })
for (let i = 0; i < 3; i++) {
  await fetch(`${BASE}/rest/items/${ITEMS.color}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: origColor })
  await sleep(4000)
  if ((await getState(ITEMS.color)) === origColor) break
}
ok('cleanup: dashboard removed', !(await (await fetch(NS)).json()).some((c) => c.uid === 'dashboard:nh-icons-test'))
ok('cleanup: items restored', (await getState(ITEMS.switch)) === origSwitch && (await getState(ITEMS.color)) === origColor,
  `switch=${await getState(ITEMS.switch)} color=${await getState(ITEMS.color)} want ${origSwitch}/${origColor}`)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
