/**
 * Slider widget e2e: five styles, both orientations.
 *
 * Every command in this suite goes to a managed item it creates itself, bound to nothing, so the
 * commands are real (the state comes back over the live stream exactly as a device's would) and
 * nothing in the house moves.
 *
 * The geometry section is the one that matters most. Four of the styles paint their own track and
 * fill under the browser's own range input, so the fill and the thumb have to agree about where
 * the value is - and a range input insets the thumb's travel by half a thumb at each end. Both
 * halves are measured: what the browser does with a press at a known position, and where the fill
 * ends up at the ends of that same scale.
 *
 * SAFE with a live config. Creates and deletes exactly:
 *   - dashboard:nh-e2e-slider   (neohab:config)
 *   - managed item nh_e2e_slide
 * Enters edit mode once and leaves without saving; touches no other item.
 */
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-slider'
const ITEM = 'nh_e2e_slide'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (v) =>
  fetch(itemUrl(ITEM) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const getState = () =>
  fetch(itemUrl(ITEM), { headers: AUTH })
    .then((r) => r.json())
    .then((j) => j.state)
    .catch(() => null)

/** Read the page through a shape that cannot throw, so a missing feature fails its own checks. */
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const sl = (label, style, extra, x, y, w, h) => ({
  id: 'w-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  type: 'slider',
  config: { item: ITEM, style, label, min: 0, max: 100, step: 1, unit: '%', ...extra },
  layout: { lg: { x, y, w, h } },
})

// 40px rows with a 6px gap, so a tile h rows tall is 46h - 6 px: fine enough to seed the short
// band where a reading row has to be shed as well as the ordinary sizes.
const WIDGETS = [
  sl('Gradient', 'gradient', {}, 0, 0, 3, 4),
  sl('Wedge', 'taper', {}, 3, 0, 3, 4),
  sl('Inset', 'inset', {}, 6, 0, 3, 4),
  sl('Bubble', 'bubble', {}, 9, 0, 3, 4),
  sl('Plain', 'plain', {}, 0, 4, 3, 4),
  sl('Tinted', 'gradient', { accentColor: '#e0483d' }, 3, 4, 3, 4),
  // On end.
  sl('V gradient', 'gradient', { orient: 'vertical' }, 6, 4, 2, 8),
  sl('V inset', 'inset', { orient: 'vertical' }, 8, 4, 2, 8),
  sl('V bubble', 'bubble', { orient: 'vertical' }, 10, 4, 2, 8),
  // Short: the reading row has to give way rather than crowd the track.
  sl('Short', 'gradient', {}, 0, 8, 3, 2),
  sl('Short inset', 'inset', {}, 3, 8, 3, 2),
  // A scale that is not 0-100, which the rail's ends have to print.
  sl('Kelvin', 'inset', { min: 2000, max: 6500, step: 50, unit: ' K' }, 0, 10, 3, 4),
  // Stored configuration is untrusted input: every field here is the wrong shape.
  sl('Junk', 'constructor', { orient: 'toString', min: 'abc', max: -5, step: 0 }, 3, 10, 3, 4),
]

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } })
await ctx.addInitScript(
  ([theme, token]) => {
    try {
      // Pinned: this suite measures the app's own defaults, and the theme in effect belongs to
      // whoever runs the server.
      localStorage.setItem('neohab:themeOverride', theme)
      localStorage.setItem('neohab:apiToken', token)
    } catch {}
  },
  ['dark', TOKEN]
)

const errors = []
let page
let initial = null

try {
  // ---- seed -----------------------------------------------------------------------------------
  await fetch(itemUrl(ITEM), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Dimmer', name: ITEM, label: 'E2E slider' }),
  })
  // A managed item deleted and re-created with the same name is not a blank one: persistence
  // restores what the last run left it with, so the precondition is established rather than
  // assumed.
  await putState(40)
  await sleep(500)
  initial = await getState()

  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seeded = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:config',
      config: { version: 1, id: 'nh-e2e-slider', name: 'E2E Slider', columns: 12, rowHeight: 40, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seeded the dashboard', seeded.ok, 'HTTP ' + seeded.status)

  page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && isAppResource(m.location()?.url)) errors.push(m.text() + ' @ ' + (m.location()?.url ?? ''))
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(APP + '#/d/nh-e2e-slider', { waitUntil: 'load' })
  await page.waitForSelector('.nh-fader', { timeout: 20000 }).catch(() => {})
  await sleep(1400)

  // ---- A: each style draws its own parts --------------------------------------------------------
  console.log('\n-- A: the styles --')
  const parts = await probe(page, () => {
    const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const of = (l) => {
      const c = byLabel(l)
      if (!c) return null
      const root = c.querySelector('.nh-fader, .nh-slider')
      if (!root) return null
      const fill = c.querySelector('.nh-fader__fill')
      const cs = fill ? getComputedStyle(fill) : null
      return {
        cls: root.className,
        fill: cs ? cs.backgroundImage : '',
        clip: cs ? cs.clipPath : '',
        plate: !!c.querySelector('.nh-fader__plate'),
        bounds: [...c.querySelectorAll('.nh-fader__bound')].map((e) => e.textContent),
        badge: c.querySelector('.nh-fader__badge')?.textContent ?? null,
        read: c.querySelector('.nh-fader__read')?.textContent ?? null,
        plainInput: !!c.querySelector('input.nh-slider__input'),
      }
    }
    return {
      grad: of('Gradient'),
      taper: of('Wedge'),
      inset: of('Inset'),
      bubble: of('Bubble'),
      plain: of('Plain'),
      tint: of('Tinted'),
      kelvin: of('Kelvin'),
      junk: of('Junk'),
    }
  })

  ok(
    'the gradient style fills with a multi-stop ramp',
    /linear-gradient\(.*,.*,.*\)/.test(parts?.grad?.fill ?? ''),
    (parts?.grad?.fill ?? '').slice(0, 70)
  )
  ok('the wedge style cuts its fill to a point', /polygon/.test(parts?.taper?.clip ?? ''), (parts?.taper?.clip ?? '').slice(0, 60))
  ok('the inset style sinks its rail into a plate', parts?.inset?.plate === true)
  ok('the inset style prints the ends of its scale', JSON.stringify(parts?.inset?.bounds) === '["0","100"]', JSON.stringify(parts?.inset?.bounds))
  ok('a scale that is not 0-100 says so at the ends', JSON.stringify(parts?.kelvin?.bounds) === '["2000","6500"]', JSON.stringify(parts?.kelvin?.bounds))
  ok('the bubble style rides the value on the thumb', /\d/.test(parts?.bubble?.badge ?? ''), parts?.bubble?.badge)
  ok(
    'the bubble style keeps its reading in the badge and nowhere else',
    /\d/.test(parts?.bubble?.badge ?? '') && parts?.bubble?.read === null,
    `badge ${parts?.bubble?.badge}, row ${parts?.bubble?.read}`
  )
  ok('the gradient style reads above the track', /\d/.test(parts?.grad?.read ?? ''), parts?.grad?.read)

  // The plain style has to stay exactly what it was: the same markup the detail sheet and the
  // floor plan's popup draw, so a theme restyling `.nh-slider__input` still reaches all three.
  ok(
    'the plain style is still the shared control',
    parts?.plain?.plainInput === true && /nh-slider/.test(parts?.plain?.cls ?? ''),
    parts?.plain?.cls
  )
  ok('the plain style is not one of the painted looks', parts?.plain && !/nh-fader/.test(parts.plain.cls))

  ok('a tile with an accent colour says it is tinted', /nh-fader--tinted/.test(parts?.tint?.cls ?? ''), parts?.tint?.cls)
  ok(
    'a tile without one is not',
    /nh-fader--gradient/.test(parts?.grad?.cls ?? '') && !/nh-fader--tinted/.test(parts?.grad?.cls ?? ''),
    parts?.grad?.cls
  )
  ok('the tint moves the ramp off its reference colours', parts?.tint?.fill && parts.tint.fill !== parts.grad.fill)

  // Stored configuration nobody can read draws the widget's own defaults rather than nothing.
  ok('a style nobody spelled right falls back to the default', /nh-fader--gradient/.test(parts?.junk?.cls ?? ''), parts?.junk?.cls)
  ok('an orientation nobody spelled right lies flat', /nh-fader--h/.test(parts?.junk?.cls ?? ''))

  // ---- B: the fill and the browser's own thumb agree ---------------------------------------------
  console.log('\n-- B: geometry --')
  // What the browser does with a press at a known position. A range input insets the thumb's
  // travel by half a thumb at each end, which is the premise the fill's arithmetic rests on: if it
  // did not, the fill would run ahead of the thumb at one end and behind it at the other.
  const railBox = await probe(page, () => {
    const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const c = byLabel('Gradient')
    const rail = c?.querySelector('.nh-fader__rail')
    const root = c?.querySelector('.nh-fader')
    if (!rail || !root) return null
    const r = rail.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, thumb: parseFloat(getComputedStyle(root).getPropertyValue('--fd-thumb')) }
  })
  const readInput = () =>
    probe(page, () => {
      const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      return Number(byLabel('Gradient')?.querySelector('input.nh-fader__input')?.value ?? -1)
    })

  if (railBox && railBox.thumb > 0) {
    const mid = railBox.y + railBox.h / 2
    await page.mouse.click(railBox.x + railBox.thumb / 2, mid)
    const atMin = await readInput()
    ok('a press half a thumb from the start reads the minimum', atMin === 0, String(atMin))
    await page.mouse.click(railBox.x + railBox.w - railBox.thumb / 2, mid)
    const atMax = await readInput()
    ok('a press half a thumb from the end reads the maximum', atMax === 100, String(atMax))
    await page.mouse.click(railBox.x + railBox.w / 2, mid)
    const atMid = await readInput()
    ok('a press in the middle reads the middle', Math.abs(atMid - 50) <= 1, String(atMid))
  } else {
    for (const n of ['a press half a thumb from the start reads the minimum', 'a press half a thumb from the end reads the maximum', 'a press in the middle reads the middle'])
      ok(n, false, 'no rail')
  }

  // ...and where the fill ends up at the ends of that same scale. Measured after a reload, so the
  // optimistic layer is not still holding the value the presses above sent.
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.nh-fader', { timeout: 20000 }).catch(() => {})
  // Longer than STEADY_MS (1500): a value arriving within that window of the last one shown is
  // held back until it closes, which is the app working as designed - and a shorter wait reads the
  // PREVIOUS value, so the number in the detail would not be the one this asked for.
  const SETTLED = 1900
  const fillAt = async (value) => {
    await putState(value)
    await sleep(SETTLED)
    return probe(page, () => {
      const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const c = byLabel('Gradient')
      const rail = c?.querySelector('.nh-fader__rail')?.getBoundingClientRect()
      const fill = c?.querySelector('.nh-fader__fill')?.getBoundingClientRect()
      const root = c?.querySelector('.nh-fader')
      if (!rail || !fill || !root) return null
      return {
        thumb: parseFloat(getComputedStyle(root).getPropertyValue('--fd-thumb')),
        len: fill.width,
        endGap: rail.right - fill.right,
        railLen: rail.width,
        reading: c.querySelector('.nh-fader__read')?.textContent,
      }
    })
  }

  const at0 = await fillAt(0)
  ok('the reading follows the item', at0?.reading === '0%', at0?.reading)
  ok(
    'at the minimum the fill reaches the thumb centre and no further',
    at0 && Math.abs(at0.len - at0.thumb / 2) <= 1.5,
    at0 ? `fill ${at0.len.toFixed(1)} vs thumb/2 ${(at0.thumb / 2).toFixed(1)}` : 'no fill'
  )
  const at100 = await fillAt(100)
  // Half a thumb short of the rail's end, which is where the thumb's centre is: the last half of
  // the thumb hangs over the end of its own travel, and a fill drawn to the rail's edge would sit
  // proud of it. The same distance as at the minimum, from the other side.
  ok(
    'at the maximum the fill reaches the thumb centre, half a thumb short of the end',
    at100 && Math.abs(at100.endGap - at100.thumb / 2) <= 1.5,
    at100 ? `gap ${at100.endGap.toFixed(1)} vs thumb/2 ${(at100.thumb / 2).toFixed(1)}` : 'no fill'
  )
  const at50 = await fillAt(50)
  ok(
    'halfway along, the fill ends halfway along',
    at50 && Math.abs(at50.len - at50.railLen / 2) <= 2,
    at50 ? `fill ${at50.len.toFixed(1)} of ${at50.railLen.toFixed(1)}` : 'no fill'
  )

  // ---- C: on end ---------------------------------------------------------------------------------
  console.log('\n-- C: vertical --')
  const vert = await probe(page, () => {
    const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const c = byLabel('V gradient')
    const rail = c?.querySelector('.nh-fader__rail')?.getBoundingClientRect()
    const fill = c?.querySelector('.nh-fader__fill')?.getBoundingClientRect()
    const input = c?.querySelector('input.nh-fader__input')
    if (!rail || !fill || !input) return null
    const cs = getComputedStyle(input)
    return {
      tall: rail.height > rail.width,
      fromBottom: Math.abs(rail.bottom - fill.bottom),
      grows: fill.height,
      railLen: rail.height,
      writingMode: cs.writingMode,
      direction: cs.direction,
    }
  })
  ok('a vertical rail is taller than it is wide', vert?.tall === true, vert ? `${vert.railLen.toFixed(0)} tall` : 'none')
  ok('its fill grows from the bottom', vert && vert.fromBottom <= 1.5, vert ? `bottom gap ${vert.fromBottom.toFixed(1)}` : 'none')
  ok(
    "it is the browser's own vertical range",
    vert?.writingMode?.startsWith('vertical') === true && vert?.direction === 'rtl',
    vert ? vert.writingMode + '/' + vert.direction : 'none'
  )
  ok(
    'halfway along, half the track is filled',
    vert && Math.abs(vert.grows - vert.railLen / 2) <= 3,
    vert ? `${vert.grows.toFixed(1)} of ${vert.railLen.toFixed(1)}` : 'none'
  )

  // ArrowUp raises the value on a fader, which is why the input is turned rather than rotated: a
  // rotated one keeps the horizontal key mapping and reads backwards.
  const vinput = page.locator('.nh-widget:has(.nh-widget__labeltext:text-is("V gradient")) input.nh-fader__input')
  const beforeKey = Number(await vinput.inputValue().catch(() => NaN))
  await vinput.focus().catch(() => {})
  await page.keyboard.press('ArrowUp')
  const afterKey = Number(await vinput.inputValue().catch(() => NaN))
  ok('ArrowUp raises the value on a fader', afterKey > beforeKey, `${beforeKey} -> ${afterKey}`)
  await page.keyboard.press('ArrowDown')
  await sleep(900)

  // ---- D: what a short or narrow tile keeps --------------------------------------------------------
  console.log('\n-- D: shedding, and staying inside the tile --')
  const shed = await probe(page, () => {
    const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const seen = (l, sel) => {
      const el = byLabel(l)?.querySelector(sel)
      return el ? getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0 : false
    }
    return {
      shortRead: seen('Short', '.nh-fader__read'),
      shortTrack: seen('Short', '.nh-fader__track'),
      shortInsetBounds: seen('Short inset', '.nh-fader__bound'),
      tallRead: seen('Gradient', '.nh-fader__read'),
    }
  })
  ok('a tile with room draws the reading', shed?.tallRead === true)
  // Both halves in one check: on a build that draws no reading anywhere, "the short one has none"
  // is true for the wrong reason.
  ok('a tile too short for it drops the reading', shed?.tallRead === true && shed?.shortRead === false, JSON.stringify(shed))
  ok('...and keeps the track, which is the part you drag', shed?.shortTrack === true)
  ok('...and the inset rail keeps the ends of its scale', shed?.shortInsetBounds === true)

  const spill = await probe(page, () => {
    const bad = []
    let tiles = 0
    for (const cell of document.querySelectorAll('.nh-widget')) {
      if (!cell.querySelector('.nh-fader, .nh-slider')) continue
      tiles++
      const c = cell.getBoundingClientRect()
      const name = cell.querySelector('.nh-widget__labeltext')?.textContent ?? '?'
      for (const el of cell.querySelectorAll('.nh-fader__rail, .nh-fader__read, .nh-fader__plate, .nh-fader__badge, .nh-slider')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        const past = Math.max(c.left - r.left, r.right - c.right, c.top - r.top, r.bottom - c.bottom)
        if (past > 1) bad.push(`${name} ${el.className.split(' ')[0]} past by ${past.toFixed(1)}`)
      }
    }
    return { bad, tiles }
  })
  ok('there are tiles to scan, in every style and both ways round', (spill?.tiles ?? 0) >= 13, String(spill?.tiles))
  ok('nothing is drawn outside its tile', spill?.bad.length === 0, (spill?.bad ?? []).join('; ').slice(0, 170))

  // The band the pointer can grab: a 6px track is not a touch target.
  const hit = await probe(page, () => {
    const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const r = byLabel('Gradient')?.querySelector('input.nh-fader__input')?.getBoundingClientRect()
    return r ? r.height : 0
  })
  ok('the track is a finger wide, not a hairline', (hit ?? 0) >= 26, `${(hit ?? 0).toFixed(0)}px`)

  // ---- E: the badge follows the thumb, and stays inside the tile --------------------------------
  console.log('\n-- E: the badge --')
  const badgeAt = async (value) => {
    await putState(value)
    await sleep(SETTLED)
    return probe(page, () => {
      const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const c = byLabel('Bubble')
      const badge = c?.querySelector('.nh-fader__badge')
      const b = badge?.getBoundingClientRect()
      const rail = c?.querySelector('.nh-fader__rail')?.getBoundingClientRect()
      const cell = c?.getBoundingClientRect()
      if (!b || !rail || !cell) return null
      return {
        centre: b.x + b.width / 2 - rail.x,
        text: badge.textContent,
        inside: b.left >= cell.left - 1 && b.right <= cell.right + 1,
        railLen: rail.width,
      }
    })
  }
  const b20 = await badgeAt(20)
  const b80 = await badgeAt(80)
  ok('the badge shows the value', b80?.text?.includes('80') === true, b80?.text)
  ok(
    'the badge follows the thumb',
    b20 && b80 && b80.centre > b20.centre + 20,
    b20 && b80 ? `${b20.centre.toFixed(0)} -> ${b80.centre.toFixed(0)}` : 'none'
  )
  const b0 = await badgeAt(0)
  const b100 = await badgeAt(100)
  ok('at the minimum the badge stays inside the tile', b0?.inside === true, b0 ? `centre ${b0.centre.toFixed(0)}` : 'none')
  ok('at the maximum the badge stays inside the tile', b100?.inside === true, b100 ? `centre ${b100.centre.toFixed(0)}` : 'none')

  // ---- F: what a press actually sends ---------------------------------------------------------------
  console.log('\n-- F: commands --')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.nh-fader', { timeout: 20000 }).catch(() => {})
  await sleep(900)
  const posts = []
  await page.route('**/rest/items/' + ITEM, (route) => {
    if (route.request().method() === 'POST') posts.push(route.request().postData())
    return route.continue()
  })

  const box = await probe(page, () => {
    const byLabel = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const r = byLabel('Gradient')?.querySelector('.nh-fader__rail')?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
  })
  if (box) {
    // A drag: the press stages, the release sends, and the item gets one command carrying where the
    // thumb was let go - not one per pointer move.
    await page.mouse.move(box.x + box.w * 0.3, box.y + box.h / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.w * 0.7, box.y + box.h / 2, { steps: 10 })
    await page.mouse.up()
    await sleep(700)
    ok('a drag sends exactly one command', posts.length === 1, JSON.stringify(posts))
    ok('and it carries where the thumb was let go', Number(posts[0]) >= 60 && Number(posts[0]) <= 80, String(posts[0]))

    // A hold takes the gesture, and the release that ends it sends nothing: the value was staged
    // on the press and is dropped, which is what makes "a hold never changes a value" true of a
    // control that commits on pointer-up.
    posts.length = 0
    await page.mouse.move(box.x + box.w * 0.2, box.y + box.h / 2)
    await page.mouse.down()
    await sleep(900)
    await page.mouse.up()
    await sleep(700)
    ok('a hold on the track sends nothing', posts.length === 0, JSON.stringify(posts))
    await page.keyboard.press('Escape')
    await sleep(300)
  } else {
    for (const n of ['a drag sends exactly one command', 'and it carries where the thumb was let go', 'a hold on the track sends nothing'])
      ok(n, false, 'no rail')
  }
  await page.unroute('**/rest/items/' + ITEM)

  // ---- G: the settings panel -----------------------------------------------------------------------
  console.log('\n-- G: the settings panel --')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.nh-fader', { timeout: 20000 }).catch(() => {})
  await page.click('[aria-label="Edit dashboard"]').catch(() => {})
  await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 }).catch(() => {})
  await page.click('.nh-grid--edit .nh-cell >> nth=0 >> .nh-cell__grip').catch(() => {})
  await page.waitForSelector('.nh-sheet select', { timeout: 8000 }).catch(() => {})

  const fields = await probe(page, () => {
    const named = (label) =>
      [...document.querySelectorAll('.nh-sheet .nh-field')].find((f) => f.querySelector('.nh-field__label')?.textContent === label)
    const opts = (label) => [...(named(label)?.querySelectorAll('option') ?? [])].map((o) => o.value)
    return { style: opts('Style'), orient: opts('Orientation') }
  })
  ok('the panel offers every style', (fields?.style ?? []).length === 5, JSON.stringify(fields?.style))
  ok('the panel offers both orientations', JSON.stringify(fields?.orient) === '["horizontal","vertical"]', JSON.stringify(fields?.orient))

  // The live preview: choosing a style redraws the tile that is being edited. Run mode draws
  // `.nh-gcell` and the editor `.nh-cell`, so this asks about the surface it is standing on.
  const fieldSelect = (label) =>
    page.locator('.nh-sheet .nh-field', { has: page.locator('.nh-field__label', { hasText: label }) }).locator('select')
  await fieldSelect('Style').selectOption('inset').catch(() => {})
  await sleep(500)
  ok('choosing a style redraws the tile at once', (await probe(page, () => !!document.querySelector('.nh-cell .nh-fader--inset'))) === true)
  await fieldSelect('Orientation').selectOption('vertical').catch(() => {})
  await sleep(500)
  ok(
    'so does choosing an orientation',
    (await probe(page, () => !!document.querySelector('.nh-cell .nh-fader--inset.nh-fader--v'))) === true
  )

  // The editor's exit confirm is a native dialog, which Playwright dismisses (i.e. cancels) unless
  // it is told otherwise - so leaving a dirty draft has to accept it explicitly.
  page.once('dialog', (d) => d.accept())
  await page.click('button:has-text("Exit")').catch(() => {})
  await sleep(700)
  const stored = await fetch(NS + '/' + UID, { headers: AUTH })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  const storedStyle = stored?.config?.widgets?.find((w) => w.id === 'w-gradient')?.config?.style
  ok('the live preview changed nothing on the server', storedStyle === 'gradient', String(storedStyle))
  ok('and the editor was left', (await probe(page, () => !document.querySelector('.nh-grid--edit'))) === true)

  ok('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))
} catch (e) {
  ok('the suite ran to the end', false, String(e).slice(0, 200))
} finally {
  // ---- cleanup ---------------------------------------------------------------------------------
  console.log('\n-- cleanup --')
  if (page) await page.close().catch(() => {})
  await ctx.close().catch(() => {})
  await browser.close().catch(() => {})

  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
  const mine = (Array.isArray(left) ? left : []).filter((c) => c.uid === UID).map((c) => c.uid)
  ok('the dashboard it made is gone', mine.length === 0, mine.join(','))

  await fetch(itemUrl(ITEM), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const stillThere = await fetch(itemUrl(ITEM), { headers: AUTH }).then((r) => r.status)
  ok('the item it made is gone', stillThere === 404, 'HTTP ' + stillThere)
  console.log('  (the item was at ' + initial + ' when the suite started)')
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed} pass, ${failed} fail`)
if (failed)
  console.log(
    'FAILED: ' +
      results
        .filter((r) => !r.pass)
        .map((r) => r.name)
        .join(' | ')
  )
process.exitCode = failed ? 1 : 0
