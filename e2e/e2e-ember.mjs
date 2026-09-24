// Ember theme + compass widget + accent tiles + theme-driven chart palette.
// SAFE with a live config: creates only dashboard:nh-e2e-ember and deletes exactly it. Picking Ember writes
// the SHARED theme, which stays in this suite's browser (lib/sandbox.mjs).
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS, FORMATTED_ITEM } from './lib/target.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

const UID = 'dashboard:nh-e2e-ember'
const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => `${BASE}/rest/items/${n}`

async function itemState(name) {
  const r = await (await fetch(itemUrl(name), { headers: AUTH })).json()
  return r.state
}
async function sendItem(name, value) {
  await fetch(itemUrl(name), { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(value) })
}

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const rgb = (s) => {
  let m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s ?? '')
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(s ?? '')
  if (m) return [0, 1, 2].map((i) => Math.round(Number(m[i + 1]) * 255))
  return null
}
const near = (a, b, tol = 6) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol)

const samplePlot = (sel) => {
  const canvas = document.querySelector(sel)
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const d = ctx.getImageData(0, 0, width, height).data
  let orange = 0
  let blue = 0
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]
    if (a < 100) continue
    if (r > 190 && g > 60 && g < 150 && b < 90) orange++
    if (b > 170 && r < 130 && g > 80) blue++
  }
  return { orange, blue }
}

const browser = await launch()
const errs = []
const sb = await sharedSettings()
const initialDimmer = await itemState(ITEMS.dimmer)

async function newPage(themeOverride) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  await sb.install(page)
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('dialog', (d) => d.accept())
  await page.addInitScript(
    ({ t, theme }) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
        if (theme) localStorage.setItem('neohab:themeOverride', theme)
        else localStorage.removeItem('neohab:themeOverride')
      } catch {}
    },
    { t: TOKEN, theme: themeOverride ?? null }
  )
  return page
}

try {
  await sendItem(ITEMS.dimmer, 90)
  await sleep(800)

  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-ember',
        name: 'E2E Ember',
        columns: 12,
        rowHeight: 'match',
        gap: 8,
        widgets: [
          { id: 'w-val', type: 'value', config: { item: ITEMS.dimmer, label: 'Plain', unit: '%' }, layout: { lg: { x: 0, y: 0, w: 2, h: 1 } } },
          { id: 'w-left', type: 'value', config: { item: ITEMS.dimmer, label: 'Lefty', labelAlign: 'left' }, layout: { lg: { x: 2, y: 0, w: 2, h: 1 } } },
          { id: 'w-fill', type: 'value', config: { item: ITEMS.dimmer, label: 'Callout', accent: 'filled' }, layout: { lg: { x: 4, y: 0, w: 2, h: 1 } } },
          { id: 'w-tint', type: 'label', config: { text: 'Carrots', accent: 'tinted' }, layout: { lg: { x: 6, y: 0, w: 2, h: 1 } } },
          { id: 'w-comp', type: 'compass', config: { item: ITEMS.dimmer }, layout: { lg: { x: 0, y: 1, w: 3, h: 3 } } },
          {
            id: 'w-compdeg',
            type: 'compass',
            config: { item: ITEMS.dimmer, label: 'Wind', showDegrees: true, rose: true, color: '#00ff88' },
            layout: { lg: { x: 3, y: 1, w: 3, h: 3 } },
          },
          { id: 'w-compempty', type: 'compass', config: { item: '' }, layout: { lg: { x: 6, y: 1, w: 3, h: 3 } } },
          {
            id: 'w-chart',
            type: 'chart',
            config: { item: ITEMS.temperature, label: 'Trend', period: '24h', picker: false },
            layout: { lg: { x: 0, y: 4, w: 6, h: 2 } },
          },
          { id: 'w-btnon', type: 'button', config: { item: ITEMS.dimmer, label: 'OnBtn', command: '0', toggle: true }, layout: { lg: { x: 0, y: 6, w: 2, h: 1 } } },
          { id: 'w-btnoff', type: 'button', config: { item: ITEMS.dimmer, label: 'OffBtn', command: '87654', toggle: true }, layout: { lg: { x: 2, y: 6, w: 2, h: 1 } } },
          ...(FORMATTED_ITEM
            ? [{ id: 'w-valfmt', type: 'value', config: { item: FORMATTED_ITEM, label: 'Formatted' }, layout: { lg: { x: 8, y: 0, w: 2, h: 1 } } }]
            : []),
        ],
      },
    }),
  })
  ok('seeded ' + UID, seed.status === 200, 'status=' + seed.status)

  const pa = await newPage('dark')
  await pa.goto(APP + '#/d/nh-e2e-ember', { waitUntil: 'domcontentloaded' })
  await pa.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})

  ok('compass renders', (await pa.locator('#w-comp svg.nh-compass, .nh-gcell svg.nh-compass').count()) >= 2,
    'count=' + (await pa.locator('svg.nh-compass').count()))

  const fillBgA = rgb(await pa.locator('.nh-acc-filled .nh-widget').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => ''))
  ok('filled tile = active theme primary (dark: blue)', near(fillBgA, [56, 182, 255]), JSON.stringify(fillBgA))
  const tintBgA = rgb(await pa.locator('.nh-acc-tinted .nh-widget').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => ''))
  const surfA = rgb(await pa.evaluate(() => getComputedStyle(document.querySelector('.nh-widget')).getPropertyValue('background-color')))
  ok('tinted tile is a wash, not the plain surface', tintBgA && surfA && !near(tintBgA, surfA, 2) && !near(tintBgA, [56, 182, 255], 30),
    `tint=${JSON.stringify(tintBgA)} surf=${JSON.stringify(surfA)}`)

  ok('no --nh-chart-1 without a theme that sets it',
    (await pa.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--nh-chart-1').trim())) === '')
  await pa.waitForSelector('.nh-chartwrap canvas', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const plotA = await pa.evaluate(samplePlot, '.nh-chartwrap canvas')
  ok('chart uses the built-in palette (blue trace, no orange)', plotA && plotA.blue > 50 && plotA.orange < 10, JSON.stringify(plotA))

  const cardinalOf = (id) => pa.locator(`.nh-gcell:has(svg.nh-compass) >> nth=${id}`)
  await pa.waitForFunction(() => {
    const t = document.querySelectorAll('.nh-compass__cardinal')
    return t.length > 0 && [...t].some((el) => el.textContent === 'E')
  }, { timeout: 15000 }).catch(() => {})
  const cardinals = await pa.evaluate(() => [...document.querySelectorAll('.nh-compass__cardinal')].map((t) => t.textContent))
  ok('bearing 90 reads E', cardinals.filter((c) => c === 'E').length >= 2, JSON.stringify(cardinals))
  const xform = await pa.locator('.nh-compass__pointer').first().getAttribute('transform', { timeout: 4000 }).catch(() => null)
  ok('pointer rotated to 90', xform === 'rotate(90 50 50)', xform ?? 'none')
  ok('degrees line shown when asked', (await pa.locator('.nh-compass__deg').count()) === 1 &&
    (await pa.locator('.nh-compass__deg').textContent()) === '90°',
    await pa.locator('.nh-compass__deg').textContent().catch(() => 'none'))
  ok('rose letters only when asked', (await pa.locator('.nh-compass__rose').count()) === 8)
  const customFill = await pa.locator('.nh-gcell:has(.nh-compass__rose) .nh-compass__cardinal').getAttribute('fill', { timeout: 4000 }).catch(() => null)
  ok('explicit color reaches the cardinal (attribute, not class)', customFill === '#00ff88', customFill ?? 'none')
  const emptyText = await pa.locator('.nh-widget__unset').first().innerText().catch(() => '')
  ok('unconfigured compass explains itself', /pick one in this widget/i.test(emptyText), emptyText.replace(/\s+/g, ' '))

  if (FORMATTED_ITEM) {
    const fmtState = await (await fetch(itemUrl(FORMATTED_ITEM), { headers: AUTH })).json()
    const pattern = fmtState.stateDescription?.pattern ?? ''
    const patternTail = pattern.replace(/^\s*%[\d.,+\-# ]*[a-zA-Z]/, '').replace(/%%/g, '%').trim()
    const unitWanted =
      patternTail === '%unit%' ? String(fmtState.state ?? '').replace(/^-?[\d.,]+\s*/, '').trim() : patternTail
    if (!unitWanted) {
      ok('formatted item splits (SKIPPED: its display pattern carries no unit)', true, 'pattern=' + pattern)
    } else {
      const tile = pa.locator('.nh-gcell:has(.nh-widget__labeltext:text-is("Formatted"))')
      await pa.waitForFunction(() => {
        const t = document.querySelectorAll('.nh-value__text')
        return [...t].some((el) => el.textContent !== '-' && /^\d/.test(el.textContent))
      }, { timeout: 15000 }).catch(() => {})
      const numText = await tile.locator('.nh-value__text').textContent({ timeout: 4000 }).catch(() => null)
      const unitText = await tile.locator('.nh-value__unit').textContent({ timeout: 4000 }).catch(() => null)
      ok('formatted state splits: number alone in the value', numText !== null && /^-?[\d.,]+$/.test(numText), 'num=' + numText)
      ok('formatted state splits: unit in its own span', unitText === unitWanted, `unit=${unitText} want=${unitWanted}`)
    }
  } else {
    ok('formatted item splits (SKIPPED: no items.formatted in the target config)', true)
  }

  await sendItem(ITEMS.dimmer, 0)
  await pa.waitForFunction(() => [...document.querySelectorAll('.nh-compass__cardinal')].some((el) => el.textContent === 'N'),
    { timeout: 15000 }).catch(() => {})
  const xform0 = await pa.locator('.nh-compass__pointer').first().getAttribute('transform', { timeout: 4000 }).catch(() => null)
  ok('live update swings the pointer to N', xform0 === 'rotate(0 50 50)', xform0 ?? 'none')
  await pa.close()

  const pb = await newPage(null)
  await pb.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await pb.waitForSelector('.nh-theme__pick', { timeout: 20000 }).catch(() => {})
  const emberCard = pb.locator('.nh-theme__pick:has(.nh-theme__name:text-is("Ember"))')
  ok('Ember theme card offered', (await emberCard.count()) === 1)
  await emberCard.click().catch(() => {})
  await sleep(1200)
  const bodyBg = rgb(await pb.evaluate(() => getComputedStyle(document.body).backgroundColor))
  ok('Ember tokens apply (slate-navy page)', near(bodyBg, [26, 34, 45]), JSON.stringify(bodyBg))
  ok('Ember stylesheet injected', (await pb.locator('#nh-theme-css').count()) === 1)
  ok('--nh-chart-1 pinned to the accent',
    (await pb.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--nh-chart-1').trim())) === '#f2681f')

  await pb.goto(APP + '#/d/nh-e2e-ember', { waitUntil: 'domcontentloaded' })
  await pb.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
  const fillBgB = rgb(await pb.locator('.nh-acc-filled .nh-widget').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => ''))
  ok('filled tile turns ember orange', near(fillBgB, [242, 104, 31]), JSON.stringify(fillBgB))
  const fillLabel = rgb(await pb.locator('.nh-acc-filled .nh-widget__label').first().evaluate((el) => getComputedStyle(el).color).catch(() => ''))
  ok('filled label is the deep ink, not white', fillLabel && fillLabel[0] < 160 && fillLabel[1] < 90, JSON.stringify(fillLabel))
  const tintBgB = rgb(await pb.locator('.nh-acc-tinted .nh-widget').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => ''))
  ok('tinted tile is a muted orange wash', tintBgB && tintBgB[0] > tintBgB[1] && tintBgB[1] > tintBgB[2] && tintBgB[0] > 55 && tintBgB[0] < 120,
    JSON.stringify(tintBgB))

  const justPlain = await pb.locator('.nh-gcell:has(.nh-widget__labeltext:text-is("Plain")) .nh-widget__labelmain')
    .evaluate((el) => getComputedStyle(el).justifyContent).catch(() => '')
  ok('Ember centers labels by default', justPlain === 'center', justPlain)
  const justLeft = await pb.locator('.nh-gcell:has(.nh-widget__labeltext:text-is("Lefty")) .nh-widget__labelmain')
    .evaluate((el) => getComputedStyle(el).justifyContent).catch(() => '')
  ok('an explicit Left still wins over the theme', justLeft === 'flex-start', justLeft)

  const ringStroke = rgb(await pb.locator('.nh-compass__ring').first().evaluate((el) => getComputedStyle(el).stroke).catch(() => ''))
  ok('Ember warms the compass ring', ringStroke && ringStroke[0] > 100 && ringStroke[0] > ringStroke[2], JSON.stringify(ringStroke))
  const ringWidth = await pb.locator('.nh-compass__ring').first().evaluate((el) => getComputedStyle(el).strokeWidth).catch(() => '')
  ok('Ember thickens the compass ring', ringWidth === '3.2px', ringWidth)

  const labelXform = await pb.locator('.nh-gcell:has(.nh-widget__labeltext:text-is("Plain")) .nh-widget__label')
    .evaluate((el) => getComputedStyle(el).textTransform).catch(() => '')
  ok('Ember labels keep their typed case', labelXform === 'none', labelXform)
  const valueRatio = await pb.locator('.nh-gcell:has(.nh-widget__labeltext:text-is("Plain"))')
    .evaluate((cell) => {
      const t = cell.querySelector('.nh-value__text')
      return t ? parseFloat(getComputedStyle(t).fontSize) / parseFloat(getComputedStyle(cell).fontSize) : 0
    }).catch(() => 0)
  ok('Ember value is the huge stat number (2.6em)', Math.abs(valueRatio - 2.6) < 0.05, 'ratio=' + valueRatio.toFixed(2))
  const unitAlign = await pb.locator('.nh-gcell:has(.nh-widget__labeltext:text-is("Plain")) .nh-value__unit')
    .evaluate((el) => getComputedStyle(el).alignSelf).catch(() => '')
  ok('Ember raises the unit beside the number', unitAlign === 'flex-start', unitAlign)

  await pb.waitForFunction(() => {
    const on = [...document.querySelectorAll('.nh-button--active')]
    return on.some((b) => b.textContent.includes('OnBtn'))
  }, { timeout: 15000 }).catch(() => {})
  await sleep(400) // the button background transitions 100ms; sample settled colors
  const offBtn = pb.locator('.nh-gcell:has(.nh-button__label:text-is("OffBtn")) .nh-button')
  const offStyle = await offBtn.evaluate((el) => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, bw: s.borderTopWidth }
  }).catch(() => null)
  ok('Ember buttons are flat tile content (no inner card)', offStyle && offStyle.bg === 'rgba(0, 0, 0, 0)' && offStyle.bw === '0px',
    JSON.stringify(offStyle))
  const onTile = rgb(await pb.locator('.nh-gcell:has(.nh-button__label:text-is("OnBtn")) .nh-widget')
    .evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => ''))
  ok('an active toggle paints its WHOLE tile as the accent plate', near(onTile, [242, 104, 31]), JSON.stringify(onTile))
  const onBtnBg = await pb.locator('.nh-gcell:has(.nh-button__label:text-is("OnBtn")) .nh-button')
    .evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
  ok('the active button itself stays transparent on the plate', onBtnBg === 'rgba(0, 0, 0, 0)', onBtnBg)

  const expandOpacity = await pb.locator('.nh-chart__expand').first()
    .evaluate((el) => getComputedStyle(el).opacity).catch(() => '')
  ok('Ember dims the chart expand affordance', expandOpacity === '0.45', expandOpacity)

  await pb.waitForSelector('.nh-chartwrap canvas', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const plotB = await pb.evaluate(samplePlot, '.nh-chartwrap canvas')
  ok('the same chart re-renders in the accent (orange trace, no blue)', plotB && plotB.orange > 50 && plotB.blue < 10, JSON.stringify(plotB))

  await pb.click('[aria-label="Edit dashboard"]')
  await pb.waitForSelector('.nh-grid--edit')
  await pb.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  const before = await pb.locator('.nh-cell.nh-acc-filled').count()
  await pb.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Plain")) .nh-cell__overlay').click()
  await pb.waitForSelector('.nh-sheet--side')
  const accSel = pb.locator('.nh-sheet--side .nh-field:has(.nh-field__label:text-is("Tile accent")) select')
  ok('Tile accent offered for any widget', (await accSel.count()) === 1)
  ok('accent shows None by default', (await accSel.inputValue().catch(() => 'x')) === '')
  ok(
    'the None option is the one selected',
    (await accSel.locator('option:checked').textContent().catch(() => '')) === 'None'
  )
  ok('a widget with no accent has no accent class', (await pb.locator('.nh-cell.nh-acc-none').count()) === 0)
  ok('accent offers every choice', (await accSel.locator('option').count().catch(() => 0)) === 4)
  await accSel.selectOption('filled').catch(() => {})
  await sleep(400)
  ok('picking Filled paints the tile live', (await pb.locator('.nh-cell.nh-acc-filled').count()) === before + 1)
  await pb.click('button:has-text("Exit")')
  await sleep(600)
  const stored = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  const storedVal = stored?.config?.widgets?.find((w) => w.id === 'w-val')
  ok('Exit discarded the accent experiment', storedVal && storedVal.config.accent === undefined, JSON.stringify(storedVal?.config?.accent))
  await pb.close()

  const realErrs = errs.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))
  ok('no console/page errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  const del = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
  const gone = (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).status === 404
  ok('cleanup: ' + UID + ' deleted', gone, 'del=' + del.status)
  const untouched = await sb.verify().catch((e) => ({ ok: false, detail: String(e) }))
  ok('cleanup: the shared settings on the server were never written', untouched.ok, untouched.detail)
  await sendItem(ITEMS.dimmer, initialDimmer)
  await sleep(700)
  const restored = await itemState(ITEMS.dimmer)
  ok('dimmer restored to recorded initial', String(restored) === String(initialDimmer), `got=${restored} want=${initialDimmer}`)
}

const fails = results.filter((r) => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
process.exitCode = fails.length === 0 ? 0 : 1
