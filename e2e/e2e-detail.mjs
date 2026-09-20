// The widget detail sheet, and the gesture that opens it.
// SAFE with a live config: creates and deletes exactly dashboard:nh-e2e-detail, saves NOTHING through the
// app (so no restore point is minted), and COMMANDS NOTHING, every.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-detail'
const DASH = 'nh-e2e-detail'
const HOLD_MS = 800 // comfortably past the 500ms threshold

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => ({}))

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const readSheet = () => {
  const panel = document.querySelector('.nh-detail__panel')
  if (!panel) return { open: false }
  const rows = [...panel.querySelectorAll('.nh-detail__row')].map((r) => ({
    label: r.querySelector('dt')?.textContent?.trim() ?? '',
    value: r.querySelector('dd')?.textContent?.trim() ?? '',
  }))
  const r = panel.getBoundingClientRect()
  const titleEl = panel.querySelector('.nh-detail__title')
  const subEl = panel.querySelector('.nh-detail__sub')
  const range = panel.querySelector('input[type="range"]')
  return {
    open: true,
    head: titleEl?.textContent?.trim() ?? '',
    sub: subEl?.textContent?.trim() ?? '',
    title: (subEl ? titleEl?.firstChild?.textContent : titleEl?.textContent)?.trim() ?? '',
    rows,
    labels: rows.map((x) => x.label),
    ranges: panel.querySelectorAll('input[type="range"]').length,
    range: range ? { min: range.min, max: range.max, step: range.step, value: range.value } : null,
    reading: panel.querySelector('.nh-slider__value')?.textContent?.trim() ?? '',
    chip: panel.querySelector('.nh-chart__chip--on')?.textContent?.trim() ?? '',
    buttons: [...panel.querySelectorAll('.nh-quickbtns button')].map((b) => b.textContent.trim()),
    control: panel.querySelector('.nh-detail__control') !== null,
    changed: rows.find((x) => x.label === 'Last changed')?.value ?? '',
    picks: [...panel.querySelectorAll('.nh-detail__pickrow')].map((b) => b.textContent.trim()),
    link: panel.querySelector('.nh-detail__link')?.getAttribute('href') ?? '',
    canvases: panel.querySelectorAll('canvas').length,
    chartText: panel.querySelector('.nh-detail__chart')?.textContent?.trim() ?? '',
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  }
}

const browser = await launch()
const errs = []
const commands = []

async function newPage(width = 1500, height = 1000, opts = {}) {
  const page = await browser.newPage({ viewport: { width, height }, ...opts })
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const at = m.location?.()?.url
    if (!isAppResource(at)) return
    errs.push(m.text() + (at ? ' <- ' + at : ''))
  })
  page.on('dialog', (d) => d.accept())
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
      localStorage.setItem('neohab:themeOverride', 'dark') // assert against the default theme
      localStorage.setItem('neohab:language', 'en') // the labels below are the English ones
    } catch {}
  }, TOKEN)
  await page.route('**/rest/items/**', async (route) => {
    if (route.request().method() === 'POST') {
      commands.push({ url: route.request().url(), body: route.request().postData() })
      return route.fulfill({ status: 200, body: '' })
    }
    return route.fallback()
  })
  return page
}

async function holdOn(page, locator, ms = HOLD_MS) {
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  const b = await locator.boundingBox().catch(() => null)
  if (!b) return false
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await sleep(ms)
  await page.mouse.up()
  await sleep(350)
  return true
}

async function closeSheet(page) {
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(250)
}

let page
try {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: DASH,
        name: 'E2E Detail',
        columns: 12,
        rowHeight: 100,
        gap: 8,
        widgets: [
          { id: 'w-btn', type: 'button', layout: { lg: { x: 0, y: 0, w: 3, h: 2 } }, config: { label: 'E2E Button', item: ITEMS.dimmer, command: '55', action: 'command' } },
          { id: 'w-dial', type: 'dial', layout: { lg: { x: 3, y: 0, w: 3, h: 2 } }, config: { label: 'E2E Dial', item: ITEMS.dimmer, min: 0, max: 100, step: 1 } },
          { id: 'w-clock', type: 'clock', layout: { lg: { x: 6, y: 0, w: 3, h: 2 } }, config: { label: 'E2E Clock', showDate: true } },
          { id: 'w-chart', type: 'chart', layout: { lg: { x: 0, y: 2, w: 6, h: 3 } }, config: { label: 'E2E Chart', series: [{ item: ITEMS.dimmer }, { item: ITEMS.temperature }], period: '7d' } },
          { id: 'w-gauge', type: 'dial', layout: { lg: { x: 6, y: 2, w: 3, h: 2 } }, config: { label: 'E2E Gauge', item: ITEMS.dimmer, style: 'arc', readOnly: true, min: 0, max: 100 } },
          { id: 'w-value', type: 'value', layout: { lg: { x: 9, y: 2, w: 3, h: 2 } }, config: { label: 'E2E Value', item: ITEMS.dimmer } },
          { id: 'w-slider', type: 'slider', layout: { lg: { x: 0, y: 5, w: 6, h: 2 } }, config: { label: 'E2E Slider', item: ITEMS.dimmer, min: 0, max: 100, step: 1 } },
          { id: 'w-kelvin', type: 'slider', layout: { lg: { x: 0, y: 7, w: 4, h: 2 } }, config: { label: 'E2E Kelvin', item: ITEMS.dimmer, min: 2000, max: 6500, step: 50, unit: ' K' } },
          { id: 'w-therm', type: 'dial', layout: { lg: { x: 4, y: 7, w: 4, h: 2 } }, config: { label: 'E2E Thermostat', item: ITEMS.dimmer, min: 10, max: 30, step: 0.5, unit: '°' } },
          { id: 'w-roller', type: 'rollershutter', layout: { lg: { x: 8, y: 7, w: 4, h: 2 } }, config: { label: 'E2E Roller', item: ITEMS.dimmer } },
          { id: 'w-pick', type: 'selection', layout: { lg: { x: 0, y: 9, w: 4, h: 2 } }, config: { label: 'E2E Pick', item: ITEMS.dimmer, choices: '10=Low\n50=Half\n100=Full' } },
          { id: 'w-onoff', type: 'button', layout: { lg: { x: 4, y: 9, w: 4, h: 2 } }, config: { style: 'switch', toggle: true, label: 'E2E OnOff', item: ITEMS.dimmer, command: '100', commandAlt: '0' } },
          { id: 'w-play', type: 'player', layout: { lg: { x: 8, y: 9, w: 4, h: 2 } }, config: { label: 'E2E Play', item: ITEMS.dimmer } },
          { id: 'w-tv', type: 'player', layout: { lg: { x: 0, y: 11, w: 4, h: 2 } }, config: { label: 'E2E TV', item: ITEMS.player } },
          { id: 'w-text', type: 'label', layout: { lg: { x: 4, y: 11, w: 4, h: 2 } }, config: { text: 'E2E Label' } },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.status === 200 || seed.status === 201, 'status ' + seed.status)

  const restItem = await (await fetch(BASE + '/rest/items/' + encodeURIComponent(ITEMS.dimmer), { headers: AUTH })).json().catch(() => ({}))
  const serverHasLastChange = typeof restItem?.lastStateChange === 'number'
  const sinceIso = new Date(Date.now() - 24 * 3600e3).toISOString()
  const histUrl =
    BASE + '/rest/persistence/items/' + encodeURIComponent(ITEMS.dimmer) + '?starttime=' + sinceIso + '&boundary=true'
  const storedRows = await fetch(histUrl, { headers: AUTH })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (Array.isArray(j?.data) ? j.data.length : 0))
    .catch(() => 0)

  page = await newPage()
  await page.goto(APP + '#/d/' + DASH)
  await page.waitForSelector('.nh-dash', { timeout: 20000 })
  await page.waitForSelector('.nh-gcell', { timeout: 15000 }).catch(() => {})
  await sleep(700)

  const btn = page.locator('.nh-gcell').nth(0)
  const dial = page.locator('.nh-gcell').nth(1)
  const clock = page.locator('.nh-gcell').nth(2)
  const chart = page.locator('.nh-gcell').nth(3)
  const gauge = page.locator('.nh-gcell').nth(4)
  const value = page.locator('.nh-gcell').nth(5)
  const plain = page.locator('.nh-gcell').last()

  commands.length = 0
  const held = await holdOn(page, btn)
  const afterHold = await probe(page, readSheet)
  ok('a hold on a widget opens its detail sheet', held && afterHold.open === true)
  ok(
    'the hold does not also command the item',
    commands.length === 0,
    commands.length ? commands.map((c) => c.body).join(',') : 'no commands'
  )
  ok(
    'the sheet says which item it is about',
    (afterHold.head ?? '').includes(ITEMS.dimmer),
    `head="${afterHold.head ?? ''}" title="${afterHold.title ?? ''}" sub="${afterHold.sub ?? ''}"`
  )
  ok(
    'a labelled item leads with its label, not its name',
    restItem?.label ? afterHold.title === restItem.label && afterHold.sub === ITEMS.dimmer : true,
    restItem?.label ? `label="${restItem.label}" title="${afterHold.title}"` : 'item has no label on this server'
  )

  await closeSheet(page)
  const afterEsc = await probe(page, readSheet)
  ok('Escape closes the sheet', afterHold.open === true && afterEsc.open === false)

  commands.length = 0
  await btn.click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  const afterTap = await probe(page, readSheet)
  ok('a plain tap still sends the command', commands.length === 1, commands.map((c) => c.body).join(',') || 'none')
  ok('a plain tap does not open the sheet', afterTap.open !== true)

  commands.length = 0
  const bb = await btn.boundingBox()
  await page.mouse.move(bb.x + 20, bb.y + 20)
  await page.mouse.down()
  await page.mouse.move(bb.x + 90, bb.y + 60, { steps: 8 })
  await sleep(HOLD_MS)
  await page.mouse.up()
  await sleep(300)
  const afterDrag = await probe(page, readSheet)
  ok('movement cancels the hold', afterDrag.open !== true)
  await closeSheet(page)

  commands.length = 0
  const rb = await btn.boundingBox()
  await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2, { button: 'right' })
  await sleep(400)
  const afterRight = await probe(page, readSheet)
  ok('a right-click opens the sheet', afterRight.open === true)
  ok('the right-click commands nothing', commands.length === 0, commands.map((c) => c.body).join(',') || 'no commands')
  await closeSheet(page)

  const dbox = await dial.boundingBox()
  const spot = { x: dbox.x + dbox.width / 2 + 24, y: dbox.y + dbox.height / 2 - 24 }

  commands.length = 0
  await page.mouse.click(spot.x, spot.y)
  await sleep(400)
  const tapped = commands.map((c) => c.body)

  commands.length = 0
  await page.mouse.move(spot.x, spot.y)
  await page.mouse.down()
  await sleep(HOLD_MS)
  await page.mouse.up()
  await sleep(400)
  const heldCmds = commands.map((c) => c.body)
  const afterDialHold = await probe(page, readSheet)

  ok('a tap on a dial still sets the value under the pointer', tapped.length === 1, `tap=[${tapped.join(',')}]`)
  ok('a hold on a dial commands nothing', heldCmds.length === 0, `hold=[${heldCmds.join(',')}]`)
  ok('and opens the sheet instead', afterDialHold.open === true)
  await closeSheet(page)

  const slid = page.locator('.nh-gcell .nh-fader__input').first()
  const sbox = await slid.boundingBox()
  const farAlong = { x: sbox.x + sbox.width * 0.85, y: sbox.y + sbox.height / 2 }
  const sliderValue = () => slid.inputValue().catch(() => '')

  const beforeHoldValue = await sliderValue()
  commands.length = 0
  await page.mouse.move(farAlong.x, farAlong.y)
  await page.mouse.down()
  await sleep(HOLD_MS)
  const duringHoldValue = await sliderValue()
  await page.mouse.up()
  await sleep(500)
  const afterHoldValue = await sliderValue()
  const afterSliderHold = await probe(page, readSheet)
  ok('a hold on a slider opens the sheet', afterSliderHold.open === true)
  ok('a hold on a slider commands nothing', commands.length === 0, commands.map((c) => c.body).join(',') || 'no commands')
  ok(
    'and the thumb goes back where it was',
    afterHoldValue === beforeHoldValue && beforeHoldValue !== '',
    `before=${beforeHoldValue} during=${duringHoldValue} after=${afterHoldValue}`
  )
  await closeSheet(page)

  commands.length = 0
  await page.mouse.click(farAlong.x, farAlong.y)
  await sleep(500)
  const afterTapValue = await sliderValue()
  const afterSliderTap = await probe(page, readSheet)
  // the value under the pointer, not "something different": the live item can already sit exactly there
  ok(
    'a tap on the track still sets the value there',
    commands.length === 1 && afterTapValue === commands[0].body,
    `commands=[${commands.map((c) => c.body).join(',')}] value=${afterTapValue}`
  )
  ok('a tap on the track does not open the sheet', afterSliderTap.open !== true)

  commands.length = 0
  await page.mouse.move(farAlong.x, farAlong.y)
  await page.mouse.down()
  await page.mouse.move(sbox.x + sbox.width * 0.3, farAlong.y, { steps: 10 })
  await sleep(HOLD_MS)
  await page.mouse.up()
  await sleep(500)
  const afterDrag2 = await probe(page, readSheet)
  ok(
    'a slow drag is still a drag, and still commits',
    commands.length >= 1 && afterDrag2.open !== true,
    `commands=[${commands.map((c) => c.body).join(',')}] sheet=${afterDrag2.open === true}`
  )
  await closeSheet(page)

  const beforeCtx = await sliderValue()
  commands.length = 0
  await page.mouse.move(farAlong.x, farAlong.y)
  await page.mouse.down()
  await sleep(200)
  await page.evaluate(
    ([px, py]) => {
      document
        .elementFromPoint(px, py)
        ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: px, clientY: py }))
    },
    [farAlong.x, farAlong.y]
  )
  await sleep(300)
  const ctxSheet = await probe(page, readSheet)
  await page.mouse.up()
  await sleep(500)
  const afterCtxValue = await sliderValue()
  ok('a touch long press (contextmenu) opens the sheet over a slider', ctxSheet.open === true)
  ok(
    'and takes the gesture with it: nothing sent, thumb back',
    commands.length === 0 && afterCtxValue === beforeCtx,
    `commands=[${commands.map((c) => c.body).join(',')}] before=${beforeCtx} after=${afterCtxValue}`
  )
  await closeSheet(page)

  commands.length = 0
  const db = await dial.boundingBox()
  await page.mouse.click(db.x + db.width / 2, db.y + 6, { button: 'right' })
  await sleep(400)
  const afterDialRight = await probe(page, readSheet)
  ok('a right-click still reaches a dial, so nothing is unreachable', afterDialRight.open === true)
  ok('that right-click commands nothing', commands.length === 0, commands.map((c) => c.body).join(',') || 'no commands')
  ok(
    'an ordinary dial IS a control, so its sheet offers one',
    afterDialRight.open === true && afterDialRight.control === true && afterDialRight.ranges >= 1,
    `control=${afterDialRight.control} ranges=${afterDialRight.ranges}`
  )
  await closeSheet(page)

  const gb = await gauge.boundingBox()
  await page.mouse.click(gb.x + gb.width / 2, gb.y + 8, { button: 'right' })
  await sleep(400)
  const gaugeSheet = await probe(page, readSheet)
  ok('a read-only gauge still opens its sheet', gaugeSheet.open === true)
  ok(
    'and offers no way to change the value',
    gaugeSheet.open === true && gaugeSheet.control === false && gaugeSheet.ranges === 0,
    `control=${gaugeSheet.control} ranges=${gaugeSheet.ranges}`
  )
  ok(
    'while still saying what the thing is doing',
    (gaugeSheet.labels ?? []).includes('State'),
    (gaugeSheet.labels ?? []).join(', ')
  )
  await closeSheet(page)

  commands.length = 0
  await holdOn(page, value)
  const valueSheet = await probe(page, readSheet)
  ok('a readout opens its sheet', valueSheet.open === true)
  ok(
    'and offers no control either',
    valueSheet.open === true && valueSheet.control === false && valueSheet.ranges === 0,
    `control=${valueSheet.control} ranges=${valueSheet.ranges}`
  )
  ok('nothing was commanded on the way', commands.length === 0, commands.map((c) => c.body).join(',') || 'no commands')
  await closeSheet(page)

  await holdOn(page, plain)
  const afterPlain = await probe(page, readSheet)
  ok('a widget with nothing more to show offers no sheet', afterPlain.open !== true)
  await closeSheet(page)

  await holdOn(page, clock)
  const clockSheet = await probe(page, readSheet)
  ok('a clock opens a view of its own', clockSheet.open === true, `open=${clockSheet.open}`)
  ok('titled as the widget, not as an item', clockSheet.title === 'E2E Clock', clockSheet.title ?? '(none)')
  ok(
    'and says which zone the time is in',
    (clockSheet.labels ?? []).includes('Time zone') && (clockSheet.labels ?? []).includes('Offset from UTC'),
    (clockSheet.labels ?? []).join(', ') || '(no rows)'
  )
  const clockText = await probe(page, () => {
    const el = document.querySelector('.nh-clockdetail')
    if (!el) return {}
    return {
      time: el.querySelector('.nh-clockdetail__time')?.textContent?.trim() ?? '',
      date: el.querySelector('.nh-clockdetail__date')?.textContent?.trim() ?? '',
      zone: el.querySelector('.nh-clockdetail__zoneid')?.textContent?.trim() ?? '',
    }
  })
  ok('with the time to the second', /\d{1,2}:\d{2}:\d{2}/.test(clockText.time ?? ''), clockText.time ?? '(none)')
  ok(
    'and the date written out in full',
    typeof clockText.date === 'string' && clockText.date.length > 10 && /\d{4}/.test(clockText.date),
    clockText.date ?? '(none)'
  )
  ok('naming the zone it resolved', /\//.test(clockText.zone ?? '') || (clockText.zone ?? '') !== '', clockText.zone ?? '(none)')
  ok('and no item picker, since there is no item', (clockSheet.picks ?? []).length === 0)
  await closeSheet(page)

  commands.length = 0
  await holdOn(page, btn)
  const sheet = await probe(page, readSheet)
  ok('the sheet shows the current state', sheet.labels?.includes('State'), (sheet.labels ?? []).join(', '))
  ok(
    'the sheet offers the command this button sends',
    (sheet.buttons ?? []).join(',') === '55',
    `ranges=${sheet.ranges} buttons=${(sheet.buttons ?? []).join(',')}`
  )
  ok(
    'the sheet links to the item in Main UI',
    typeof sheet.link === 'string' && sheet.link.endsWith('/settings/items/' + encodeURIComponent(ITEMS.dimmer)),
    sheet.link || '(none)'
  )
  await sleep(2500)
  const withHistory = await probe(page, readSheet)
  ok(
    'the sheet shows history, or says why it cannot',
    withHistory.canvases >= 1 || /persistence/i.test(withHistory.chartText ?? ''),
    `canvases=${withHistory.canvases} text=${(withHistory.chartText ?? '').slice(0, 60)}`
  )

  const hasRow = (withHistory.labels ?? []).includes('Last changed')
  const expectRow = serverHasLastChange || storedRows > 0
  ok(
    'when did it last change: answered from the item, or from the history when the server has no field',
    hasRow === expectRow,
    `field=${serverHasLastChange} storedRows=${storedRows} sheet=${hasRow} value="${withHistory.changed}"`
  )

  commands.length = 0
  await page.locator('.nh-detail__panel .nh-quickbtns button').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  ok(
    'the sheet\'s control commands the item',
    commands.length === 1 && (commands[0].body ?? '').trim() === '55',
    commands.map((c) => c.body).join(',') || 'none'
  )
  await closeSheet(page)

  await holdOn(page, btn)
  const beforeScrim = await probe(page, readSheet)
  await page.mouse.click(6, 6)
  await sleep(300)
  const afterScrim = await probe(page, readSheet)
  ok('clicking outside the sheet closes it', beforeScrim.open === true && afterScrim.open === false)

  commands.length = 0
  await holdOn(page, chart)
  const picker = await probe(page, readSheet)
  ok('a widget with several items asks which one', (picker.picks ?? []).length === 2, (picker.picks ?? []).join(', '))
  await page.locator('.nh-detail__pickrow', { hasText: ITEMS.temperature }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const chosen = await probe(page, readSheet)
  ok('choosing one opens its detail', (chosen.head ?? '').includes(ITEMS.temperature), chosen.head ?? '(none)')
  await sleep(1200)
  const withChip = await probe(page, readSheet)
  ok('the history opens on the widget\'s own range', withChip.chip === '7d', withChip.chip || '(no active chip)')
  await closeSheet(page)

  await page.click('[aria-label="Edit dashboard"]').catch(() => {})
  await page.waitForSelector('.nh-grid--edit', { timeout: 10000 }).catch(() => {})
  await sleep(600)
  commands.length = 0
  await holdOn(page, page.locator('.nh-grid--edit .nh-cell').nth(0))
  const inEdit = await probe(page, readSheet)
  ok('editing still means editing: no detail sheet there', inEdit.open !== true)
  await page.click('button:has-text("Exit")').catch(() => {})
  await sleep(700)

  const anon = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await anon.route('**/rest/items/**', async (r) =>
    r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '' }) : r.fallback()
  )
  await anon.goto(APP + '#/d/' + DASH)
  await anon.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
  await sleep(700)
  await holdOn(anon, anon.locator('.nh-gcell').nth(0))
  const asVisitor = await probe(anon, readSheet)
  ok('a signed-out visitor can open the sheet', asVisitor.open === true)
  ok(
    'and sees the state and a control, the same as on the dashboard',
    asVisitor.open === true &&
      (asVisitor.labels ?? []).includes('State') &&
      (asVisitor.ranges >= 1 || (asVisitor.buttons ?? []).length >= 1),
    asVisitor.open
      ? `labels=${(asVisitor.labels ?? []).join(',')} ranges=${asVisitor.ranges} buttons=${(asVisitor.buttons ?? []).join(',')}`
      : 'not open'
  )
  await anon.close().catch(() => {})

  const NAME_RE = new RegExp('/rest/items/' + ITEMS.dimmer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\?|$)')
  const strippedItem = { ...restItem }
  delete strippedItem.lastState
  delete strippedItem.lastStateUpdate
  delete strippedItem.lastStateChange

  async function sheetOverHistory(rows) {
    const p = await newPage()
    const asked = []
    await p.route(NAME_RE, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(strippedItem) })
    })
    await p.route('**/rest/persistence/items/**', async (route) => {
      const url = route.request().url()
      if (url.includes('boundary=true') && !url.includes('endtime=')) asked.push(url)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: ITEMS.dimmer, datapoints: String(rows.length), data: rows }),
      })
    })
    await p.goto(APP + '#/d/' + DASH)
    await p.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
    await sleep(600)
    await holdOn(p, p.locator('.nh-gcell').nth(0))
    await sleep(600)
    const sheet = await probe(p, readSheet)
    await p.close().catch(() => {})
    return { sheet, asked }
  }

  const now = Date.now()
  const changedTwoHoursAgo = [
    { time: now - 6 * 3600e3, state: '10' },
    { time: now - 3 * 3600e3, state: '10' },
    { time: now - 2 * 3600e3, state: '40' },
    { time: now - 60e3, state: '40' },
  ]
  const recent = await sheetOverHistory(changedTwoHoursAgo)
  ok(
    'with no field to read, the sheet asks the history',
    recent.asked.length >= 1,
    recent.asked.length ? recent.asked[0].split('?')[1] : 'no such request'
  )
  ok(
    'and reports when the value actually became what it is',
    /2 hours ago/i.test(recent.sheet.changed ?? ''),
    `"${recent.sheet.changed ?? ''}"`
  )

  const steady = await sheetOverHistory([
    { time: now - 20 * 3600e3, state: '40' },
    { time: now - 60e3, state: '40' },
  ])
  ok(
    'a value that held all window is reported as older than the window, not as unknown',
    (steady.sheet.changed ?? '') === 'Over a day ago',
    `"${steady.sheet.changed ?? ''}"`
  )

  const nothing = await sheetOverHistory([])
  ok(
    'with nothing stored, nothing is invented',
    nothing.sheet.open === true && !(nothing.sheet.labels ?? []).includes('Last changed'),
    `open=${nothing.sheet.open} labels=${(nothing.sheet.labels ?? []).join(',')}`
  )

  const sheets = {}
  const cellNamed = (p, name) =>
    p
      .locator('.nh-gcell')
      .filter({ has: p.locator('.nh-widget__labeltext', { hasText: new RegExp('^' + name + '$') }) })
      .first()

  async function sheetOf(name) {
    await closeSheet(page)
    const cell = cellNamed(page, name)
    await cell.scrollIntoViewIfNeeded().catch(() => {})
    const box = await cell.boundingBox().catch(() => null)
    if (!box) return {}
    await page.mouse.click(box.x + box.width / 2, box.y + 8, { button: 'right' })
    await sleep(500)
    const sheet = await probe(page, readSheet)
    sheets[name] = sheet
    return sheet
  }

  const kelvin = await sheetOf('E2E Kelvin')
  ok(
    'a slider set to 2000-6500 K is offered as 2000-6500, not as 0-100',
    kelvin.range?.min === '2000' && kelvin.range?.max === '6500' && kelvin.range?.step === '50',
    JSON.stringify(kelvin.range ?? null)
  )
  ok('and the reading carries the widget\'s unit', /K$/.test(kelvin.reading ?? ''), `"${kelvin.reading ?? ''}"`)
  commands.length = 0
  const kSlider = page.locator('.nh-detail__panel input[type="range"]').first()
  if (await kSlider.count()) {
    await kSlider.focus()
    await page.keyboard.press('ArrowRight')
    await sleep(900) // past the keyboard-commit coalescing window
  }
  const sent = Number((commands[0]?.body ?? '').trim())
  ok(
    'so what it commands is inside the widget\'s own range',
    commands.length === 1 && sent >= 2000 && sent <= 6500,
    `commands=[${commands.map((c) => c.body).join(',')}]`
  )

  const therm = await sheetOf('E2E Thermostat')
  ok(
    'a dial keeps its own scale and step too',
    therm.range?.min === '10' && therm.range?.max === '30' && therm.range?.step === '0.5',
    JSON.stringify(therm.range ?? null)
  )

  const roller = await sheetOf('E2E Roller')
  ok(
    'a rollershutter offers up, stop and down',
    (roller.buttons ?? []).join(',') === 'Up,Stop,Down',
    (roller.buttons ?? []).join(',') || '(none)'
  )
  ok('and no slider to drag a door along', roller.ranges === 0, `ranges=${roller.ranges}`)
  commands.length = 0
  await page.locator('.nh-detail__panel .nh-quickbtns button', { hasText: 'Down' }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  ok(
    'and its buttons send its own commands',
    commands.length === 1 && (commands[0].body ?? '').trim() === 'DOWN',
    `commands=[${commands.map((c) => c.body).join(',')}]`
  )

  const play = await sheetOf('E2E Play')
  ok(
    'a media player offers its transport',
    (play.buttons ?? []).join(',') === 'Previous,Play,Pause,Next',
    (play.buttons ?? []).join(',') || '(none)'
  )
  commands.length = 0
  await page.locator('.nh-detail__panel .nh-quickbtns button', { hasText: 'Pause' }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  ok(
    'and pause pauses',
    commands.length === 1 && (commands[0].body ?? '').trim() === 'PAUSE',
    `commands=[${commands.map((c) => c.body).join(',')}]`
  )

  const tv = await sheetOf('E2E TV')
  ok(
    'the same for a real Player item, whose state is PLAY or PAUSE',
    (tv.buttons ?? []).length === 4 && tv.ranges === 0,
    `buttons=${(tv.buttons ?? []).join(',')} ranges=${tv.ranges}`
  )

  const pick = await sheetOf('E2E Pick')
  ok(
    'a selection offers the choices its author wrote',
    (pick.buttons ?? []).join(',') === 'Low,Half,Full',
    (pick.buttons ?? []).join(',') || '(none)'
  )
  ok('and not a slider over them', pick.ranges === 0, `ranges=${pick.ranges}`)
  commands.length = 0
  await page.locator('.nh-detail__panel .nh-quickbtns button', { hasText: 'Half' }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  ok(
    'and sends the command behind the label, not the label',
    commands.length === 1 && (commands[0].body ?? '').trim() === '50',
    `commands=[${commands.map((c) => c.body).join(',')}]`
  )

  const onoff = await sheetOf('E2E OnOff')
  ok('a switch offers on and off', (onoff.buttons ?? []).join(',') === 'On,Off', (onoff.buttons ?? []).join(',') || '(none)')
  commands.length = 0
  await page.locator('.nh-detail__panel .nh-quickbtns button', { hasText: 'On' }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  ok(
    'sending whatever this switch calls on',
    commands.length === 1 && (commands[0].body ?? '').trim() === '100',
    `commands=[${commands.map((c) => c.body).join(',')}]`
  )

  const empty = Object.entries(sheets)
    .filter(([, s]) => s.control === true && s.ranges === 0 && (s.buttons ?? []).length === 0)
    .map(([name]) => name)
  ok('no sheet showed an empty control box', empty.length === 0, empty.join(', ') || 'none empty')
  await closeSheet(page)

  const phone = await newPage(393, 800)
  await phone.goto(APP + '#/d/' + DASH)
  await phone.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
  await sleep(800)
  await holdOn(phone, phone.locator('.nh-gcell').nth(0))
  const onPhone = await probe(phone, readSheet)
  ok('the sheet opens on a phone too', onPhone.open === true)
  ok(
    'on a phone it is a bottom sheet, full width',
    onPhone.open === true && onPhone.box.w === onPhone.viewport.w && onPhone.box.y + onPhone.box.h >= onPhone.viewport.h - 2,
    onPhone.open ? `panel ${onPhone.box.w}x${onPhone.box.h} at y=${onPhone.box.y} in ${onPhone.viewport.w}x${onPhone.viewport.h}` : 'not open'
  )
  await phone.close().catch(() => {})

  const readSelectable = () => {
    const body = document.querySelector('.nh-detail__body')
    const cell = document.querySelector('.nh-gcell')
    return {
      open: !!document.querySelector('.nh-detail__panel'),
      holding: document.documentElement.classList.contains('nh-holding'),
      sheet: body ? getComputedStyle(body).userSelect : null,
      cell: cell ? getComputedStyle(cell).userSelect : null,
    }
  }

  const touchPage = await newPage(1500, 1000, { hasTouch: true })
  await touchPage.goto(APP + '#/d/' + DASH)
  await touchPage.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
  await sleep(600)

  let during = {}
  let after = {}
  try {
    const cdp = await touchPage.context().newCDPSession(touchPage)
    const b = await touchPage.locator('.nh-gcell').nth(0).boundingBox()
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await sleep(HOLD_MS) // past the threshold: the sheet is open and the finger is still down
    during = await probe(touchPage, readSelectable)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(300)
    after = await probe(touchPage, readSelectable)
  } catch (e) {
    during = { error: String(e.message).slice(0, 90) }
  }

  ok(
    'a touch hold opens the sheet with the finger still down',
    during.open === true,
    during.error ?? `open=${during.open}`
  )
  ok('nothing on the dashboard is selectable while that press lasts', during.cell === 'none', `cell=${during.cell}`)
  ok("and neither is the sheet's own text, under the finger", during.sheet === 'none', `sheet=${during.sheet}`)

  ok('lifting the finger does not close the sheet it just opened', after.open === true, `open=${after.open}`)
  ok(
    'and selection comes back the moment the press ends',
    after.sheet === 'text' && after.holding === false,
    `sheet=${after.sheet} holding=${after.holding}`
  )

  await closeSheet(touchPage)
  const mb = await touchPage.locator('.nh-gcell').nth(0).boundingBox()
  let mouseHold = {}
  if (mb) {
    await touchPage.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
    await touchPage.mouse.down()
    await sleep(HOLD_MS)
    mouseHold = await probe(touchPage, readSelectable)
    await touchPage.mouse.up()
  }
  ok(
    'a mouse hold leaves selection alone, so a drag can still select text',
    mouseHold.cell !== 'none' && mouseHold.holding === false && mouseHold.open === true,
    `cell=${mouseHold.cell} holding=${mouseHold.holding} open=${mouseHold.open}`
  )
  await touchPage.close().catch(() => {})

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} finally {
  await browser.close().catch(() => {})
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid === UID)
  ok('cleanup: dashboard removed', left.length === 0)

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
