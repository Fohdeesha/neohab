/**
 * The widget detail sheet, and the gesture that opens it.
 *
 * The gesture is the risky half. Every widget's own action runs on `click`, which fires on release
 * however long the button was held, so a hold has to REPLACE the tap rather than add to it - or a
 * slow press on a light opens the sheet AND commands the light. Two checks here exist for exactly
 * that, and both FAIL on a build without the feature, which is the point:
 *
 *   - a hold on a button opens the sheet and sends nothing;
 *   - a hold on a slider or a dial sends nothing either, and that one cannot be fixed by swallowing
 *     a click: both stage a value on pointerdown and commit it on pointer-UP, so pressing a track
 *     away from its thumb jumped the value there and then commanded it. They stage locally and send
 *     only on release, so a hold recognised in between takes the gesture and the value goes back.
 *     A tap and a drag are untouched, and both are checked here, since a fix bought by breaking the
 *     control would be no fix at all.
 *
 * The other half is what the sheet is allowed to offer. A read-only gauge and a value readout are
 * displays, and being handed a slider from one would command the very item the tile refuses to
 * command; all three widgets here bind the SAME writable item, so only the widget's own nature can
 * be deciding. Section 8 is the same question about WHICH control: the sheet used to work it out
 * from the item's state, so a slider configured 2000-6500 K came out as a 0-100 track, a
 * rollershutter got a position slider instead of up/stop/down, and a media player got no buttons
 * at all. Every widget there binds an item whose state points somewhere else, so nothing but the
 * widget's own declaration can produce the right answer. And "last changed" is answered from the
 * item on openHAB 5 and from persistence on openHAB 4, which serves no such field - checked
 * exactly, over a history this suite supplies.
 *
 * SAFE with a live config: creates and deletes exactly dashboard:nh-e2e-detail, saves NOTHING
 * through the app (so no restore point is minted), and COMMANDS NOTHING - every command the app
 * attempts is intercepted and answered by the suite, so no request reaches a real device and no
 * item state is disturbed. The item is only ever read.
 */
import { chromium } from 'playwright-core'
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
/** Never throws: a missing element must fail its own check, not abort every check after it. */
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => ({}))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

/** Reports what the detail sheet is showing, or {} when it is not open. */
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
  // The slider's own attributes, because the whole question is whether the control matches the
  // WIDGET's scale or some 0-100 guess made from the item's state.
  const range = panel.querySelector('input[type="range"]')
  return {
    open: true,
    // The header reads "<label>" with "<item name>" beneath it, or just the name when the server
    // offers no label - so both parts are reported rather than one concatenated string.
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

async function newPage(width = 1500, height = 1000) {
  const page = await browser.newPage({ viewport: { width, height } })
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
  // Nothing this suite does may reach a device: every command is answered here instead.
  await page.route('**/rest/items/**', async (route) => {
    if (route.request().method() === 'POST') {
      commands.push({ url: route.request().url(), body: route.request().postData() })
      return route.fulfill({ status: 200, body: '' })
    }
    return route.fallback()
  })
  return page
}

/** Press and hold at the centre of a locator. Returns false when it is not on screen. */
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
  // ---- seed -------------------------------------------------------------------------------
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
          // a plain command button: the case where a hold must not also command
          { id: 'w-btn', type: 'button', layout: { lg: { x: 0, y: 0, w: 3, h: 2 } }, config: { label: 'E2E Button', item: ITEMS.dimmer, command: '55', action: 'command' } },
          // a dial: stages on pointerdown, commits on pointerup - no click to swallow
          { id: 'w-dial', type: 'dial', layout: { lg: { x: 3, y: 0, w: 3, h: 2 } }, config: { label: 'E2E Dial', item: ITEMS.dimmer, min: 0, max: 100, step: 1 } },
          // bound to nothing: there is no detail to show, so no gesture is offered
          { id: 'w-clock', type: 'clock', layout: { lg: { x: 6, y: 0, w: 3, h: 2 } }, config: { label: 'E2E Clock' } },
          // two items: the sheet has to ask which one
          // period 7d, not the sheet's own default of a day: the sheet has to open on the window
          // this widget was set to.
          { id: 'w-chart', type: 'chart', layout: { lg: { x: 0, y: 2, w: 6, h: 3 } }, config: { label: 'E2E Chart', series: [{ item: ITEMS.dimmer }, { item: ITEMS.temperature }], period: '7d' } },
          // an instrument its author deliberately made uncommandable, bound to a writable item
          { id: 'w-gauge', type: 'dial', layout: { lg: { x: 6, y: 2, w: 3, h: 2 } }, config: { label: 'E2E Gauge', item: ITEMS.dimmer, style: 'arc', readOnly: true, min: 0, max: 100 } },
          // a readout: same item again, and still not a control
          { id: 'w-value', type: 'value', layout: { lg: { x: 9, y: 2, w: 3, h: 2 } }, config: { label: 'E2E Value', item: ITEMS.dimmer } },
          // a range input: the reported case, where pressing the track jumps the value there
          { id: 'w-slider', type: 'slider', layout: { lg: { x: 0, y: 5, w: 6, h: 2 } }, config: { label: 'E2E Slider', item: ITEMS.dimmer, min: 0, max: 100, step: 1 } },
          // ── section 9's widgets. Appended, so the positional locators above keep their cells.
          // Every one of these binds an item whose STATE would have produced a different control
          // from the one its author configured, which is the whole point of them.
          { id: 'w-kelvin', type: 'slider', layout: { lg: { x: 0, y: 7, w: 4, h: 2 } }, config: { label: 'E2E Kelvin', item: ITEMS.dimmer, min: 2000, max: 6500, step: 50, unit: ' K' } },
          { id: 'w-therm', type: 'dial', layout: { lg: { x: 4, y: 7, w: 4, h: 2 } }, config: { label: 'E2E Thermostat', item: ITEMS.dimmer, min: 10, max: 30, step: 0.5, unit: '°' } },
          { id: 'w-roller', type: 'rollershutter', layout: { lg: { x: 8, y: 7, w: 4, h: 2 } }, config: { label: 'E2E Roller', item: ITEMS.dimmer } },
          { id: 'w-pick', type: 'selection', layout: { lg: { x: 0, y: 9, w: 4, h: 2 } }, config: { label: 'E2E Pick', item: ITEMS.dimmer, choices: '10=Low\n50=Half\n100=Full' } },
          { id: 'w-onoff', type: 'switch', layout: { lg: { x: 4, y: 9, w: 4, h: 2 } }, config: { label: 'E2E OnOff', item: ITEMS.dimmer, onCommand: '100', offCommand: '0' } },
          { id: 'w-play', type: 'player', layout: { lg: { x: 8, y: 9, w: 4, h: 2 } }, config: { label: 'E2E Play', item: ITEMS.dimmer } },
          // ...and the real shape of the reported case: a Player item, whose PLAY/PAUSE state no
          // state sniffer can turn into a control. Read only - this one is never clicked.
          { id: 'w-tv', type: 'player', layout: { lg: { x: 0, y: 11, w: 4, h: 2 } }, config: { label: 'E2E TV', item: ITEMS.player } },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.status === 200 || seed.status === 201, 'status ' + seed.status)

  // What does THIS server serve? openHAB 5.x carries lastStateChange on the item; 4.3.7 does not,
  // and the sheet must reflect whichever it is rather than inventing a timestamp.
  const restItem = await (await fetch(BASE + '/rest/items/' + encodeURIComponent(ITEMS.dimmer), { headers: AUTH })).json().catch(() => ({}))
  const serverHasLastChange = typeof restItem?.lastStateChange === 'number'
  // And what can the history say? The same window the sheet asks for, so the two cannot disagree.
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

  // ---- 1. the gesture ---------------------------------------------------------------------
  commands.length = 0
  const held = await holdOn(page, btn)
  const afterHold = await probe(page, readSheet)
  ok('a hold on a widget opens its detail sheet', held && afterHold.open === true)
  ok(
    'the hold does not also command the item',
    commands.length === 0,
    commands.length ? commands.map((c) => c.body).join(',') : 'no commands'
  )
  // Identified either way: the label leads when the server offers one, with the item name beneath,
  // and the name alone when it does not. Both must name the item somewhere in the header.
  ok(
    'the sheet says which item it is about',
    (afterHold.head ?? '').includes(ITEMS.dimmer),
    `head="${afterHold.head ?? ''}" title="${afterHold.title ?? ''}" sub="${afterHold.sub ?? ''}"`
  )
  ok(
    'a labelled item leads with its label, not its name',
    // Nothing to prove on a server that gives this item no label; restItem is the same source the
    // app reads, so the two cannot disagree about whether there is one.
    restItem?.label ? afterHold.title === restItem.label && afterHold.sub === ITEMS.dimmer : true,
    restItem?.label ? `label="${restItem.label}" title="${afterHold.title}"` : 'item has no label on this server'
  )

  await closeSheet(page)
  const afterEsc = await probe(page, readSheet)
  // Open FIRST, then closed: "it is not open" passes for free on a build that never opens it.
  ok('Escape closes the sheet', afterHold.open === true && afterEsc.open === false)

  // A tap still does what a tap always did - the swallow must not have broken the normal path.
  commands.length = 0
  await btn.click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  const afterTap = await probe(page, readSheet)
  ok('a plain tap still sends the command', commands.length === 1, commands.map((c) => c.body).join(',') || 'none')
  ok('a plain tap does not open the sheet', afterTap.open !== true)

  // Movement means a drag, a swipe or a scroll, never a hold.
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

  // Right-click is the desktop route, and produces no click of its own to swallow.
  commands.length = 0
  const rb = await btn.boundingBox()
  await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2, { button: 'right' })
  await sleep(400)
  const afterRight = await probe(page, readSheet)
  ok('a right-click opens the sheet', afterRight.open === true)
  ok('the right-click commands nothing', commands.length === 0, commands.map((c) => c.body).join(',') || 'no commands')
  await closeSheet(page)

  // ---- 2. controls that own their pointer --------------------------------------------------
  // A range input and a dial stage a value on pointerdown and send it on pointerup, where no
  // click-swallow can reach: pressing a slider's track a long way from its thumb jumped the value
  // there and then commanded it, even when the press was meant as a hold. They stage locally and
  // send nothing until the release, so a hold recognised in between takes the gesture - the value
  // goes back and nothing is sent. The rule is now the plain one: **a hold never changes a value**,
  // while a tap and a drag are untouched.
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

  // The tap is the control: it must still set the value under the pointer, or the fix below has
  // been bought by breaking the widget.
  ok('a tap on a dial still sets the value under the pointer', tapped.length === 1, `tap=[${tapped.join(',')}]`)
  ok('a hold on a dial commands nothing', heldCmds.length === 0, `hold=[${heldCmds.join(',')}]`)
  ok('and opens the sheet instead', afterDialHold.open === true)
  await closeSheet(page)

  // The same on a slider, which is where this was reported: press the track well away from the
  // thumb, hold, and the thumb must come back with nothing sent.
  const slid = page.locator('.nh-gcell .nh-slider__input').first()
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

  // ...and a plain tap on the track still moves the value there, which is the whole point of it.
  commands.length = 0
  await page.mouse.click(farAlong.x, farAlong.y)
  await sleep(500)
  const afterTapValue = await sliderValue()
  const afterSliderTap = await probe(page, readSheet)
  ok(
    'a tap on the track still sets the value there',
    commands.length === 1 && afterTapValue !== beforeHoldValue,
    `commands=[${commands.map((c) => c.body).join(',')}] value=${afterTapValue}`
  )
  ok('a tap on the track does not open the sheet', afterSliderTap.open !== true)

  // A slow drag must not be mistaken for a hold: movement past the tolerance cancels the timer.
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

  // The touch route onto those controls is the browser's own contextmenu, raised on a long press.
  // It has to take the gesture exactly as the timer does, or a phone gets the old behaviour back.
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

  // ---- 2b. a display is a display ------------------------------------------------------------
  // The bug this answers: holding a read-only gauge handed out a slider that would have commanded
  // the item the tile deliberately refuses to command. The same question separates a readout from
  // a control, whatever each is bound to - and all three widgets here are bound to the SAME
  // writable item, so nothing but the widget's own nature can be deciding.
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

  // ---- 3. a widget bound to nothing --------------------------------------------------------
  await holdOn(page, clock)
  const afterClock = await probe(page, readSheet)
  ok('a widget with no item offers no sheet', afterClock.open !== true)
  await closeSheet(page)

  // ---- 4. what the sheet shows -------------------------------------------------------------
  commands.length = 0
  await holdOn(page, btn)
  const sheet = await probe(page, readSheet)
  ok('the sheet shows the current state', sheet.labels?.includes('State'), (sheet.labels ?? []).join(', '))
  // A button sends one particular command, so that is what its sheet offers - not a slider over a
  // range its author never asked for. (Section 8 is where the ranges are checked.)
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
  // A history section either plots or explains why it cannot; a blank box is the failure.
  await sleep(2500)
  const withHistory = await probe(page, readSheet)
  ok(
    'the sheet shows history, or says why it cannot',
    withHistory.canvases >= 1 || /persistence/i.test(withHistory.chartText ?? ''),
    `canvases=${withHistory.canvases} text=${(withHistory.chartText ?? '').slice(0, 60)}`
  )

  // "Last changed" comes from the item on openHAB 5 and from persistence on openHAB 4, which
  // serves no such field. So the row is expected exactly when one of those two has an answer, and
  // both are asked here over REST rather than assumed.
  const hasRow = (withHistory.labels ?? []).includes('Last changed')
  const expectRow = serverHasLastChange || storedRows > 0
  ok(
    'when did it last change: answered from the item, or from the history when the server has no field',
    hasRow === expectRow,
    `field=${serverHasLastChange} storedRows=${storedRows} sheet=${hasRow} value="${withHistory.changed}"`
  )

  // The control has to actually drive the item, and with the widget's own command.
  commands.length = 0
  await page.locator('.nh-detail__panel .nh-quickbtns button').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  ok(
    'the sheet\'s control commands the item',
    commands.length === 1 && (commands[0].body ?? '').trim() === '55',
    commands.map((c) => c.body).join(',') || 'none'
  )
  await closeSheet(page)

  // clicking the scrim outside the panel closes it too
  await holdOn(page, btn)
  const beforeScrim = await probe(page, readSheet)
  await page.mouse.click(6, 6)
  await sleep(300)
  const afterScrim = await probe(page, readSheet)
  ok('clicking outside the sheet closes it', beforeScrim.open === true && afterScrim.open === false)

  // ---- 5. a widget with several items ------------------------------------------------------
  commands.length = 0
  await holdOn(page, chart)
  const picker = await probe(page, readSheet)
  ok('a widget with several items asks which one', (picker.picks ?? []).length === 2, (picker.picks ?? []).join(', '))
  await page.locator('.nh-detail__pickrow', { hasText: ITEMS.temperature }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const chosen = await probe(page, readSheet)
  ok('choosing one opens its detail', (chosen.head ?? '').includes(ITEMS.temperature), chosen.head ?? '(none)')
  // ...on the window this chart was set to, rather than starting the reader back at a day.
  await sleep(1200)
  const withChip = await probe(page, readSheet)
  ok('the history opens on the widget\'s own range', withChip.chip === '7d', withChip.chip || '(no active chip)')
  await closeSheet(page)

  // ---- 6. edit mode is unchanged -----------------------------------------------------------
  await page.click('[aria-label="Edit dashboard"]').catch(() => {})
  await page.waitForSelector('.nh-grid--edit', { timeout: 10000 }).catch(() => {})
  await sleep(600)
  commands.length = 0
  await holdOn(page, page.locator('.nh-grid--edit .nh-cell').nth(0))
  const inEdit = await probe(page, readSheet)
  ok('editing still means editing: no detail sheet there', inEdit.open !== true)
  await page.click('button:has-text("Exit")').catch(() => {})
  await sleep(700)

  // ---- 7. a view-only visitor ---------------------------------------------------------------
  // Editing is administrators-only, but this is a VIEWING feature: a visitor may already read
  // states and work the controls on the dashboard, so the sheet must not be gated behind a
  // sign-in. Everything it reads (the item, its history) is USER-role on both openHAB lines.
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

  // ---- 7b. when the server serves no change timestamp ----------------------------------------
  // openHAB 4.3.7 has no lastStateChange, so the answer is walked out of persistence. Both the
  // item response and the history are answered here, which makes this identical on either openHAB
  // line and exact rather than "whatever this server happens to hold".
  const NAME_RE = new RegExp('/rest/items/' + ITEMS.dimmer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\?|$)')
  const strippedItem = { ...restItem }
  delete strippedItem.lastState
  delete strippedItem.lastStateUpdate
  delete strippedItem.lastStateChange

  /** Open the sheet on a page where the server answers with exactly this history. */
  async function sheetOverHistory(rows) {
    const p = await newPage()
    const asked = []
    // Registered after newPage's, so this one runs first and passes anything else back to it.
    await p.route(NAME_RE, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(strippedItem) })
    })
    await p.route('**/rest/persistence/items/**', async (route) => {
      const url = route.request().url()
      // The sheet's own question, told apart from the chart's: a boundary sample and no end time.
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

  // A guard rather than a discriminator: it also passes on a build with no such row at all, and
  // is here so that "nothing stored" can never become an invented timestamp.
  const nothing = await sheetOverHistory([])
  ok(
    'with nothing stored, nothing is invented',
    nothing.sheet.open === true && !(nothing.sheet.labels ?? []).includes('Last changed'),
    `open=${nothing.sheet.open} labels=${(nothing.sheet.labels ?? []).join(',')}`
  )

  // ---- 8. the control is the WIDGET's, not a guess from the item ----------------------------
  // Reported: holding a slider gave "completely wild and different ranges", and holding a media
  // player gave no transport buttons at all. Both are the same cause - the sheet worked the
  // control out from the item's STATE, which threw away everything the author had configured.
  // Every widget below binds an item whose state points somewhere else, so nothing but the
  // widget's own declaration can produce the right answer.
  const sheets = {}
  /** The cell whose header carries this name, so this section does not depend on cell order. */
  const cellNamed = (p, name) =>
    p
      .locator('.nh-gcell')
      .filter({ has: p.locator('.nh-widget__labeltext', { hasText: new RegExp('^' + name + '$') }) })
      .first()

  /** Open one widget's sheet and report what control it offered. */
  async function sheetOf(name) {
    await closeSheet(page)
    const cell = cellNamed(page, name)
    await cell.scrollIntoViewIfNeeded().catch(() => {})
    const box = await cell.boundingBox().catch(() => null)
    if (!box) return {}
    // Right-click rather than a hold: it reaches a control that owns its pointer without any
    // timing, and section 2 has already proved the hold route opens the same sheet.
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
  // The value it would actually send, which is the harm: on the old rule this track ran 0-100 and
  // commanded a number the lamp could do nothing with.
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

  // A rollershutter's state is a percentage, so the old rule offered a position slider - which on
  // a garage door is a real door moving to wherever the track was pressed.
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

  // Jon's report: "it only has on off for switches, it does not have custom buttons, for example
  // the tv play pause". A Player item holds PLAY or PAUSE, which is not a shape anything can guess.
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

  // A selection's choices are the commands the item accepts; a slider over them is not a control,
  // it is a way to send something the item has never heard of.
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

  // A switch does not always mean ON and OFF.
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

  // A control section with nothing inside it is a box that says nothing, which is what a media
  // player used to get. Checked over every sheet this section opened. A guard rather than a
  // discriminator on every target: it needs a Player item that actually holds PLAY or PAUSE, and
  // on a server where that item is NULL the old rule drew no box either.
  const empty = Object.entries(sheets)
    .filter(([, s]) => s.control === true && s.ranges === 0 && (s.buttons ?? []).length === 0)
    .map(([name]) => name)
  ok('no sheet showed an empty control box', empty.length === 0, empty.join(', ') || 'none empty')
  await closeSheet(page)

  // ---- 9. the phone shape ------------------------------------------------------------------
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
