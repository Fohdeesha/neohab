/**
 * Timeline widget + analog clock e2e: bands from real persistence, explicit color maps
 * (numeric-tolerant), the tap-for-details line, period chips, live band extension from SSE,
 * the analog clock face, the settings editors, and the importer's new 1:1 timeline/analog
 * mapping (synthetic file, so no HABPanel data is involved).
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-timeclock and the imported
 * dashboard:nh-e2e-hpx (both deleted), commands only the configured dimmer item (initial
 * state recorded and restored), and restores the `settings` component VERBATIM after the
 * import writes its speech-item mapping.
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-timeclock'
const IMPORTED = 'dashboard:nh-e2e-hpx'
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
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

// ---------- snapshots ----------
const settingsOrig = await (async () => {
  const r = await fetch(NS + '/settings', { headers: AUTH })
  return r.ok ? r.json() : null
})()
const dimmer = ITEMS.dimmer
const dimmerOrig = (await getItem(dimmer)).state
const dimmerNow = Math.round(Number(dimmerOrig))
console.log(`snapshot: ${dimmer}=${dimmerOrig}, settings ${settingsOrig ? 'present' : 'absent'}`)

// The color map targets the dimmer's CURRENT value, so the current (rightmost) band must be
// red whatever the item happens to sit at - and '64' must match a stored '64.0' band.
await fetch(NS, {
  method: 'POST',
  headers: { ...AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uid: UID,
    component: 'neohab:dashboard',
    config: {
      version: 1, id: 'nh-e2e-timeclock', name: 'nh-e2e-timeclock', columns: 12, rowHeight: 'match',
      widgets: [
        {
          id: 'w-tl', type: 'timeline',
          config: {
            label: 'History',
            series: [{ item: dimmer, label: 'Dim' }, { item: ITEMS.temperature, label: 'Temp' }],
            colorMaps: [{ state: String(dimmerNow), color: '#ff0000' }],
            period: '12h',
          },
          layout: { lg: { x: 0, y: 0, w: 8, h: 4 } },
        },
        {
          id: 'w-ana', type: 'clock',
          config: { mode: 'analog', showNumbers: true, showSeconds: true, showDate: true },
          layout: { lg: { x: 8, y: 0, w: 4, h: 4 } },
        },
        { id: 'w-dig', type: 'clock', config: {}, layout: { lg: { x: 0, y: 4, w: 4, h: 2 } } },
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

try {
  // ---------- timeline rendering ----------
  await page.goto(APP + '#/d/nh-e2e-timeclock', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tl__row', { timeout: 20000 })
  ok('timeline renders', true)
  ok('one row per item', (await page.locator('.nh-tl__row').count()) === 2)
  const names = await page.locator('.nh-tl__name').allTextContents()
  ok('row labels shown', names.join(',') === 'Dim,Temp', names.join(','))
  const dimBands = await page.locator('.nh-tl__row').nth(0).locator('.nh-tl__band').count()
  const tempBands = await page.locator('.nh-tl__row').nth(1).locator('.nh-tl__band').count()
  ok('dimmer row has bands', dimBands > 0, `bands=${dimBands}`)
  ok('temperature row has bands', tempBands > 0, `bands=${tempBands}`)
  ok('axis has four tick labels', (await page.locator('.nh-tl__axis span').count()) === 4)

  // the current run (rightmost band) matches the numeric-tolerant color map -> red
  const lastBand = page.locator('.nh-tl__row').nth(0).locator('.nh-tl__band').last()
  const lastColor = await lastBand.evaluate((el) => getComputedStyle(el).backgroundColor)
  ok('color map (numeric-tolerant) colors the current band red', lastColor === 'rgb(255, 0, 0)', lastColor)

  // unmapped states get palette colors, not the explicit red
  const tempColor = await page
    .locator('.nh-tl__row').nth(1).locator('.nh-tl__band').first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  ok('unmapped state auto-colored from the palette', tempColor !== 'rgb(255, 0, 0)' && tempColor !== 'rgba(0, 0, 0, 0)', tempColor)

  // tap for details
  await lastBand.click()
  await sleep(200)
  const info = await page.textContent('.nh-tl__info').catch(() => null)
  ok('tapping a band shows its details', !!info && info.includes('Dim') && info.includes('·'), info ?? 'none')

  // period chips: switch to 1h and back
  ok('period chips present', (await page.locator('.nh-chart__chip').count()) >= 6)
  await page.click('.nh-chart__chip:text-is("1h")')
  await page.waitForSelector('.nh-tl__row', { timeout: 15000 })
  ok('1h chip active after click', (await page.locator('.nh-chart__chip--on').textContent()) === '1h')

  // ---------- live band extension ----------
  const before = await page.locator('.nh-tl__row').nth(0).locator('.nh-tl__band').count()
  const target = dimmerNow === 57 ? 62 : 57
  await postItem(dimmer, target)
  await page
    .waitForFunction(
      (n) => document.querySelectorAll('.nh-tl__row')[0].querySelectorAll('.nh-tl__band').length > n,
      before,
      { timeout: 10000 }
    )
    .catch(() => {})
  const after = await page.locator('.nh-tl__row').nth(0).locator('.nh-tl__band').count()
  ok('live state change starts a new band', after > before, `${before} -> ${after}`)

  // ---------- analog clock ----------
  const face = page.locator('#w-ana .nh-clock__face, .nh-clock__face')
  ok('analog face renders', (await page.locator('.nh-clock__face').count()) === 1)
  const lines = await page.locator('.nh-clock__face line').count()
  ok('face has ticks and three hands', lines === 15, `lines=${lines}`)
  ok('numerals shown', (await page.locator('.nh-clock__face text').count()) === 12)
  const strokes = await page.locator('.nh-clock__face line').last().getAttribute('stroke')
  ok('hands colored by theme tokens', String(strokes).includes('var(--nh-'), String(strokes))
  const x1 = await page.locator('.nh-clock__face line').last().getAttribute('x2')
  await sleep(1600)
  const x2 = await page.locator('.nh-clock__face line').last().getAttribute('x2')
  ok('second hand moves', x1 !== x2, `${x1} -> ${x2}`)
  ok('digital clock unchanged beside it', (await page.locator('.nh-clock__time').count()) === 1)
  void face

  // ---------- settings editors ----------
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, undefined, { timeout: 5000 })
  await page.locator('.nh-cell', { hasText: 'History' }).first().click()
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  ok('timeline settings: Items editor', (await page.locator('.nh-sheet button:has-text("Add item")').count()) === 1)
  ok('timeline settings: color rows editor', (await page.locator('.nh-sheet button:has-text("Add state color")').count()) === 1)
  const rowCards = await page.locator('.nh-sheet .nh-chartcard').count()
  await page.click('.nh-sheet button:has-text("Add state color")')
  await sleep(200)
  ok('Add state color adds a row', (await page.locator('.nh-sheet .nh-chartcard').count()) === rowCards + 1)
  await page.click('button:has-text("Exit")') // dirty -> confirm dialog auto-accepted

  // ---------- importer: timeline + analog clock + speech item ----------
  const hpFile = {
    dashboards: [
      {
        id: 'nh-e2e-hpx', name: 'nh-e2e-hpx',
        widgets: [
          {
            type: 'timeline', name: 'TL', period: 'D', row: 0, col: 0, sizeX: 4, sizeY: 3,
            series: [{ item: 'Fake_Item_1', name: 'S1' }],
            colorMaps: [{ state: 'ON', color: '#123456' }, { state: 0, color: '#654321' }],
          },
          { type: 'clock', name: 'CK', mode: 'Analog', analog_theme: 'dark', row: 0, col: 4, sizeX: 2, sizeY: 2 },
        ],
      },
    ],
    settings: { speech_synthesis_item: 'NH_E2E_Speech' },
    customwidgets: {},
  }
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h2:text-is("Migrate from HABPanel")', { timeout: 10000 })
  const fileInput = page.locator('section:has(h2:text-is("Migrate from HABPanel")) input[type="file"]')
  await fileInput.setInputFiles({
    name: 'habpanel-config.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hpFile)),
  })
  await page.waitForSelector('.nh-report', { timeout: 15000 })
  const report = await page.textContent('.nh-report')
  ok('import report shown', report?.includes('1 dashboards'), report?.slice(0, 120))
  ok('no chart-fallback warning anymore', !report?.includes('imported as charts'), '')
  ok('speech-item note in the report', report?.includes('speech item'), '')

  const imported = await (await fetch(NS + '/' + IMPORTED, { headers: AUTH })).json()
  const w0 = imported?.config?.widgets?.[0]
  const w1 = imported?.config?.widgets?.[1]
  ok('timeline imported 1:1', w0?.type === 'timeline', String(w0?.type))
  ok('timeline series carried over', w0?.config?.series?.[0]?.item === 'Fake_Item_1' && w0?.config?.series?.[0]?.label === 'S1', JSON.stringify(w0?.config?.series))
  ok(
    'color maps carried over (incl. numeric state)',
    w0?.config?.colorMaps?.length === 2 && w0.config.colorMaps[0].color === '#123456' && w0.config.colorMaps[1].state === '0',
    JSON.stringify(w0?.config?.colorMaps)
  )
  ok('timeline period mapped', w0?.config?.period === '24h', String(w0?.config?.period))
  ok('capitalized Analog mode imported as analog clock', w1?.type === 'clock' && w1?.config?.mode === 'analog', JSON.stringify(w1?.config))
  const settingsNow = await (await fetch(NS + '/settings', { headers: AUTH })).json()
  ok('speech item imported into settings', settingsNow?.config?.speechItem === 'NH_E2E_Speech', String(settingsNow?.config?.speechItem))

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

// ---------- cleanup (always) ----------
await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
await fetch(NS + '/' + IMPORTED, { method: 'DELETE', headers: AUTH })
if (settingsOrig) {
  await fetch(NS + '/settings', {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsOrig),
  })
  const settingsAfter = await (await fetch(NS + '/settings', { headers: AUTH })).json()
  const strip = (c) => JSON.stringify({ ...c, timestamp: undefined })
  ok('cleanup: settings restored verbatim', strip(settingsAfter) === strip(settingsOrig))
} else {
  await fetch(NS + '/settings', { method: 'DELETE', headers: AUTH })
}
await postItem(dimmer, dimmerOrig)
await sleep(1200)
const dimmerAfter = (await getItem(dimmer)).state
ok('cleanup: dimmer restored', String(dimmerAfter) === String(dimmerOrig), `${dimmerAfter} vs ${dimmerOrig}`)
for (const uid of [UID, IMPORTED]) {
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
