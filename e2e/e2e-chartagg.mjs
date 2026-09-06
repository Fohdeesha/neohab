// Chart aggregation / heatmap / full-screen view e2e.
// SAFE with a live config: creates only dashboard:nh-e2e-agg, deletes exactly that, and commands NOTHING, it
// only reads the history of the configured temperature item.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
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

  const realErrs = errs.filter((e) => !/ResizeObserver loop/.test(e))
  ok('console clean', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
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
