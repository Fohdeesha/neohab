/**
 * Stepper widget e2e: one value with a step up and a step down, in six looks and five finishes.
 *
 * Every command in this suite goes to managed items it creates itself, bound to nothing, so the
 * commands are real (the state comes back over the live stream exactly as a device's would) and
 * nothing in the house moves. The count of them is one of the checks: a run of quick presses has
 * to cost the item ONE command carrying the last value, not one per press.
 *
 * The layout checks measure where the parts sit and how big they are, in the tile sizes the
 * looks were reported on, and the spill scan covers one-column cells as well as short ones.
 *
 * SAFE with a live config. Creates and deletes exactly:
 *   - dashboard:nh-e2e-stepper                                          (neohab:config)
 *   - managed items nh_e2e_stepnum, nh_e2e_steplist, nh_e2e_stepfan, nh_e2e_stepnull,
 *     nh_e2e_stepmany
 * Enters edit mode once and leaves without saving; touches no other item.
 */
import { chromium } from 'playwright-core'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-stepper'
const NUM = 'nh_e2e_stepnum'
const LIST = 'nh_e2e_steplist'
const FAN = 'nh_e2e_stepfan'
const NULLI = 'nh_e2e_stepnull'
const MANYI = 'nh_e2e_stepmany'
const ITEMS_MADE = [NUM, LIST, FAN, NULLI, MANYI]
const CHOICES = 'HDMI1=Apple TV\nHDMI2=HDMI 2\nCAST=Chromecast\nTV=Aerial\nBD=Blu-ray'
const MANY = Array.from({ length: 14 }, (_, i) => `M${i + 1}=Mode ${i + 1}`).join('\n')

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (n, v) =>
  fetch(itemUrl(n) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const getState = (n) =>
  fetch(itemUrl(n), { headers: AUTH })
    .then((r) => r.json())
    .then((j) => j.state)
    .catch(() => null)
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name: n, label }),
  })

/** Read the page through a shape that cannot throw, so a missing feature fails its own checks. */
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return chromium.launch({ channel, headless: true })
    } catch {}
  }
  return chromium.launch({ headless: true })
}

const stepper = (label, look, finish, extra) => ({
  id: 'w-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  type: 'stepper',
  config: { item: NUM, label, look, finish, mode: 'number', min: 60, max: 85, step: 0.5, unit: '°F', ...extra },
})
// The dashboard's rows are 28px with a 6px gap, so a tile h rows tall is 34h - 6 px: `at`
// takes heights in the old two-row units (a "2" is 198px, a "1" is 96px) so the seed reads as it
// always did, and the band tiles below ask for 4 and 5 rows outright (130px and 164px), the
// heights at which a column look's full-size parts stop fitting under a name row.
const at = (w, x, y, wd, h) => ({ ...w, layout: { lg: { x, y: y * 3, w: wd, h: h * 3 } } })
const band = (w, x, h) => ({ ...w, layout: { lg: { x, y: 33, w: 2, h } } })

const WIDGETS = [
  at(stepper('Pair', 'pair', 'plain'), 0, 0, 3, 2),
  at(stepper('Stack glass', 'stack', 'glass'), 3, 0, 3, 2),
  at(stepper('Spinner glow', 'spinner', 'glow'), 6, 0, 3, 2),
  at(stepper('Split solid', 'split', 'solid'), 9, 0, 2, 2),
  at(stepper('Carousel list', 'carousel', 'glass', { item: LIST, mode: 'list', choices: CHOICES, wrap: false }), 0, 2, 3, 2),
  at(stepper('Range sheen', 'range', 'sheen'), 3, 2, 3, 2),
  at(stepper('Stack list', 'stack', 'plain', { item: LIST, mode: 'list', choices: CHOICES, wrap: true }), 6, 2, 3, 2),
  at(stepper('Fan', 'carousel', 'plain', { item: FAN, min: 1, max: 5, step: 1, unit: '' }), 9, 2, 3, 2),
  at(stepper('Arrows auto', 'pair', 'plain', { arrows: 'auto' }), 0, 4, 2, 2),
  at(stepper('Arrows chevron', 'pair', 'plain', { arrows: 'chevron' }), 2, 4, 2, 2),
  at(stepper('Arrows triangle', 'pair', 'plain', { arrows: 'triangle' }), 4, 4, 2, 2),
  at(stepper('Arrows plusminus', 'pair', 'plain', { arrows: 'plusminus' }), 6, 4, 2, 2),
  at(stepper('Arrows arrow', 'pair', 'plain', { arrows: 'arrow' }), 8, 4, 2, 2),
  // Stored configuration is untrusted input: every field here is the wrong shape.
  {
    id: 'w-hostile',
    type: 'stepper',
    config: { item: NUM, label: 'Hostile', look: 'constructor', finish: {}, arrows: 42, mode: 'toString', min: 'abc', max: -5, step: 0, choices: {}, wrap: 'yes' },
    layout: { lg: { x: 10, y: 12, w: 2, h: 6 } },
  },
  at(stepper('Wide split', 'split', 'glass'), 0, 6, 6, 2),
  at(stepper('Unknown', 'pair', 'plain', { item: NULLI }), 6, 6, 2, 2),
  at(stepper('Many', 'carousel', 'plain', { item: MANYI, mode: 'list', choices: MANY }), 8, 6, 2, 2),
  at(stepper('Accent', 'pair', 'glow', { accentColor: '#e0603c' }), 10, 6, 2, 2),
  at(stepper('Short pair', 'pair', 'plain'), 0, 8, 3, 1),
  at(stepper('Short stack', 'stack', 'glass'), 3, 8, 3, 1),
  at(stepper('Short spinner', 'spinner', 'glow'), 6, 8, 3, 1),
  at(stepper('Short range', 'range', 'solid'), 9, 8, 3, 1),
  // One-column cells, where the carousel's edge strips used to hang past the tile and the
  // range bar's two end labels were drawn over each other; and a two-column range bar, the
  // size of the tiles the layout was reported on.
  at(stepper('Narrow carousel', 'carousel', 'plain', { item: FAN, min: 1, max: 5, step: 1, unit: '' }), 0, 9, 1, 2),
  at(stepper('Narrow range', 'range', 'plain'), 1, 9, 1, 2),
  at(stepper('Two-col range', 'range', 'plain'), 2, 9, 2, 2),
  // The band: cells too short for a column look's full-size parts and too tall for it to lie
  // down, where the reading used to be drawn over the bars.
  band(stepper('Band stack 130', 'stack', 'plain'), 0, 4),
  band(stepper('Band pair 130', 'pair', 'plain'), 2, 4),
  band(stepper('Band range 130', 'range', 'plain'), 4, 4),
  band(stepper('Band stack 164', 'stack', 'glow'), 6, 5),
  band(stepper('Band pair 164', 'pair', 'glow'), 8, 5),
  band(stepper('Band range 164', 'range', 'glow'), 10, 5),
]

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
const errs = []
const posts = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const url = m.location?.()?.url
  if (!isAppResource(url)) return
  errs.push(m.text() + (url ? ' <- ' + url : ''))
})
page.on('dialog', (d) => d.accept().catch(() => {}))
// Commands are REAL - the items are unbound - but every one is recorded.
await page.route('**/rest/items/**', (r) => {
  const req = r.request()
  if (req.method() === 'POST') posts.push({ item: decodeURIComponent(req.url().split('/rest/items/')[1] ?? ''), body: req.postData() ?? '' })
  return r.continue()
})
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

const postsTo = (item) => posts.filter((p) => p.item === item)
const tile = (label) => page.locator(`.nh-widget:has(.nh-widget__labeltext:text-is("${label}"))`).first()
const reading = (label) =>
  probe(
    page,
    (l) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      if (!w) return null
      return {
        num: w.querySelector('.nh-step__num')?.textContent ?? null,
        unit: w.querySelector('.nh-step__unit')?.textContent ?? '',
        upOff: !!w.querySelector('.nh-step__btn--up.nh-step__btn--off, .nh-step__zone--up.nh-step__zone--off'),
        downOff: !!w.querySelector('.nh-step__btn--down.nh-step__btn--off, .nh-step__zone--down.nh-step__zone--off'),
        upAria: w.querySelector('.nh-step__btn--up, .nh-step__zone--up')?.getAttribute('aria-disabled') ?? null,
        dots: w.querySelectorAll('.nh-step__dot').length,
        dotOn: [...w.querySelectorAll('.nh-step__dot')].findIndex((d) => d.classList.contains('nh-step__dot--on')),
        count: w.querySelector('.nh-step__count')?.textContent ?? null,
      }
    },
    label
  )
const waitReading = async (label, want, ms = 4000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await reading(label)
    if (last && last.num === want) return last
    await sleep(100)
  }
  return last
}
const glyph = (label, which) =>
  probe(
    page,
    ({ l, which }) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const svg = w?.querySelector(`.nh-step__btn--${which} .nh-step__ic, .nh-step__zone--${which} .nh-step__ic--v`)
      return svg ? { d: svg.querySelector('path')?.getAttribute('d'), fill: svg.classList.contains('nh-step__ic--fill') } : null
    },
    { l: label, which }
  )
const styleOf = (label, selector, props) =>
  probe(
    page,
    ({ l, selector, props }) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const el = w?.querySelector(selector)
      if (!el) return null
      const cs = getComputedStyle(el)
      const out = {}
      for (const p of props) out[p] = cs.getPropertyValue(p)
      return out
    },
    { l: label, selector, props }
  )

try {
  /* ---------------- seed ---------------- */
  await makeItem(NUM, 'Number', 'NH E2E Stepper Number')
  await makeItem(LIST, 'String', 'NH E2E Stepper List')
  await makeItem(FAN, 'Number', 'NH E2E Stepper Fan')
  await makeItem(NULLI, 'Number', 'NH E2E Stepper Unknown')
  await makeItem(MANYI, 'String', 'NH E2E Stepper Many')
  await putState(NUM, '72')
  await putState(LIST, 'HDMI2')
  await putState(FAN, '3')
  await putState(MANYI, 'M3')
  // A re-created item is not a blank one: persistence restores the state the last run left it
  // with. "No value yet" has to be established, not assumed.
  await putState(NULLI, 'NULL')
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: 'nh-e2e-stepper', name: 'E2E Stepper', columns: 12, rowHeight: 28, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-stepper')
  await page.waitForSelector('.nh-step', { timeout: 20000 }).catch(() => {})
  await sleep(1500)

  /* ---------------- A. every tile renders ---------------- */
  const roots = await probe(page, () => [...document.querySelectorAll('.nh-step')].map((s) => s.className))
  ok('every stepper tile renders', Array.isArray(roots) && roots.length === WIDGETS.length, `${roots?.length} of ${WIDGETS.length}`)
  const looks = ['stack', 'pair', 'spinner', 'split', 'carousel', 'range']
  const finishes = ['plain', 'glass', 'glow', 'solid', 'sheen']
  ok(
    'all six looks and five finishes are on the page',
    looks.every((l) => roots?.some((c) => c.includes('nh-step--' + l))) && finishes.every((f) => roots?.some((c) => c.includes('nh-step--' + f))),
    (roots ?? []).join(' | ').slice(0, 200)
  )
  const errTiles = await probe(page, () => document.querySelectorAll('.nh-widget--error').length)
  ok('no tile fell back to the error boundary', errTiles === 0, 'error tiles=' + errTiles)

  /* ---------------- B. the reading ---------------- */
  const pair = await waitReading('Pair', '72.0')
  ok('a number reads to the digits its step resolves, with its unit', pair?.num === '72.0' && pair?.unit === '°F', JSON.stringify(pair))
  const car = await waitReading('Carousel list', 'HDMI 2')
  ok("a list reads the current choice's label", car?.num === 'HDMI 2', JSON.stringify(car))
  ok('the carousel shows one dot per choice with the current one lit', car?.dots === 5 && car?.dotOn === 1, JSON.stringify(car))
  const fan = await waitReading('Fan', '3')
  ok('a short numeric range gets dots too', fan?.num === '3' && fan?.dots === 5 && fan?.dotOn === 2, JSON.stringify(fan))
  const fanGlyph = await glyph('Fan', 'up')
  ok('the carousel keeps chevrons at its edges even for a number', fanGlyph?.d === 'M9 6l6 6-6 6', JSON.stringify(fanGlyph))
  const many = await reading('Many')
  ok('a list too long for dots shows a count instead', many?.dots === 0 && /^3 of 14$/.test(many?.count ?? ''), JSON.stringify(many))
  const fill = await styleOf('Range sheen', '.nh-step__fill', ['width', 'background-image'])
  const track = await styleOf('Range sheen', '.nh-step__track', ['width'])
  const frac = fill && track ? parseFloat(fill.width) / parseFloat(track.width) : NaN
  ok('the range bar fills to where the value sits in its range', Math.abs(frac - 0.48) < 0.03, `fill ${fill?.width} of ${track?.width} = ${frac.toFixed(3)}`)
  const bounds = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Range sheen')
    return [...(w?.querySelectorAll('.nh-step__bounds span') ?? [])].map((s) => s.textContent)
  })
  ok('the range bar names both ends of the range', JSON.stringify(bounds) === JSON.stringify(['60.0', '85.0']), JSON.stringify(bounds))

  /* ---------------- B2. where the parts sit, and how big they are ---------------- */
  // Each of these was reported on a built dashboard: the range bar's reading pushed to the
  // left, the spinner's reading on the tile's edge, the carousel's chevrons too small to
  // see as targets, and the range's end labels too small to read.
  const geom = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const rect = (el) => (el ? el.getBoundingClientRect() : null)
    const cellWidth = (w) => Math.round(w?.closest('.nh-gcell')?.getBoundingClientRect().width ?? 0)
    const range = find('Range sheen')
    const num = rect(range?.querySelector('.nh-step__num'))
    const unit = rect(range?.querySelector('.nh-step__unit'))
    const row = rect(range?.querySelector('.nh-step__row'))
    const spin = find('Spinner glow')
    const spinNum = rect(spin?.querySelector('.nh-step__num'))
    const spinRoot = rect(spin?.querySelector('.nh-step'))
    const car = find('Carousel list')
    const glyph = rect(car?.querySelector('.nh-step__edge .nh-step__ic'))
    const two = find('Two-col range')
    const spans = [...(two?.querySelectorAll('.nh-step__bounds span') ?? [])].map((s) => ({
      font: parseFloat(getComputedStyle(s).fontSize),
      whole: s.scrollWidth <= s.clientWidth && s.getBoundingClientRect().width > 0,
    }))
    const narrow = find('Narrow range')
    const narrowBounds = narrow?.querySelector('.nh-step__bounds')
    const count = find('Many')?.querySelector('.nh-step__count')
    return {
      readingCentre: num && row ? Math.round(((num.left + (unit ?? num).right) / 2 - (row.left + row.right) / 2) * 10) / 10 : null,
      spinInset: spinNum && spinRoot ? Math.round((spinNum.left - spinRoot.left) * 10) / 10 : null,
      spinCell: cellWidth(spin),
      glyph: glyph ? Math.round(glyph.width * 10) / 10 : null,
      spans,
      twoCell: cellWidth(two),
      narrowBounds: narrowBounds ? getComputedStyle(narrowBounds).display : null,
      narrowCell: cellWidth(narrow),
      countFont: count ? parseFloat(getComputedStyle(count).fontSize) : null,
    }
  })
  ok('the range bar centres its reading over the bar', geom && Math.abs(geom.readingCentre) <= 2, `off centre by ${geom?.readingCentre}px`)
  ok('the spinner sets its reading in from the tile edge', geom && geom.spinInset >= 14, `inset ${geom?.spinInset}px in a ${geom?.spinCell}px cell`)
  ok("the carousel's chevrons are drawn big enough to be seen as targets", geom && geom.glyph >= 30, `glyph ${geom?.glyph}px`)
  ok(
    "the range bar's two end labels read at the tile's text size and whole",
    geom && geom.spans.length === 2 && geom.spans.every((s) => s.font >= 15 && s.whole),
    JSON.stringify(geom?.spans) + ` in a ${geom?.twoCell}px cell`
  )
  ok('a one-column range bar drops the end labels it cannot fit', geom && geom.narrowCell > 0 && geom.narrowCell <= 120 && geom.narrowBounds === 'none', `display ${geom?.narrowBounds} in a ${geom?.narrowCell}px cell`)
  ok("the carousel's count caption reads at the tile's text size", geom && geom.countFont >= 15, `${geom?.countFont}px`)

  /* ---------------- B3. every look fits the room its tile leaves ---------------- */
  // Reported on a 140px tile: the stack's bars and reading kept their full size and overlapped.
  // The scan takes EVERY stepper tile - the reading must not cross a control (the split tile
  // floats its reading over the zones by design and is skipped for that half) and no part may
  // leave the widget body - and it requires the band tiles to be there, since a fit check over
  // tall and short cells alone is what let the overlap ship.
  const fit = await probe(page, () => {
    const R = (el) => el.getBoundingClientRect()
    const hits = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const defects = []
    let band = 0
    let tiles = 0
    const dirs = {}
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const step = cell.querySelector('.nh-step')
      if (!step) continue
      tiles++
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      const cr = R(cell)
      if (cr.height >= 105 && cr.height <= 170) band++
      const body = R(cell.querySelector('.nh-widget__body'))
      const value = step.querySelector('.nh-step__value')
      if (value && !step.classList.contains('nh-step--split')) {
        const vr = R(value)
        for (const c of step.querySelectorAll('.nh-step__btn, .nh-step__track, .nh-step__segs, .nh-step__ctl')) {
          if (hits(R(c), vr)) {
            defects.push(`${label}: reading over ${c.className.split(' ')[1]}`)
            break
          }
        }
      }
      for (const p of step.querySelectorAll('.nh-step__btn, .nh-step__value, .nh-step__track, .nh-step__bounds, .nh-step__ctl, .nh-step__zone')) {
        const r = R(p)
        if (r.width === 0 || r.height === 0) continue
        if (r.top < body.top - 0.5 || r.bottom > body.bottom + 0.5 || r.left < body.left - 0.5 || r.right > body.right + 0.5) {
          defects.push(`${label}: ${p.className.split(' ')[1]} outside the body`)
          break
        }
      }
      const col = step.querySelector('.nh-step__stack, .nh-step__pair, .nh-step__range')
      if (col) dirs[label] = getComputedStyle(col).flexDirection
    }
    return { tiles, band, defects: [...new Set(defects)], dirs }
  })
  ok(
    'no look draws its reading over a control or a part outside its body, in the band included',
    fit && fit.tiles === WIDGETS.length && fit.band >= 6 && fit.defects.length === 0,
    `${fit?.tiles} tiles, ${fit?.band} in the band` + (fit?.defects.length ? ': ' + fit.defects.join(' | ') : '')
  )
  ok(
    'a column look keeps its column while its parts can shrink to fit, and lies down only below that',
    fit && fit.dirs['Band stack 130'] === 'column' && fit.dirs['Band pair 130'] === 'column' && fit.dirs['Band range 130'] === 'column' && fit.dirs['Short stack'] === 'row' && fit.dirs['Short pair'] === 'row' && fit.dirs['Short range'] === 'row',
    JSON.stringify(fit?.dirs)
  )

  /* ---------------- C. stepping a number ---------------- */
  const before = postsTo(NUM).length
  await tile('Pair').locator('.nh-step__btn--up').click({ timeout: 5000 }).catch(() => {})
  await sleep(80)
  const quick = await reading('Pair')
  ok('a press shows its result at once', quick?.num === '72.5', JSON.stringify(quick))
  await sleep(900)
  ok('and sends the value once the presses stop', postsTo(NUM).length === before + 1 && postsTo(NUM).at(-1)?.body === '72.5', JSON.stringify(postsTo(NUM).slice(before)))
  ok('the item took it', (await getState(NUM)) === '72.5', String(await getState(NUM)))

  const before3 = postsTo(NUM).length
  const up = tile('Pair').locator('.nh-step__btn--up')
  await up.click({ timeout: 5000 }).catch(() => {})
  await up.click({ timeout: 5000 }).catch(() => {})
  await up.click({ timeout: 5000 }).catch(() => {})
  await sleep(80)
  const triple = await reading('Pair')
  ok('three quick presses read three steps up', triple?.num === '74.0', JSON.stringify(triple))
  await sleep(900)
  const burst = postsTo(NUM).slice(before3)
  ok('and cost the item exactly one command, carrying the last value', burst.length === 1 && burst[0].body === '74', JSON.stringify(burst))
  ok('the item is at the last value', (await getState(NUM)) === '74', String(await getState(NUM)))

  // A value this control commanded a moment ago is HELD for the optimistic layer's settle
  // window (8s) before a differing live state takes over - the slider does the same, and it
  // is what keeps a quantising device from snapping a control back. So the state set here
  // reaches the reading only once that window closes, and the wait allows for it.
  await putState(NUM, '85')
  const atMax = await waitReading('Pair', '85.0', 12000)
  ok('at the maximum the up button is dimmed and marked disabled', atMax?.upOff === true && atMax?.upAria === 'true' && atMax?.downOff === false, JSON.stringify(atMax))
  const beforeMax = postsTo(NUM).length
  await tile('Pair').locator('.nh-step__btn--up').click({ timeout: 2000, force: true }).catch(() => {})
  await sleep(700)
  ok('and pressing it sends nothing', postsTo(NUM).length === beforeMax && (await reading('Pair'))?.num === '85.0', 'posts=' + (postsTo(NUM).length - beforeMax))
  await tile('Pair').locator('.nh-step__btn--down').click({ timeout: 5000 }).catch(() => {})
  await sleep(900)
  ok('while down still works', (await reading('Pair'))?.num === '84.5' && (await getState(NUM)) === '84.5', String(await getState(NUM)))

  /* ---------------- D. stepping a list ---------------- */
  await tile('Carousel list').locator('.nh-step__btn--up').click({ timeout: 5000 }).catch(() => {})
  await sleep(900)
  const next = await reading('Carousel list')
  ok('next moves a list to the following choice and commands it', next?.num === 'Chromecast' && next?.dotOn === 2 && (await getState(LIST)) === 'CAST', JSON.stringify(next))
  const prev = tile('Carousel list').locator('.nh-step__btn--down')
  await prev.click({ timeout: 5000 }).catch(() => {})
  await prev.click({ timeout: 5000 }).catch(() => {})
  await sleep(900)
  const first = await reading('Carousel list')
  ok('previous twice reaches the first choice', first?.num === 'Apple TV' && (await getState(LIST)) === 'HDMI1', JSON.stringify(first))
  ok('a list that does not wrap stops there', first?.downOff === true && first?.upOff === false, JSON.stringify(first))
  await putState(LIST, 'BD')
  const last = await waitReading('Stack list', 'Blu-ray')
  ok('the last choice reads as itself', last?.num === 'Blu-ray' && last?.upOff === false, JSON.stringify(last))
  await tile('Stack list').locator('.nh-step__btn--up').click({ timeout: 5000 }).catch(() => {})
  await sleep(900)
  ok('a list told to wrap goes round to the first choice', (await reading('Stack list'))?.num === 'Apple TV' && (await getState(LIST)) === 'HDMI1', String(await getState(LIST)))

  /* ---------------- E. an item with no value yet ---------------- */
  const unknown = await reading('Unknown')
  ok('an item with no state reads a dash with both buttons live', unknown?.num === '-' && !unknown?.upOff && !unknown?.downOff, JSON.stringify(unknown))
  await tile('Unknown').locator('.nh-step__btn--up').click({ timeout: 5000 }).catch(() => {})
  await sleep(900)
  ok('and its first press starts it at the minimum', (await reading('Unknown'))?.num === '60.0' && (await getState(NULLI)) === '60', String(await getState(NULLI)))

  /* ---------------- F. the split tile ---------------- */
  const zones = await probe(page, () => {
    const box = (l, sel) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const r = w?.querySelector(sel)?.getBoundingClientRect()
      return r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null
    }
    const vis = (l, sel) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const el = w?.querySelector(sel)
      return el ? getComputedStyle(el).display !== 'none' : null
    }
    return {
      sqUp: box('Split solid', '.nh-step__zone--up'),
      sqDown: box('Split solid', '.nh-step__zone--down'),
      sqV: vis('Split solid', '.nh-step__zone--up .nh-step__ic--v'),
      sqH: vis('Split solid', '.nh-step__zone--up .nh-step__ic--h'),
      wUp: box('Wide split', '.nh-step__zone--up'),
      wDown: box('Wide split', '.nh-step__zone--down'),
      wV: vis('Wide split', '.nh-step__zone--up .nh-step__ic--v'),
      wH: vis('Wide split', '.nh-step__zone--up .nh-step__ic--h'),
    }
  })
  ok(
    'a square split stacks up over down, with the vertical glyph',
    zones?.sqUp && zones.sqDown && zones.sqUp.y < zones.sqDown.y && zones.sqUp.x === zones.sqDown.x && zones.sqV === true && zones.sqH === false,
    JSON.stringify(zones && { sqUp: zones.sqUp, sqDown: zones.sqDown, v: zones.sqV, h: zones.sqH })
  )
  ok(
    'a wide split puts down on the left and up on the right, with the sideways glyph',
    zones?.wUp && zones.wDown && zones.wDown.x < zones.wUp.x && zones.wUp.y === zones.wDown.y && zones.wV === false && zones.wH === true,
    JSON.stringify(zones && { wUp: zones.wUp, wDown: zones.wDown, v: zones.wV, h: zones.wH })
  )
  const beforeZone = postsTo(NUM).length
  const zoneFrom = Number(await getState(NUM))
  await tile('Split solid').locator('.nh-step__zone--down').click({ timeout: 5000, position: { x: 20, y: 20 } }).catch(() => {})
  await sleep(900)
  ok(
    'pressing a zone steps the value',
    postsTo(NUM).length === beforeZone + 1 && Number(await getState(NUM)) === zoneFrom - 0.5,
    `${zoneFrom} -> ${await getState(NUM)}`
  )

  /* ---------------- G. arrow styles ---------------- */
  const g = {}
  for (const a of ['auto', 'chevron', 'triangle', 'plusminus', 'arrow']) g[a] = await glyph('Arrows ' + a, 'up')
  ok('automatic arrows are plus and minus for a number', g.auto?.d === 'M12 5v14M5 12h14', JSON.stringify(g.auto))
  ok('chevrons point along the pair\'s axis', g.chevron?.d === 'M9 6l6 6-6 6', JSON.stringify(g.chevron))
  ok('triangles are filled', g.triangle?.fill === true && g.triangle?.d === 'M17 12L7 18V6z', JSON.stringify(g.triangle))
  ok('plus and minus can be chosen outright', g.plusminus?.d === 'M12 5v14M5 12h14', JSON.stringify(g.plusminus))
  ok('straight arrows have a shaft', g.arrow?.d === 'M5 12h14M12 5l7 7-7 7', JSON.stringify(g.arrow))
  const listGlyph = await glyph('Carousel list', 'up')
  ok('automatic arrows are chevrons for a list', listGlyph?.d === 'M9 6l6 6-6 6', JSON.stringify(listGlyph))

  /* ---------------- H. finishes ---------------- */
  const plain = await styleOf('Pair', '.nh-step__box', ['background-color', 'backdrop-filter'])
  // `blur(var(--st-blur))` at 0px computes as blur(0px), which is no blur at all.
  ok(
    'plain is the theme\'s raised surface',
    plain?.['background-color'] === 'rgb(34, 44, 55)' && ['none', 'blur(0px)'].includes(plain?.['backdrop-filter']),
    JSON.stringify(plain)
  )
  const glass = await styleOf('Stack glass', '.nh-step__box', ['backdrop-filter', 'background-image'])
  ok('glass is frosted and lit from above', glass?.['backdrop-filter'] === 'blur(8px)' && /linear-gradient/.test(glass?.['background-image'] ?? ''), JSON.stringify(glass))
  const glow = await styleOf('Spinner glow', '.nh-step__num', ['color', 'text-shadow'])
  const glowCtl = await styleOf('Spinner glow', '.nh-step__ctl', ['box-shadow'])
  ok('glow inks the reading in the accent with a halo', glow?.color === 'rgb(56, 182, 255)' && glow?.['text-shadow'] !== 'none' && glowCtl?.['box-shadow'] !== 'none', JSON.stringify({ glow, glowCtl }))
  const solid = await styleOf('Split solid', '.nh-step__split', ['background-color'])
  ok('solid paints the control in the accent', solid?.['background-color'] === 'rgb(56, 182, 255)', JSON.stringify(solid))
  const sheen = await styleOf('Range sheen', '.nh-step__box', ['background-image'])
  const sheenNum = await styleOf('Range sheen', '.nh-step__num', ['-webkit-background-clip', 'background-image'])
  ok(
    'sheen is a lit gradient plate with the reading brushed to match',
    /linear-gradient/.test(sheen?.['background-image'] ?? '') && sheenNum?.['-webkit-background-clip'] === 'text' && /linear-gradient/.test(sheenNum?.['background-image'] ?? ''),
    JSON.stringify({ sheen, sheenNum })
  )
  ok('and the sheen finish fills the range bar with its own light', /linear-gradient/.test(fill?.['background-image'] ?? ''), fill?.['background-image'])
  const accent = await styleOf('Accent', '.nh-step__num', ['color'])
  ok('a tile accent colour takes over from the theme\'s', accent?.color === 'rgb(224, 96, 60)', JSON.stringify(accent))

  /* ---------------- I. hostile configuration ---------------- */
  // On the defaults the hostile tile is a 0-100 stepper at step 1, so it reads the item's
  // current value to whole digits, whatever the presses above left it at.
  const hostileWant = Number(await getState(NUM)).toFixed(0)
  const hostile = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Hostile')
    return w ? { cls: w.querySelector('.nh-step')?.className ?? '', num: w.querySelector('.nh-step__num')?.textContent, error: !!w.closest('.nh-gcell')?.querySelector('.nh-widget--error') } : null
  })
  // The defaults are a spinner in the glow finish, which is also what a new widget starts as.
  ok(
    'a configuration of the wrong shape everywhere still renders on the defaults',
    hostile && /nh-step--spinner/.test(hostile.cls) && /nh-step--glow/.test(hostile.cls) && hostile.num === hostileWant && !hostile.error,
    JSON.stringify(hostile) + ' want ' + hostileWant
  )

  /* ---------------- J. nothing drawn outside its tile ---------------- */
  // A "nothing spills" check passes for free on a page with nothing on it, so it also counts
  // what it scanned and requires every tile to have been there.
  const spill = await probe(page, () => {
    const out = []
    let scanned = 0
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const cr = cell.getBoundingClientRect()
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      const parts = cell.querySelectorAll('.nh-step *')
      if (parts.length) scanned++
      for (const el of parts) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const over = Math.max(cr.left - r.left, r.right - cr.right, cr.top - r.top, r.bottom - cr.bottom)
        if (over > 1) out.push(`${label}: past by ${over.toFixed(1)}px`)
      }
    }
    return { scanned, spills: [...new Set(out)] }
  })
  ok(
    'no look draws past its tile, short cells included',
    spill && spill.scanned === WIDGETS.length && spill.spills.length === 0,
    `scanned ${spill?.scanned} of ${WIDGETS.length}` + (spill?.spills.length ? ': ' + spill.spills.join(' | ') : '')
  )

  /* ---------------- K. the settings panel ---------------- */
  await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.locator('.nh-cell').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
  const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
  const selectInfo = async (label) => {
    const sel = field(label).locator('select').first()
    const n = await sel.locator('option').count().catch(() => -1)
    const v = await sel.inputValue().catch(() => null)
    return { n, v }
  }
  const styleSel = await selectInfo('Style')
  const finishSel = await selectInfo('Finish')
  const arrowSel = await selectInfo('Arrow style')
  const valueSel = await selectInfo('Value')
  ok('the panel offers six styles, five finishes, five arrow styles and two kinds of value, none blank',
    styleSel.n === 6 && finishSel.n === 5 && arrowSel.n === 5 && valueSel.n === 2 && [styleSel, finishSel, arrowSel, valueSel].every((s) => s.v),
    JSON.stringify({ styleSel, finishSel, arrowSel, valueSel }))
  const minBefore = await field('Minimum').count()
  await field('Value').locator('select').first().selectOption('list').catch(() => {})
  await sleep(300)
  const choicesAfter = await field('Choices (one per line, COMMAND=Label)').count()
  const minAfter = await field('Minimum').count()
  ok('switching the value to a list swaps the range fields for the choices', minBefore === 1 && choicesAfter === 1 && minAfter === 0, JSON.stringify({ minBefore, choicesAfter, minAfter }))
  const wasEditing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const editing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  ok('leaving the editor without saving', wasEditing === true && editing === false, `was=${wasEditing} now=${editing}`)

  /* ---------------- L. the detail sheet offers the widget\'s own scale ---------------- */
  const target = tile('Pair')
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const b = await target.boundingBox().catch(() => null)
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await sleep(750)
    await page.mouse.up()
    await sleep(400)
  }
  const sheet = await probe(page, () => {
    const r = document.querySelector('.nh-detail__panel input[type="range"]')
    return r ? { min: r.min, max: r.max, step: r.step } : null
  })
  ok('a hold opens a control on the widget\'s own scale, not 0-100', sheet && sheet.min === '60' && sheet.max === '85' && sheet.step === '0.5', JSON.stringify(sheet))
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  /* ---------------- cleanup ---------------- */
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  for (const item of ITEMS_MADE) await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => c.uid === UID).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboard removed', left.length === 0, left.join(','))
  const itemsLeft = []
  for (const item of ITEMS_MADE) {
    const r = await fetch(itemUrl(item), { headers: AUTH }).catch(() => null)
    if (r && r.status === 200) itemsLeft.push(item)
  }
  ok('cleanup: test items removed', itemsLeft.length === 0, itemsLeft.join(','))
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
