// The colour widget's on and off buttons. The feature rests on a fact about openHAB rather than on anything
// stored: a Color item maps OFF onto `H,S,0` and ON.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-colorpower (neohab:config), managed
// item nh_e2e_pwr (never a file-provided item).
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

const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

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
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

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
    bg: btns.map((b) => {
      const read = (v) => {
        let m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(v)
        if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
        m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: *\/ *([\d.]+))?/.exec(v)
        if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])]
        return null
      }
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
    bodyPad: (() => {
      const body = host.querySelector('.nh-widget__body')
      return body ? parseFloat(getComputedStyle(body).paddingTop) : undefined
    })(),
    aside: picker ? picker.className.includes('nh-color--aside') : false,
    sliders: host.querySelectorAll('.nh-color__track').length,
  }
}

const readSheetPicker = () => {
  const panel = document.querySelector('.nh-detail__panel')
  if (!panel) return { open: false }
  return {
    open: true,
    pickers: panel.querySelectorAll('.nh-color').length,
    buttons: [...panel.querySelectorAll('.nh-color__pbtn')].map((b) => b.textContent.trim()),
  }
}

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
const commands = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
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

const sent = () => commands.splice(0, commands.length)

try {
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
        rowHeight: 40,
        gap: 8,
        widgets: [
          widget('w-pwr', 'Lamp', { powerButtons: true }, 0, 0, 8), // 376px: stacked on the swatch
          widget('w-plain', 'Plain', { powerButtons: false }, 4, 0, 8), // the box unticked
          widget('w-tight', 'Tight', { powerButtons: true }, 8, 0, 4), // 184px: stacked on a tightened swatch
          widget('w-mid', 'Mid', { powerButtons: true }, 8, 4, 3), // 136px: swatch too short even for that
          widget('w-short', 'Short', { powerButtons: true }, 8, 7, 2), // 88px: swatch shed entirely
          widget('w-tightplain', 'TightPlain', { powerButtons: false }, 0, 8, 4),
          widget('w-shortplain', 'ShortPlain', { powerButtons: false }, 0, 13, 2),
          widget('w-default', 'Default', {}, 4, 13, 8),
          widget('w-shortdefault', 'ShortDefault', {}, 6, 15, 2),
          { ...widget('w-nrow', 'NarrowTight', { powerButtons: true }, 4, 8, 4), layout: { lg: { x: 4, y: 8, w: 1, h: 4 } } },
          { ...widget('w-narrow', 'Narrow', { powerButtons: true }, 5, 8, 3), layout: { lg: { x: 5, y: 8, w: 1, h: 3 } } },
          widget('w-hostile', 'Hostile', { powerButtons: 'yes' }, 6, 8, 5),
        ],
      },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-colorpower')
  await page.waitForSelector('.nh-color input[type=range]', { timeout: 20000 })
  await sleep(1200) // the first states arrive and the optimistic layer settles

  const pressBtn = async (label, which, target = page) => {
    const r = await probe(target, readButtons, label)
    const b = r?.boxes?.[which === 'off' ? 0 : 1]
    if (!b) return false
    await target.mouse.click(b.x + b.w / 2, b.y + b.h / 2)
    return true
  }

  const pwr = await probe(page, readButtons, 'Lamp')
  ok('a widget that asked for them draws two buttons', pwr?.count === 2, 'count=' + (pwr?.count ?? 'none'))
  ok(
    'off is above on, and both are named',
    JSON.stringify(pwr?.labels) === JSON.stringify(['Off', 'On']),
    JSON.stringify(pwr?.labels)
  )
  ok('the picker still has its three sliders', pwr?.sliders === 3, 'sliders=' + pwr?.sliders)

  const plain = await probe(page, readButtons, 'Plain')
  ok(
    'a picker with the box unticked draws none',
    pwr?.count === 2 && plain?.count === 0,
    'powered=' + pwr?.count + ' plain=' + plain?.count
  )

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

  ok('while the lamp is lit, On is the one in effect', pwr?.pressed?.[1] === 'true', JSON.stringify(pwr?.pressed))

  sent()
  await pressBtn('Lamp', 'off')
  await sleep(300)
  const offSent = sent()
  ok('Off sends OFF, not a triple of zeroes', JSON.stringify(offSent) === JSON.stringify(['OFF']), JSON.stringify(offSent))

  const afterOff = await stateSettles('288,55,0')
  ok('so openHAB keeps the hue and saturation and only darkens it', afterOff === '288,55,0', 'state=' + afterOff)
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
  const wentOff = afterOff === '288,55,0'
  ok('the lamp comes back exactly as it was', wentOff && afterOn === '288,55,40', 'off=' + afterOff + ' on=' + afterOn)
  ok(
    'and not at full brightness, which a plain ON would have given',
    wentOff && !afterOn.endsWith(',100'),
    'off=' + afterOff + ' on=' + afterOn
  )

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

  await sleep(9000)
  const seen = []
  for (const [name, state, expect] of [
    ['near-black', '240,90,4', 'rgb(1, 1, 10)'],
    ['near-white', '50,4,98', 'rgb(250, 248, 240)'],
    ['mid amber', '40,90,85', 'rgb(217, 152, 22)'],
    ['deep blue', '220,90,35', 'rgb(9, 39, 89)'],
  ]) {
    await putState(state)
    await sleep(2200)
    const r = await probe(page, readButtons, 'Lamp')
    const idle = contrast(r?.ink?.[0], r?.bg?.[0])
    const active = contrast(r?.ink?.[1], r?.bg?.[1])
    ok(
      'a button can be read on a ' + name + ' swatch',
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
  ok(
    'and clear of the sliders underneath',
    tight?.channelsBox && tight.boxes?.length === 2 && tight.boxes.every((b) => b.y + b.h <= tight.channelsBox.y + 1),
    JSON.stringify({ btns: tight?.boxes?.map((b) => b.y + b.h), sliders: tight?.channelsBox?.y })
  )
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

  const nrow = await probe(page, readButtons, 'NarrowTight')
  ok(
    'a narrow tile still stacks it on the swatch',
    onSwatch(nrow) && nrow.boxes[0].y + nrow.boxes[0].h <= nrow.boxes[1].y + 1,
    JSON.stringify({ cell: nrow?.cellBox?.w, swatch: nrow?.swatchBox, btns: nrow?.boxes })
  )

  const narrow = await probe(page, readButtons, 'Narrow')
  ok(
    'in a narrow short tile the sliders keep most of the width',
    narrow?.count === 2 &&
      narrow.channelsBox &&
      narrow.channelsBox.w >= narrow.cellBox.w * 0.5 &&
      narrow.channelsBox.w >= 60,
    JSON.stringify({ cell: narrow?.cellBox?.w, sliders: narrow?.channelsBox?.w, btns: narrow?.boxes?.[0]?.w })
  )

  ok(
    'the pair is drawn at a size worth pressing',
    tight?.boxes?.[0] && tight.boxes[0].h >= 22 && tight.boxes[0].h <= 25 && pwr?.boxes?.[0]?.h >= 26,
    JSON.stringify({ tight: tight?.boxes?.[0]?.h, tall: pwr?.boxes?.[0]?.h })
  )

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
  const phoneDefault = await probe(page, readButtons, 'ShortDefault')
  ok(
    'a row for a picker that stores nothing is the taller one too',
    phoneDefault?.cellBox && phonePowered?.cellBox && phoneDefault.cellBox.h === phonePowered.cellBox.h && phoneDefault.count === 2,
    JSON.stringify({ default: phoneDefault?.cellBox?.h, powered: phonePowered?.cellBox?.h, plain: phonePlain?.cellBox?.h })
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await sleep(900)

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
  ok(
    'nothing hangs outside its tile at any of those shapes',
    measured === 18 && spills.length === 0,
    'measured=' + measured + ' ' + spills.join(', ')
  )

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
    if (r.swatchShown && !r.boxes.every((b) => b.x >= r.swatchBox.x - 1)) themeTrouble.push(theme + ': outside the swatch')
  }
  ok('the buttons work in every built-in theme', themeTrouble.length === 0, themeTrouble.join(' | '))
  await page.evaluate(() => localStorage.setItem('neohab:themeOverride', 'dark'))
  await page.reload()
  await page.waitForSelector('.nh-color__pbtn', { timeout: 20000 }).catch(() => {})
  await sleep(900)

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

  const holdOnLabel = async (label) => {
    const r = await probe(page, readButtons, label)
    if (!r?.cellBox) return false
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
  ok(
    'and the release of that hold commands nothing',
    sheetPwr?.buttons?.length === 2 && sent().length === 0,
    'buttons=' + sheetPwr?.buttons?.length
  )
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
  ok(
    'and says the command was refused',
    /would not take/.test(toast ?? '') && toast.includes(ITEM) && !/\b400\b/.test(toast ?? ''),
    JSON.stringify(toast)
  )
  await page.unroute('**/rest/items/' + ITEM)
  errs.length = 0

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
