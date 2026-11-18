// Chart aggregation / heatmap / full-screen view e2e.
// SAFE with a live config: creates only dashboard:nh-e2e-agg, deletes exactly that, and commands NOTHING, it
// only reads the history of the configured temperature item. The app asks for history a page of rows at a
// time, and on a production target the harness refuses a request that does not (lib/sandbox.mjs).
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, ITEMS, PRODUCTION } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const DASH = 'nh-e2e-agg'
const UID = 'dashboard:' + DASH
const ITEM = ITEMS.temperature

const del = async (u) => fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH }).catch(() => {})
const get = async (u) => {
  const r = await fetch(NS + '/' + encodeURIComponent(u), { headers: AUTH })
  return r.ok ? r.json() : null
}
const seed = async (chartConfig) => {
  await del(UID)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: DASH, name: 'E2E Aggregate', columns: 12, rowHeight: 60, gap: 8,
        widgets: [
          {
            id: 'w-chart',
            type: 'chart',
            config: { label: 'Agg', series: [{ item: ITEM }], period: '7d', refresh: 3600, live: false, ...chartConfig },
            layout: { lg: { x: 0, y: 0, w: 8, h: 5 } },
          },
        ],
      },
    }),
  })
  return r.ok
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => void d.accept())
await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

await ctx.addInitScript(() => {
  const w = window
  w.__draw = { seg: 0, curve: 0, rects: 0, fills: 0, texts: [] }
  const P = Path2D.prototype
  const lineTo = P.lineTo
  P.lineTo = function (...a) {
    w.__draw.seg++
    return lineTo.apply(this, a)
  }
  const bez = P.bezierCurveTo
  P.bezierCurveTo = function (...a) {
    w.__draw.curve++
    return bez.apply(this, a)
  }
  const prect = P.rect
  P.rect = function (...a) {
    if (a[2] > 1 && Math.abs(a[3]) > 1) w.__draw.rects++
    return prect.apply(this, a)
  }
  const proto = CanvasRenderingContext2D.prototype
  const fillRect = proto.fillRect
  proto.fillRect = function (...a) {
    if (a[2] > 2 && a[3] > 2) w.__draw.fills++
    return fillRect.apply(this, a)
  }
  const fillText = proto.fillText
  proto.fillText = function (...a) {
    if (typeof a[0] === 'string' && a[0].trim() !== '') w.__draw.texts.push(a[0])
    return fillText.apply(this, a)
  }
  w.__history = []
  const fetch0 = w.fetch
  w.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.includes('/rest/persistence/items/')) w.__history.push(url)
    return fetch0.call(this, input, init)
  }
})

const open = async () => {
  await page.goto(APP + `#/d/${DASH}`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
}
const waitPlot = async () => {
  await page.waitForFunction(() => !document.querySelector('.nh-chart__status'), { timeout: 30000 })
  await sleep(600)
}
const draw = () => page.evaluate(() => window.__draw)
const historyUrls = () => page.evaluate(() => window.__history)
const resetCounters = () =>
  page.evaluate(() => {
    window.__draw = { seg: 0, curve: 0, rects: 0, fills: 0, texts: [] }
    window.__history = []
  })
const canvasTexts = () => page.evaluate(() => window.__draw.texts)

try {
  ok('the target has a temperature item to read', typeof ITEM === 'string' && ITEM.length > 0, String(ITEM))

  ok('seed raw chart', await seed({}))
  await open()
  await waitPlot()
  const rawDraw = await draw()
  ok('a raw chart draws a smooth line', rawDraw.curve > 20, JSON.stringify(rawDraw))
  const rawUrls = await historyUrls()
  ok('it fetched the history', rawUrls.length >= 1, String(rawUrls.length))
  ok('with a start and an end time', /starttime=/.test(rawUrls[0] ?? '') && /endtime=/.test(rawUrls[0] ?? ''), String(rawUrls[0]).slice(-90))
  ok('and no boundary sample when not grouping', !/boundary=true/.test(rawUrls[0] ?? ''), String(rawUrls[0]).slice(-60))

  ok('seed grouped chart', await seed({ groupBy: 'day', series: [{ item: ITEM, aggregate: 'average' }] }))
  await open()
  await waitPlot()
  const dayUrls = await historyUrls()
  ok('grouping asks for the boundary sample', /boundary=true/.test(dayUrls[0] ?? ''), String(dayUrls[0]).slice(-70))
  const dayDraw = await draw()
  ok('a grouped chart still draws', dayDraw.curve + dayDraw.seg > 0, JSON.stringify(dayDraw))
  ok('grouping reduces the point count', dayDraw.curve < rawDraw.curve, `${dayDraw.curve} vs ${rawDraw.curve}`)

  ok('seed bars', await seed({ groupBy: 'day', series: [{ item: ITEM, aggregate: 'max', kind: 'bar' }] }))
  await open()
  await waitPlot()
  const barDraw = await draw()
  ok('bars are drawn as rectangles', barDraw.rects >= 3, JSON.stringify(barDraw))
  ok('and not as a curve', barDraw.curve === 0, String(barDraw.curve))
  await page.screenshot({ path: 'shot-chart-bars.png' })

  ok('seed hour-of-day', await seed({ groupBy: 'hourOfDay', series: [{ item: ITEM, aggregate: 'average' }] }))
  await open()
  await waitPlot()
  const ticks = await canvasTexts()
  ok('an hour-of-day axis is labelled with plain hours', ticks.filter((s) => /^\d{1,2}$/.test(s.trim())).length >= 6, ticks.slice(0, 14).join(','))
  ok('and not with dates or times', !ticks.some((s) => /\d{4}|:|\//.test(s)), ticks.slice(0, 14).join(','))

  ok('seed day-of-week', await seed({ groupBy: 'dayOfWeek', series: [{ item: ITEM, aggregate: 'average', kind: 'bar' }] }))
  await open()
  await waitPlot()
  const dowTicks = await canvasTexts()
  ok('a day-of-week axis is labelled with weekday names', dowTicks.some((s) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(s.trim())), dowTicks.slice(0, 12).join(','))
  await page.screenshot({ path: 'shot-chart-dow.png' })

  ok('seed heatmap', await seed({ mode: 'heatmap', period: '30d', series: [{ item: ITEM, aggregate: 'average' }] }))
  await open()
  await waitPlot()
  ok('heatmap mode renders its own canvas', (await page.locator('.nh-heatmap__canvas').count()) === 1)
  ok('and no uPlot chart', (await page.locator('.u-over').count()) === 0)
  const heatDraw = await draw()
  ok('the matrix draws many cells', heatDraw.fills >= 100, JSON.stringify({ ...heatDraw, texts: heatDraw.texts.length }))
  ok('the heatmap names the weekdays', heatDraw.texts.some((s) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(s)), heatDraw.texts.slice(0, 10).join(','))
  await page.screenshot({ path: 'shot-chart-heatmap.png' })
  ok('the canvas is labelled for screen readers', (await page.locator('.nh-heatmap__canvas').getAttribute('aria-label'))?.includes('hour') === true, String(await page.locator('.nh-heatmap__canvas').getAttribute('aria-label')))
  ok('no legend in heatmap mode', (await page.locator('.nh-chart__legend').count()) === 0)

  ok('seed for expanding', await seed({ groupBy: 'none', series: [{ item: ITEM }] }))
  await open()
  await waitPlot()
  ok('the chart offers a full-screen button', (await page.locator('.nh-chart__expand').count()) === 1)
  await resetCounters()
  await page.click('.nh-chart__expand')
  await page.waitForSelector('.nh-chartview', { timeout: 15000 })
  ok('the route names the dashboard and the widget', /#\/c\/nh-e2e-agg\/w-chart/.test(page.url()), page.url())
  await waitPlot()
  ok('the expanded view plots', (await page.locator('.u-over').count()) === 1)
  ok('it starts on the rolling range', (await page.locator('.nh-chip--on').first().textContent()) === 'Rolling', String(await page.locator('.nh-chip--on').first().textContent()))
  ok('the rolling range offers period chips', (await page.locator('.nh-chartview__nav .nh-chart__chip').count()) >= 4)

  await resetCounters()
  await page.click('.nh-chartview__units .nh-chip:has-text("Month")')
  await page.waitForSelector('.nh-chartview__label', { timeout: 10000 })
  const monthLabel = await page.textContent('.nh-chartview__label')
  ok('picking Month names the current month', /\d{4}/.test(monthLabel ?? ''), String(monthLabel))
  ok('and refetched for it', (await historyUrls()).length >= 1, String((await historyUrls()).length))
  ok('"next" is refused at the present', await page.isDisabled('[aria-label="Next"]'))

  await resetCounters()
  await page.click('[aria-label="Previous"]')
  await page.waitForFunction(
    (was) => document.querySelector('.nh-chartview__label')?.textContent !== was,
    monthLabel,
    { timeout: 10000 }
  )
  const prevLabel = await page.textContent('.nh-chartview__label')
  ok('stepping back names the previous month', prevLabel !== monthLabel, `${monthLabel} -> ${prevLabel}`)
  const prevUrls = await historyUrls()
  ok('stepping back refetches', prevUrls.length >= 1, String(prevUrls.length))
  ok('with a closed window', /starttime=.*endtime=/.test(prevUrls[0] ?? ''), String(prevUrls[0]).slice(-100))
  ok('"next" becomes available in the past', !(await page.isDisabled('[aria-label="Next"]')))
  ok('a Now button appears', (await page.locator('button:has-text("Now")').count()) === 1)
  await page.click('button:has-text("Now")')
  await page.waitForFunction(() => document.querySelector('[aria-label="Next"]')?.disabled === true, null, { timeout: 10000 })
  ok('Now returns to the present', await page.isDisabled('[aria-label="Next"]'))

  for (const unit of ['Day', 'Week', 'Year']) {
    await page.click(`.nh-chartview__units .nh-chip:has-text("${unit}")`)
    await page.waitForSelector('.nh-chartview__label', { timeout: 10000 })
    const label = await page.textContent('.nh-chartview__label')
    ok(`${unit} names its window`, (label ?? '').trim().length > 0, String(label))
  }

  await page.click('[aria-label="Back"]')
  await page.waitForSelector('.nh-widget', { timeout: 15000 })
  ok('Back returns to the dashboard', /#\/d\/nh-e2e-agg/.test(page.url()), page.url())

  await page.goto(APP + `#/c/${DASH}/w-chart`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-chartview', { timeout: 20000 })
  ok('a deep link opens the chart directly', (await page.locator('.nh-chartview__units').count()) === 1)
  await page.goto(APP + `#/c/${DASH}/w-nosuch`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-dash__empty', { timeout: 20000 })
  ok('a stale link explains itself', /no longer on this dashboard/.test((await page.textContent('.nh-dash__empty')) ?? ''), String(await page.textContent('.nh-dash__empty')))

  await open()
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 15000 })
  await page.locator('.nh-cell').first().locator('.nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side', { timeout: 10000 })
  const labelled = (text) => page.locator(`.nh-field:has(.nh-field__label:text-is("${text}")) select`).first()
  ok('the panel offers a chart type', (await labelled('Chart type').count()) === 1)
  ok('and a group-by', (await labelled('Group by').count()) === 1)
  ok('the series card offers an aggregate', (await page.locator('.nh-chartcard__cell:has-text("Aggregate") select').count()) >= 1)
  ok('and a draw-as', (await page.locator('.nh-chartcard__cell:has-text("Draw as") select').count()) >= 1)
  ok('a full-screen toggle is offered', (await page.locator('.nh-field:has-text("Full-screen button") input[type="checkbox"]').count()) === 1)

  await labelled('Chart type').selectOption('heatmap')
  await sleep(400)
  ok('a heatmap hides the group-by', (await labelled('Group by').count()) === 0)
  ok('a heatmap hides the legend toggle', (await page.locator('.nh-field:has-text("Legend") input[type="checkbox"]').count()) === 0)
  ok('a heatmap hides the thresholds editor', (await page.locator('.nh-field:has(.nh-field__label:text-is("Thresholds"))').count()) === 0)
  await labelled('Chart type').selectOption('series')
  await sleep(300)
  await labelled('Group by').selectOption('day')
  await sleep(400)
  ok('grouping hides the live-updates toggle', (await page.locator('.nh-field:has-text("Live updates") input[type="checkbox"]').count()) === 0)
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const saved = await get(UID)
  ok('the group-by persisted', saved?.config.widgets[0].config.groupBy === 'day', String(saved?.config.widgets[0].config.groupBy))

  // --- a long, busy range comes in parts ---------------------------------------------------------
  // openHAB builds a whole history answer in memory, so one request for a month of a busy item is how a
  // server runs out of heap. The history is faked here, the way the server answers it, so no server is
  // asked for anything big: a row every 20 s, which is 129,600 rows in the 30 days the chart asks for.
  {
    let STEP = 20000
    const T0 = Math.floor((Date.now() - 45 * 86400e3) / STEP) * STEP
    const lastRow = () => Math.floor((Date.now() - T0) / STEP)
    let state = (i) => (20 + (i % 50) / 10).toFixed(1)
    const parts = []
    let inFlight = 0
    let mostInFlight = 0
    let hold = null
    const fake = async (route) => {
      const q = new URL(route.request().url()).searchParams
      const begin = Date.parse(q.get('starttime'))
      const end = q.has('endtime') ? Date.parse(q.get('endtime')) : Date.now()
      const limit = Number(q.get('pagelength') ?? 0)
      const i0 = Math.max(0, Math.ceil((begin - T0) / STEP))
      const i1 = Math.min(lastRow(), Math.floor((end - T0) / STEP))
      const inWindow = Math.max(0, i1 - i0 + 1)
      const take = limit > 0 ? Math.min(inWindow, limit) : inWindow
      const data = []
      if (q.get('boundary') === 'true' && i0 > 0) data.push({ time: begin, state: state(i0 - 1) })
      for (let i = i0; i < i0 + take; i++) data.push({ time: T0 + i * STEP, state: state(i) })
      if (q.get('boundary') === 'true' && i1 < lastRow()) data.push({ time: end, state: state(i1 + 1) })
      inFlight++
      mostInFlight = Math.max(mostInFlight, inFlight)
      parts.push({ begin, end, limit: q.get('pagelength'), boundary: q.get('boundary'), served: take, inWindow, last: take > 0 ? T0 + (i0 + take - 1) * STEP : null })
      if (hold) await hold
      inFlight--
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: ITEM, datapoints: String(data.length), data }) }).catch(() => {})
    }
    const pattern = '**/rest/persistence/items/' + encodeURIComponent(ITEM) + '?**'
    await page.route(pattern, fake)

    ok('seed a busy month', await seed({ period: '30d', groupBy: 'day', series: [{ item: ITEM, aggregate: 'count', kind: 'bar' }] }))
    await open()
    await waitPlot()
    await resetCounters()
    const whole = parts[0] ? Math.floor((parts[0].end - T0) / STEP) - Math.ceil((parts[0].begin - T0) / STEP) + 1 : -1
    const served = parts.reduce((n, p) => n + p.served, 0)
    ok('a busy month comes in parts', parts.length >= 6, `${parts.length} requests`)
    ok(
      'each part asks for one page of rows and gets no more',
      parts.length > 0 && parts.every((p) => p.limit === '20000') && Math.max(...parts.map((p) => p.served)) <= 20000,
      `limits ${[...new Set(parts.map((p) => p.limit))].join(',')}, biggest answer ${Math.max(0, ...parts.map((p) => p.served))} rows`
    )
    ok('one part at a time', mostInFlight === 1, `most at once ${mostInFlight}`)
    ok('the parts cover the range once, with no gap', whole > 100000 && served === whole, `${served} rows served of ${whole} in the window`)
    ok(
      'each part starts after the last row of the one before',
      parts.slice(1).every((p, i) => parts[i].last === null || p.begin > parts[i].last),
      parts.slice(0, 3).map((p) => new Date(p.begin).toISOString().slice(5, 16)).join(' ')
    )
    ok(
      'once it knows how busy the item is, a part asks for a window of about two pages',
      parts.length > 2 && Math.max(...parts.slice(1).map((p) => p.inWindow)) <= 50000,
      `windows held ${parts.slice(0, 4).map((p) => p.inWindow).join(', ')} rows`
    )
    ok('only the first part asks for the rows around the window', parts[0]?.boundary === 'true' && parts.slice(1).every((p) => p.boundary === null), parts.map((p) => p.boundary ?? '-').slice(0, 4).join(' '))
    ok('and the chart draws its bars', (await page.locator('.u-over').count()) === 1 && (await page.locator('.nh-chart__status').count()) === 0)

    // the bars are counts of the rows in each day, so one of them says whether every row was counted once
    const plot = await page.locator('.u-over').boundingBox()
    await page.mouse.move(plot.x + plot.width * 0.5, plot.y + plot.height * 0.5)
    await page.waitForSelector('.nh-chart__tt--show', { timeout: 5000 }).catch(() => {})
    const dayCount = Number(((await page.locator('.nh-chart__tt--show .nh-chart__tt-val').first().textContent().catch(() => '')) ?? '').replace(/[^\d]/g, ''))
    const dayName = await page.locator('.nh-chart__tt--show .nh-chart__tt-time').textContent().catch(() => '')
    // 86,400 s of a row every 20 s; a day the clocks change on is an hour longer or shorter
    ok('a day in the middle counts every one of its rows once', [4320, 4140, 4500].includes(dayCount), `${dayCount} rows on ${dayName}`)
    await page.mouse.move(5, 5)

    // --- and the page keeps none of it ---------------------------------------------------------------
    // 1.3 million rows for a line of 250 points: a row every 2 s, rising steadily so any point of the line
    // can be checked against the rows it stands for
    {
      const RAMP_MS = 45 * 86400e3
      STEP = 2000
      state = (i) => (10 + (20 * i * STEP) / RAMP_MS).toFixed(3)
      parts.length = 0
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('HeapProfiler.enable')
      let peak = 0
      let sampling = true
      const sampler = (async () => {
        while (sampling) {
          const used = await cdp.send('Runtime.getHeapUsage').then((u) => u.usedSize, () => 0)
          if (used > peak) peak = used
          await sleep(80)
        }
      })()
      ok('seed a line over a very busy month', await seed({ period: '30d', series: [{ item: ITEM }] }))
      await open()
      await page.waitForFunction(() => !document.querySelector('.nh-chart__status'), { timeout: 120000 }).catch(() => {})
      sampling = false
      await sampler
      await cdp.send('HeapProfiler.collectGarbage')
      const settled = (await cdp.send('Runtime.getHeapUsage')).usedSize
      const rows = parts.reduce((n, part) => n + part.served, 0)
      const mb = (bytes) => Math.round(bytes / 1048576)
      ok('1.3 million rows arrive', rows > 1250000 && parts.length > 60, `${rows} rows in ${parts.length} requests`)
      ok('and the line draws', (await page.locator('.u-over').count()) === 1 && (await page.locator('.nh-chart__status').count()) === 0)
      // held all at once, the rows alone were over 100 MB
      ok('the page never holds the rows: memory stays within 60 MB of where it ends', peak > 0 && peak - settled < 60 * 1048576, `peak ${mb(peak)} MB, ${mb(settled)} MB once drawn`)
      const linePlot = await page.locator('.u-over').boundingBox()
      await page.mouse.move(linePlot.x + linePlot.width * 0.5, linePlot.y + linePlot.height * 0.5)
      await page.waitForSelector('.nh-chart__tt--show', { timeout: 5000 }).catch(() => {})
      const mid = parseFloat(((await page.locator('.nh-chart__tt--show .nh-chart__tt-val').first().textContent().catch(() => '')) ?? '').replace(',', '.'))
      // half way through the 30 days the rows stand at two thirds of the 45-day rise: 10 + 20 x 30/45
      ok('the middle of the line reads what the rows there read', Math.abs(mid - 23.33) < 0.3, `${mid} against 23.33`)
      await page.mouse.move(5, 5)
      await cdp.detach().catch(() => {})
      STEP = 20000
      state = (i) => (20 + (i % 50) / 10).toFixed(1)
    }

    // a refresh that comes round while the last load is still arriving waits for the next one
    parts.length = 0
    let release
    hold = new Promise((r) => (release = r))
    ok('seed a chart that refreshes every 10 s', await seed({ period: '30d', refresh: 10, groupBy: 'day', series: [{ item: ITEM, aggregate: 'count', kind: 'bar' }] }))
    await open()
    await page.waitForTimeout(12500)
    ok('a refresh does not start a second load on top of one still running', parts.length === 1, `${parts.length} requests in 12.5 s with the first unanswered`)
    hold = null
    release()
    await waitPlot()
    ok('the held load finishes once it is answered', (await page.locator('.u-over').count()) === 1, `${parts.length} requests in all`)
    await page.unroute(pattern)
  }

  const realErrs = errs.filter((e) => !/ResizeObserver loop/.test(e))
  ok('console clean', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
  if (PRODUCTION) {
    // after the console check on purpose: the refusal logs an error, which is the point of it
    const outcome = await page.evaluate(async () => {
      try {
        await fetch('/rest/persistence/items/nh_e2e_nosuch_item?starttime=' + new Date(Date.now() - 3600e3).toISOString())
        return 'sent'
      } catch (e) {
        return String(e?.message ?? e)
      }
    })
    ok('on a production server the harness refuses a history request with no row limit', /refused/.test(outcome), outcome)
  }
} catch (err) {
  ok('suite ran to completion', false, String(err).slice(0, 250))
} finally {
  await del(UID)
  const uids = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  ok('cleanup: no leftovers', !uids.includes(UID), uids.filter((u) => u.includes('nh-e2e')).join(','))
  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
