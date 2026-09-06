/**
 * The colour widget's on and off buttons.
 *
 * The feature rests on a fact about openHAB rather than on anything stored: a Color item maps OFF
 * onto `H,S,0` and ON onto `H,S,100` (ColorItem.setState, and measured on 4.3.7 and 5.2.1 alike).
 * So switching a lamp off keeps its colour for free, and the ONE thing openHAB does not keep - the
 * brightness - is remembered on the device. Section B proves that end to end: a lamp at 40% comes
 * back at 40%, where a plain ON would have brought it back at 100%.
 *
 * Driven against an item this suite creates itself, with no device behind it, so the commands are
 * real, the openHAB state semantics are the real ones, and nothing in the house moves.
 *
 * SAFE with a live config. Creates and deletes exactly:
 *   - dashboard:nh-e2e-colorpower   (neohab:config)
 *   - managed item nh_e2e_pwr       (never a file-provided item)
 * Commands nothing else.
 */
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-colorpower'
const ITEM = 'nh_e2e_pwr'
const HOLD_MS = 800 // comfortably past the 500ms threshold

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (v) =>
  fetch(itemUrl(ITEM) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const readState = () =>
  fetch(itemUrl(ITEM) + '/state', { headers: AUTH })
    .then((r) => r.text())
    .catch(() => '<unreadable>')

/** Read the page through a shape that cannot throw, so a missing feature fails its own checks. */
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

/** Wait for the item to reach a state, so a check reads the settled value rather than a race. */
async function stateSettles(want, ms = 5000) {
  const until = Date.now() + ms
  let last = ''
  while (Date.now() < until) {
    last = await readState()
    if (last === want) return last
    await sleep(120)
  }
  return last
}

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

/**
 * One widget's picker, found by the name on it - cells carry no id in the DOM, and a positional
 * selector would drift the moment the seed gains a widget. Works in both surfaces, since the
 * editor draws `.nh-cell` where run mode draws `.nh-gcell`.
 */
const readButtons = (label) => {
  const host = [...document.querySelectorAll('.nh-gcell, .nh-cell')].find(
    (c) => c.querySelector('.nh-widget__labeltext')?.textContent?.trim() === label
  )
  if (!host) return { found: false }
  const picker = host.querySelector('.nh-color')
  const swatch = host.querySelector('.nh-color__swatch')
  const channels = host.querySelector('.nh-color__channels')
  const btns = [...host.querySelectorAll('.nh-color__pbtn')]
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  return {
    found: true,
    count: btns.length,
    labels: btns.map((b) => b.textContent.trim()),
    pressed: btns.map((b) => b.getAttribute('aria-pressed')),
    disabled: btns.map((b) => b.disabled),
    ink: btns.map((b) => getComputedStyle(b).color),
    // What is REALLY behind each button, which is a geometric question and not a DOM one: the
    // buttons are a grid item OVERLAPPING the swatch, not a child of it, so walking up the
    // ancestors goes straight past the colour they are drawn on and lands on the tile's surface.
    // That is what made a legible dark-on-amber button measure 1.1:1.
    //
    // So: the button's own background (translucent, and a color-mix that Chromium serialises as
    // color(srgb ...)) composited over the swatch where their boxes overlap, and over the nearest
    // opaque ancestor where they do not - which is the short-tile layout.
    bg: btns.map((b) => {
      const read = (v) => {
        let m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(v)
        if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
        m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: *\/ *([\d.]+))?/.exec(v)
        if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])]
        return null
      }
      // source-over, both sides premultiplied, so a translucent plate over a colour is the colour
      // an eye would see rather than either one of them.
      const over = (top, bottom) => {
        const a = top[3] + (1 - top[3]) * bottom[3]
        if (a <= 0) return [0, 0, 0, 0]
        return [0, 1, 2]
          .map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a)
          .concat(a)
      }
      const bb = b.getBoundingClientRect()
      const sw = host.querySelector('.nh-color__swatch')
      const swr = sw && getComputedStyle(sw).display !== 'none' ? sw.getBoundingClientRect() : null
      const onSwatch =
        !!swr && bb.left < swr.right && bb.right > swr.left && bb.top < swr.bottom && bb.bottom > swr.top

      const stack = [b]
      if (onSwatch) stack.push(sw)
      for (let el = onSwatch ? sw.parentElement : b.parentElement; el; el = el.parentElement) stack.push(el)

      // A solid colour painted as a one-stop gradient sits ABOVE that element's own background
      // colour, so it goes on the stack first. Reading only backgroundColor would report the base
      // under an opaque plate and measure the text against a colour nobody sees.
      const layersOf = (el) => {
        const cs = getComputedStyle(el)
        const grad = /linear-gradient\((rgba?\([^)]*\)|color\(srgb[^)]*\))/.exec(cs.backgroundImage)
        return [grad ? read(grad[1]) : null, read(cs.backgroundColor)]
      }

      let out = [0, 0, 0, 0]
      for (const el of stack) {
        for (const layer of layersOf(el)) {
          if (!layer) continue
          out = over(out, layer)
        }
        if (out[3] >= 0.999) break
      }
      return 'rgb(' + out.slice(0, 3).map(Math.round).join(', ') + ')'
    }),
    boxes: btns.map(box),
    swatchShown: swatch ? getComputedStyle(swatch).display !== 'none' : false,
    swatchBox: box(swatch),
    swatchBg: swatch ? getComputedStyle(swatch).backgroundColor : '',
    channelsBox: box(channels),
    cellBox: box(host),
    // The tile's own vertical inset, which is where the room for a stack in a short tile comes
    // from, and which is given back only to a picker that has the buttons.
    bodyPad: (() => {
      const body = host.querySelector('.nh-widget__body')
      return body ? parseFloat(getComputedStyle(body).paddingTop) : undefined
    })(),
    aside: picker ? picker.className.includes('nh-color--aside') : false,
    sliders: host.querySelectorAll('.nh-color__track').length,
  }
}

/** Everything the sheet's colour picker offers, so a long press can be compared with its tile. */
const readSheetPicker = () => {
  const panel = document.querySelector('.nh-detail__panel')
  if (!panel) return { open: false }
  return {
    open: true,
    pickers: panel.querySelectorAll('.nh-color').length,
    buttons: [...panel.querySelectorAll('.nh-color__pbtn')].map((b) => b.textContent.trim()),
  }
}

/* WCAG contrast, so "readable on any swatch colour" is measured rather than eyeballed. */
const parseRgb = (s) => {
  const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(String(s))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
const luminance = (rgb) => {
  const lin = rgb.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}
/** The same colour, allowing for the rounding in an HSB to RGB conversion. */
const sameRgb = (a, b) => {
  const ra = parseRgb(a)
  const rb = parseRgb(b)
  return !!ra && !!rb && ra.every((v, i) => Math.abs(v - rb[i]) <= 3)
}

const contrast = (a, b) => {
  const ra = parseRgb(a)
  const rb = parseRgb(b)
  if (!ra || !rb) return 0
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const errs = []
/** Every command the app sent, so a check can assert both what went out and that nothing did. */
const commands = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
/** Counted and PASSED THROUGH: the item has nothing behind it, so the round trip is the real one. */
const watchCommands = (p) =>
  p.route('**/rest/items/**', async (r) => {
    if (r.request().method() === 'POST') commands.push(r.request().postData())
    return r.continue()
  })
await watchCommands(page)
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
    localStorage.setItem('neohab:language', 'en')
  } catch {}
}, TOKEN)

/** Everything commanded since the last call, and clears the log. */
const sent = () => commands.splice(0, commands.length)

try {
  /* ---------------- seed ---------------- */
  await fetch(itemUrl(ITEM), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Color', name: ITEM, label: 'NH E2E Power Lamp' }),
  })
  await putState('288,55,40')
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const widget = (id, label, extra, x, y, h) => ({
    id,
    type: 'color',
    config: { item: ITEM, label, ...extra },
    layout: { lg: { x, y, w: 4, h } },
  })
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-colorpower',
        name: 'E2E Colour Power',
        columns: 12,
        // Fixed rather than 'match', so the short-tile checks get the heights they are about
        // whatever width the browser happens to have - and a fixed row height pins the text scale
        // at 1, so a cell font is 16px and the em thresholds land where these comments say.
        // 40px rows and 8px gaps, so a tile of h rows is 48h - 8 px tall.
        rowHeight: 40,
        gap: 8,
        widgets: [
          widget('w-pwr', 'Lamp', { powerButtons: true }, 0, 0, 8), // 376px: stacked on the swatch
          widget('w-plain', 'Plain', { powerButtons: false }, 4, 0, 8), // the box unticked
          widget('w-tight', 'Tight', { powerButtons: true }, 8, 0, 4), // 184px: stacked on a tightened swatch
          widget('w-mid', 'Mid', { powerButtons: true }, 8, 4, 3), // 136px: swatch too short even for that
          widget('w-short', 'Short', { powerButtons: true }, 8, 7, 2), // 88px: swatch shed entirely
          // A plain picker at the SAME height as the tight one: the tile insets are given back to
          // a picker that has the buttons and to nothing else, and this is what says so.
          widget('w-tightplain', 'TightPlain', { powerButtons: false }, 0, 8, 4),
          // Two SHORT tiles, one of each: a stacked row takes the widget's own floor when the
          // dashboard asks for less than that, and 2 rows of 40px asks for a lot less. Anything
          // taller than the floor would hide the difference, which is what the first draft of the
          // check did - both tiles were 320px and it compared the seed with itself.
          widget('w-shortplain', 'ShortPlain', { powerButtons: false }, 0, 13, 2),
          // Storing NOTHING is the interesting case: the buttons are the widget's default, so a
          // picker made without touching the setting has them - and the row beneath it on a phone
          // has to be the height that fits them, which is a different code path from the drawing.
          widget('w-default', 'Default', {}, 4, 13, 8),
          widget('w-shortdefault', 'ShortDefault', {}, 6, 15, 2),
          // Narrow, at both of the heights that put the buttons somewhere different: the pair has
          // to fit a swatch this wide, and beside the sliders it must not eat the width they need.
          { ...widget('w-nrow', 'NarrowTight', { powerButtons: true }, 4, 8, 4), layout: { lg: { x: 4, y: 8, w: 1, h: 4 } } },
          { ...widget('w-narrow', 'Narrow', { powerButtons: true }, 5, 8, 3), layout: { lg: { x: 5, y: 8, w: 1, h: 3 } } },
          // Anything at all can be in a stored config, and only `true` may switch a control on.
          widget('w-hostile', 'Hostile', { powerButtons: 'yes' }, 6, 8, 5),
        ],
      },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-colorpower')
  await page.waitForSelector('.nh-color input[type=range]', { timeout: 20000 })
  await sleep(1200) // the first states arrive and the optimistic layer settles

  /** Click a button by where it actually is, which needs no selector for an id-less cell. */
  const pressBtn = async (label, which, target = page) => {
    const r = await probe(target, readButtons, label)
    const b = r?.boxes?.[which === 'off' ? 0 : 1]
    if (!b) return false
    await target.mouse.click(b.x + b.w / 2, b.y + b.h / 2)
    return true
  }

  /* ---------------- A. the setting decides, and only `true` counts ---------------- */
  const pwr = await probe(page, readButtons, 'Lamp')
  ok('a widget that asked for them draws two buttons', pwr?.count === 2, 'count=' + (pwr?.count ?? 'none'))
  ok(
    'off is above on, and both are named',
    JSON.stringify(pwr?.labels) === JSON.stringify(['Off', 'On']),
    JSON.stringify(pwr?.labels)
  )
  ok('the picker still has its three sliders', pwr?.sliders === 3, 'sliders=' + pwr?.sliders)

  // Each of these says "none here" against "two there" on the same page, or it would pass just as
  // happily on a build that draws them nowhere - which is what the control run showed.
  const plain = await probe(page, readButtons, 'Plain')
  ok(
    'a picker with the box unticked draws none',
    pwr?.count === 2 && plain?.count === 0,
    'powered=' + pwr?.count + ' plain=' + plain?.count
  )

  // The default, which is what a widget dragged out of the palette gets.
  const dflt = await probe(page, readButtons, 'Default')
  ok(
    'a picker that stores nothing draws them anyway',
    dflt?.count === 2 && dflt?.aside === true && plain?.count === 0,
    'default=' + dflt?.count + ' aside=' + dflt?.aside + ' unticked=' + plain?.count
  )
  ok(
    'and is not switched into the buttons layout at all',
    pwr?.aside === true && plain?.aside === false,
    'powered=' + pwr?.aside + ' plain=' + plain?.aside
  )
  ok('the plain picker keeps its swatch and sliders', plain?.swatchShown === true && plain?.sliders === 3)

  const hostile = await probe(page, readButtons, 'Hostile')
  ok(
    'a stored "yes" is not true, so no buttons appear',
    pwr?.count === 2 && hostile?.count === 0,
    'powered=' + pwr?.count + ' hostile=' + hostile?.count
  )

  /* Where they were asked for: in the top box that shows the color, at its right-hand end. */
  const inside =
    pwr?.boxes?.length === 2 &&
    pwr.swatchBox &&
    pwr.boxes.every(
      (b) =>
        b.x >= pwr.swatchBox.x - 1 &&
        b.x + b.w <= pwr.swatchBox.x + pwr.swatchBox.w + 1 &&
        b.y >= pwr.swatchBox.y - 1 &&
        b.y + b.h <= pwr.swatchBox.y + pwr.swatchBox.h + 1
    )
  ok('both buttons sit inside the swatch', inside, JSON.stringify({ swatch: pwr?.swatchBox, btns: pwr?.boxes }))
  // [].every() is true, so the count comes first: without it this passed with no buttons at all.
  const rightEnd =
    pwr?.boxes?.length === 2 &&
    pwr.swatchBox &&
    pwr.boxes.every((b) => pwr.swatchBox.x + pwr.swatchBox.w - (b.x + b.w) <= 14)
  ok('at its right-hand end', rightEnd, JSON.stringify(pwr?.boxes?.map((b) => b.x + b.w)))
  ok(
    'stacked, off above on',
    pwr?.boxes?.length === 2 && pwr.boxes[0].y + pwr.boxes[0].h <= pwr.boxes[1].y + 1,
    JSON.stringify(pwr?.boxes?.map((b) => b.y))
  )

  /* ---------------- B. the round trip, against real openHAB semantics ---------------- */
  // The lamp is lit at 288,55,40 and this page has watched it there, so the memory holds 40.
  ok('while the lamp is lit, On is the one in effect', pwr?.pressed?.[1] === 'true', JSON.stringify(pwr?.pressed))

  sent()
  await pressBtn('Lamp', 'off')
  await sleep(300)
  const offSent = sent()
  ok('Off sends OFF, not a triple of zeroes', JSON.stringify(offSent) === JSON.stringify(['OFF']), JSON.stringify(offSent))

  const afterOff = await stateSettles('288,55,0')
  ok('so openHAB keeps the hue and saturation and only darkens it', afterOff === '288,55,0', 'state=' + afterOff)
  // The point of sending OFF rather than 0,0,0: every other UI still shows what it comes back to.
  // Dark AND still purple. The first half is what makes this fail on a lamp nothing switched off.
  ok(
    'the colour is still on the item while it is off',
    afterOff.endsWith(',0') && afterOff.startsWith('288,55,'),
    'state=' + afterOff
  )

  await sleep(400)
  const whenOff = await probe(page, readButtons, 'Lamp')
  ok(
    'the highlight moves to Off',
    whenOff?.pressed?.[0] === 'true' && whenOff?.pressed?.[1] === 'false',
    JSON.stringify(whenOff?.pressed)
  )

  sent()
  await pressBtn('Lamp', 'on')
  await sleep(300)
  const onSent = sent()
  ok(
    'On sends back the brightness it was last seen at',
    JSON.stringify(onSent) === JSON.stringify(['288,55,40']),
    JSON.stringify(onSent)
  )

  const afterOn = await stateSettles('288,55,40')
  // Both halves, because "it is still 288,55,40" is also true of a lamp nothing ever switched off.
  const wentOff = afterOff === '288,55,0'
  ok('the lamp comes back exactly as it was', wentOff && afterOn === '288,55,40', 'off=' + afterOff + ' on=' + afterOn)
  // The check with teeth: openHAB's own ON is defined as H,S,100, so a build that simply sent ON
  // lands here at 288,55,100, and this is the number that tells the two apart.
  ok(
    'and not at full brightness, which a plain ON would have given',
    wentOff && !afterOn.endsWith(',100'),
    'off=' + afterOff + ' on=' + afterOn
  )

  /* A second value, so the memory is following the lamp rather than holding one constant. */
  // Past SETTLE_MS (8s), not merely past the paint. Inside that window the picker deliberately
  // holds the colour it last COMMANDED - that is what stops a device's mid-fade echo yanking the
  // other two sliders - so a value put on the item 1.2s after a press is legitimately not what the
  // control is showing yet, and On would restore the hue on screen rather than the one just set.
  await putState('120,80,17')
  await sleep(9000)
  sent()
  await pressBtn('Lamp', 'off')
  const off2 = await stateSettles('120,80,0')
  await sleep(300)
  await pressBtn('Lamp', 'on')
  const afterOn2 = await stateSettles('120,80,17')
  const roundTrip = sent()
  ok(
    'a different brightness is remembered as itself',
    off2 === '120,80,0' && afterOn2 === '120,80,17',
    'off=' + off2 + ' on=' + afterOn2
  )
  ok('and one command went out each way', roundTrip.length === 2, JSON.stringify(roundTrip))

  /* ---------------- C. a device that has never seen it lit ---------------- */
  // Nothing stored and nothing observed: On falls back to openHAB's own answer for ON rather than
  // to an invented number.
  await putState('200,60,0')
  await sleep(600)
  const fresh = await context.newPage()
  await watchCommands(fresh)
  await fresh.addInitScript(() => {
    try {
      localStorage.removeItem('neohab:lastLit')
    } catch {}
  })
  await fresh.goto(APP + '#/d/nh-e2e-colorpower')
  await fresh.waitForSelector('.nh-color__pbtn', { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  sent()
  const pressedFresh = await pressBtn('Lamp', 'on', fresh)
  await sleep(300)
  const freshOn = sent()
  ok(
    'a device that never saw it lit falls back to full brightness',
    pressedFresh && JSON.stringify(freshOn) === JSON.stringify(['200,60,100']),
    JSON.stringify(freshOn)
  )
  await fresh.close()
  await stateSettles('200,60,100')

  /* ---------------- D. the same two colours whatever the lamp is doing ---------------- */
  // The buttons take the theme's colours and keep them: an earlier build derived the ink from the
  // swatch, so the pair flipped between white and near-black as the lamp brightened - readable at
  // every step and impossible to learn. Four swatches from near-black to near-white, because an
  // opaque button reads the same on all of them and anything let through would not.
  // Past SETTLE_MS from the last press, or the first sample reads the colour the picker is still
  // holding from section B rather than the one just put on the item.
  await sleep(9000)
  const seen = []
  for (const [name, state, expect] of [
    ['near-black', '240,90,4', 'rgb(1, 1, 10)'],
    ['near-white', '50,4,98', 'rgb(250, 248, 240)'],
    ['mid amber', '40,90,85', 'rgb(217, 152, 22)'],
    ['deep blue', '220,90,35', 'rgb(9, 39, 89)'],
  ]) {
    await putState(state)
    // Past the 1500ms window useSteadyValue holds the start of a burst for, or this reads the
    // colour BEFORE it - which is what the first run of this section did.
    await sleep(2200)
    const r = await probe(page, readButtons, 'Lamp')
    // Each button against what is actually behind IT: the active one has a plate of its own. And
    // "behind" is geometric, not a walk up the ancestors, which goes past the swatch entirely.
    const idle = contrast(r?.ink?.[0], r?.bg?.[0])
    const active = contrast(r?.ink?.[1], r?.bg?.[1])
    ok(
      'a button can be read on a ' + name + ' swatch',
      // The swatch really is the colour asked for, or the contrast is about some other colour.
      r?.count === 2 && sameRgb(r.swatchBg, expect) && idle >= 4.5 && active >= 4.5,
      'idle=' + idle.toFixed(1) + ' active=' + active.toFixed(1) + ' swatch=' + r?.swatchBg + ' wanted=' + expect
    )
    if (r?.count === 2) seen.push({ name, ink: r.ink, bg: r.bg })
  }
  const first = seen[0]
  const differs = seen.filter((s) => JSON.stringify(s.ink) !== JSON.stringify(first.ink) || JSON.stringify(s.bg) !== JSON.stringify(first.bg))
  ok(
    'the buttons are the same two colours on every one of them',
    seen.length === 4 && differs.length === 0,
    seen.length === 4
      ? differs.length
        ? differs.map((d) => d.name + ' ' + d.bg[0] + '/' + d.ink[0]).join(' | ') + ' vs ' + first.name + ' ' + first.bg[0] + '/' + first.ink[0]
        : first.bg[0] + ' ink ' + first.ink[0] + ', active ' + first.bg[1] + ' ink ' + first.ink[1]
      : 'only ' + seen.length + ' swatches read'
  )

  /* ---------------- E. shorter tiles keep the buttons, and keep them on the swatch ------------ */
  // The buttons belong on the swatch, so they stay there as the tile shrinks: first standing up,
  // then lying down. They leave only when the swatch is too short to hold a single row without
  // being drawn over the top of the hue slider, and there a colour tile must still be able to
  // switch the lamp off, so they go beside the sliders rather than going with the swatch.
  const onSwatch = (r) =>
    r?.boxes?.length === 2 &&
    !!r.swatchBox &&
    r.boxes.every(
      (b) =>
        b.y >= r.swatchBox.y - 1 &&
        b.y + b.h <= r.swatchBox.y + r.swatchBox.h + 1 &&
        b.x >= r.swatchBox.x - 1 &&
        b.x + b.w <= r.swatchBox.x + r.swatchBox.w + 1
    )

  const tight = await probe(page, readButtons, 'Tight')
  ok('a tile too short for a comfortable stack keeps both buttons', tight?.count === 2, 'count=' + (tight?.count ?? 'none'))
  ok(
    'standing one above the other on the swatch, off on top',
    onSwatch(tight) && tight.boxes[0].y + tight.boxes[0].h <= tight.boxes[1].y + 1,
    JSON.stringify({ swatch: tight?.swatchBox, btns: tight?.boxes })
  )
  ok(
    'at the right-hand end of it, with the sliders still spanning the tile',
    onSwatch(tight) &&
      tight.boxes.every((b) => tight.swatchBox.x + tight.swatchBox.w - (b.x + b.w) <= 14) &&
      tight.channelsBox.w >= tight.swatchBox.w - 1,
    JSON.stringify({
      ends: tight?.boxes?.map((b) => b.x + b.w),
      sliders: tight?.channelsBox?.w,
      swatch: tight?.swatchBox?.w,
    })
  )
  // What a threshold set too low would produce: a pair still in the swatch's grid row while being
  // drawn across the top slider.
  ok(
    'and clear of the sliders underneath',
    tight?.channelsBox && tight.boxes?.length === 2 && tight.boxes.every((b) => b.y + b.h <= tight.channelsBox.y + 1),
    JSON.stringify({ btns: tight?.boxes?.map((b) => b.y + b.h), sliders: tight?.channelsBox?.y })
  )
  // The room for it comes out of the tile's own insets, and only for a picker that has the
  // buttons. A plain one at the same height is what proves the scoping: without it this would
  // pass just as well on a build that tightened every widget in the dashboard.
  const tightPlain = await probe(page, readButtons, 'TightPlain')
  ok(
    'the tile gives its insets back to the pair, and to no other picker',
    tight?.bodyPad !== undefined &&
      tightPlain?.bodyPad !== undefined &&
      tight.bodyPad < tightPlain.bodyPad &&
      tight.swatchBox.h > tightPlain.swatchBox.h,
    JSON.stringify({
      powered: { pad: tight?.bodyPad, swatch: tight?.swatchBox?.h },
      plain: { pad: tightPlain?.bodyPad, swatch: tightPlain?.swatchBox?.h },
    })
  )

  const mid = await probe(page, readButtons, 'Mid')
  ok('a tile too short even for that still has them', mid?.count === 2, 'count=' + (mid?.count ?? 'none'))
  ok('and still draws the swatch above them', mid?.swatchShown === true, 'swatchShown=' + mid?.swatchShown)
  ok(
    'with the buttons beside the sliders instead',
    mid?.channelsBox && mid?.boxes?.[0] && mid.boxes[0].x >= mid.channelsBox.x + mid.channelsBox.w - 1,
    JSON.stringify({ channels: mid?.channelsBox, btn: mid?.boxes?.[0] })
  )

  const short = await probe(page, readButtons, 'Short')
  ok('a tile too short for the swatch still has them', short?.count === 2, 'count=' + (short?.count ?? 'none'))
  ok('the swatch really is shed there', short?.swatchShown === false, 'swatchShown=' + short?.swatchShown)
  ok(
    'beside the three sliders, which are all still there',
    short?.sliders === 3 && short?.boxes?.[0] && short.boxes[0].x >= short.channelsBox.x + short.channelsBox.w - 1,
    JSON.stringify({ sliders: short?.sliders, channels: short?.channelsBox, btn: short?.boxes?.[0] })
  )

  // A narrow tile is where the pair and the sliders compete for width. Standing up it needs only
  // one button's width, so it stays on the swatch and the sliders keep the tile.
  const nrow = await probe(page, readButtons, 'NarrowTight')
  ok(
    'a narrow tile still stacks it on the swatch',
    onSwatch(nrow) && nrow.boxes[0].y + nrow.boxes[0].h <= nrow.boxes[1].y + 1,
    JSON.stringify({ cell: nrow?.cellBox?.w, swatch: nrow?.swatchBox, btns: nrow?.boxes })
  )

  // Beside the sliders, the sliders are the control; the buttons must not squeeze them out of
  // usefulness.
  const narrow = await probe(page, readButtons, 'Narrow')
  ok(
    'in a narrow short tile the sliders keep most of the width',
    narrow?.count === 2 &&
      narrow.channelsBox &&
      narrow.channelsBox.w >= narrow.cellBox.w * 0.5 &&
      narrow.channelsBox.w >= 60,
    JSON.stringify({ cell: narrow?.cellBox?.w, sliders: narrow?.channelsBox?.w, btns: narrow?.boxes?.[0]?.w })
  )

  // The face is bigger than the tile's own text, and bigger in the tight tile than the 20px it
  // used to be there, without reaching the size a tall tile draws.
  ok(
    'the pair is drawn at a size worth pressing',
    tight?.boxes?.[0] && tight.boxes[0].h >= 22 && tight.boxes[0].h <= 25 && pwr?.boxes?.[0]?.h >= 26,
    JSON.stringify({ tight: tight?.boxes?.[0]?.h, tall: pwr?.boxes?.[0]?.h })
  )

  /* ---------------- E2. a phone's row is 150px, so the widget asks for more ---------------- */
  // Nothing in a dashboard decides the height of a stacked row: it is the widget's own floor, and
  // 150px of it leaves a 27px swatch, which is enough for the sliders and a colour to look at and
  // not enough to stand two buttons on. A picker showing them asks for the height they need, since
  // the alternative is taking it from the sliders. Driven at a real phone width, where the app
  // stacks whatever the dashboard's columns say.
  await page.setViewportSize({ width: 393, height: 852 })
  await sleep(900)
  const phonePowered = await probe(page, readButtons, 'Short')
  const phonePlain = await probe(page, readButtons, 'ShortPlain')
  ok(
    'a stacked colour row with the buttons is taller than one without',
    phonePowered?.cellBox && phonePlain?.cellBox && phonePowered.cellBox.h > phonePlain.cellBox.h,
    JSON.stringify({ powered: phonePowered?.cellBox?.h, plain: phonePlain?.cellBox?.h })
  )
  ok(
    'and the pair stands on its swatch there too',
    onSwatch(phonePowered) && phonePowered.boxes[0].y + phonePowered.boxes[0].h <= phonePowered.boxes[1].y + 1,
    JSON.stringify({ swatch: phonePowered?.swatchBox, btns: phonePowered?.boxes })
  )
  ok(
    'with all three sliders at their usual size under it',
    phonePowered?.sliders === 3 && phonePlain?.channelsBox && phonePowered.channelsBox.h === phonePlain.channelsBox.h,
    JSON.stringify({ sliders: phonePowered?.sliders, powered: phonePowered?.channelsBox?.h, plain: phonePlain?.channelsBox?.h })
  )
  // The floor is asked of the widget by the grid, which passes the STORED config, while the tile
  // renders from that config under the definition's defaults. A picker storing nothing has to get
  // the same row height as one storing `true`, or the buttons are drawn into a row sized for a
  // picker without them.
  const phoneDefault = await probe(page, readButtons, 'ShortDefault')
  ok(
    'a row for a picker that stores nothing is the taller one too',
    phoneDefault?.cellBox && phonePowered?.cellBox && phoneDefault.cellBox.h === phonePowered.cellBox.h && phoneDefault.count === 2,
    JSON.stringify({ default: phoneDefault?.cellBox?.h, powered: phonePowered?.cellBox?.h, plain: phonePlain?.cellBox?.h })
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await sleep(900)

  // Nothing may hang outside its own tile at any of these sizes - the class this project has hit in
  // a weather panel, a player's transport and a clock.
  const spills = []
  let measured = 0
  for (const label of ['Lamp', 'Tight', 'Mid', 'Short', 'NarrowTight', 'Narrow']) {
    const r = await probe(page, readButtons, label)
    if (!r?.cellBox) continue
    for (const b of [...(r.boxes ?? []), r.channelsBox].filter(Boolean)) {
      measured++
      const past = Math.max(b.x + b.w - (r.cellBox.x + r.cellBox.w), b.y + b.h - (r.cellBox.y + r.cellBox.h))
      if (past > 1) spills.push(label + ' past by ' + Math.round(past))
    }
  }
  // Eighteen boxes: two buttons and a slider stack in each of the six tiles. Counted, so "nothing
  // spilled" cannot quietly mean "there was nothing to spill".
  ok(
    'nothing hangs outside its tile at any of those shapes',
    measured === 18 && spills.length === 0,
    'measured=' + measured + ' ' + spills.join(', ')
  )

  /* ---------------- F. every built-in theme ---------------- */
  // A theme restyles buttons, so the pair has to stay legible and inside its tile in all of them.
  const THEMES = ['dark', 'light', 'oled', 'aqua', 'swiss', 'swiss-light', 'ember', 'lcd', 'ops', 'assembly']
  await putState('288,55,40')
  await sleep(800)
  const themeTrouble = []
  for (const theme of THEMES) {
    await page.evaluate((t) => localStorage.setItem('neohab:themeOverride', t), theme)
    await page.reload()
    await page.waitForSelector('.nh-color__pbtn', { timeout: 20000 }).catch(() => {})
    await sleep(900)
    const r = await probe(page, readButtons, 'Lamp')
    if (r?.count !== 2) {
      themeTrouble.push(theme + ': ' + (r?.count ?? 'no') + ' buttons')
      continue
    }
    const idle = contrast(r.ink[0], r.bg[0])
    const active = contrast(r.ink[1], r.bg[1])
    if (idle < 4.5 || active < 4.5) themeTrouble.push(theme + ': idle ' + idle.toFixed(1) + ' active ' + active.toFixed(1))
    const past = Math.max(...r.boxes.map((b) => b.x + b.w - (r.cellBox.x + r.cellBox.w)))
    if (past > 1) themeTrouble.push(theme + ': past the tile by ' + Math.round(past))
    // A theme must not put them back inside a swatch it has restyled out of existence either.
    if (r.swatchShown && !r.boxes.every((b) => b.x >= r.swatchBox.x - 1)) themeTrouble.push(theme + ': outside the swatch')
  }
  ok('the buttons work in every built-in theme', themeTrouble.length === 0, themeTrouble.join(' | '))
  await page.evaluate(() => localStorage.setItem('neohab:themeOverride', 'dark'))
  await page.reload()
  await page.waitForSelector('.nh-color__pbtn', { timeout: 20000 }).catch(() => {})
  await sleep(900)

  /* ---------------- G. the editor commands nothing ---------------- */
  await page.click('[aria-label="Edit dashboard"]').catch(() => {})
  await sleep(900)
  const editing = await probe(page, readButtons, 'Lamp')
  ok(
    'the buttons are inert in edit mode',
    editing?.count === 2 && editing.disabled.every((d) => d === true),
    JSON.stringify(editing?.disabled)
  )
  sent()
  await pressBtn('Lamp', 'off')
  await sleep(500)
  ok('and command nothing when clicked there', editing?.count === 2 && sent().length === 0, 'buttons=' + editing?.count)
  await page.keyboard.press('Escape')
  await sleep(500)
  await page.keyboard.press('Escape')
  await sleep(800)
  const backToRun = await probe(page, () => document.querySelector('.nh-grid--edit') === null)
  ok('the editor was left behind', backToRun === true)

  /* ---------------- H. the long-press sheet matches the tile it came from ---------------- */
  const holdOnLabel = async (label) => {
    const r = await probe(page, readButtons, label)
    if (!r?.cellBox) return false
    // The name row, well clear of the sliders and of the buttons themselves.
    await page.mouse.move(r.cellBox.x + r.cellBox.w / 2, r.cellBox.y + 10)
    await page.mouse.down()
    await sleep(HOLD_MS)
    await page.mouse.up()
    await sleep(450)
    return true
  }
  sent()
  await holdOnLabel('Lamp')
  const sheetPwr = await probe(page, readSheetPicker)
  ok(
    'a long press on a widget with the buttons offers them too',
    JSON.stringify(sheetPwr?.buttons) === JSON.stringify(['Off', 'On']),
    JSON.stringify(sheetPwr)
  )
  // Anything that opens UNDER a live pointer inherits the rest of that press, and the sheet is a
  // portal into the body, so the cell's own click-swallow is nowhere in the event's path.
  ok(
    'and the release of that hold commands nothing',
    sheetPwr?.buttons?.length === 2 && sent().length === 0,
    'buttons=' + sheetPwr?.buttons?.length
  )
  // The other half of that rule, and the one that would break if the guard were too broad: the
  // hold must not command anything, and the buttons it just revealed must still work. The flag the
  // guard reads is cleared by the press that ends the hold, and the sheet is a portal, so nothing
  // in the cell above it sees that release - which is exactly how a control ends up permanently
  // dead rather than merely safe.
  sent()
  const sheetBtn = await probe(page, () => {
    const b = document.querySelectorAll('.nh-detail__panel .nh-color__pbtn')[1]
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })
  if (sheetBtn) await page.mouse.click(sheetBtn.x, sheetBtn.y)
  await sleep(400)
  const fromSheet = sent()
  ok(
    'and the buttons in that sheet still command when they are pressed',
    !!sheetBtn && fromSheet.length === 1,
    JSON.stringify(fromSheet)
  )

  await page.keyboard.press('Escape')
  await sleep(500)

  await holdOnLabel('Plain')
  const sheetPlain = await probe(page, readSheetPicker)
  ok(
    'a long press on one without them offers the picker alone',
    sheetPwr?.buttons?.length === 2 &&
      sheetPlain?.open === true &&
      sheetPlain.pickers === 1 &&
      sheetPlain.buttons.length === 0,
    JSON.stringify(sheetPlain)
  )
  await page.keyboard.press('Escape')
  await sleep(500)

  /* ---------------- I. a command the server refuses ---------------- */
  // A button is a command like any other, so a refusal has to revert the optimistic display and
  // say so, rather than leaving a lamp looking off when it is not. Injected as a 400, so nothing
  // real is refused and no device is involved.
  await putState('288,55,40')
  await sleep(2200)
  await page.route('**/rest/items/' + ITEM, (r) =>
    r.request().method() === 'POST' ? r.fulfill({ status: 400, body: 'nope' }) : r.continue()
  )
  const beforeRefusal = await probe(page, readButtons, 'Lamp')
  await pressBtn('Lamp', 'off')
  await sleep(900)
  const refused = await probe(page, readButtons, 'Lamp')
  const toast = await probe(page, () => document.querySelector('.nh-toast')?.textContent ?? '')
  ok(
    'a refused Off puts the display back rather than showing the lamp as off',
    beforeRefusal?.pressed?.[1] === 'true' && refused?.pressed?.[1] === 'true',
    'before=' + JSON.stringify(beforeRefusal?.pressed) + ' after=' + JSON.stringify(refused?.pressed)
  )
  // In words: an HTTP status in a toast says nothing to the person who pressed the button, so the
  // notice names the item and what happened and carries no bare code.
  ok(
    'and says the command was refused',
    /would not take/.test(toast ?? '') && toast.includes(ITEM) && !/\b400\b/.test(toast ?? ''),
    JSON.stringify(toast)
  )
  await page.unroute('**/rest/items/' + ITEM)
  // The notice is a deliberate one, not a defect, so it does not count against the console check.
  errs.length = 0

  /* ---------------- J. a lamp with no state at all ---------------- */
  await fetch(itemUrl(ITEM) + '/state', {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'text/plain' },
    body: 'UNDEF',
  })
  await page.reload()
  await page.waitForSelector('.nh-color__pbtn', { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  const undef = await probe(page, readButtons, 'Lamp')
  ok('a lamp with no state still draws its buttons', undef?.count === 2, 'count=' + (undef?.count ?? 'none'))
  ok('and reads as off, since there is no brightness to show', undef?.pressed?.[0] === 'true', JSON.stringify(undef?.pressed))

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  /* ---------------- cleanup ---------------- */
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(itemUrl(ITEM), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => c.uid === UID).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboard removed', left.length === 0, left.join(','))
  const stillThere = await fetch(itemUrl(ITEM), { headers: AUTH })
    .then((r) => r.status === 200)
    .catch(() => false)
  ok('cleanup: test item removed', stillThere === false)
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(
    '\n' +
      (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') +
      '  (' +
      (results.length - failed.length) +
      '/' +
      results.length +
      ')'
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}
