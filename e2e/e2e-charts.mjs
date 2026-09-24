// Chart-v2 e2e: multi-series, palette colors, legend toggling, crosshair tooltip, period chips + refetch,
// drag-zoom + reset, threshold band pixels.
// SAFE with a live config: creates only dashboard:nh-e2e-charts and dashboard:nh-e2e-chartfit and
// deletes exactly those in cleanup (guarded, runs even if a section throws).
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { pickItem } from './lib/ui.mjs'

const UID = 'dashboard:nh-e2e-charts'
const FIT = 'dashboard:nh-e2e-chartfit'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => (await fetch(`${BASE}/rest/items/${item}/state`, { headers: AUTH })).text()
const sendCmd = (item, cmd) =>
  fetch(`${BASE}/rest/items/${item}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: cmd })

const initialLevel = await getState(ITEMS.dimmer)

// every string uPlot paints, with the box it paints it in: an axis whose allowance is too small
// for the tile's font draws its label off the edge of the canvas, and nothing else can see that
const CAPTURE_LABELS = () => {
  window.__labels = []
  const fill = CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
    try {
      const size = parseFloat(/([\d.]+)px/.exec(this.font)?.[1] ?? '12')
      window.__labels.push({
        t: String(text),
        w: this.measureText(String(text)).width,
        x,
        y,
        size,
        align: this.textAlign,
        baseline: this.textBaseline,
        cw: this.canvas.width,
        ch: this.canvas.height,
      })
    } catch {}
    return fill.call(this, text, x, y, ...rest)
  }
}

// a threshold sits at a value of its own, so when the item has not been near it for the window uPlot's
// auto-range leaves it above the plot and its label is drawn up there and clipped, which is what the
// clipping is for. This check is about the axis labels, whose room the widget works out for itself
const THRESHOLD_LABELS = ['High']
const labelsOutside = (target) =>
  target.evaluate((skip) => {
    const bad = []
    for (const l of window.__labels ?? []) {
      if (skip.includes(l.t)) continue
      const left = l.align === 'right' ? l.x - l.w : l.align === 'center' ? l.x - l.w / 2 : l.x
      const top = l.baseline === 'top' ? l.y : l.baseline === 'middle' ? l.y - l.size / 2 : l.y - l.size
      if (left < -2 || left + l.w > l.cw + 2 || top < -2 || top + l.size > l.ch + 2) {
        bad.push({
          t: l.t,
          left: Math.round(left),
          right: Math.round(left + l.w),
          top: Math.round(top),
          bottom: Math.round(top + l.size),
          cw: l.cw,
          ch: l.ch,
        })
      }
    }
    return { drawn: (window.__labels ?? []).filter((l) => !skip.includes(l.t)).length, bad }
  }, THRESHOLD_LABELS)

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript(
  ({ t, capture }) => {
  const CAPTURE = new Function('return ' + capture)()
  try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {}
  window.__frames = []
  const cr = CanvasRenderingContext2D.prototype.clearRect
  CanvasRenderingContext2D.prototype.clearRect = function (...a) {
    const cv = this.canvas
    if (cv && !cv.__pid) cv.__pid = (window.__pidSeq = (window.__pidSeq || 0) + 1)
    window.__frames.push({ pid: cv ? cv.__pid : 0, segs: 0 })
    return cr.apply(this, a)
  }
  for (const name of ['lineTo', 'bezierCurveTo']) {
    const orig = Path2D.prototype[name]
    Path2D.prototype[name] = function (...a) {
      const f = window.__frames[window.__frames.length - 1]
      if (f) f.segs++
      return orig.apply(this, a)
    }
  }
  CAPTURE()
  },
  { t: TOKEN, capture: CAPTURE_LABELS.toString() }
)

let persistCount = 0
const persistUrls = []
page.on('request', (r) => {
  if (r.url().includes('/rest/persistence/items/')) { persistCount++; persistUrls.push(r.url()) }
})

const CELL = { multi: 0, legacy: 1, nothresh: 2, thresh: 3, y2only: 4, decim: 5, tt: 6, picked: 7 }
const chartSel = (i) => `.nh-gcell:nth-child(${i + 1}) .nh-chart`
const cellSel = (i) => `.nh-gcell:nth-child(${i + 1})`

const sampleCanvas = (sel) =>
  page.$eval(sel + ' canvas', (c) => {
    const ctx = c.getContext('2d')
    const w = Math.floor(c.width / 4)
    const h = Math.floor(c.height / 4)
    const d = ctx.getImageData(Math.floor(c.width / 2 - w / 2), Math.floor(c.height / 2 - h / 2), w, h).data
    let r = 0, g = 0, b = 0, a = 0
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const al = d[i + 3] / 255
      r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al
    }
    return { r: r / n, g: g / n, b: b / n, a: a / n }
  })

const canvasHash = (sel) => page.$eval(sel + ' canvas', (c) => c.toDataURL().length + ':' + c.toDataURL().slice(-80))

try {
  // a killed earlier run can have left either behind, and the POST would then fail onto the stale one
  for (const uid of [UID, FIT]) await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-charts',
        name: 'E2E Charts',
        columns: 12,
        rowHeight: 60,
        widgets: [
          {
            id: 'w-multi',
            type: 'chart',
            config: {
              label: 'Multi',
              period: '24h',
              series: [
                { item: ITEMS.dimmer, label: 'Level' },
                { item: ITEMS.temperature, label: 'Temp', axis: 'y2' },
                { item: ITEMS.switch, label: 'Guest', mode: 'step' },
              ],
              thresholds: [{ from: 80, color: '#e34948', label: 'High' }],
            },
            layout: { lg: { x: 0, y: 0, w: 8, h: 6 } },
          },
          {
            id: 'w-legacy',
            type: 'chart',
            config: { item: ITEMS.dimmer, label: 'Legacy', period: '24h' },
            layout: { lg: { x: 8, y: 0, w: 3, h: 5 } },
          },
          {
            id: 'w-nothresh',
            type: 'chart',
            config: {
              period: '24h',
              picker: false,
              live: false,
              series: [{ item: ITEMS.dimmer, label: 'L', color: '#3987e5', fill: 0, width: 1 }],
            },
            layout: { lg: { x: 0, y: 6, w: 6, h: 4 } },
          },
          {
            id: 'w-thresh',
            type: 'chart',
            config: {
              period: '24h',
              picker: false,
              live: false,
              series: [{ item: ITEMS.dimmer, label: 'L', color: '#3987e5', fill: 0, width: 1 }],
              thresholds: [{ from: -100000, to: 100000, color: '#e34948' }],
            },
            layout: { lg: { x: 6, y: 6, w: 6, h: 4 } },
          },
          {
            id: 'w-y2only',
            type: 'chart',
            config: {
              label: 'Y2',
              period: '24h',
              picker: false,
              live: false,
              series: [{ item: ITEMS.temperature, label: 'T', axis: 'y2', color: '#d55181', fill: 0, width: 1 }],
              thresholds: [{ from: -100000, to: 100000, axis: 'y2', color: '#e34948' }],
            },
            layout: { lg: { x: 0, y: 10, w: 6, h: 4 } },
          },
          {
            id: 'w-decim',
            type: 'chart',
            config: {
              period: '24h',
              picker: false,
              live: false,
              maxPoints: 200,
              series: [{ item: ITEMS.dimmer, label: 'D', fill: 0, width: 1 }],
            },
            layout: { lg: { x: 6, y: 10, w: 6, h: 4 } },
          },
          {
            id: 'w-tt',
            type: 'chart',
            config: {
              label: 'TT',
              period: '24h',
              picker: false,
              live: false,
              series: [
                { item: ITEMS.dimmer, label: 'A', fill: 0 },
                { item: ITEMS.dimmer, label: 'B', fill: 0, width: 1 },
              ],
            },
            layout: { lg: { x: 0, y: 14, w: 6, h: 4 } },
          },
          {
            id: 'w-picked',
            type: 'chart',
            config: {
              label: 'Picked',
              period: '24h',
              live: false,
              periods: ['1h', '24h'],
              series: [{ item: ITEMS.dimmer, label: 'P', fill: 0, width: 1 }],
            },
            layout: { lg: { x: 6, y: 14, w: 6, h: 4 } },
          },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))

  await page.goto(APP + '#/d/nh-e2e-charts', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(chartSel(CELL.multi) + ' canvas', { timeout: 20000 })
  await page.waitForSelector(chartSel(CELL.thresh) + ' canvas', { timeout: 20000 })
  await page.waitForSelector(chartSel(CELL.tt) + ' canvas', { timeout: 20000 })
  await sleep(700)

  const deskLabels = await labelsOutside(page)
  ok(
    'every axis label is drawn inside its canvas',
    deskLabels.drawn > 20 && deskLabels.bad.length === 0,
    `${deskLabels.drawn} drawn, off the edge: ${JSON.stringify(deskLabels.bad.slice(0, 3))}`
  )

  // whether a tick sits by the right edge depends on the time of day, so pin the clock just after the last
  // noon or midnight: every tick step up to 12h has a tick there, 90 seconds short of the window's end
  const pin = new Date()
  pin.setHours(pin.getHours() >= 12 ? 12 : 0, 0, 0, 0)
  const edgePage = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  edgePage.on('pageerror', (e) => errs.push(String(e.message)))
  await edgePage.addInitScript(
    ({ t, capture }) => {
      try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {}
      new Function('return ' + capture)()()
    },
    { t: TOKEN, capture: CAPTURE_LABELS.toString() }
  )
  await edgePage.clock.setFixedTime(pin.getTime() + 90_000)
  await edgePage.goto(APP + '#/d/nh-e2e-charts', { waitUntil: 'domcontentloaded' })
  await edgePage.waitForSelector(chartSel(CELL.multi) + ' canvas', { timeout: 20000 }).catch(() => {})
  await edgePage.waitForSelector(chartSel(CELL.tt) + ' canvas', { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  const edgeLabels = await labelsOutside(edgePage)
  const atEdge = await edgePage.evaluate(() =>
    (window.__labels ?? []).filter((l) => l.align === 'center' && l.x + l.w / 2 > l.cw - 24).map((l) => l.t)
  )
  ok(
    'an x label on the right edge of the window stays inside its canvas',
    atEdge.length > 0 && edgeLabels.bad.length === 0,
    `pinned ${pin.toLocaleTimeString()} + 90s, at the edge: ${JSON.stringify([...new Set(atEdge)].slice(0, 3))}, off it: ${JSON.stringify(edgeLabels.bad.slice(0, 3))}`
  )
  await edgePage.close()

  const keys = page.locator(cellSel(CELL.multi) + ' .nh-chart__key')
  ok('legend shows 3 series', (await keys.count()) === 3, String(await keys.count()))
  const dotColors = await page.$$eval(cellSel(CELL.multi) + ' .nh-chart__key .nh-chart__dot', (els) =>
    els.map((e) => getComputedStyle(e).backgroundColor)
  )
  ok(
    'auto palette colors assigned in order',
    JSON.stringify(dotColors) === JSON.stringify(['rgb(57, 135, 229)', 'rgb(0, 131, 0)', 'rgb(213, 81, 129)']),
    JSON.stringify(dotColors)
  )
  ok(
    'single-series charts show no legend',
    (await page.locator(cellSel(CELL.nothresh) + ' .nh-chart__legend').count()) === 0
  )
  const chip24 = page.locator(cellSel(CELL.multi) + ' .nh-chart__chip--on')
  ok('period chip 24h active', (await chip24.textContent()) === '24h', String(await chip24.textContent()))
  ok(
    'chips hidden when picker: false',
    (await page.locator(cellSel(CELL.nothresh) + ' .nh-chart__chips').count()) === 0
  )

  // the range choosers, the axis labels and the legend are text a person reads, so they sit at the tile's
  // own size. A chip that parks in the name row would otherwise inherit its 0.8em and shrink again on top
  // of its own, which put it at 8.7px on a real dashboard.
  const readable = await page.evaluate((sel) => {
    const cell = document.querySelector(sel)
    if (!cell) return null
    const size = (el) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null)
    return {
      cell: size(cell),
      chip: size(cell.querySelector('.nh-chart__chip')),
      key: size(cell.querySelector('.nh-chart__key')),
      inHeader: !!cell.querySelector('.nh-widget__aside .nh-chart__chip')
    }
  }, cellSel(CELL.multi))
  ok(
    'a range chooser is set at the tile’s own text size, wherever it parks',
    readable !== null && readable.chip === readable.cell && readable.cell >= 12,
    JSON.stringify(readable)
  )
  ok(
    'and so is a legend key',
    readable !== null && readable.key === readable.cell,
    `key=${readable?.key} cell=${readable?.cell}`
  )

  const chipsOf = (i) => page.$$eval(cellSel(i) + ' .nh-chart__chip', (els) => els.map((e) => e.textContent.trim()))
  const defaultChips = await chipsOf(CELL.multi)
  ok(
    'the chip row offers the short ranges a live reading is read at',
    defaultChips.includes('3h') && defaultChips.includes('6h'),
    defaultChips.join(' ')
  )
  ok(
    'chips run shortest to longest',
    JSON.stringify(defaultChips) === JSON.stringify(['1h', '3h', '6h', '12h', '24h', '7d', '30d', '1y']),
    defaultChips.join(' ')
  )
  const pickedChips = await chipsOf(CELL.picked)
  ok(
    'a chart offers the ranges its author picked, and no others',
    JSON.stringify(pickedChips) === JSON.stringify(['1h', '24h']),
    pickedChips.join(' ')
  )
  await page.click(cellSel(CELL.picked) + ' .nh-chart__chip:has-text("1h")')
  await sleep(1200)
  const afterPick = await chipsOf(CELL.picked)
  ok(
    'the range you came from is still one chip away',
    JSON.stringify(afterPick) === JSON.stringify(['1h', '24h']),
    afterPick.join(' ')
  )
  await page.click(cellSel(CELL.picked) + ' .nh-chart__chip:has-text("24h")')
  await sleep(1200)

  const ttCanvas = await page.$(chartSel(CELL.tt) + ' canvas')
  await ttCanvas.scrollIntoViewIfNeeded()
  const ttBox = await ttCanvas.boundingBox()
  let ttRows = 0
  for (let i = 0; i < 20 && ttRows < 2; i++) {
    await page.mouse.move(ttBox.x + ttBox.width * 0.55, ttBox.y + ttBox.height * 0.5 + (i % 2))
    await sleep(250)
    ttRows = await page.locator(cellSel(CELL.tt) + ' .nh-chart__tt--show .nh-chart__tt-row').count()
  }
  const tt = page.locator(cellSel(CELL.tt) + ' .nh-chart__tt--show')
  ok('crosshair tooltip appears on hover', (await tt.count()) === 1)
  ok('tooltip lists the series under the cursor', ttRows >= 2, `rows=${ttRows}`)
  const ttTime = await page.locator(cellSel(CELL.tt) + ' .nh-chart__tt--show .nh-chart__tt-time').textContent()
  ok('tooltip has a time header', !!ttTime && ttTime.trim().length > 4, ttTime ?? '')
  await page.mouse.move(10, 10)
  await sleep(250)
  ok('tooltip hides when the pointer leaves', (await page.locator(cellSel(CELL.tt) + ' .nh-chart__tt--show').count()) === 0)

  await keys.nth(1).click()
  ok('legend click marks series off', (await keys.nth(1).getAttribute('class')).includes('nh-chart__key--off'))
  const ttKeys = page.locator(cellSel(CELL.tt) + ' .nh-chart__key')
  await ttKeys.nth(1).click()
  await ttCanvas.scrollIntoViewIfNeeded()
  const ttBox2 = await ttCanvas.boundingBox()
  await page.mouse.move(ttBox2.x + ttBox2.width * 0.55, ttBox2.y + ttBox2.height * 0.5)
  await sleep(300)
  const rowsHidden = await page.locator(cellSel(CELL.tt) + ' .nh-chart__tt--show .nh-chart__tt-row').count()
  ok('hidden series leaves the tooltip', rowsHidden === ttRows - 1, `rows=${rowsHidden} was ${ttRows}`)
  await page.mouse.move(10, 10)
  await ttKeys.nth(1).click()
  await keys.nth(1).click()
  ok('legend click re-shows series', !(await keys.nth(1).getAttribute('class')).includes('nh-chart__key--off'))

  const before7d = persistCount
  await page.click(cellSel(CELL.multi) + ' .nh-chart__chip:text-is("7d")')
  await sleep(1500)
  const fetched = persistCount - before7d
  ok('7d chip refetches all series', fetched >= 3, `fetches=${fetched}`)
  const last = persistUrls[persistUrls.length - 1]
  const started = new URL(last).searchParams.get('starttime')
  const ageDays = (Date.now() - Date.parse(started)) / 86400e3
  ok('7d starttime is ~7 days ago', ageDays > 6.9 && ageDays < 7.1, `age=${ageDays.toFixed(2)}d`)
  ok(
    '7d chip becomes active',
    (await page.locator(cellSel(CELL.multi) + ' .nh-chart__chip--on').textContent()) === '7d'
  )
  await page.click(cellSel(CELL.multi) + ' .nh-chart__chip:text-is("24h")')
  await sleep(1200)

  const zbox = await (await page.$(chartSel(CELL.multi) + ' canvas')).boundingBox()
  await page.mouse.move(zbox.x + zbox.width * 0.45, zbox.y + zbox.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(zbox.x + zbox.width * 0.75, zbox.y + zbox.height * 0.5, { steps: 8 })
  await page.mouse.up()
  await sleep(400)
  const resetChip = page.locator(cellSel(CELL.multi) + ' .nh-chart__chip--reset')
  ok('drag-zoom shows the reset chip', (await resetChip.count()) === 1)
  await resetChip.click()
  await sleep(600)
  ok('reset chip clears the zoom', (await page.locator(cellSel(CELL.multi) + ' .nh-chart__chip--reset').count()) === 0)

  ok('legacy {item} config renders a chart', (await page.locator(chartSel(CELL.legacy) + ' canvas').count()) === 1)

  const plain = await sampleCanvas(chartSel(CELL.nothresh))
  const banded = await sampleCanvas(chartSel(CELL.thresh))
  ok(
    'threshold band paints the plot red',
    banded.r > plain.r + 8 && banded.r > banded.b,
    `plain r=${plain.r.toFixed(1)} banded r=${banded.r.toFixed(1)} b=${banded.b.toFixed(1)}`
  )

  await page.waitForSelector(chartSel(CELL.y2only) + ' canvas')
  const leftStrip = await page.$eval(chartSel(CELL.y2only) + ' canvas', (c) => {
    const ctx = c.getContext('2d')
    const d = ctx.getImageData(30, Math.floor(c.height * 0.35), 10, Math.floor(c.height * 0.25)).data
    let s = 0
    for (let i = 0; i < d.length; i += 4) s += (d[i] - d[i + 2]) * (d[i + 3] / 255)
    return s / (d.length / 4)
  })
  ok('y2-only chart has no phantom left axis (band reaches left edge)', leftStrip > 3, `r-b=${leftStrip.toFixed(2)}`)

  ok(
    'wide chart parks chips beside its name',
    (await page.locator(cellSel(CELL.multi) + ' .nh-widget__label .nh-chart__chips').count()) === 1
  )
  ok(
    'narrow chart keeps chips above the plot',
    (await page.locator(cellSel(CELL.legacy) + ' .nh-widget__label .nh-chart__chips').count()) === 0 &&
      (await page.locator(cellSel(CELL.legacy) + ' .nh-chartwrap .nh-chart__chips').count()) === 1
  )

  const decimPid = await page.$eval(chartSel(CELL.decim) + ' canvas', (c) => c.__pid)
  const decimSegs = await page.evaluate(
    (p) => window.__frames.filter((f) => f.pid === p).map((f) => f.segs),
    decimPid
  )
  const decimLast = decimSegs[decimSegs.length - 1]
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const raw = await fetch(`${BASE}/rest/persistence/items/${ITEMS.dimmer}?starttime=${since}`, { headers: AUTH })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => Number(j?.datapoints ?? 0))
    .catch(() => 0)
  if (raw <= 220) {
    ok(`maxPoints decimation (SKIPPED: only ${raw} stored points in 24h, nothing to average down)`, true)
  } else {
    ok('maxPoints averages the series down (~200 buckets)', decimLast > 150 && decimLast < 300, `segs=${decimLast} of ${raw} raw`)
  }

  await page.mouse.move(10, 10)
  await sleep(600)
  const target = Number(initialLevel) > 50 ? '15' : '85'
  const legacyPid = await page.$eval(chartSel(CELL.legacy) + ' canvas', (c) => c.__pid)
  const legacySegs = (pid) =>
    page.evaluate((p) => window.__frames.filter((f) => f.pid === p).map((f) => f.segs), pid)
  const segsBefore = await legacySegs(legacyPid)
  const persistBefore = persistCount
  await sendCmd(ITEMS.dimmer, target)
  await sleep(3000)
  const segsAfter = await legacySegs(legacyPid)
  const lastBefore = segsBefore[segsBefore.length - 1]
  const lastAfter = segsAfter[segsAfter.length - 1]
  ok(
    'live item change appends a point (one more path segment)',
    segsAfter.length > segsBefore.length && lastAfter === lastBefore + 1,
    `frames ${segsBefore.length}->${segsAfter.length}, segs ${lastBefore}->${lastAfter}`
  )
  ok('live append does not refetch history', persistCount === persistBefore, `fetches=${persistCount - persistBefore}`)
  await sendCmd(ITEMS.dimmer, initialLevel)
  await sleep(800)

  await page.click(cellSel(CELL.multi) + ' .nh-chart__chip:has-text("12h")')
  await sleep(2500)
  ok(
    '12h chip active in run mode',
    (await page.locator(cellSel(CELL.multi) + ' .nh-chart__chip--on:has-text("12h")').count()) === 1
  )

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  ok(
    'picked period survives entering edit mode (was resetting to default)',
    (await page.locator(`.nh-cell:nth-child(${CELL.multi + 1}) .nh-chart__chip--on:has-text("12h")`).count()) === 1
  )
  await page.locator('.nh-cell').nth(CELL.multi).locator('.nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side')
  const cards = page.locator('.nh-sheet--side .nh-chartcard')
  ok('settings show 3 series + 1 threshold cards', (await cards.count()) === 4, String(await cards.count()))
  ok('y2 axis fields appear when a series uses the right axis', (await page.locator('.nh-sheet--side label:has-text("Right Y axis min")').count()) === 1)
  const labelInput = page.locator('.nh-sheet--side .nh-chartcard').first().locator('input[placeholder="Label (optional)"]')
  await labelInput.fill('LVL')
  await sleep(400)
  const firstKey = await page.locator(`.nh-cell:nth-child(${CELL.multi + 1}) .nh-chart__key`).first().textContent()
  ok('series label edit live-previews in the legend', firstKey?.trim() === 'LVL', firstKey ?? '')

  await page.locator('.nh-cell').nth(CELL.nothresh).locator('.nh-cell__overlay').click()
  await sleep(300)
  await page.click('.nh-sheet--side button:has-text("Add series")')
  const picker = page.locator('.nh-sheet--side .nh-chartcard').nth(1).locator('.nh-picker input[role="combobox"]')
  const pickedSeries = await pickItem(page, picker, ITEMS.temperature)
  await sleep(400)
  ok('clicking the option binds the new series to that item', pickedSeries === ITEMS.temperature, 'value=' + pickedSeries)
  ok(
    'adding a second series shows the legend in preview',
    (await page.locator(`.nh-cell:nth-child(${CELL.nothresh + 1}) .nh-chart__legend`).count()) === 1
  )

  const rangeSel = '.nh-sheet--side .nh-field:has(.nh-field__label:text-is("Ranges offered")) .nh-multisel'
  const rangeChips = () =>
    page.$$eval(rangeSel + ' button', (els) =>
      els.map((e) => ({ id: e.textContent.trim(), on: e.getAttribute('aria-pressed') === 'true' }))
    )

  await page.locator('.nh-cell').nth(CELL.multi).locator('.nh-cell__overlay').click({ timeout: 8000 }).catch(() => {})
  await sleep(400)
  const asDrawn = await rangeChips()
  ok('the settings offer every range as a toggle', asDrawn.length === 15, `${asDrawn.length} options`)
  ok(
    'with nothing stored the form shows the set the chart is actually drawing',
    JSON.stringify(asDrawn.filter((c) => c.on).map((c) => c.id)) ===
      JSON.stringify(['1h', '3h', '6h', '12h', '24h', '7d', '30d', '1y']),
    asDrawn.filter((c) => c.on).map((c) => c.id).join(' ')
  )

  await page.locator('.nh-cell').nth(CELL.picked).locator('.nh-cell__overlay').click({ timeout: 8000 }).catch(() => {})
  await sleep(400)
  const asStored = await rangeChips()
  ok(
    'a stored list is shown as stored',
    JSON.stringify(asStored.filter((c) => c.on).map((c) => c.id)) === JSON.stringify(['1h', '24h']),
    asStored.filter((c) => c.on).map((c) => c.id).join(' ')
  )
  await page.click(rangeSel + ' button:text-is("6h")', { timeout: 8000 }).catch(() => {})
  await sleep(600)
  const previewed = await page.$$eval(`.nh-cell:nth-child(${CELL.picked + 1}) .nh-chart__chip`, (els) =>
    els.map((e) => e.textContent.trim())
  )
  ok(
    'adding a range live-previews on the widget',
    JSON.stringify(previewed) === JSON.stringify(['1h', '6h', '24h']),
    previewed.join(' ')
  )

  await page.click('button:has-text("Exit")')
  await sleep(700)
  const comp = await (await fetch(NS + '/' + UID, { headers: AUTH })).json()
  const stored = comp?.config?.widgets?.find((w) => w.id === 'w-multi')
  ok(
    'cancel leaves the server config untouched',
    stored?.config?.series?.[0]?.label === 'Level' &&
      comp?.config?.widgets?.find((w) => w.id === 'w-nothresh')?.config?.series?.length === 1,
    JSON.stringify(stored?.config?.series?.[0])
  )

  ok('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '))

  await page.screenshot({ path: 'shot-charts.png', fullPage: false })

  {
    await page.route('**/rest/persistence/items/**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Persistence service not queryable: nosuchservice', 'http-code': 400 } }),
      })
    )
    await page.route('**/rest/persistence', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-histnotice, .nh-chart__status', { timeout: 20000 }).catch(() => {})
    await sleep(1500)
    const notice = await page.evaluate(() => {
      const el = document.querySelector('.nh-histnotice')
      return {
        present: !!el,
        head: el?.querySelector('.nh-histnotice__head')?.textContent ?? '',
        detail: el?.querySelector('.nh-histnotice__detail')?.textContent ?? '',
        stillSaysFault: [...document.querySelectorAll('.nh-chart__status')].some((s) =>
          (s.textContent ?? '').includes('Could not load history')
        ),
      }
    })
    ok('no persistence: says a persistence service is needed', notice.present, 'head=' + notice.head)
    ok('no persistence: not reported as an ordinary fault', !notice.stillSaysFault)
    ok(
      'no persistence: names no particular add-on',
      notice.detail.length > 20 && !/rrd4j|influx|mapdb|jdbc/i.test(notice.head + notice.detail),
      notice.detail.slice(0, 80)
    )
    ok('no persistence: an admin is told none is installed', /installed/i.test(notice.detail), notice.detail.slice(0, 80))
    await page.unroute('**/rest/persistence/items/**')
    await page.unroute('**/rest/persistence')
  }

  // --- full screen: the plot IS the page --------------------------------------------------------
  // The page existed since the feature landed and nothing had ever measured its plot, only where the
  // expand button sits. A percentage height on the chart never resolved against the plot box, so the
  // chart fell back to its 240px floor and left four fifths of a 1000px window empty.
  {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(chartSel(CELL.multi) + ' canvas', { timeout: 25000 })
    await sleep(1500)
    await page.click(cellSel(CELL.multi) + ' .nh-chart__expand')
    await page.waitForSelector('.nh-chartview__plot canvas', { timeout: 25000 }).catch(() => {})
    await sleep(2000)
    const full = await page.evaluate(() => {
      const box = (s) => {
        const el = document.querySelector(s)
        return el ? Math.round(el.getBoundingClientRect().height) : -1
      }
      return {
        route: location.hash,
        plot: box('.nh-chartview__plot'),
        chart: box('.nh-chartview__plot .nh-chart'),
        canvas: box('.nh-chartview__plot canvas'),
        docH: document.documentElement.scrollHeight,
        winH: innerHeight,
      }
    })
    ok('full screen: the expand button opens the chart page', full.route.startsWith('#/c/'), full.route)
    // the precondition the rest of this section needs: without a plot box far taller than the 240px
    // floor, "the chart fills it" would be true of the broken build too
    ok('full screen: the plot box has most of the window', full.plot > 700, `plot=${full.plot} win=${full.winH}`)
    ok(
      'full screen: the chart fills the plot box',
      full.chart > 0 && full.plot - full.chart <= 30,
      `chart=${full.chart} of plot=${full.plot}`
    )
    ok(
      'full screen: the canvas is drawn at that height',
      full.canvas > 0 && Math.abs(full.canvas - full.chart) <= 4,
      `canvas=${full.canvas} chart=${full.chart}`
    )
    ok('full screen: the page does not scroll', full.docH <= full.winH + 2, `doc=${full.docH} win=${full.winH}`)
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
    await sleep(800)
  }

  // --- a phone-sized tile: the plot is the thing the widget is for -------------------------------
  // Jon's own geometry: 12 columns, gap 6, square rows, a chart 7 wide and 2 tall. On a landscape
  // phone that is a 493x136 tile, and uPlot's flat 50px x-axis took every pixel the plot had.
  const fitSeed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: FIT,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-chartfit',
        name: 'E2E Chart fit',
        columns: 12,
        gap: 6,
        rowHeight: 'match',
        widgets: [
          {
            id: 'w-short',
            type: 'chart',
            config: { label: 'Short', period: '24h', live: false, series: [{ item: ITEMS.dimmer, label: 'S' }] },
            layout: { lg: { x: 0, y: 0, w: 7, h: 2 } },
          },
          {
            id: 'w-narrow',
            type: 'chart',
            config: { label: 'Narrow', period: '24h', live: false, series: [{ item: ITEMS.dimmer, label: 'N' }] },
            layout: { lg: { x: 7, y: 0, w: 2, h: 4 } },
          },
        ],
      },
    }),
  })
  ok('fit dashboard created', fitSeed.ok, String(fitSeed.status))

  const phone = await browser.newPage({ viewport: { width: 873, height: 393 }, hasTouch: true, isMobile: true })
  await phone.addInitScript(
    ({ t, capture }) => {
      const CAPTURE = new Function('return ' + capture)()
      try {
        localStorage.setItem('neohab:apiToken', t)
        localStorage.setItem('neohab:themeOverride', 'dark')
      } catch {}
      CAPTURE()
    },
    { t: TOKEN, capture: CAPTURE_LABELS.toString() }
  )
  await phone.goto(APP + '#/d/nh-e2e-chartfit', { waitUntil: 'domcontentloaded' })
  await phone.waitForSelector('.nh-chart canvas', { timeout: 20000 }).catch(() => {})
  await sleep(1500)

  const fitBoxes = await phone.evaluate(() => {
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }
    const of = (label) => {
      const cell = [...document.querySelectorAll('.nh-gcell')].find(
        (c) => c.querySelector('.nh-widget__labeltext')?.textContent === label
      )
      const chips = cell?.querySelector('.nh-chart__chips')
      return {
        cell: box(cell),
        canvas: box(cell?.querySelector('.nh-chart canvas')),
        plot: box(cell?.querySelector('.u-over')),
        expandInHeader: !!cell?.querySelector('.nh-widget__label .nh-chart__expand'),
        chips: box(chips),
        chip: box(chips?.querySelector('.nh-chart__chip')),
        chipsScroll: chips ? { scroll: chips.scrollWidth, client: chips.clientWidth } : null,
      }
    }
    return { short: of('Short'), narrow: of('Narrow') }
  })
  await phone.close()
  const short = fitBoxes.short
  const narrow = fitBoxes.narrow
  ok('short tile: the chart is drawn at all', !!short.canvas && short.canvas.h > 0, JSON.stringify(short.canvas))
  ok(
    'short tile: the axes leave the plot at least half the canvas',
    !!short.plot && !!short.canvas && short.plot.h >= short.canvas.h * 0.5 && short.plot.h >= 40,
    `plot=${JSON.stringify(short.plot)} canvas=${JSON.stringify(short.canvas)}`
  )
  ok('short tile: the expand button rides in the name row', short.expandInHeader === true, `inHeader=${short.expandInHeader}`)
  ok(
    'narrow tile: they leave it at least half the canvas width',
    !!narrow.plot && !!narrow.canvas && narrow.plot.w >= narrow.canvas.w * 0.5,
    `plot=${JSON.stringify(narrow.plot)} canvas=${JSON.stringify(narrow.canvas)}`
  )
  ok(
    'narrow tile: the chips stay on one row',
    !!narrow.chips && !!narrow.chip && narrow.chips.h <= narrow.chip.h * 1.5,
    `chips=${JSON.stringify(narrow.chips)} chip=${JSON.stringify(narrow.chip)}`
  )
  ok(
    'and the chips that do not fit are still reachable by scrolling',
    !!narrow.chipsScroll && narrow.chipsScroll.scroll > narrow.chipsScroll.client,
    JSON.stringify(narrow.chipsScroll)
  )

} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  const del = await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
  const delFit = await fetch(NS + '/' + FIT, { method: 'DELETE', headers: AUTH })
  const gone =
    (await fetch(NS + '/' + UID, { headers: AUTH })).status === 404 &&
    (await fetch(NS + '/' + FIT, { headers: AUTH })).status === 404
  ok(
    'cleanup: suite dashboards deleted',
    (del.ok || del.status === 404) && (delFit.ok || delFit.status === 404) && gone,
    `del=${del.status}/${delFit.status}`
  )
  await sendCmd(ITEMS.dimmer, initialLevel)
  await sleep(1000)
  const lvl = await getState(ITEMS.dimmer)
  ok(`cleanup: ${ITEMS.dimmer} restored`, lvl === initialLevel, `${lvl} vs ${initialLevel}`)
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks passed`)
process.exitCode = pass === results.length ? 0 : 1
