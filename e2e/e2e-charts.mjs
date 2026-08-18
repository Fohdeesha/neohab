/**
 * Chart-v2 e2e: multi-series, palette colors, legend toggling, crosshair tooltip, period
 * chips + refetch, drag-zoom + reset, threshold band pixels, legacy single-item configs,
 * live SSE appending without refetch, and the series/threshold settings editors.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-charts and deletes exactly that in
 * cleanup (guarded, runs even if a section throws). Commands ONLY the dimmer item (approved),
 * records its initial state and restores it. the temperature item / the switch item are
 * read via persistence history only, never commanded.
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-charts'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => (await fetch(`${BASE}/rest/items/${item}/state`)).text()
const sendCmd = (item, cmd) =>
  fetch(`${BASE}/rest/items/${item}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: cmd })

const initialLevel = await getState(ITEMS.dimmer)

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  // Pin the default theme: the server's global theme is the user's own choice, and a theme
  // may legitimately re-pin chart palette slots (--nh-chart-<n>) - this suite asserts the
  // BUILT-IN palette order, so it must not inherit whatever theme the server happens to run.
  try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {}
  // Frame probe: a live append redraws its own canvas with exactly one more path segment.
  // Pixel comparison can't see it - the drop lands in the same pixel column as the fill's
  // closing edge at the plot border - so count segments per frame, attributed per canvas.
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
}, TOKEN)

// count persistence fetches (period switch refetches; live appends must NOT)
let persistCount = 0
const persistUrls = []
page.on('request', (r) => {
  if (r.url().includes('/rest/persistence/items/')) { persistCount++; persistUrls.push(r.url()) }
})

// DOM cell order == widgets array order
const CELL = { multi: 0, legacy: 1, nothresh: 2, thresh: 3, y2only: 4, decim: 5 }
const chartSel = (i) => `.nh-gcell:nth-child(${i + 1}) .nh-chart`
const cellSel = (i) => `.nh-gcell:nth-child(${i + 1})`

/** Alpha-weighted average color of a block at the center of a chart canvas. */
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
  // ---------- seed ----------
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
              // full-plot band: with no left axis the band must start at the canvas's left edge
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
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))

  await page.goto(APP + '#/d/nh-e2e-charts', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(chartSel(CELL.multi) + ' canvas', { timeout: 20000 })
  await page.waitForSelector(chartSel(CELL.thresh) + ' canvas', { timeout: 20000 })
  await sleep(700)

  // ---------- multi-series: legend, palette, chips ----------
  const keys = page.locator(cellSel(CELL.multi) + ' .nh-chart__key')
  ok('legend shows 3 series', (await keys.count()) === 3, String(await keys.count()))
  const dotColors = await page.$$eval(cellSel(CELL.multi) + ' .nh-chart__key .nh-chart__dot', (els) =>
    els.map((e) => getComputedStyle(e).backgroundColor)
  )
  // dark theme palette slots 1..3
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

  // ---------- tooltip ----------
  // Polled, with the cursor re-nudged each round: a hover that fires before both series have
  // been applied lists only one row, and under battery load a single 300ms sample caught
  // exactly that frame. The cap keeps the assertion able to fail.
  const canvasBox = await (await page.$(chartSel(CELL.multi) + ' canvas')).boundingBox()
  let ttRows = 0
  for (let i = 0; i < 20 && ttRows < 2; i++) {
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.5 + (i % 2))
    await sleep(250)
    ttRows = await page.locator(cellSel(CELL.multi) + ' .nh-chart__tt--show .nh-chart__tt-row').count()
  }
  const tt = page.locator(cellSel(CELL.multi) + ' .nh-chart__tt--show')
  ok('crosshair tooltip appears on hover', (await tt.count()) === 1)
  ok('tooltip lists the series under the cursor', ttRows >= 2, `rows=${ttRows}`)
  const ttTime = await page.locator(cellSel(CELL.multi) + ' .nh-chart__tt--show .nh-chart__tt-time').textContent()
  ok('tooltip has a time header', !!ttTime && ttTime.trim().length > 4, ttTime ?? '')
  await page.mouse.move(10, 10)
  await sleep(250)
  ok('tooltip hides when the pointer leaves', (await page.locator(cellSel(CELL.multi) + ' .nh-chart__tt--show').count()) === 0)

  // ---------- legend toggling ----------
  await keys.nth(1).click()
  ok('legend click marks series off', (await keys.nth(1).getAttribute('class')).includes('nh-chart__key--off'))
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.5)
  await sleep(300)
  const rowsHidden = await page.locator(cellSel(CELL.multi) + ' .nh-chart__tt--show .nh-chart__tt-row').count()
  ok('hidden series leaves the tooltip', rowsHidden === ttRows - 1, `rows=${rowsHidden} was ${ttRows}`)
  await page.mouse.move(10, 10)
  await keys.nth(1).click()
  ok('legend click re-shows series', !(await keys.nth(1).getAttribute('class')).includes('nh-chart__key--off'))

  // ---------- period switch refetches with the right window ----------
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

  // ---------- drag-zoom + reset ----------
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

  // ---------- legacy single-item config renders ----------
  ok('legacy {item} config renders a chart', (await page.locator(chartSel(CELL.legacy) + ' canvas').count()) === 1)

  // ---------- threshold band drawn ----------
  const plain = await sampleCanvas(chartSel(CELL.nothresh))
  const banded = await sampleCanvas(chartSel(CELL.thresh))
  ok(
    'threshold band paints the plot red',
    banded.r > plain.r + 8 && banded.r > banded.b,
    `plain r=${plain.r.toFixed(1)} banded r=${banded.r.toFixed(1)} b=${banded.b.toFixed(1)}`
  )

  // ---------- y2-only chart: no phantom left axis ----------
  // The full-plot band must reach the canvas's left edge; a phantom 0..1 left axis would
  // leave a transparent ~45px gutter there instead.
  await page.waitForSelector(chartSel(CELL.y2only) + ' canvas')
  // Red-minus-blue, alpha-weighted: the band is red; a phantom axis leaves either nothing or
  // gray-blue tick text there (negative delta), so only the fixed build scores positive.
  const leftStrip = await page.$eval(chartSel(CELL.y2only) + ' canvas', (c) => {
    const ctx = c.getContext('2d')
    // x 30-40: inside the band once the phantom axis is gone (its ~25px default gutter ends
    // before that), but inside the ~50px axis gutter (empty or gray-blue text) when it isn't.
    const d = ctx.getImageData(30, Math.floor(c.height * 0.35), 10, Math.floor(c.height * 0.25)).data
    let s = 0
    for (let i = 0; i < d.length; i += 4) s += (d[i] - d[i + 2]) * (d[i + 3] / 255)
    return s / (d.length / 4)
  })
  ok('y2-only chart has no phantom left axis (band reaches left edge)', leftStrip > 3, `r-b=${leftStrip.toFixed(2)}`)

  // ---------- chips placement: inline beside a wide chart's name, stacked when narrow ----------
  ok(
    'wide chart parks chips beside its name',
    (await page.locator(cellSel(CELL.multi) + ' .nh-widget__label .nh-chart__chips').count()) === 1
  )
  ok(
    'narrow chart keeps chips above the plot',
    (await page.locator(cellSel(CELL.legacy) + ' .nh-widget__label .nh-chart__chips').count()) === 0 &&
      (await page.locator(cellSel(CELL.legacy) + ' .nh-chartwrap .nh-chart__chips').count()) === 1
  )

  // ---------- decimation caps rendered points ----------
  const decimPid = await page.$eval(chartSel(CELL.decim) + ' canvas', (c) => c.__pid)
  const decimSegs = await page.evaluate(
    (p) => window.__frames.filter((f) => f.pid === p).map((f) => f.segs),
    decimPid
  )
  const decimLast = decimSegs[decimSegs.length - 1]
  // averaging emits ONE point per time bucket (~200 for minute data) - the old min/max
  // collapsed flat buckets to ~105 segments, so the >150 floor discriminates the algorithms.
  // It can only discriminate when there is something to decimate, so establish that rather than
  // assume it: a server whose history is sparser than maxPoints draws every point it has and
  // would fail a check that was never about it.
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

  // ---------- live SSE append (no refetch) ----------
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

  // ---------- picked period survives entering edit mode ----------
  await page.click(cellSel(CELL.multi) + ' .nh-chart__chip:has-text("12h")')
  await sleep(2500)
  ok(
    '12h chip active in run mode',
    (await page.locator(cellSel(CELL.multi) + ' .nh-chart__chip--on:has-text("12h")').count()) === 1
  )

  // ---------- settings editors ----------
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
  // 3 series cards + 1 threshold card
  ok('settings show 3 series + 1 threshold cards', (await cards.count()) === 4, String(await cards.count()))
  ok('y2 axis fields appear when a series uses the right axis', (await page.locator('.nh-sheet--side label:has-text("Right Y axis min")').count()) === 1)
  const labelInput = page.locator('.nh-sheet--side .nh-chartcard').first().locator('input[placeholder="Label (optional)"]')
  await labelInput.fill('LVL')
  await sleep(400)
  // edit mode renders .nh-cell cells, not the run-mode .nh-gcell
  const firstKey = await page.locator(`.nh-cell:nth-child(${CELL.multi + 1}) .nh-chart__key`).first().textContent()
  ok('series label edit live-previews in the legend', firstKey?.trim() === 'LVL', firstKey ?? '')

  // add a series to the single-series chart -> legend appears in preview
  await page.locator('.nh-cell').nth(CELL.nothresh).locator('.nh-cell__overlay').click()
  await sleep(300)
  await page.click('.nh-sheet--side button:has-text("Add series")')
  const picker = page.locator('.nh-sheet--side .nh-chartcard').nth(1).locator('.nh-picker input[role="combobox"]')
  await picker.click()
  await picker.fill(ITEMS.temperature)
  await page.waitForSelector('.nh-picker__option')
  await page.click(`.nh-picker__option:has(.nh-picker__name:text-is("${ITEMS.temperature}"))`)
  await sleep(700)
  ok(
    'adding a second series shows the legend in preview',
    (await page.locator(`.nh-cell:nth-child(${CELL.nothresh + 1}) .nh-chart__legend`).count()) === 1
  )

  // discard everything; server config must be untouched
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

  // ---------- console health ----------
  ok('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '))

  await page.screenshot({ path: 'shot-charts.png', fullPage: false })

  /* ---------- a server with no usable persistence service ----------
     Last, because it routes the persistence endpoint away and every earlier section wants the
     real one. The body is exactly what openHAB 4.3.7 answers when asked for history from a
     service it cannot query (measured; 5.x uses a different STATUS for the same thing, which is
     why the app matches the message instead). A chart used to call this "Could not load
     history", which describes a fault rather than a missing prerequisite - and a fresh openHAB
     has no persistence add-on at all, so it is the first thing many people would see. */
  {
    await page.route('**/rest/persistence/items/**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Persistence service not queryable: nosuchservice', 'http-code': 400 } }),
      })
    )
    // the admin-only service list: an empty one means "nothing installed"
    await page.route('**/rest/persistence', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
    // reload, not goto: the page is already on this hash, and a goto that only changes the
    // fragment is a same-document navigation - nothing would refetch and the charts would sit
    // there still showing the data they loaded before the routes existed
    await page.reload({ waitUntil: 'domcontentloaded' })
    // caught so a build without the notice fails these checks rather than aborting the suite
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
    // "mentions no add-on" must not be satisfiable by there being no notice at all
    ok(
      'no persistence: names no particular add-on',
      notice.detail.length > 20 && !/rrd4j|influx|mapdb|jdbc/i.test(notice.head + notice.detail),
      notice.detail.slice(0, 80)
    )
    ok('no persistence: an admin is told none is installed', /installed/i.test(notice.detail), notice.detail.slice(0, 80))
    await page.unroute('**/rest/persistence/items/**')
    await page.unroute('**/rest/persistence')
  }
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  // ---------- cleanup (always) ----------
  const del = await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
  const gone = (await fetch(NS + '/' + UID, { headers: AUTH })).status === 404
  ok('cleanup: suite dashboard deleted', (del.ok || del.status === 404) && gone, `del=${del.status}`)
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
