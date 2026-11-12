// LED gauge e2e: the dial widget's ring styles, their color stops and the alarm.
// SAFE with a live config: creates only dashboard:nh-e2e-gauge and dashboard:nh-e2e-gaugestops and deletes
// exactly those. Off production it also creates and deletes the managed item nh_e2e_gauge_null.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { pickItem } from './lib/ui.mjs'
import { skipOnProduction } from './lib/guard.mjs'

const UID = 'dashboard:nh-e2e-gauge'
const UID_STOPS = 'dashboard:nh-e2e-gaugestops'
const NULL_ITEM = 'nh_e2e_gauge_null'
const RED = '#f44336'
const GREEN = '#4caf50'
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

const litCount = (frac, n) => (frac > 0 ? Math.min(n, Math.floor(frac * n + 1e-9) + 1) : 0)

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try { localStorage.setItem('neohab:apiToken', t) } catch {}
}, TOKEN)

const initialDimmer = await itemState(ITEMS.dimmer)
let madeNull = false

try {
  await sendItem(ITEMS.dimmer, 60)
  await sleep(800)

  const SEV = [
    { value: 10, color: '#2196f3' },
    { value: 30, color: '#ff9800' },
    { value: 70, color: '#f44336' },
  ]
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-gauge',
        name: 'E2E Gauge',
        columns: 12,
        rowHeight: 'match',
        gap: 6,
        widgets: [
          {
            id: 'w-led',
            type: 'dial',
            config: {
              item: ITEMS.dimmer, label: 'LED', style: 'led', unit: '%', ledCount: 60,
              color: '#123456',
              severity: SEV, showTicks: true, tickSteps: 5, bloom: true,
              markers: [{ value: 80, label: 'ref', color: '#ffffff' }, { item: ITEMS.dimmer, color: '#00ff00' }],
              zones: [{ from: 70, to: 100, color: '#f44336' }],
            },
            layout: { lg: { x: 0, y: 0, w: 3, h: 3 } },
          },
          {
            id: 'w-color',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Plain color', style: 'led', readOnly: true, color: '#00ff88' },
            layout: { lg: { x: 0, y: 6, w: 3, h: 3 } },
          },
          {
            id: 'w-dual',
            type: 'dial',
            config: {
              item: ITEMS.dimmer, label: 'Dual', style: 'led', unit: '%',
              item2: ITEMS.temperature, min2: 0, max2: 100, step2: 1, unit2: '°', color2: '#ff00ff',
            },
            layout: { lg: { x: 3, y: 6, w: 3, h: 3 } },
          },
          {
            id: 'w-half',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Half', style: 'led', readOnly: true, ledCount: 40, arcSweep: 180, arcStart: 270, hideUnlit: true, bloom: false },
            layout: { lg: { x: 3, y: 0, w: 3, h: 3 } },
          },
          {
            id: 'w-alarm',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Alarm on', style: 'led', readOnly: true, alarm: true, alarmFrom: 0, alarmTo: 100 },
            layout: { lg: { x: 6, y: 0, w: 3, h: 3 } },
          },
          {
            id: 'w-calm',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Alarm off', style: 'led', readOnly: true, bloom: true, alarm: true, alarmFrom: 98, alarmTo: 100 },
            layout: { lg: { x: 9, y: 0, w: 3, h: 3 } },
          },
          {
            id: 'w-bidi',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Bidi', style: 'led', readOnly: true, min: -100, max: 100, bidirectional: true, ledCount: 40 },
            layout: { lg: { x: 0, y: 3, w: 3, h: 3 } },
          },
          {
            id: 'w-classic',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Classic', unit: '%' },
            layout: { lg: { x: 3, y: 3, w: 3, h: 3 } },
          },
          {
            id: 'w-ro',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'RO', style: 'led', readOnly: true },
            layout: { lg: { x: 6, y: 3, w: 3, h: 3 } },
          },
          {
            id: 'w-hostile',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Hostile', style: 'led', readOnly: true, markers: {}, zones: 'nope', severity: 42, ledCount: 0, arcSweep: 9999, arcStart: -720, item2: {}, color: 17 },
            layout: { lg: { x: 9, y: 3, w: 3, h: 3 } },
          },
          {
            id: 'w-arc',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Arc', style: 'arc', readOnly: true, unit: '%', color: '#2196f3', showTicks: true, arcSweep: 270, arcStart: 225, zones: [{ from: 80, to: 100, color: '#f44336' }] },
            layout: { lg: { x: 0, y: 9, w: 3, h: 3 } },
          },
          {
            id: 'w-blocks',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Blocks', style: 'blocks', readOnly: true, color: '#ffb300' },
            layout: { lg: { x: 3, y: 9, w: 3, h: 3 } },
          },
          {
            id: 'w-3d',
            type: 'dial',
            config: { item: ITEMS.dimmer, label: 'Clay', style: '3d', readOnly: true, color: '#00d0c0' },
            layout: { lg: { x: 6, y: 9, w: 3, h: 3 } },
          },
          {
            id: 'w-hist',
            type: 'dial',
            config: { item: ITEMS.temperature, label: 'Hist', style: 'led', readOnly: true, unit: '°F', min: -40, max: 150, history: true, historyPeriod: '24h' },
            layout: { lg: { x: 9, y: 9, w: 3, h: 3 } },
          },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))

  // an item with no reading, which only a server that is ours to change can be given
  if (!skipOnProduction(ok, 'the no-reading alarm check needs a managed item')) {
    await fetch(itemUrl(NULL_ITEM), {
      method: 'PUT',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Number', name: NULL_ITEM, label: 'NH E2E Gauge Unknown' }),
    })
    madeNull = true
    await fetch(itemUrl(NULL_ITEM) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: 'NULL' })
  }

  // every check on this one is taken with the dimmer at 90
  const ring = (id, label, x, y, config) => ({
    id,
    type: 'dial',
    config: { item: ITEMS.dimmer, label, readOnly: true, unit: '%', ...config },
    layout: { lg: { x, y, w: 3, h: 3 } },
  })
  await fetch(NS + '/' + encodeURIComponent(UID_STOPS), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seedStops = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID_STOPS,
      component: 'neohab:dashboard',
      config: {
        version: 3,
        id: 'nh-e2e-gaugestops',
        name: 'E2E Gauge Stops',
        columns: 12,
        rowHeight: 'match',
        gap: 6,
        widgets: [
          ring('g-top', 'Top stop', 0, 0, { style: 'arc', color: '#123456', severity: [{ value: 80, color: RED }, { value: 50, color: GREEN }] }),
          ring('g-mid', 'Middle stop', 3, 0, { style: 'arc', color: '#123456', severity: [{ value: 95, color: RED }, { value: 50, color: GREEN }] }),
          ring('g-below', 'Below', 6, 0, { style: 'arc', color: '#00ff88', severity: [{ value: 95, color: RED }] }),
          ring('g-theme', 'Theme', 9, 0, { style: 'arc', severity: [{ value: 95, color: RED }] }),
          ring('g-clay', 'Clay alarm', 0, 3, { style: '3d', alarm: true, alarmFrom: 0, alarmTo: 100 }),
          ring('g-zero', 'Zero alarm', 3, 3, { style: 'led', min: 90, max: 100, alarm: true, alarmFrom: 90, alarmTo: 100 }),
          ring('g-out', 'Out of range', 6, 3, { style: 'led', alarm: true, alarmFrom: 98, alarmTo: 100 }),
          ...(madeNull ? [ring('g-null', 'No reading', 9, 3, { item: NULL_ITEM, style: 'led', alarm: true, alarmFrom: 0, alarmTo: 100 })] : []),
        ],
      },
    }),
  })
  ok('stops dashboard created', seedStops.ok, String(seedStops.status))

  const posts = []
  await page.route('**/rest/items/**', (route) => {
    if (route.request().method() === 'POST') {
      posts.push({ url: route.request().url(), body: route.request().postData() })
      return route.fulfill({ status: 200, body: '' })
    }
    return route.fallback()
  })

  await page.goto(APP + '#/d/nh-e2e-gauge', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-dial--led', { timeout: 20000 })
  await sleep(1500) // tween + SSE settle

  const cell = (label) => page.locator(`.nh-gcell:has(.nh-widget__labeltext:text-is("${label}"))`)

  const gauges = await page.locator('.nh-dial--ring').count()
  ok('thirteen ring gauges render', gauges === 13, String(gauges))
  ok('LED-kind gauges carry the led class', (await page.locator('.nh-dial--led').count()) === 10)

  ok('hostile config still shows its value', (await cell('Hostile').locator('.nh-gauge__value').textContent()) === '60')
  const hostileBeads = await cell('Hostile').locator('.nh-gauge__led, .nh-gauge__ledlit').count()
  ok('hostile ledCount 0 clamps to 8 beads', hostileBeads === 8, String(hostileBeads))
  ok('hostile item2 draws no inner ring', (await cell('Hostile').locator('.nh-gauge__led--inner, .nh-gauge__ledlit--inner').count()) === 0)

  const plainStop = await cell('Plain color').locator('radialGradient[id^="nh-g-led-"] stop').last().evaluate((el) => el.style.stopColor)
  ok('plain Color drives the beads without stops', /0,\s*255,\s*136|#00ff88/i.test(plainStop), plainStop)

  const dualInnerLit = await cell('Dual').locator('.nh-gauge__ledlit--inner').count()
  ok('dual gauge lights an inner ring', dualInnerLit > 0, String(dualInnerLit))
  const radii = await cell('Dual').evaluate((el) => {
    const svg = el.querySelector('svg.nh-dial--led')
    const at = (sel) => {
      const c = svg.querySelector(sel)
      return c ? Math.hypot(Number(c.getAttribute('cx')) - 50, Number(c.getAttribute('cy')) - 50) : null
    }
    return { outer: at('.nh-gauge__ledlit:not(.nh-gauge__ledlit--inner)'), inner: at('.nh-gauge__ledlit--inner') }
  })
  ok('inner ring sits inside the outer', radii.outer !== null && radii.inner !== null && radii.inner < radii.outer - 5, JSON.stringify(radii))
  const innerStop = await cell('Dual').evaluate(
    (el) => [...el.querySelectorAll('radialGradient[id^="nh-g-led2-"] stop')].pop()?.style.stopColor ?? 'absent'
  )
  ok('inner ring carries its own color', /255,\s*0,\s*255|#ff00ff/i.test(innerStop), innerStop)
  ok('center shows the outer value big', (await cell('Dual').locator('.nh-gauge__value').textContent())?.startsWith('60'))
  const second = await cell('Dual').evaluate((el) => el.querySelector('.nh-gauge__second')?.textContent ?? 'absent')
  ok('center shows the inner reading beneath', /^\d+ °$/.test(second), String(second))

  ok('arc: solid value band with the configured color', (await cell('Arc').evaluate((el) => el.querySelector('.nh-gauge__band')?.getAttribute('stroke') ?? 'absent')) === '#2196f3')
  ok('arc: dim full-length track', (await cell('Arc').locator('.nh-gauge__btrack').count()) === 1)
  ok('arc: sector face drawn', (await cell('Arc').locator('.nh-gauge__face').count()) === 1)
  ok('arc: no beads', (await cell('Arc').locator('.nh-gauge__led, .nh-gauge__ledlit').count()) === 0)
  ok('arc: zone band drawn', (await cell('Arc').locator('.nh-gauge__zone').count()) === 1)
  ok('arc: tick labels present', (await cell('Arc').locator('.nh-gauge__ticklabel').count()) > 0)

  const blkLit = await cell('Blocks').locator('.nh-gauge__blklit').count()
  const blkUnlit = await cell('Blocks').locator('.nh-gauge__blk').count()
  ok('blocks: 20 segments by default', blkLit + blkUnlit === 20, `${blkLit}+${blkUnlit}`)
  ok('blocks: midpoint rule lights 12 at 60%', blkLit === 12, String(blkLit))
  ok('blocks: lit stroke is the configured color', (await cell('Blocks').evaluate((el) => el.querySelector('.nh-gauge__blklit')?.getAttribute('stroke') ?? 'absent')) === '#ffb300')

  ok('3d: clay block bodies', (await cell('Clay').locator('.nh-gauge__claybody').count()) === 20)
  ok('3d: offset shadows under the blocks', (await cell('Clay').locator('.nh-gauge__clayshadow').count()) > 20)
  ok('3d: solid value arc present', (await cell('Clay').locator('.nh-gauge__band').count()) === 1)
  ok('3d: raised center disc sheen', (await cell('Clay').locator('.nh-gauge__clayhi2').count()) === 1)
  ok('3d: decorative dot ring', (await cell('Clay').locator('.nh-gauge__led').count()) >= 14)

  await page.waitForSelector('.nh-gcell:has(.nh-widget__labeltext:text-is("Hist")) .nh-gauge__bar', { timeout: 15000 }).catch(() => {})
  const histBars = await cell('Hist').locator('.nh-gauge__bar').count()
  ok('history bars render from persistence', histBars > 3 && histBars <= 24, String(histBars))
  ok('history mode puts the unit beside the value', (await cell('Hist').locator('.nh-gauge__value tspan').count()) === 1)

  posts.length = 0
  await cell('Dual').locator('svg.nh-dial--led').scrollIntoViewIfNeeded()
  const dbox = await cell('Dual').locator('svg.nh-dial--led').boundingBox()
  const dsize = Math.min(dbox.width, dbox.height)
  await page.mouse.click(dbox.x + dbox.width / 2 + dsize * 0.44, dbox.y + dbox.height / 2)
  await sleep(300)
  ok('rim tap goes to the outer item', posts.length === 1 && posts[0].url.endsWith('/' + ITEMS.dimmer), JSON.stringify(posts))
  posts.length = 0
  await page.mouse.click(dbox.x + dbox.width / 2 + dsize * 0.32, dbox.y + dbox.height / 2)
  await sleep(300)
  ok('inner tap goes to the second item', posts.length === 1 && posts[0].url.endsWith('/' + ITEMS.temperature), JSON.stringify(posts))
  ok('inner tap maps the inner scale (25)', posts.length === 1 && posts[0].body === '25', posts[0]?.body)

  const lit = await cell('LED').locator('.nh-gauge__ledlit').count()
  const wantLit = litCount(0.6, 60)
  ok('lit bead count follows the value', Math.abs(lit - wantLit) <= 1, `lit=${lit} want~${wantLit}`)
  const unlit = await cell('LED').locator('.nh-gauge__led').count()
  ok('unlit beads fill the rest of the ring', lit + unlit === 60, `unlit=${unlit}`)

  const stopColor = await cell('LED').locator('radialGradient[id^="nh-g-led-"] stop').last().evaluate((el) => el.style.stopColor)
  ok('bead gradient carries the severity color', /255,\s*152,\s*0|#ff9800/i.test(stopColor), stopColor)

  const litFill = await cell('LED').locator('.nh-gauge__ledlit').first().evaluate((el) => getComputedStyle(el).fill)
  ok('lit bead fill is the gradient url', litFill.includes('url('), litFill)
  await page.addStyleTag({ content: '.nh-gauge__ledlit { fill: var(--nh-text); }' })
  const brokenFill = await cell('LED').locator('.nh-gauge__ledlit').first().evaluate((el) => getComputedStyle(el).fill)
  ok('(control) a stylesheet fill would defeat the gradient - check has power', !brokenFill.includes('url('), brokenFill)
  await page.evaluate(() => document.querySelector('style:last-of-type')?.remove())

  ok('bloom is drawn', (await cell('LED').locator('.nh-gauge__bloom').count()) === 1)
  const value = await cell('LED').locator('.nh-gauge__value').textContent()
  ok('center value reads 60', value === '60', value)
  ok('unit under the value', (await cell('LED').locator('.nh-gauge__unit').textContent()) === '%')

  const labels = await cell('LED').locator('.nh-gauge__ticklabel').allTextContents()
  ok('tick labels majors only, zeros stripped', JSON.stringify(labels) === JSON.stringify(['0', '20', '40', '60', '80']), JSON.stringify(labels))
  const tickClear = await cell('LED').locator('.nh-gauge__ticklabel').evaluateAll((els) => {
    const svg = els[0].closest('svg')
    const vb = svg.viewBox.baseVal
    return els.every((el) => {
      const b = el.getBBox()
      return b.x >= vb.x && b.x + b.width <= vb.x + vb.width
    })
  })
  ok('every tick label inside the viewBox (no clipping)', tickClear)

  const markers = await cell('LED').locator('.nh-gauge__marker').count()
  ok('two markers drawn (fixed + item-bound)', markers === 2, String(markers))
  ok('marker label rendered', (await cell('LED').locator('.nh-gauge__markerlabel').textContent()) === 'ref')
  ok('zone arc drawn with its color', (await cell('LED').locator('.nh-gauge__zone').getAttribute('stroke')) === '#f44336')

  ok('alarm gauge pulses', (await cell('Alarm on').locator('.nh-gauge__bloom--pulse').count()) === 1)
  ok('out-of-range alarm does not pulse', (await cell('Alarm off').locator('.nh-gauge__bloom--pulse').count()) === 0)
  ok('out-of-range alarm still blooms', (await cell('Alarm off').locator('.nh-gauge__bloom').count()) === 1)
  ok('alarm puts the flashing frame on the tile', (await cell('Alarm on').locator('.nh-widget--alarm > .nh-widget__alarm').count()) === 1)
  ok('out-of-range alarm has no frame', (await cell('Alarm off').locator('.nh-widget__alarm').count()) === 0)
  const framed = await page.locator('.nh-widget__alarm').count()
  ok('no other tile on the page is framed', framed === 1, String(framed))

  ok('hidden-unlit shows only lit beads', (await cell('Half').locator('.nh-gauge__led').count()) === 0)
  const halfLit = await cell('Half').locator('.nh-gauge__ledlit').count()
  ok('half gauge lit count', Math.abs(halfLit - Math.floor(0.6 * 39 + 1 + 1e-9)) <= 1, String(halfLit))
  ok('bloom off leaves no bloom', (await cell('Half').locator('.nh-gauge__bloom').count()) === 0)

  const bidiLit = await cell('Bidi').locator('.nh-gauge__ledlit').count()
  ok('bidirectional lights the zero..value span, not min..value', bidiLit >= 11 && bidiLit <= 15, String(bidiLit))

  for (const sel of ['.nh-dial__track', '.nh-dial__fill', '.nh-dial__knob', '.nh-dial__value']) {
    ok(`classic keeps ${sel}`, (await cell('Classic').locator(sel).count()) === 1)
  }
  ok('classic value text', (await cell('Classic').locator('.nh-dial__value').textContent()) === '60%')

  const markerPos = async () => {
    const m = cell('LED').locator('.nh-gauge__marker').nth(1)
    return { x: Number(await m.getAttribute('x1')), y: Number(await m.getAttribute('y1')) }
  }
  const posBefore = await markerPos()
  await sendItem(ITEMS.dimmer, 90) // real command via REST (recorded item), page routes only block the PAGE's posts
  await sleep(2500) // SSE + tween
  const lit90 = await cell('LED').locator('.nh-gauge__ledlit').count()
  ok('live update relights the ring', Math.abs(lit90 - litCount(0.9, 60)) <= 1, `lit=${lit90}`)
  const stop90 = await cell('LED').locator('radialGradient[id^="nh-g-led-"] stop').last().evaluate((el) => el.style.stopColor)
  ok('severity color moves to the red band', /244,\s*67,\s*54|#f44336/i.test(stop90), stop90)
  ok('center value follows', (await cell('LED').locator('.nh-gauge__value').textContent()) === '90')
  const posAfter = await markerPos()
  const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y)
  ok('item-bound marker moved with the item', moved > 5, `moved ${moved.toFixed(1)} units`)

  posts.length = 0
  const box = await cell('LED').locator('svg.nh-dial--led').boundingBox()
  await page.mouse.click(box.x + box.width / 2 + Math.min(box.width, box.height) * 0.44, box.y + box.height / 2)
  await sleep(400)
  ok('tap sends one command', posts.length === 1, JSON.stringify(posts))
  ok('tap maps the angle to the value (25)', posts.length === 1 && posts[0].body === '25', posts[0]?.body)

  posts.length = 0
  const rbox = await cell('RO').locator('svg.nh-dial--led').boundingBox()
  await page.mouse.click(rbox.x + rbox.width / 2 + Math.min(rbox.width, rbox.height) * 0.44, rbox.y + rbox.height / 2)
  await sleep(400)
  ok('read-only tap sends nothing', posts.length === 0, JSON.stringify(posts))

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("LED")) .nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side .nh-stopstrip', { timeout: 8000 }).catch(() => {})
  const stripOf = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.nh-sheet--side .nh-stopstrip__seg')].map((seg) => ({
        label: seg.querySelector('.nh-stopstrip__label')?.textContent,
        color: getComputedStyle(seg.querySelector('.nh-stopstrip__bar')).backgroundColor,
        theme: seg.querySelector('.nh-stopstrip__bar').classList.contains('nh-stopstrip__bar--theme'),
      }))
    )
  const bands = (strip) => JSON.stringify(strip.map((b) => b.label + ' ' + b.color))
  const fromInputs = page.locator('.nh-sheet--side .nh-chartcard__cell:has(span:text-is("From value")) input')
  const oldStops = await fromInputs.evaluateAll((els) => els.map((el) => el.value))
  ok('a version 1 dashboard opens with its stops as stored', JSON.stringify(oldStops) === '["10","30","70"]', JSON.stringify(oldStops))
  const oldStrip = await stripOf()
  ok(
    'and each one starts at its value: base below 10, blue from 10, orange from 30, red from 70',
    bands(oldStrip) === JSON.stringify(['< 10 rgb(18, 52, 86)', '≥ 10 rgb(33, 150, 243)', '≥ 30 rgb(255, 152, 0)', '≥ 70 rgb(244, 67, 54)']),
    bands(oldStrip)
  )

  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Classic")) .nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side')
  await sleep(300)
  const styleSel = page.locator('.nh-sheet--side .nh-field:has(.nh-field__label:text-is("Style")) select')
  ok('style select shows classic by default', (await styleSel.inputValue()) === 'classic')
  ok('no LED fields while classic', (await page.locator('.nh-sheet--side label:has-text("Segments")').count()) === 0)
  await styleSel.selectOption('led')
  await sleep(400)
  ok('switching to LED restyles the widget live', (await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Classic")) .nh-dial--led').count()) === 1)
  ok('LED fields appear', (await page.locator('.nh-sheet--side label:has-text("Segments")').count()) === 1)
  ok('style select offers every look', (await styleSel.locator('option').count()) === 6)
  ok('alarm range hidden until alarm is on', (await page.locator('.nh-sheet--side label:has-text("Alarm from")').count()) === 0)
  ok('second-item field offered', (await page.locator('.nh-sheet--side').getByText('Second item (inner ring)').count()) === 1)
  ok('inner fields hidden without a second item', (await page.locator('.nh-sheet--side label:has-text("Inner minimum")').count()) === 0)

  const itemField = page.locator('.nh-sheet--side .nh-field:has-text("Second item")').locator('.nh-picker')
  const secondItem = await pickItem(page, itemField.locator('input'), ITEMS.dimmer)
  await sleep(400)
  ok('picking the second item from the list binds it', secondItem === ITEMS.dimmer, 'value=' + secondItem)
  ok('a picked second item shows the inner fields', (await page.locator('.nh-sheet--side label:has-text("Inner minimum")').count()) === 1)
  ok('picker shows a clear button once set', (await itemField.locator('.nh-picker__clear').count()) === 1)
  await itemField.locator('.nh-picker__clear').click()
  await sleep(400)
  ok('the ✕ empties the field', (await itemField.locator('input').inputValue()) === '')
  ok('clearing the second item hides the inner fields', (await page.locator('.nh-sheet--side label:has-text("Inner minimum")').count()) === 0)
  ok('clear button gone once empty', (await itemField.locator('.nh-picker__clear').count()) === 0)
  await page.locator('.nh-sheet--side button:has-text("Add color stop")').click()
  await sleep(200)
  ok('severity row editor adds a card', (await page.locator('.nh-sheet--side .nh-chartcard:has-text("Stop 1")').count()) === 1)
  await page.click('button:has-text("Exit")')
  await sleep(500)
  const stored = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  const storedClassic = stored?.config?.widgets?.find((w) => w.id === 'w-classic')
  ok('exit discarded the style experiment', storedClassic && storedClassic.config.style === undefined, JSON.stringify(storedClassic?.config?.style))
  const storedLed = stored?.config?.widgets?.find((w) => w.id === 'w-led')
  ok(
    'reading an old dashboard does not rewrite it on the server',
    stored?.config?.version === 1 && storedLed?.config?.severity?.length === 3,
    `version ${stored?.config?.version}, ${storedLed?.config?.severity?.length} stops`
  )

  // ---- stops and the alarm, dimmer still at 90 ----
  // a build without the stops strip has nothing to find below, so nothing may wait long
  page.setDefaultTimeout(5000)
  await page.goto(APP + '#/d/nh-e2e-gaugestops', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-gcell:has(.nh-widget__labeltext:text-is("Top stop")) .nh-gauge__band', { timeout: 15000 }).catch(() => {})
  await sleep(1500)
  const now = Number.parseFloat(await itemState(ITEMS.dimmer))
  const band = (label) =>
    cell(label)
      .evaluate((el) => el.querySelector('.nh-gauge__band')?.getAttribute('stroke') ?? 'absent')
      .catch(() => 'no tile')
  const count = (label, sel) => cell(label).locator(sel).count()

  const top = await band('Top stop')
  ok('a reading above every stop takes the highest one', now === 90 && top === RED, `dimmer ${now}, stops 50 and 80: ${top}`)
  const mid = await band('Middle stop')
  ok('a reading between two stops takes the one below it', mid === GREEN, `stops 50 and 95: ${mid}`)
  const below = await band('Below')
  ok('a reading below the lowest stop takes the base color', below === '#00ff88', `stop 95: ${below}`)
  const themed = await band('Theme')
  ok('and follows the theme when there is no base color', themed === 'var(--nh-primary)', `stop 95, no color: ${themed}`)

  ok('the 3D dial gets the alarm frame', (await count('Clay alarm', '.nh-widget--alarm > .nh-widget__alarm')) === 1)
  const zero = {
    frame: await count('Zero alarm', '.nh-widget__alarm'),
    pulse: await count('Zero alarm', '.nh-gauge__bloom--pulse'),
    lit: await count('Zero alarm', '.nh-gauge__ledlit'),
  }
  ok('a reading at the bottom of its scale still alarms', zero.frame === 1 && zero.pulse === 1, JSON.stringify(zero))
  const out = { tile: await count('Out of range', '.nh-dial--ring'), frame: await count('Out of range', '.nh-widget__alarm') }
  ok('a reading outside the alarm range has no frame', out.tile === 1 && out.frame === 0, JSON.stringify(out))
  if (madeNull) {
    const none = {
      tile: await count('No reading', '.nh-dial--ring'),
      frame: await count('No reading', '.nh-widget__alarm'),
      state: await itemState(NULL_ITEM),
    }
    ok('an item with no reading does not alarm', none.tile === 1 && none.frame === 0 && none.state === 'NULL', JSON.stringify(none))
  }
  const said = await cell('Clay alarm').locator('.nh-widget__alarm').getAttribute('aria-label').catch(() => null)
  ok('the frame says what it is to a screen reader', typeof said === 'string' && said.length > 0, String(said))

  // the frame has to cover its own tile and nothing else. a cell is a size container, which does not
  // contain an absolute child, so the control takes the tile's position away and expects it to escape
  const frameBox = () =>
    cell('Clay alarm')
      .evaluate((el) => {
        const tile = el.querySelector('.nh-widget').getBoundingClientRect()
        const frame = el.querySelector('.nh-widget__alarm').getBoundingClientRect()
        const off = Math.max(
          Math.abs(frame.left - tile.left),
          Math.abs(frame.top - tile.top),
          Math.abs(frame.right - tile.right),
          Math.abs(frame.bottom - tile.bottom)
        )
        return { off, frame: Math.round(frame.width) + 'x' + Math.round(frame.height), tile: Math.round(tile.width) + 'x' + Math.round(tile.height) }
      })
      .catch(() => null)
  const snug = await frameBox()
  ok('the frame sits on its own tile, edge to edge', snug !== null && snug.off <= 1.5 && Number.parseInt(snug.tile) > 100, JSON.stringify(snug))
  const unpin = await page.addStyleTag({ content: '.nh-widget.nh-widget--alarm { position: static !important; }' })
  const loose = await frameBox()
  ok('(control) without a positioned tile the frame leaves it - check has power', loose !== null && loose.off > 20, JSON.stringify(loose))
  await unpin.evaluate((el) => el.remove())

  const under = () =>
    cell('Clay alarm')
      .evaluate((el) => {
        const r = el.querySelector('.nh-widget').getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return { frame: !!hit?.closest('.nh-widget__alarm'), inTile: el.contains(hit), tag: hit?.tagName }
      })
      .catch(() => null)
  const press = await under()
  ok('a press goes through the frame to the dial', press !== null && !press.frame && press.inTile, JSON.stringify(press))
  const solid = await page.addStyleTag({ content: '.nh-widget__alarm { pointer-events: auto !important; }' })
  const blocked = await under()
  ok('(control) a frame that took the pointer would be on top - check has power', blocked?.frame === true, JSON.stringify(blocked))
  await solid.evaluate((el) => el.remove())

  const motion = () =>
    page.evaluate(() => {
      const read = (el) => {
        if (!el) return null
        const cs = getComputedStyle(el)
        return {
          name: cs.animationName,
          time: cs.animationDuration,
          count: cs.animationIterationCount,
          running: el.getAnimations().filter((a) => a.playState === 'running').length,
        }
      }
      return { frame: read(document.querySelector('.nh-widget__alarm')), pulse: read(document.querySelector('.nh-gauge__bloom--pulse')) }
    })
  const lively = await motion()
  ok(
    'the frame flashes once a second',
    lively.frame?.name === 'nh-alarm' && lively.frame?.time === '1s' && lively.frame?.count === 'infinite' && lively.frame?.running === 1,
    JSON.stringify(lively.frame)
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await sleep(300)
  const calm = await motion()
  ok(
    'and keeps flashing when the device asks for less motion, slower',
    calm.frame?.name === 'nh-alarm-calm' && calm.frame?.time === '2s' && calm.frame?.count === 'infinite' && calm.frame?.running === 1,
    JSON.stringify(calm.frame)
  )
  ok('(control) every other animation is cut to one pass there - check has power', calm.pulse?.count === '1', JSON.stringify(calm.pulse))
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // ---- the stops editor ----
  await page.click('[aria-label="Edit dashboard"]').catch(() => {})
  await page.waitForSelector('.nh-grid--edit').catch(() => {})
  const pick = async (name) => {
    await page
      .locator(`.nh-cell:has(.nh-widget__labeltext:text-is("${name}")) .nh-cell__overlay`)
      .click()
      .catch(() => {})
    await sleep(400)
  }
  ok('the alarm shows while editing too', (await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Clay alarm")) .nh-widget__alarm').count()) === 1)
  await pick('Top stop')
  ok('each stop asks for the value it starts from', (await page.locator('.nh-sheet--side .nh-chartcard__cell span:text-is("From value")').count()) === 2)
  ok('and nothing still says "up to"', (await page.locator('.nh-sheet--side').getByText('Up to value').count()) === 0)
  const strip = await stripOf()
  ok(
    'the preview lists the bands low to high, base color first',
    bands(strip) === JSON.stringify(['< 50 rgb(18, 52, 86)', '≥ 50 rgb(76, 175, 80)', '≥ 80 rgb(244, 67, 54)']),
    bands(strip)
  )
  await pick('Theme')
  const themeStrip = await stripOf()
  ok("with no base color the first band is marked as the theme's", themeStrip.length === 2 && themeStrip[0].theme && !themeStrip[1].theme, JSON.stringify(themeStrip))

  // typed, not filled: the field takes a keystroke at a time
  await pick('Below')
  const editBand = () =>
    page
      .locator('.nh-cell:has(.nh-widget__labeltext:text-is("Below")) .nh-gauge__band')
      .getAttribute('stroke')
      .catch(() => 'absent')
  const before = await editBand()
  await fromInputs.click().catch(() => {})
  await page.keyboard.press('Control+A')
  await page.keyboard.type('85')
  await sleep(400)
  const after = await editBand()
  const typed = await stripOf()
  const field = await fromInputs.inputValue().catch(() => 'absent')
  ok(
    'typing a lower stop recolors the dial and the preview as it is typed',
    before === '#00ff88' && after === RED && typed[1]?.label === '≥ 85' && field === '85',
    `${before} -> ${after}, field ${field}, preview ${typed.map((b) => b.label).join(' | ')}`
  )
  const side = await page.evaluate(() => {
    const el = document.querySelector('.nh-sheet--side')
    return el ? { scroll: el.scrollWidth, client: el.clientWidth } : null
  })
  ok('the stops field fits the settings panel', side !== null && side.scroll <= side.client, JSON.stringify(side))
  await page.click('button:has-text("Exit")').catch(() => {})
  await sleep(500)
  const storedStops = await (await fetch(NS + '/' + encodeURIComponent(UID_STOPS), { headers: AUTH })).json()
  const storedBelow = storedStops?.config?.widgets?.find((w) => w.id === 'g-below')
  ok('exit discarded the typed stop', storedBelow?.config?.severity?.[0]?.value === 95, JSON.stringify(storedBelow?.config?.severity))

  const realErrs = errs.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))
  ok('no console/page errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  const del = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
  const gone = (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).status === 404
  ok('cleanup: ' + UID + ' deleted', gone, 'del=' + del.status)
  const delStops = await fetch(NS + '/' + encodeURIComponent(UID_STOPS), { method: 'DELETE', headers: AUTH })
  const goneStops = (await fetch(NS + '/' + encodeURIComponent(UID_STOPS), { headers: AUTH })).status === 404
  ok('cleanup: ' + UID_STOPS + ' deleted', goneStops, 'del=' + delStops.status)
  if (madeNull) {
    await fetch(itemUrl(NULL_ITEM), { method: 'DELETE', headers: AUTH }).catch(() => {})
    const itemGone = (await fetch(itemUrl(NULL_ITEM), { headers: AUTH })).status === 404
    ok('cleanup: ' + NULL_ITEM + ' deleted', itemGone)
  }
  await sendItem(ITEMS.dimmer, initialDimmer)
  await sleep(700)
  const restored = await itemState(ITEMS.dimmer)
  ok('dimmer restored to recorded initial', String(restored) === String(initialDimmer), `got=${restored} want=${initialDimmer}`)
}

const fails = results.filter((r) => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
process.exitCode = fails.length === 0 ? 0 : 1
