/**
 * LED gauge e2e: the dial widget's 'led' style. Rendering (beads, severity colors, bloom,
 * hide-unlit, partial arcs), scale ticks + clamped labels, markers (fixed and item-bound),
 * zones, the alarm pulse, live SSE updates, pointer set-by-tap (route-fulfilled, nothing real
 * commanded by the tap), read-only, the classic style untouched, and the settings form's
 * Style switch + row editors.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-gauge and deletes exactly it.
 * The dimmer item is commanded via REST for the live-update checks (initial state recorded
 * and restored); every in-app tap that could command goes through a fulfilled route, so no
 * widget interaction ever reaches a real device.
 */
import { chromium } from 'playwright-core'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-gauge'
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
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

/** The suite's own copy of the lighting rule: LED i is lit when its fraction <= value fraction. */
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

try {
  // a known dimmer value the severity/lighting expectations are computed from
  await sendItem(ITEMS.dimmer, 60)
  await sleep(800)

  // ---------- seed ----------
  const SEV = [
    { value: 30, color: '#2196f3' },
    { value: 70, color: '#ff9800' },
    { value: 100, color: '#f44336' },
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
              // color present AND severity stops: the stops must win by value
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
            // hostile stored config: lists that are not lists, numbers out of range - a hand
            // edit or foreign import is written verbatim, and the widget must render, not throw
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

  // every item POST the page makes is fulfilled, never forwarded - taps cannot reach a device
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

  // ---------- LED rendering ----------
  const gauges = await page.locator('.nh-dial--ring').count()
  ok('thirteen ring gauges render', gauges === 13, String(gauges))
  ok('LED-kind gauges carry the led class', (await page.locator('.nh-dial--led').count()) === 10)

  // hostile config: renders with every bad value clamped instead of crashing the dashboard
  ok('hostile config still shows its value', (await cell('Hostile').locator('.nh-gauge__value').textContent()) === '60')
  const hostileBeads = await cell('Hostile').locator('.nh-gauge__led, .nh-gauge__ledlit').count()
  ok('hostile ledCount 0 clamps to 8 beads', hostileBeads === 8, String(hostileBeads))
  ok('hostile item2 draws no inner ring', (await cell('Hostile').locator('.nh-gauge__led--inner, .nh-gauge__ledlit--inner').count()) === 0)

  // ---------- plain color + precedence ----------
  const plainStop = await cell('Plain color').locator('radialGradient[id^="nh-g-led-"] stop').last().evaluate((el) => el.style.stopColor)
  ok('plain Color drives the beads without stops', /0,\s*255,\s*136|#00ff88/i.test(plainStop), plainStop)
  // w-led carries color #123456 AND stops: its orange severity check above proves stops win

  // ---------- dual gauge ----------
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
  // evaluate-based so a build without the feature FAILS these instead of timing out on a wait
  const innerStop = await cell('Dual').evaluate(
    (el) => [...el.querySelectorAll('radialGradient[id^="nh-g-led2-"] stop')].pop()?.style.stopColor ?? 'absent'
  )
  ok('inner ring carries its own color', /255,\s*0,\s*255|#ff00ff/i.test(innerStop), innerStop)
  ok('center shows the outer value big', (await cell('Dual').locator('.nh-gauge__value').textContent())?.startsWith('60'))
  const second = await cell('Dual').evaluate((el) => el.querySelector('.nh-gauge__second')?.textContent ?? 'absent')
  ok('center shows the inner reading beneath', /^\d+ °$/.test(second), String(second))

  // ---------- solid arc style ----------
  ok('arc: solid value band with the configured color', (await cell('Arc').evaluate((el) => el.querySelector('.nh-gauge__band')?.getAttribute('stroke') ?? 'absent')) === '#2196f3')
  ok('arc: dim full-length track', (await cell('Arc').locator('.nh-gauge__btrack').count()) === 1)
  ok('arc: sector face drawn', (await cell('Arc').locator('.nh-gauge__face').count()) === 1)
  ok('arc: no beads', (await cell('Arc').locator('.nh-gauge__led, .nh-gauge__ledlit').count()) === 0)
  ok('arc: zone band drawn', (await cell('Arc').locator('.nh-gauge__zone').count()) === 1)
  ok('arc: tick labels present', (await cell('Arc').locator('.nh-gauge__ticklabel').count()) > 0)

  // ---------- blocks style ----------
  const blkLit = await cell('Blocks').locator('.nh-gauge__blklit').count()
  const blkUnlit = await cell('Blocks').locator('.nh-gauge__blk').count()
  ok('blocks: 20 segments by default', blkLit + blkUnlit === 20, `${blkLit}+${blkUnlit}`)
  ok('blocks: midpoint rule lights 12 at 60%', blkLit === 12, String(blkLit))
  ok('blocks: lit stroke is the configured color', (await cell('Blocks').evaluate((el) => el.querySelector('.nh-gauge__blklit')?.getAttribute('stroke') ?? 'absent')) === '#ffb300')

  // ---------- 3d style ----------
  ok('3d: clay block bodies', (await cell('Clay').locator('.nh-gauge__claybody').count()) === 20)
  ok('3d: offset shadows under the blocks', (await cell('Clay').locator('.nh-gauge__clayshadow').count()) > 20)
  ok('3d: solid value arc present', (await cell('Clay').locator('.nh-gauge__band').count()) === 1)
  ok('3d: raised center disc sheen', (await cell('Clay').locator('.nh-gauge__clayhi2').count()) === 1)
  ok('3d: decorative dot ring', (await cell('Clay').locator('.nh-gauge__led').count()) >= 14)

  // ---------- history bars ----------
  await page.waitForSelector('.nh-gcell:has(.nh-widget__labeltext:text-is("Hist")) .nh-gauge__bar', { timeout: 15000 }).catch(() => {})
  const histBars = await cell('Hist').locator('.nh-gauge__bar').count()
  ok('history bars render from persistence', histBars > 3 && histBars <= 24, String(histBars))
  ok('history mode puts the unit beside the value', (await cell('Hist').locator('.nh-gauge__value tspan').count()) === 1)

  // nearest-ring taps (route-fulfilled - nothing real is commanded). The dual cell sits on the
  // bottom row, below the 1000px viewport fold - scroll it into view first or the raw mouse
  // click lands outside the viewport and silently does nothing.
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

  // severity: 60 sits in the 30..70 band -> orange
  const stopColor = await cell('LED').locator('radialGradient[id^="nh-g-led-"] stop').last().evaluate((el) => el.style.stopColor)
  ok('bead gradient carries the severity color', /255,\s*152,\s*0|#ff9800/i.test(stopColor), stopColor)

  // the computed fill of a lit bead is the gradient, not a stylesheet color
  const litFill = await cell('LED').locator('.nh-gauge__ledlit').first().evaluate((el) => getComputedStyle(el).fill)
  ok('lit bead fill is the gradient url', litFill.includes('url('), litFill)
  // negative control: re-applying the old base-class fill rule must break the check above
  await page.addStyleTag({ content: '.nh-gauge__ledlit { fill: var(--nh-text); }' })
  const brokenFill = await cell('LED').locator('.nh-gauge__ledlit').first().evaluate((el) => getComputedStyle(el).fill)
  ok('(control) a stylesheet fill would defeat the gradient - check has power', !brokenFill.includes('url('), brokenFill)
  await page.evaluate(() => document.querySelector('style:last-of-type')?.remove())

  ok('bloom is drawn', (await cell('LED').locator('.nh-gauge__bloom').count()) === 1)
  const value = await cell('LED').locator('.nh-gauge__value').textContent()
  ok('center value reads 60', value === '60', value)
  ok('unit under the value', (await cell('LED').locator('.nh-gauge__unit').textContent()) === '%')

  // ---------- ticks ----------
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

  // ---------- markers + zones ----------
  const markers = await cell('LED').locator('.nh-gauge__marker').count()
  ok('two markers drawn (fixed + item-bound)', markers === 2, String(markers))
  ok('marker label rendered', (await cell('LED').locator('.nh-gauge__markerlabel').textContent()) === 'ref')
  ok('zone arc drawn with its color', (await cell('LED').locator('.nh-gauge__zone').getAttribute('stroke')) === '#f44336')

  // ---------- alarm pulse ----------
  ok('alarm gauge pulses', (await cell('Alarm on').locator('.nh-gauge__bloom--pulse').count()) === 1)
  ok('out-of-range alarm does not pulse', (await cell('Alarm off').locator('.nh-gauge__bloom--pulse').count()) === 0)
  ok('out-of-range alarm still blooms', (await cell('Alarm off').locator('.nh-gauge__bloom').count()) === 1)

  // ---------- hide-unlit + partial arc + no bloom ----------
  ok('hidden-unlit shows only lit beads', (await cell('Half').locator('.nh-gauge__led').count()) === 0)
  const halfLit = await cell('Half').locator('.nh-gauge__ledlit').count()
  ok('half gauge lit count', Math.abs(halfLit - Math.floor(0.6 * 39 + 1 + 1e-9)) <= 1, String(halfLit))
  ok('bloom off leaves no bloom', (await cell('Half').locator('.nh-gauge__bloom').count()) === 0)

  // ---------- bidirectional: lights from the zero reference ----------
  // dimmer 60 in [-100,100]: zero at fraction 0.5, value at 0.8 -> roughly 0.3 * 40 beads lit
  const bidiLit = await cell('Bidi').locator('.nh-gauge__ledlit').count()
  ok('bidirectional lights the zero..value span, not min..value', bidiLit >= 11 && bidiLit <= 15, String(bidiLit))

  // ---------- classic untouched ----------
  for (const sel of ['.nh-dial__track', '.nh-dial__fill', '.nh-dial__knob', '.nh-dial__value']) {
    ok(`classic keeps ${sel}`, (await cell('Classic').locator(sel).count()) === 1)
  }
  ok('classic value text', (await cell('Classic').locator('.nh-dial__value').textContent()) === '60%')

  // ---------- live update via SSE: color band change + lit count + item-bound marker ----------
  // compare BOTH coordinates: x alone is mirror-symmetric about the vertical axis, so two
  // different values can share it exactly (the timeclock second-hand lesson)
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

  // ---------- pointer set: tap at 3 o'clock -> 25% of a full circle from the top ----------
  posts.length = 0
  const box = await cell('LED').locator('svg.nh-dial--led').boundingBox()
  // svg is square-centered: tap on the ring at the right (25% around a full circle from 12h)
  await page.mouse.click(box.x + box.width / 2 + Math.min(box.width, box.height) * 0.44, box.y + box.height / 2)
  await sleep(400)
  ok('tap sends one command', posts.length === 1, JSON.stringify(posts))
  ok('tap maps the angle to the value (25)', posts.length === 1 && posts[0].body === '25', posts[0]?.body)

  // ---------- read-only sends nothing ----------
  posts.length = 0
  const rbox = await cell('RO').locator('svg.nh-dial--led').boundingBox()
  await page.mouse.click(rbox.x + rbox.width / 2 + Math.min(rbox.width, rbox.height) * 0.44, rbox.y + rbox.height / 2)
  await sleep(400)
  ok('read-only tap sends nothing', posts.length === 0, JSON.stringify(posts))

  // ---------- settings form: style switch + row editors, then discarded ----------
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Classic")) .nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side')
  const styleSel = page.locator('.nh-sheet--side .nh-field:has(.nh-field__label:text-is("Style")) select')
  ok('style select shows classic by default', (await styleSel.inputValue()) === 'classic')
  ok('no LED fields while classic', (await page.locator('.nh-sheet--side label:has-text("Segments")').count()) === 0)
  await styleSel.selectOption('led')
  await sleep(400)
  ok('switching to LED restyles the widget live', (await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Classic")) .nh-dial--led').count()) === 1)
  ok('LED fields appear', (await page.locator('.nh-sheet--side label:has-text("Segments")').count()) === 1)
  ok('style select offers all five looks', (await styleSel.locator('option').count()) === 5)
  ok('alarm range hidden until alarm is on', (await page.locator('.nh-sheet--side label:has-text("Alarm from")').count()) === 0)
  ok('second-item field offered', (await page.locator('.nh-sheet--side').getByText('Second item (inner ring)').count()) === 1)
  ok('inner fields hidden without a second item', (await page.locator('.nh-sheet--side label:has-text("Inner minimum")').count()) === 0)

  // the picker's clear button: set the second item, then clear it with the ✕
  const itemField = page.locator('.nh-sheet--side .nh-field:has-text("Second item")').locator('.nh-picker')
  await itemField.locator('input').fill(ITEMS.dimmer)
  await sleep(400)
  ok('typed second item shows the inner fields', (await page.locator('.nh-sheet--side label:has-text("Inner minimum")').count()) === 1)
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

  // ---------- console health ----------
  const realErrs = errs.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))
  ok('no console/page errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  const del = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
  const gone = (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).status === 404
  ok('cleanup: ' + UID + ' deleted', gone, 'del=' + del.status)
  await sendItem(ITEMS.dimmer, initialDimmer)
  await sleep(700)
  const restored = await itemState(ITEMS.dimmer)
  ok('dimmer restored to recorded initial', String(restored) === String(initialDimmer), `got=${restored} want=${initialDimmer}`)
}

const fails = results.filter((r) => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
process.exitCode = fails.length === 0 ? 0 : 1
