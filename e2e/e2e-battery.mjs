// Battery widget e2e: one charge level drawn eight ways, with its input scale, level colours and charging bolt.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-battery (neohab:config), managed
// items nh_e2e_batt, nh_e2e_battchg, nh_e2e_battmv, nh_e2e_battnull. Commands nothing: every state is set over REST.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'
import { skipSuiteOnProduction } from './lib/guard.mjs'

skipSuiteOnProduction('every check here drives managed items this suite creates')

const UID = 'dashboard:nh-e2e-battery'
const NUM = 'nh_e2e_batt'
const CHG = 'nh_e2e_battchg'
const MV = 'nh_e2e_battmv'
const NULLI = 'nh_e2e_battnull'
const ITEMS_MADE = [NUM, CHG, MV, NULLI]
const STYLES = ['glow', 'neon', 'cells', 'ring', 'pods', 'bar', 'wave', 'meter']
const GOOD = 'rgb(63, 185, 80)'
const MID = 'rgb(224, 165, 38)'
const LOW = 'rgb(255, 107, 112)'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (n, v) =>
  fetch(itemUrl(n) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name: n, label }),
  })

const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const battery = (label, style, extra) => ({
  id: 'w-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  type: 'battery',
  config: { item: NUM, label, style, chargingItem: CHG, ...extra },
})
const at = (w, x, y, cols, rows) => ({ ...w, layout: { lg: { x, y, w: cols, h: rows } } })

// 8 rows of 28px is a tall tile whose body clears the inside-layout floor; 4 rows is a short one
const WIDGETS = [
  at(battery('Glow', 'glow'), 0, 0, 3, 8),
  at(battery('Neon', 'neon'), 3, 0, 3, 8),
  at(battery('Cells', 'cells'), 6, 0, 3, 8),
  at(battery('Ring', 'ring'), 9, 0, 3, 8),
  at(battery('Pods', 'pods', { caption: 'Tablet', icon: 'mdi:cellphone' }), 0, 8, 3, 8),
  at(battery('Bar', 'bar'), 3, 8, 3, 8),
  at(battery('Wave', 'wave'), 6, 8, 3, 8),
  at(battery('Meter', 'meter'), 9, 8, 3, 8),
  at(battery('Glow short', 'glow'), 0, 16, 3, 4),
  at(battery('Cells short', 'cells'), 3, 16, 3, 4),
  at(battery('Bar short', 'bar'), 6, 16, 3, 4),
  at(battery('Meter short', 'meter'), 9, 16, 3, 4),
  at(battery('Millivolts', 'glow', { item: MV, min: 3000, max: 4200, chargingItem: '' }), 0, 20, 3, 8),
  at(battery('Text off', 'cells', { showText: false }), 3, 20, 3, 8),
  at(battery('Accent', 'bar', { colorMode: 'accent', accentColor: '#e0603c', chargingItem: '' }), 6, 20, 3, 8),
  at(battery('Unknown', 'glow', { item: NULLI, chargingItem: '' }), 9, 20, 3, 8),
  {
    id: 'w-hostile',
    type: 'battery',
    config: { item: NUM, label: 'Hostile', style: 'constructor', showText: 'no', min: 'abc', max: -5, colorMode: 42, lowBelow: {}, midBelow: 'x', chargingItem: 12, icon: {}, caption: 7, animate: 'yes' },
    layout: { lg: { x: 0, y: 28, w: 3, h: 8 } },
  },
  at(battery('Pods plain', 'pods', { chargingItem: '' }), 3, 28, 3, 8),
  at(battery('Wave still', 'wave', { animate: false, chargingItem: '' }), 6, 28, 3, 8),
  at(battery('Ring short', 'ring', { chargingItem: '' }), 9, 28, 3, 4),
  // the shapes where a caption or a number runs out of room: one column, and two short columns
  at(battery('Glow narrow', 'glow'), 0, 32, 1, 6),
  at(battery('Neon squeezed', 'neon'), 1, 32, 2, 5),
  at(battery('Bar squeezed', 'bar'), 3, 32, 2, 4),
]
const CHARGING_TILES = WIDGETS.filter((w) => w.config.chargingItem === CHG).length

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
await page.route('**/rest/items/**', (r) => {
  if (r.request().method() === 'POST') posts.push(r.request().url())
  return r.continue()
})
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

const tile = (label) => page.locator(`.nh-widget:has(.nh-widget__labeltext:text-is("${label}"))`).first()
const reading = (label) =>
  probe(
    page,
    (l) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      if (!w) return null
      const root = w.querySelector('.nh-battery')
      const num = w.querySelector('.nh-battery__num')
      const wave = w.querySelector('.nh-battery__wavenum')
      return {
        cls: root?.className ?? '',
        level: root?.getAttribute('data-level') ?? null,
        num: num ? (num.querySelector('span')?.textContent ?? null) : wave ? (wave.textContent ?? '').replace('%', '') : null,
        pct: !!(num?.querySelector('.nh-battery__pct') || (wave && wave.textContent.includes('%'))),
        cap: w.querySelector('.nh-battery__cap')?.textContent ?? null,
        podcap: w.querySelector('.nh-battery__podcap')?.textContent ?? null,
        error: !!w.closest('.nh-gcell')?.querySelector('.nh-widget--error'),
      }
    },
    label
  )
const waitReading = async (label, want, ms = 5000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await reading(label)
    if (last && want(last)) return last
    await sleep(120)
  }
  return last
}
const fillOf = (label, selector) =>
  probe(
    page,
    ({ l, selector }) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const el = w?.querySelector(selector)
      return el ? getComputedStyle(el).fill : null
    },
    { l: label, selector }
  )

try {
  await makeItem(NUM, 'Number', 'NH E2E Battery Level')
  await makeItem(CHG, 'Switch', 'NH E2E Battery Charging')
  await makeItem(MV, 'Number', 'NH E2E Battery Millivolts')
  await makeItem(NULLI, 'Number', 'NH E2E Battery Unknown')
  await putState(NUM, '56')
  await putState(CHG, 'OFF')
  await putState(MV, '3600')
  await putState(NULLI, 'NULL')
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 2, id: 'nh-e2e-battery', name: 'E2E Battery', columns: 12, rowHeight: 28, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-battery')
  await page.waitForSelector('.nh-battery', { timeout: 20000 }).catch(() => {})
  await waitReading('Bar', (r) => r.num === '56', 8000)
  await sleep(600)

  const roots = await probe(page, () => [...document.querySelectorAll('.nh-battery')].map((s) => s.className))
  ok('every battery tile renders', Array.isArray(roots) && roots.length === WIDGETS.length, `${roots?.length} of ${WIDGETS.length}`)
  ok('all eight styles are on the page', STYLES.every((s) => roots?.some((c) => c.includes('nh-battery--' + s))), (roots ?? []).join(' | ').slice(0, 200))
  const errTiles = await probe(page, () => document.querySelectorAll('.nh-widget--error').length)
  ok('no tile fell back to the error boundary', errTiles === 0, 'error tiles=' + errTiles)

  const reads = {}
  for (const l of ['Glow', 'Neon', 'Cells', 'Ring', 'Pods', 'Bar', 'Wave', 'Meter']) reads[l] = await reading(l)
  ok(
    'every style reads 56 with a percent sign',
    Object.values(reads).every((r) => r && r.num === '56' && r.pct),
    Object.entries(reads)
      .map(([l, r]) => `${l}:${r?.num}${r?.pct ? '%' : ''}`)
      .join(' ')
  )
  const mv = await waitReading('Millivolts', (r) => r.num === '50')
  ok('an item on its own scale is read as a percent of that scale', mv?.num === '50' && mv?.pct, JSON.stringify(mv))
  const unknown = await reading('Unknown')
  ok('an item with no state reads a dash and no percent sign', unknown?.num === '-' && unknown?.pct === false && unknown?.level === 'unknown', JSON.stringify(unknown))
  const off = await reading('Text off')
  ok('the percent can be turned off', off && off.num === null, JSON.stringify(off))
  const hostile = await reading('Hostile')
  ok(
    'a configuration of the wrong shape everywhere renders on the defaults',
    hostile && /nh-battery--neon/.test(hostile.cls) && hostile.num === '56' && !hostile.error,
    JSON.stringify(hostile)
  )

  const layout = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const shape = (l) => {
      const w = find(l)
      if (!w) return null
      const body = w.querySelector('.nh-widget__body').getBoundingClientRect()
      return {
        body: Math.round(body.height),
        stack: !!w.querySelector('.nh-battery__stack'),
        over: !!w.querySelector('.nh-battery__over'),
        side: !!w.querySelector('.nh-battery__side'),
        row: !!w.querySelector('.nh-battery__row'),
        column: !!w.querySelector('.nh-battery__column'),
      }
    }
    return { glow: shape('Glow'), glowShort: shape('Glow short'), cells: shape('Cells'), cellsShort: shape('Cells short'), bar: shape('Bar'), barShort: shape('Bar short'), ring: shape('Ring'), ringShort: shape('Ring short') }
  })
  ok(
    'a tall tile puts the number inside the glyph, a short one beside it',
    layout?.glow?.body >= 176 && layout.glow.over && layout.glowShort?.body < 176 && layout.glowShort.side && !layout.glowShort.over,
    JSON.stringify({ glow: layout?.glow, glowShort: layout?.glowShort })
  )
  ok(
    'cells stack the number over the glyph when tall and beside it when short',
    layout?.cells?.column && !layout.cells.side && layout.cellsShort?.side,
    JSON.stringify({ cells: layout?.cells, cellsShort: layout?.cellsShort })
  )
  ok(
    'the bar stacks number over bar when tall and lies them side by side when wide and short',
    layout?.bar?.column && layout.barShort?.row,
    JSON.stringify({ bar: layout?.bar, barShort: layout?.barShort })
  )
  ok('a short wide ring stands beside its number', layout?.ring?.stack && layout?.ringShort?.side, JSON.stringify({ ring: layout?.ring, ringShort: layout?.ringShort }))

  const geom = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const bar = find('Bar')
    const fill = bar?.querySelector('.nh-battery__fill')?.getBoundingClientRect()
    const track = bar?.querySelector('.nh-battery__track')?.getBoundingClientRect()
    const cells = find('Cells')
    const ring = find('Ring')
    const meter = find('Meter')
    const pods = find('Pods')
    const pod = pods?.querySelector('.nh-battery__pod')?.getBoundingClientRect()
    const podfill = pods?.querySelector('.nh-battery__podfill')?.getBoundingClientRect()
    return {
      barFrac: fill && track ? fill.width / (track.width - 8) : null,
      cells: {
        full: cells?.querySelectorAll('.nh-battery__cell--full').length,
        part: cells?.querySelectorAll('.nh-battery__cell--part').length,
        empty: cells?.querySelectorAll('.nh-battery__cell--empty').length,
      },
      ticks: { on: ring?.querySelectorAll('.nh-battery__tick--on').length, all: ring?.querySelectorAll('.nh-battery__tick').length },
      segs: { on: meter?.querySelectorAll('.nh-battery__seg--on').length, all: meter?.querySelectorAll('.nh-battery__seg').length },
      podFrac: pod && podfill ? podfill.height / pod.height : null,
      disc: !!pods?.querySelector('.nh-battery__disc .nh-icon'),
      plainDisc: !!find('Pods plain')?.querySelector('.nh-battery__disc'),
      podcap: pods?.querySelector('.nh-battery__podcap')?.textContent ?? null,
      waveAnim: find('Wave')?.querySelectorAll('animateTransform').length,
      stillAnim: find('Wave still')?.querySelectorAll('animateTransform').length,
    }
  })
  ok('the bar fills to the level', geom && Math.abs(geom.barFrac - 0.56) < 0.03, `fill fraction ${geom?.barFrac?.toFixed(3)}`)
  ok('56 lights two cells, half-lights the third and leaves the fourth', geom && geom.cells.full === 2 && geom.cells.part === 1 && geom.cells.empty === 1, JSON.stringify(geom?.cells))
  ok('56 lights 27 of the 48 ticks', geom && geom.ticks.on === 27 && geom.ticks.all === 48, JSON.stringify(geom?.ticks))
  ok(
    'the meter lights the nearest share of its segments',
    geom && geom.segs.all >= 8 && geom.segs.all <= 20 && geom.segs.on === Math.round(geom.segs.all * 0.56),
    JSON.stringify(geom?.segs)
  )
  ok('the pod fills to the level', geom && Math.abs(geom.podFrac - 0.56) < 0.03, `fill fraction ${geom?.podFrac?.toFixed(3)}`)
  ok('a pod draws its disc only when an icon is set', geom && geom.disc === true && geom.plainDisc === false, JSON.stringify({ disc: geom?.disc, plain: geom?.plainDisc }))
  ok('the pod caption is the one configured', geom?.podcap === 'Tablet', String(geom?.podcap))
  ok('the wave moves unless told not to', geom && geom.waveAnim >= 2 && geom.stillAnim === 0, JSON.stringify({ wave: geom?.waveAnim, still: geom?.stillAnim }))

  const goodFill = await fillOf('Bar', '.nh-battery__fill')
  ok('above the amber threshold the level colour is green', goodFill === GOOD, String(goodFill))
  const accentFill = await fillOf('Accent', '.nh-battery__fill')
  ok("a tile accent colour takes over from the level", accentFill === 'rgb(224, 96, 60)', String(accentFill))

  await putState(NUM, '38')
  const mid = await waitReading('Bar', (r) => r.num === '38')
  const midFill = await fillOf('Bar', '.nh-battery__fill')
  ok('below 45 it turns amber, on every style', mid?.level === 'mid' && midFill === MID && (await reading('Ring'))?.level === 'mid', JSON.stringify({ mid, midFill }))
  await putState(NUM, '12')
  const low = await waitReading('Bar', (r) => r.num === '12')
  const lowFill = await fillOf('Bar', '.nh-battery__fill')
  const lowCells = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Cells')
    return { full: w?.querySelectorAll('.nh-battery__cell--full').length, part: w?.querySelectorAll('.nh-battery__cell--part').length }
  })
  ok('below 20 it turns red and the cells empty down to one part-lit', low?.level === 'low' && lowFill === LOW && lowCells?.full === 0 && lowCells?.part === 1, JSON.stringify({ low, lowFill, lowCells }))
  await putState(NUM, '92')
  const high = await waitReading('Bar', (r) => r.num === '92')
  ok('back above the thresholds it is green again', high?.level === 'good' && (await fillOf('Bar', '.nh-battery__fill')) === GOOD, JSON.stringify(high))
  await putState(NUM, '56')
  await waitReading('Bar', (r) => r.num === '56')

  await putState(CHG, 'ON')
  const chg = await waitReading('Glow', (r) => /nh-battery--charging/.test(r.cls))
  const chargingTiles = await probe(page, () => document.querySelectorAll('.nh-battery--charging').length)
  ok('a charging item that is ON lights every tile bound to it', chargingTiles === CHARGING_TILES, `${chargingTiles} of ${CHARGING_TILES}`)
  ok('the glow says Charging inside the body', chg?.cap === 'Charging', JSON.stringify(chg))
  const podChg = await reading('Pods')
  ok('the pod caption says Charging instead of its own words', podChg?.podcap === 'Charging', JSON.stringify(podChg))
  const bolts = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const cellsBolt = !!find('Cells')?.querySelector('.nh-battery__cell--part + path')
    const neonBolt = find('Neon')?.querySelectorAll('.nh-battery__glyph path')
    const neonFill = neonBolt && neonBolt.length ? getComputedStyle(neonBolt[neonBolt.length - 1]).fill : null
    const barBolt = !!find('Bar')?.querySelector('.nh-battery__fill + path')
    return { cellsBolt, neonFill, barBolt }
  })
  ok(
    'the bolt lights in the part-lit cell, the neon tube and the bar',
    bolts && bolts.cellsBolt && bolts.barBolt && bolts.neonFill !== 'none' && bolts.neonFill !== null,
    JSON.stringify(bolts)
  )
  const room = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const cap = (l) => {
      const c = find(l)?.querySelector('.nh-battery__cap')
      return c ? { bolt: c.classList.contains('nh-battery__cap--bolt'), text: c.textContent.trim() } : null
    }
    const narrow = find('Glow narrow')
    return {
      glow: cap('Glow'),
      neon: cap('Neon squeezed'),
      bar: cap('Bar squeezed'),
      narrowNum: !!narrow?.querySelector('.nh-battery__num'),
      narrowAlone: !!narrow?.querySelector('.nh-battery__side--alone'),
      narrowBolt: !!narrow?.querySelector('.nh-battery__glyph path'),
    }
  })
  ok(
    'a caption with no room keeps the bolt and drops the word',
    room && room.glow?.bolt === false && room.glow?.text === 'Charging' && room.neon?.bolt === true && room.neon?.text === '',
    JSON.stringify(room && { glow: room.glow, neon: room.neon })
  )
  ok(
    'a body too narrow for a number beside the glyph draws the glyph alone, with its bolt',
    room && room.narrowNum === false && room.narrowAlone === true && room.narrowBolt === true,
    JSON.stringify(room && { num: room.narrowNum, alone: room.narrowAlone, bolt: room.narrowBolt })
  )
  await putState(CHG, 'OFF')
  const unchg = await waitReading('Glow', (r) => !/nh-battery--charging/.test(r.cls))
  const stillCharging = await probe(page, () => document.querySelectorAll('.nh-battery--charging').length)
  ok('and OFF puts every bolt out', unchg && stillCharging === 0 && unchg.cap === null, `charging tiles=${stillCharging} cap=${unchg?.cap}`)

  const sizes = await probe(page, () => {
    const caps = [...document.querySelectorAll('.nh-battery__cap, .nh-battery__podcap')].map((c) => parseFloat(getComputedStyle(c).fontSize))
    const nums = [...document.querySelectorAll('.nh-battery__num')].map((c) => parseFloat(getComputedStyle(c).fontSize))
    return { caps, nums }
  })
  ok(
    "captions read at the tile's text size and every number is bigger than it",
    sizes && sizes.caps.length > 0 && sizes.caps.every((s) => s >= 15) && sizes.nums.length > 0 && sizes.nums.every((s) => s >= 20),
    JSON.stringify({ caps: sizes?.caps.slice(0, 4), numMin: sizes ? Math.min(...sizes.nums) : null })
  )

  const spill = await probe(page, () => {
    const out = []
    let scanned = 0
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const root = cell.querySelector('.nh-battery')
      if (!root) continue
      scanned++
      const cr = cell.getBoundingClientRect()
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      for (const el of cell.querySelectorAll('.nh-battery__glyph, .nh-battery__num, .nh-battery__cap, .nh-battery__pod, .nh-battery__stack, .nh-battery__podcap')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const over = Math.max(cr.left - r.left, r.right - cr.right, cr.top - r.top, r.bottom - cr.bottom)
        if (over > 1) out.push(`${label}: ${el.className.baseVal ?? el.className} past by ${over.toFixed(1)}px`)
      }
    }
    return { scanned, spills: [...new Set(out)] }
  })
  ok(
    'no style draws past its tile, short tiles included',
    spill && spill.scanned === WIDGETS.length && spill.spills.length === 0,
    `scanned ${spill?.scanned} of ${WIDGETS.length}` + (spill?.spills.length ? ': ' + spill.spills.join(' | ') : '')
  )

  await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.locator('.nh-cell').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
  const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
  const styleSel = field('Style').locator('select').first()
  const styleN = await styleSel.locator('option').count().catch(() => -1)
  const styleV = await styleSel.inputValue().catch(() => null)
  const colorSel = field('Color').locator('select').first()
  const colorN = await colorSel.locator('option').count().catch(() => -1)
  const colorV = await colorSel.inputValue().catch(() => null)
  ok('the panel offers eight styles and two colour modes, none blank', styleN === 8 && styleV === 'glow' && colorN === 2 && colorV === 'level', JSON.stringify({ styleN, styleV, colorN, colorV }))
  const before = { icon: await field('Icon').count(), caption: await field('Caption').count(), wave: await field('Move the wave').count(), amber: await field('Amber below').count(), text: await field('Show the percent').count() }
  await styleSel.selectOption('pods').catch(() => {})
  await sleep(300)
  const pods = { icon: await field('Icon').count(), caption: await field('Caption').count() }
  await styleSel.selectOption('wave').catch(() => {})
  await sleep(300)
  const wave = { icon: await field('Icon').count(), wave: await field('Move the wave').count() }
  await colorSel.selectOption('accent').catch(() => {})
  await sleep(300)
  const accent = { amber: await field('Amber below').count(), red: await field('Red below').count() }
  ok(
    'the icon and caption belong to pods, the motion switch to wave, the thresholds to colour by level',
    before.icon === 0 && before.caption === 0 && before.wave === 0 && before.amber === 1 && before.text === 1 && pods.icon === 1 && pods.caption === 1 && wave.icon === 0 && wave.wave === 1 && accent.amber === 0 && accent.red === 0,
    JSON.stringify({ before, pods, wave, accent })
  )
  const wasEditing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const editing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  ok('leaving the editor without saving', wasEditing === true && editing === false, `was=${wasEditing} now=${editing}`)

  const target = tile('Bar')
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const b = await target.boundingBox().catch(() => null)
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await sleep(750)
    await page.mouse.up()
    await sleep(400)
  }
  // two items are bound, so the sheet asks which first; then it fetches the item itself, so the reading lands a round trip later
  const picks = await probe(page, () => [...document.querySelectorAll('.nh-detail__pickrow')].map((b) => b.textContent.trim()))
  ok('a hold on a tile with a charging item asks which of the two to show', Array.isArray(picks) && picks.length === 2 && picks.includes(NUM), (picks ?? []).join(', '))
  await page.locator('.nh-detail__pickrow', { hasText: NUM }).first().click({ timeout: 5000 }).catch(() => {})
  let sheet = null
  for (let i = 0; i < 30; i++) {
    sheet = await probe(page, () => {
      const d = document.querySelector('.nh-detail')
      return d ? { range: d.querySelectorAll('input[type="range"]').length, buttons: d.querySelectorAll('.nh-quickbtns').length, text: (d.textContent ?? '').slice(0, 160) } : null
    })
    if (sheet && /56/.test(sheet.text)) break
    await sleep(150)
  }
  ok(
    'a hold opens the sheet with the reading and no control, since the widget only reads its item',
    sheet && sheet.range === 0 && sheet.buttons === 0 && /56/.test(sheet.text),
    JSON.stringify(sheet)
  )
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)

  ok('nothing was commanded', posts.length === 0, posts.slice(0, 3).join(' | '))
  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
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
  console.log('\n' + (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') + '  (' + (results.length - failed.length) + '/' + results.length + ')')
  process.exitCode = failed.length === 0 ? 0 : 1
}
