/**
 * Icon packs + per-state icons + custom uploads e2e. SAFE with a live config: adds only the
 * nh-e2e-packs dashboard and icon:e2e-cust-* components, deletes exactly those afterwards,
 * restores item state. Never wipes the namespace, never writes settings.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => await (await fetch(`${BASE}/rest/items/${item}/state`)).text()
const sendCmd = (item, cmd) =>
  fetch(`${BASE}/rest/items/${item}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: cmd })
const listNs = async () => await (await fetch(NS)).json()

const ITEM = ITEMS.switch
const origState = await getState(ITEM)

/* ------------------------- pack assets served from the jar ------------------------- */

for (const [file, min] of [
  ['fluent-index.json', 1500],
  ['fc-index.json', 300],
  ['meteo-index.json', 400],
]) {
  const r = await fetch(`${BASE}/neohab/icons/${file}`)
  const n = r.ok ? (await r.json()).length : 0
  ok(`${file} served with entries`, r.ok && n >= min, `n=${n}`)
}
for (const p of ['fluent/light-bulb', 'fc/electrical-sensor', 'meteo/clear-day']) {
  const r = await fetch(`${BASE}/neohab/icons/${p}.svg`)
  ok(`${p}.svg served`, r.ok && (await r.text()).includes('<svg'))
}
for (const d of ['fluent', 'fc', 'meteo']) {
  ok(`${d} attribution shipped`, (await fetch(`${BASE}/neohab/icons/${d}/ATTRIBUTION.txt`)).ok)
}
// curation: known skin-tone variants and flag emoji are gone, neutral bases and
// legit "-light"/"flag-in-hole" style names survive
const fluentIdx = await (await fetch(`${BASE}/neohab/icons/fluent-index.json`)).json()
const fluentNames = new Set(fluentIdx.map((r) => r.split('|')[0]))
ok(
  'fluent index has no skin-tone variants',
  !['thumbs-up-light', 'thumbs-up-dark', 'man-wrestling-dark', 'artist-medium', 'waving-hand-medium-light'].some((n) =>
    fluentNames.has(n)
  )
)
ok(
  'fluent index has no flag emoji',
  !['white-flag', 'pirate-flag', 'chequered-flag', 'crossed-flags', 'rainbow-flag'].some((n) => fluentNames.has(n))
)
ok(
  'fluent keeps neutral people + lookalike names',
  ['thumbs-up', 'waving-hand', 'vertical-traffic-light', 'flag-in-hole'].every((n) => fluentNames.has(n))
)

/* --------------------------------- seed dashboard --------------------------------- */

await sendCmd(ITEM, 'OFF')
await fetch(NS, {
  method: 'POST',
  headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: 'dashboard:nh-e2e-packs',
    component: 'neohab:dashboard',
    config: {
      version: 1, id: 'nh-e2e-packs', name: 'nh-e2e-packs', columns: 12, rowHeight: 80, gap: 8,
      widgets: [
        { id: 'b1', type: 'button', config: { label: 'PackBtn', icon: 'fluent:light-bulb', iconActive: 'fluent:fire', iconSize: 40, command: 'ON', commandAlt: 'OFF', toggle: true, item: ITEM }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
        { id: 'b2', type: 'button', config: { label: 'TintBtn', icon: 'mdi:lightbulb', iconColor: '#ff0000', iconColorActive: '#00ff00', iconSize: 40, command: 'ON', commandAlt: 'OFF', toggle: true, item: ITEM }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
        { id: 's1', type: 'switch', config: { label: 'MeteoSwitch', icon: 'meteo:clear-day', iconSize: 36, item: ITEM } , layout: { lg: { x: 6, y: 0, w: 3, h: 3 } } },
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
  await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-packs', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-button', { timeout: 15000 })
  await sleep(1500)

  /* ------------------------- rendering + per-state behavior ------------------------- */

  const packImg = page.locator('.nh-button[aria-label="PackBtn"] img.nh-icon--img')
  ok('fluent icon renders as img', (await packImg.count()) === 1)
  ok('fluent img src from jar pack', ((await packImg.getAttribute('src')) ?? '').includes('icons/fluent/light-bulb.svg'))
  const meteoImg = page.locator('.nh-switch img.nh-icon--img')
  ok('meteo icon renders on switch', ((await meteoImg.getAttribute('src')) ?? '').includes('icons/meteo/clear-day.svg'))

  const tintSpan = page.locator('.nh-button[aria-label="TintBtn"] .nh-icon--mdi')
  const colorOff = await tintSpan.evaluate((el) => getComputedStyle(el).backgroundColor)
  ok('mdi tint color applies (inactive)', colorOff === 'rgb(255, 0, 0)', colorOff)

  await sendCmd(ITEM, 'ON')
  await page
    .waitForFunction(
      () => document.querySelector('.nh-button[aria-label="PackBtn"] img.nh-icon--img')?.src.includes('fire.svg'),
      { timeout: 8000 }
    )
    .catch(() => {})
  ok('active state swaps to the active icon', ((await packImg.getAttribute('src')) ?? '').includes('icons/fluent/fire.svg'))
  const colorOn = await tintSpan.evaluate((el) => getComputedStyle(el).backgroundColor)
  ok('mdi active tint color applies', colorOn === 'rgb(0, 255, 0)', colorOn)

  await sendCmd(ITEM, 'OFF')
  await page
    .waitForFunction(
      () => document.querySelector('.nh-button[aria-label="PackBtn"] img.nh-icon--img')?.src.includes('light-bulb.svg'),
      { timeout: 8000 }
    )
    .catch(() => {})
  ok('inactive state falls back to base icon', ((await packImg.getAttribute('src')) ?? '').includes('light-bulb.svg'))

  /* ------------------------------- picker tabs + picks ------------------------------- */

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.click('.nh-cell:has(.nh-button[aria-label="PackBtn"]) .nh-cell__overlay')
  await page.waitForSelector('.nh-sheet--side')
  const iconInput = page.locator('.nh-sheet--side input[placeholder*="mdi:name"]').first()
  await iconInput.focus()
  await page.waitForSelector('.nh-iconpicker__pop', { timeout: 5000 })
  ok('picker opens on Color tab for a fluent value', (await page.locator('.nh-iconpicker__tab--on').textContent()) === 'Color')
  await page.fill('.nh-iconpicker__search', 'thermometer')
  await sleep(600)
  await page.locator('.nh-iconpicker__cell[title="thermometer"]').first().click()
  await sleep(300)
  ok('picking from Color tab sets fluent ref', (await iconInput.inputValue()) === 'fluent:thermometer', await iconInput.inputValue())

  await iconInput.focus()
  await page.waitForSelector('.nh-iconpicker__pop')
  await page.click('.nh-iconpicker__tab:has-text("Weather")')
  await page.fill('.nh-iconpicker__search', 'clear-night')
  await sleep(600)
  await page.locator('.nh-iconpicker__cell[title="clear-night"]').first().click()
  await sleep(300)
  ok('picking from Weather tab sets meteo ref', (await iconInput.inputValue()) === 'meteo:clear-night', await iconInput.inputValue())

  /* --------------------------------- custom uploads --------------------------------- */

  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  // hand-built 2x2 24bpp red BMP (no alpha) - must come out as a PNG data URI
  const bmp = Buffer.alloc(70)
  bmp.write('BM', 0, 'ascii')
  bmp.writeUInt32LE(70, 2)
  bmp.writeUInt32LE(54, 10)
  bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(2, 18)
  bmp.writeInt32LE(2, 22)
  bmp.writeUInt16LE(1, 26)
  bmp.writeUInt16LE(24, 28)
  bmp.writeUInt32LE(0, 30)
  bmp.writeUInt32LE(16, 34)
  bmp.writeInt32LE(2835, 38)
  bmp.writeInt32LE(2835, 42)
  for (const off of [54, 57, 62, 65]) {
    bmp[off] = 0
    bmp[off + 1] = 0
    bmp[off + 2] = 255
  }
  const svgEvil =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10" fill="red"/></svg>'

  const uploadFile = async (file, expectedRef) => {
    await iconInput.focus()
    await page.waitForSelector('.nh-iconpicker__pop')
    await page.click('.nh-iconpicker__tab:has-text("Custom")')
    await page.setInputFiles('.nh-iconpicker__pop input[type="file"]', file)
    await page
      .waitForFunction(
        ({ sel, expected }) => document.querySelector(sel)?.value === expected,
        { sel: '.nh-sheet--side input[placeholder*="mdi:name"]', expected: expectedRef },
        { timeout: 10000 }
      )
      .catch(() => {})
    return await iconInput.inputValue()
  }

  const vPng = await uploadFile({ name: 'e2e-cust-png.png', mimeType: 'image/png', buffer: PNG_1PX }, 'custom:e2e-cust-png')
  ok('PNG upload auto-selects custom ref', vPng === 'custom:e2e-cust-png', vPng)
  const afterPng = await listNs()
  const pngComp = afterPng.find((c) => c.uid === 'icon:e2e-cust-png')
  ok('PNG icon persisted as icon:<id> component', !!pngComp)
  ok('PNG stored as png data URI', (pngComp?.config?.dataUri ?? '').startsWith('data:image/png'))
  const cellImg = page.locator('.nh-cell:has(.nh-button[aria-label="PackBtn"]) img.nh-icon--img').first()
  ok('widget renders the uploaded icon', ((await cellImg.getAttribute('src')) ?? '').startsWith('data:image/png'))

  const vBmp = await uploadFile({ name: 'e2e-cust-bmp.bmp', mimeType: 'image/bmp', buffer: bmp }, 'custom:e2e-cust-bmp')
  ok('BMP upload auto-selects custom ref', vBmp === 'custom:e2e-cust-bmp', vBmp)
  const bmpComp = (await listNs()).find((c) => c.uid === 'icon:e2e-cust-bmp')
  ok('BMP converted to png data URI', (bmpComp?.config?.dataUri ?? '').startsWith('data:image/png'))

  const vSvg = await uploadFile({ name: 'e2e-cust-svg.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svgEvil) }, 'custom:e2e-cust-svg')
  ok('SVG upload auto-selects custom ref', vSvg === 'custom:e2e-cust-svg', vSvg)
  const svgComp = (await listNs()).find((c) => c.uid === 'icon:e2e-cust-svg')
  const svgDecoded = svgComp ? Buffer.from(svgComp.config.dataUri.split(',')[1], 'base64').toString() : ''
  ok('uploaded SVG is sanitized (no script)', svgDecoded.includes('<svg') && !svgDecoded.includes('<script'), svgDecoded.slice(0, 80))

  await page.click('button:has-text("Exit")')
  await sleep(400)

  /* ------------------------------ settings manager ------------------------------ */

  await page.goto(BASE + '/neohab/index.html#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h2:has-text("Custom icons")', { timeout: 10000 })
  ok('Custom icons section present', true)
  await page.waitForSelector('.nh-iconman__row', { timeout: 5000 })
  ok('manager lists the uploaded icons', (await page.locator('.nh-iconman__row').count()) === 3)
  ok('upload limit field shows default', (await page.locator('#icon-maxkb').inputValue()) === '300')

  const pngRow = page.locator('.nh-iconman__row:has-text("custom:e2e-cust-png")')
  await pngRow.locator('.nh-iconman__name').fill('Renamed PNG')
  await pngRow.locator('.nh-iconman__name').press('Enter')
  await sleep(800)
  const renamed = (await listNs()).find((c) => c.uid === 'icon:e2e-cust-png')
  ok('rename persists to the server', renamed?.config?.name === 'Renamed PNG', renamed?.config?.name)

  await pngRow.locator('button:has-text("Delete")').click()
  await sleep(800)
  ok('manager delete removes the component', !(await listNs()).some((c) => c.uid === 'icon:e2e-cust-png'))
  ok('manager row disappears', (await page.locator('.nh-iconman__row').count()) === 2)

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

/* ------------------------------------ cleanup ------------------------------------ */

await fetch(NS + '/dashboard:nh-e2e-packs', { method: 'DELETE', headers: AUTH })
for (const uid of ['icon:e2e-cust-png', 'icon:e2e-cust-bmp', 'icon:e2e-cust-svg']) {
  await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })
}
await sendCmd(ITEM, origState)
await sleep(1500)
const leftovers = (await listNs()).filter((c) => c.uid === 'dashboard:nh-e2e-packs' || c.uid.startsWith('icon:e2e-cust'))
ok('cleanup: test components removed', leftovers.length === 0, leftovers.map((c) => c.uid).join(','))
ok('cleanup: item state restored', (await getState(ITEM)) === origState, await getState(ITEM))

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
