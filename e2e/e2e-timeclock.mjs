// Timeline widget + analog clock e2e: bands from real persistence, explicit color maps (numeric-tolerant),
// the tap-for-details line, period chips.
// SAFE with a live config: creates only dashboard:nh-e2e-timeclock and the imported dashboard:nh-e2e-hpx
// (both deleted), commands only the configured dimmer item (initial.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { getSettings, restoreSettings } from './lib/components.mjs'

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
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const settingsOrig = await getSettings()
const dimmer = ITEMS.dimmer
const dimmerOrig = (await getItem(dimmer)).state
console.log(`snapshot: ${dimmer}=${dimmerOrig}, settings ${settingsOrig ? 'present' : 'absent'}`)

const dimmerNow = Math.round(Number(dimmerOrig)) === 44 ? 46 : 44
await postItem(dimmer, dimmerNow)
{
  const until = Date.now() + 10000
  for (;;) {
    if (Math.round(Number((await getItem(dimmer)).state)) === dimmerNow) break
    if (Date.now() > until) {
      console.log(`WARNING: ${dimmer} did not settle at ${dimmerNow}`)
      break
    }
    await new Promise((r) => setTimeout(r, 200))
  }
}

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
        {
          id: 'w-nobg', type: 'clock',
          config: { label: 'No card', tileBackground: false },
          layout: { lg: { x: 4, y: 4, w: 4, h: 2 } },
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
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

try {
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

  const lastBand = page.locator('.nh-tl__row').nth(0).locator('.nh-tl__band').last()
  const lastColor = await (async () => {
    const until = Date.now() + 20000
    let seen = ''
    for (;;) {
      seen = await lastBand.evaluate((el) => getComputedStyle(el).backgroundColor)
      if (seen === 'rgb(255, 0, 0)' || Date.now() > until) return seen
      await new Promise((r) => setTimeout(r, 500))
    }
  })()
  ok('color map (numeric-tolerant) colors the current band red', lastColor === 'rgb(255, 0, 0)', lastColor)

  const tempColor = await page
    .locator('.nh-tl__row').nth(1).locator('.nh-tl__band').first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  ok('unmapped state auto-colored from the palette', tempColor !== 'rgb(255, 0, 0)' && tempColor !== 'rgba(0, 0, 0, 0)', tempColor)

  await lastBand.click()
  await sleep(200)
  const info = await page.textContent('.nh-tl__info').catch(() => null)
  ok('tapping a band shows its details', !!info && info.includes('Dim') && info.includes('·'), info ?? 'none')

  ok('period chips present', (await page.locator('.nh-chart__chip').count()) >= 6)
  await page.click('.nh-chart__chip:text-is("1h")')
  await page.waitForSelector('.nh-tl__row', { timeout: 15000 })
  ok('1h chip active after click', (await page.locator('.nh-chart__chip--on').textContent()) === '1h')

  const before = await page.locator('.nh-tl__row').nth(0).locator('.nh-tl__band').count()
  const target = dimmerNow === 57 ? 62 : 57 // a different value, so the band genuinely changes
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

  const face = page.locator('#w-ana .nh-clock__face, .nh-clock__face')
  ok('analog face renders', (await page.locator('.nh-clock__face').count()) === 1)
  const lines = await page.locator('.nh-clock__face line').count()
  ok('face has ticks and three hands', lines === 15, `lines=${lines}`)
  ok('numerals shown', (await page.locator('.nh-clock__face text').count()) === 12)
  const strokes = await page.locator('.nh-clock__face line').last().getAttribute('stroke')
  ok('hands colored by theme tokens', String(strokes).includes('var(--nh-'), String(strokes))
  const tip = async () => {
    const hand = page.locator('.nh-clock__face line').last()
    return (await hand.getAttribute('x2')) + ',' + (await hand.getAttribute('y2'))
  }
  const tipBefore = await tip()
  await sleep(1600)
  const tipAfter = await tip()
  ok('second hand moves', tipBefore !== tipAfter, `${tipBefore} -> ${tipAfter}`)
  ok('digital clock unchanged beside it', (await page.locator('.nh-clock__time').count()) === 2)
  void face

  const cards = await page.evaluate(() => {
    const cell = (id) => document.querySelector(`[data-widget-id="${id}"] .nh-widget, #${id} .nh-widget`)
    const paint = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        bare: el.classList.contains('nh-widget--bare'),
        bg: cs.backgroundColor,
        border: cs.borderTopColor + ' ' + cs.borderTopWidth,
        radius: cs.borderTopLeftRadius,
      }
    }
    const widgets = [...document.querySelectorAll('.nh-widget')]
    const clocks = widgets.filter((w) => w.querySelector('.nh-clock'))
    const timeline = widgets.find((w) => w.querySelector('.nh-tl__row'))
    void cell
    return {
      plain: clocks.filter((c) => !c.classList.contains('nh-widget--bare')).map(paint),
      off: clocks.filter((c) => c.classList.contains('nh-widget--bare')).map(paint),
      timeline: paint(timeline),
    }
  })
  const tlPaint = cards.timeline
  ok('both clocks are cards by default', cards.plain.length === 2, JSON.stringify(cards.plain))
  ok(
    'a clock is painted exactly like the widget beside it',
    tlPaint !== null &&
      cards.plain.length > 0 &&
      cards.plain.every((c) => c.bg === tlPaint.bg && c.border === tlPaint.border && c.radius === tlPaint.radius),
    `clock=${JSON.stringify(cards.plain[0])} other=${JSON.stringify(tlPaint)}`
  )
  ok(
    'a clock set to show no tile background paints none',
    cards.off.length === 1 && cards.off[0].bg !== tlPaint?.bg,
    JSON.stringify(cards.off)
  )

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

  await page.locator('.nh-cell', { has: page.locator('.nh-clock__time') }).first().click()
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  const bgField = page.locator('.nh-field', { hasText: 'Show the tile background' }).locator('input[type=checkbox]')
  ok('clock settings offer the tile background', (await bgField.count()) === 1)
  ok('and it is on for a clock that never said otherwise', (await bgField.isChecked().catch(() => null)) === true)
  const clockBare = () =>
    page
      .evaluate(() => {
        const w = [...document.querySelectorAll('.nh-cell')]
          .find((c) => c.querySelector('.nh-clock__time'))
          ?.querySelector('.nh-widget')
        return w ? w.classList.contains('nh-widget--bare') : null
      })
      .catch(() => null)
  const bareBefore = await clockBare()
  await bgField.uncheck({ timeout: 5000 }).catch(() => {})
  await sleep(200)
  const bareAfter = await clockBare()
  ok('turning it off takes the card away as you watch', bareBefore === false && bareAfter === true,
    `before=${bareBefore} after=${bareAfter}`)
  await page.click('button:has-text("Exit")') // dirty -> confirm dialog auto-accepted

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
  const settingsNow = await getSettings()
  ok('speech item imported into settings', settingsNow?.config?.speechItem === 'NH_E2E_Speech', String(settingsNow?.config?.speechItem))

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
await fetch(NS + '/' + IMPORTED, { method: 'DELETE', headers: AUTH })
const settingsBack = await restoreSettings(settingsOrig)
ok(`cleanup: settings ${settingsBack.mode}`, settingsBack.ok, settingsBack.detail)
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
