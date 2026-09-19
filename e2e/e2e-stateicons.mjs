// Papercut-batch e2e: value-widget icons (beside the readout, state-aware).
// SAFE with a live config: creates only dashboard:nh-e2e-sticons and dashboard:nh-e2e-sticons2 (both
// deleted), commands only the configured dimmer item (initial state.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { getSettings } from './lib/components.mjs'

const UID = 'dashboard:nh-e2e-sticons'
const UID2 = 'dashboard:nh-e2e-sticons2'
const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const getItem = async (name) => (await fetch(`${BASE}/rest/items/${name}`, { headers: AUTH })).json()
const postItem = (name, cmd) =>
  fetch(`${BASE}/rest/items/${name}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'text/plain' },
    body: String(cmd),
  })

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const dimmer = ITEMS.dimmer
const dimmerOrig = (await getItem(dimmer)).state
const dimmerNow = Math.round(Number(dimmerOrig))
const switchState = (await getItem(ITEMS.switch)).state // never commanded, only matched
const settingsBefore = await getSettings()
console.log(`snapshot: ${dimmer}=${dimmerOrig}, ${ITEMS.switch}=${switchState}, theme=${settingsBefore?.config?.theme}`)

const lowIcon = 'mdi:lightbulb-outline'
const highIcon = 'mdi:lightbulb'

await fetch(NS, {
  method: 'POST',
  headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: UID2,
    component: 'neohab:dashboard',
    config: {
      version: 1, id: 'nh-e2e-sticons2', name: 'nh-e2e Target', columns: 12, rowHeight: 'match',
      widgets: [{ id: 'w-c', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 3 } } }],
    },
  }),
})
await fetch(NS, {
  method: 'POST',
  headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: UID,
    component: 'neohab:dashboard',
    config: {
      version: 1, id: 'nh-e2e-sticons', name: 'nh-e2e-sticons', columns: 12, rowHeight: 'match',
      widgets: [
        {
          id: 'w-val', type: 'value',
          config: {
            item: dimmer, label: 'Level', icon: 'mdi:home', iconColor: '#0000ff',
            stateIcons: [
              { state: '0-49', icon: lowIcon, color: '#ff0000' },
              { state: '50-100', icon: highIcon, color: '#00ff00' },
            ],
          },
          layout: { lg: { x: 0, y: 0, w: 3, h: 3 } },
        },
        {
          id: 'w-nav', type: 'button',
          config: { label: 'Go', action: 'navigate', navigateDashboard: 'nh-e2e-sticons2', command: 'ON' },
          layout: { lg: { x: 3, y: 0, w: 3, h: 3 } },
        },
        {
          id: 'w-sw', type: 'button',
          config: {
            style: 'switch', toggle: true, nonZeroIsOn: true, item: ITEMS.switch, label: 'Sw', icon: 'mdi:power',
            stateIcons: [{ state: switchState, icon: 'mdi:sleep', color: '#ff00ff' }],
          },
          layout: { lg: { x: 6, y: 0, w: 3, h: 3 } },
        },
      ],
    },
  }),
})

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

const iconOf = async () => {
  const el = page.locator('.nh-value .nh-icon--mdi').first()
  return {
    mask: await el.evaluate((e) => getComputedStyle(e).webkitMaskImage || getComputedStyle(e).maskImage),
    color: await el.evaluate((e) => getComputedStyle(e).backgroundColor),
  }
}

try {
  await page.goto(APP + '#/d/nh-e2e-sticons', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-value .nh-icon--mdi', { timeout: 15000 })
  ok('value widget renders an icon beside the readout', true)

  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('.nh-value .nh-icon--mdi')
        if (!el) return false
        const m = getComputedStyle(el).webkitMaskImage || getComputedStyle(el).maskImage
        return !!m && !m.includes('home.svg')
      },
      undefined,
      { timeout: 10000 }
    )
    .catch(() => {})

  const inLow = dimmerNow <= 49
  const first = await iconOf()
  ok(
    'range rule picks the icon for the current value',
    first.mask.includes(inLow ? 'lightbulb-outline' : 'lightbulb') && (inLow || !first.mask.includes('outline')),
    first.mask.slice(0, 90)
  )
  ok(
    'range rule tints the icon',
    first.color === (inLow ? 'rgb(255, 0, 0)' : 'rgb(0, 255, 0)'),
    first.color
  )

  const target = inLow ? 75 : 25
  await postItem(dimmer, target)
  await page
    .waitForFunction(
      (want) => {
        const el = document.querySelector('.nh-value .nh-icon--mdi')
        if (!el) return false
        return getComputedStyle(el).backgroundColor === want
      },
      inLow ? 'rgb(0, 255, 0)' : 'rgb(255, 0, 0)',
      { timeout: 10000 }
    )
    .catch(() => {})
  const second = await iconOf()
  ok(
    'crossing the range flips the icon',
    second.mask.includes(inLow ? 'lightbulb' : 'lightbulb-outline') && (inLow ? !second.mask.includes('outline') : true),
    second.mask.slice(0, 90)
  )
  ok('crossing the range flips the tint', second.color === (inLow ? 'rgb(0, 255, 0)' : 'rgb(255, 0, 0)'), second.color)
  await postItem(dimmer, dimmerOrig)

  const swIcon = page.locator('.nh-switch .nh-icon--mdi').first()
  await page.waitForSelector('.nh-switch .nh-icon--mdi', { timeout: 10000 })
  const swMask = await swIcon.evaluate((e) => getComputedStyle(e).webkitMaskImage || getComputedStyle(e).maskImage)
  const swColor = await swIcon.evaluate((e) => getComputedStyle(e).backgroundColor)
  ok('switch state rule swaps its icon', swMask.includes('sleep'), swMask.slice(0, 90))
  ok('switch state rule tints its icon', swColor === 'rgb(255, 0, 255)', swColor)

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, undefined, { timeout: 5000 })
  await page.locator('.nh-cell', { hasText: 'Level' }).first().click()
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  ok('value settings: per-state icon rows shown', (await page.locator('.nh-sheet .nh-chartcard').count()) === 2)
  await page.click('.nh-sheet button:has-text("Add state icon")')
  await sleep(200)
  ok('Add state icon adds a row', (await page.locator('.nh-sheet .nh-chartcard').count()) === 3)
  ok(
    'row hints at the range syntax',
    (await page.locator('.nh-sheet input[placeholder="State, or a range like 1-49"]').count()) === 3
  )

  await page.locator('.nh-cell', { hasText: 'Go' }).first().click()
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  const dashSelect = page.locator('.nh-sheet select#f-w-nav-navigateDashboard')
  ok('Go to dashboard is a select', (await dashSelect.count()) === 1)
  ok('current target selected', (await dashSelect.inputValue()) === 'nh-e2e-sticons2')
  const options = await dashSelect.locator('option').allTextContents()
  ok('options list the real dashboards by name', options.includes('nh-e2e Target'), options.slice(0, 6).join('|'))
  await page.click('button:has-text("Exit")')
  await sleep(300)

  await page.click('.nh-button:has-text("Go")')
  await sleep(500)
  ok('navigate button goes to the picked dashboard', page.url().includes('#/d/nh-e2e-sticons2'), page.url())

  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#nh-set-devicetheme', { timeout: 10000 })
  ok('device theme select defaults to follow', (await page.inputValue('#nh-set-devicetheme')) === '')
  // what the shared theme actually looks like here, so the check below works whatever it is set to
  const bgShared = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.selectOption('#nh-set-devicetheme', 'oled')
  await sleep(400)
  const bgOverride = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok('override applies instantly (OLED black)', bgOverride === 'rgb(0, 0, 0)', bgOverride)
  ok('override hint shown', (await page.locator('text=This device keeps its own theme').count()) === 1)

  const settingsMid = await getSettings()
  ok('shared theme setting untouched', settingsMid?.config?.theme === settingsBefore?.config?.theme, String(settingsMid?.config?.theme))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#nh-set-devicetheme', { timeout: 10000 })
  ok('override survives a reload', (await page.inputValue('#nh-set-devicetheme')) === 'oled')
  const bgReload = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok('override still applied after reload', bgReload === 'rgb(0, 0, 0)', bgReload)

  await page.selectOption('#nh-set-devicetheme', '')
  await sleep(400)
  const bgCleared = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  // back to the shared theme's own background, rather than merely "changed": a server whose shared
  // theme is itself black made that weaker form fail
  ok('clearing returns to the shared theme', bgCleared === bgShared, `${bgCleared} want ${bgShared}`)

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
await fetch(NS + '/' + UID2, { method: 'DELETE', headers: AUTH })
await postItem(dimmer, dimmerOrig)
await sleep(1200)
const dimmerAfter = (await getItem(dimmer)).state
ok('cleanup: dimmer restored', String(dimmerAfter) === String(dimmerOrig), `${dimmerAfter} vs ${dimmerOrig}`)
const switchAfter = (await getItem(ITEMS.switch)).state
ok('cleanup: switch item untouched', String(switchAfter) === String(switchState), `${switchAfter} vs ${switchState}`)
for (const uid of [UID, UID2]) {
  const r = await fetch(NS + '/' + uid, { headers: AUTH })
  ok(`cleanup: ${uid} absent`, !r.ok)
}

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
