// Value widget e2e: one reading drawn eight ways, plus the stat widget's fold into it.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-value and
// dashboard:nh-e2e-valuemigrate (neohab:config), managed items nh_e2e_val, nh_e2e_valref,
// nh_e2e_valnull. Commands nothing: every state is set over REST.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'
import { skipSuiteOnProduction } from './lib/guard.mjs'

skipSuiteOnProduction('every check here drives managed items this suite creates')

const UID = 'dashboard:nh-e2e-value'
const MIG_UID = 'dashboard:nh-e2e-valuemigrate'
const NUM = 'nh_e2e_val'
const REF = 'nh_e2e_valref'
const NULLI = 'nh_e2e_valnull'
const ITEMS_MADE = [NUM, REF, NULLI]
const STYLES = ['plain', 'stat', 'spark', 'split', 'bar', 'segment', 'pill', 'hero']
// the item the sparkline is drawn from: a fixture the other history suites already rely on
const SPARK_ITEM = ITEMS.dimmer

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

const val = (label, style, extra) => ({
  id: 'w-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  type: 'value',
  config: { item: NUM, label, ...(style ? { style } : {}), ...extra },
})
const at = (w, x, y, cols, rows) => ({ ...w, layout: { lg: { x, y, w: cols, h: rows } } })

// 6 rows of 28px is a comfortable tile; 3 rows is short; 1-2 columns is where a reading runs out of width
const WIDGETS = [
  at(val('Plain', undefined), 0, 0, 3, 6),
  at(val('Stat', 'stat', { caption: 'Target', badge: 'DO', badgeColor: '#d0202a', subText: 'fixed', subCaption: 'Static' }), 3, 0, 3, 6),
  at(val('Spark', 'spark', { item: SPARK_ITEM, caption: 'Window', trend: 'history', trendPeriod: '24h' }), 6, 0, 3, 6),
  at(val('Split', 'split', { caption: 'Room', icon: 'mdi:thermometer' }), 9, 0, 3, 6),
  at(val('Bar', 'bar', { caption: 'Tank', min: 0, max: 200 }), 0, 6, 3, 6),
  at(val('Segment', 'segment', { caption: 'Console' }), 3, 6, 3, 6),
  at(val('Pill', 'pill', { caption: 'Status' }), 6, 6, 3, 6),
  at(val('Hero', 'hero', { caption: 'Wall' }), 9, 6, 3, 6),

  // the same eight in a short tile, which is where one of them draws outside its cell
  at(val('Plain short', undefined), 0, 12, 3, 3),
  at(val('Stat short', 'stat', { caption: 'Target', badge: 'DO' }), 3, 12, 3, 3),
  at(val('Spark short', 'spark', { item: SPARK_ITEM, caption: 'Window' }), 6, 12, 3, 3),
  at(val('Split short', 'split', { caption: 'Room', icon: 'mdi:thermometer' }), 9, 12, 3, 3),
  at(val('Bar short', 'bar', { caption: 'Tank', min: 0, max: 200 }), 0, 15, 3, 3),
  at(val('Segment short', 'segment', { caption: 'Console' }), 3, 15, 3, 3),
  at(val('Pill short', 'pill', { caption: 'Status' }), 6, 15, 3, 3),
  at(val('Hero short', 'hero', { caption: 'Wall' }), 9, 15, 3, 3),

  /*
   * The band between the tall tiles above and the short ones below - 60px and 116px cells. This is
   * where a part that reserves its own height runs out of tile, and where the container queries that
   * shed a caption, a plot or a bar track have to fire. The sparkline's svg took its height from the
   * viewBox's 1:1 ratio and drew 94px outside a 153x75 cell until it was pinned; nothing in the tall
   * or short seeds could see that.
   */
  at(val('Plain band', undefined), 0, 33, 3, 2),
  at(val('Stat band', 'stat', { caption: 'Target', badge: 'DO' }), 3, 33, 3, 2),
  at(val('Spark band', 'spark', { item: SPARK_ITEM, caption: 'Window' }), 6, 33, 3, 2),
  at(val('Split band', 'split', { caption: 'Room', icon: 'mdi:thermometer' }), 9, 33, 3, 2),
  at(val('Bar band', 'bar', { caption: 'Tank', min: 0, max: 200 }), 0, 35, 3, 2),
  at(val('Segment band', 'segment', { caption: 'Console' }), 3, 35, 3, 2),
  at(val('Pill band', 'pill', { caption: 'Status' }), 6, 35, 3, 2),
  at(val('Hero band', 'hero', { caption: 'Wall' }), 9, 35, 3, 2),
  // and one step up again, where the captions and the plot come back
  at(val('Spark mid', 'spark', { item: SPARK_ITEM, caption: 'Window' }), 0, 37, 3, 4),
  at(val('Bar mid', 'bar', { caption: 'Tank', min: 0, max: 200 }), 3, 37, 3, 4),
  at(val('Split mid', 'split', { caption: 'Room', icon: 'mdi:thermometer' }), 6, 37, 3, 4),
  at(val('Hero mid', 'hero', { caption: 'Wall' }), 9, 37, 3, 4),

  // narrow: an em-sized part has no room here, and a caption is a single long token
  at(val('Narrow bar', 'bar', { caption: 'Tank', min: 0, max: 200 }), 0, 18, 1, 5),
  at(val('Narrow split', 'split', { caption: 'Room', icon: 'mdi:thermometer' }), 1, 18, 2, 5),
  at(val('Narrow hero', 'hero'), 3, 18, 1, 5),

  // colour: a severity stop, a flat colour, and the two looks that fill a shape with it
  at(val('Severity', 'stat', { severity: [{ value: 50, color: '#a3ce4a' }, { value: 500, color: '#e5484d' }] }), 4, 18, 2, 5),
  at(val('Pill filled', 'pill', { color: '#ffd23c' }), 6, 18, 2, 5),
  // the same control on a dark colour: the ink has to move, or it is a constant that happens to suit amber
  at(val('Pill dark', 'pill', { color: '#1b3a5c' }), 8, 18, 2, 5),
  at(val('Split filled', 'split', { color: '#0b78c2', icon: 'mdi:factory' }), 10, 18, 2, 5),

  // trend: the same movement judged three ways, against a second item so no persistence is needed
  at(val('Up good', 'stat', { trend: 'item', trendItem: REF, goodDirection: 'up' }), 0, 23, 3, 5),
  at(val('Up bad', 'stat', { trend: 'item', trendItem: REF, goodDirection: 'down' }), 3, 23, 3, 5),
  at(val('Up plain', 'stat', { trend: 'item', trendItem: REF, goodDirection: 'none' }), 6, 23, 3, 5),
  at(val('Second item', 'stat', { subItem: REF, subCaption: 'Reference' }), 9, 23, 3, 5),

  // alignment, an item with no state, and a config of the wrong shape throughout
  at(val('Centred', 'stat', { align: 'center', caption: 'Mid' }), 0, 28, 3, 5),
  at(val('Righted', 'stat', { align: 'right', caption: 'End' }), 3, 28, 3, 5),
  at(val('Unknown', 'bar', { item: NULLI, min: 0, max: 200 }), 6, 28, 3, 5),
  {
    id: 'w-hostile',
    type: 'value',
    config: {
      item: NUM,
      label: 'Hostile',
      style: 'constructor',
      align: 'toString',
      trend: 'valueOf',
      trendPeriod: '__proto__',
      goodDirection: 42,
      min: 'abc',
      max: -5,
      severity: {},
      badge: 7,
      caption: {},
      iconSize: 'big',
      stateIcons: 'nope',
    },
    layout: { lg: { x: 9, y: 28, w: 3, h: 5 } },
  },
  /*
   * The same shapes again on a look that actually DRAWS a caption, a badge and a second reading.
   * The hostile tile above falls back to the plain look, which draws none of them - so on its own it
   * proved nothing about what React does when handed an object as a child.
   */
  {
    id: 'w-hostile-drawn',
    type: 'value',
    config: {
      item: NUM,
      label: 'Hostile drawn',
      style: 'stat',
      caption: {},
      badge: { nope: 1 },
      subText: ['a', 'b'],
      subCaption: {},
      unit: {},
      align: 'center',
    },
    layout: { lg: { x: 0, y: 39, w: 3, h: 5 } },
  },
]

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
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
      const q = (sel) => w.querySelector(sel)
      // textContent and getAttribute both answer for an element the stylesheet has shed, so anything
      // a container query can hide is read through checkVisibility rather than through presence
      const shown = (el) =>
        !!el && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true })
      const vis = (sel) => (shown(w.querySelector(sel)) ? w.querySelector(sel) : null)
      const plain = q('.nh-value__text')
      const statv = q('.nh-stat__value')
      const root = q('.nh-read')
      const arrow = q('.nh-stat__arrow')
      const fill = q('.nh-read__fill')
      const pill = q('.nh-read__pill')
      return {
        // the plain look keeps its own tree; every other look reads through the stat classes
        num: (plain ?? statv)?.textContent ?? null,
        tree: plain ? 'value' : statv ? 'stat' : null,
        readCls: root?.className ?? null,
        statCls: q('.nh-stat')?.className ?? null,
        unit: q('.nh-value__unit, .nh-stat__unit')?.textContent ?? null,
        ghost: (plain ?? statv)?.getAttribute('data-ghost') ?? null,
        caption: vis('.nh-stat__caption')?.textContent ?? null,
        badge: q('.nh-stat__badge')?.textContent ?? null,
        sub: q('.nh-stat__subvalue')?.textContent ?? null,
        // the label is the translated name a screen reader says; the direction itself is data
        arrow: arrow ? arrow.getAttribute('data-direction') : null,
        arrowTone: arrow ? arrow.className.baseVal.replace(/.*nh-stat__arrow--/, '') : null,
        arrowFill: arrow ? getComputedStyle(arrow).fill : null,
        mainColor: q('.nh-read__main, .nh-stat__main') ? getComputedStyle(q('.nh-read__main, .nh-stat__main')).color : null,
        fillWidth: fill ? Math.round(fill.getBoundingClientRect().width) : null,
        trackWidth: q('.nh-read__track') ? Math.round(q('.nh-read__track').getBoundingClientRect().width) : null,
        ends: [...w.querySelectorAll('.nh-read__ends span')].map((s) => s.textContent),
        pillBg: pill ? getComputedStyle(pill).backgroundColor : null,
        pillInk: pill ? getComputedStyle(pill).color : null,
        discBg: q('.nh-read__disc') ? getComputedStyle(q('.nh-read__disc')).backgroundColor : null,
        segFont: statv ? getComputedStyle(statv).fontFamily : null,
        sparkD: shown(q('.nh-read__plot')) ? (q('.nh-read__line')?.getAttribute('d') ?? null) : null,
        sparkArea: shown(q('.nh-read__plot')) ? (q('.nh-read__area')?.getAttribute('d') ?? null) : null,
        numSize: Math.round(parseFloat(getComputedStyle(plain ?? statv ?? w).fontSize)),
        cellH: Math.round(w.closest('.nh-gcell')?.getBoundingClientRect().height ?? 0),
        cellFont: Math.round(parseFloat(getComputedStyle(w.closest('.nh-gcell') ?? w).fontSize)),
        error: !!w.closest('.nh-gcell')?.querySelector('.nh-widget--error'),
      }
    },
    label
  )
const waitReading = async (label, want, ms = 8000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await reading(label)
    if (last && want(last)) return last
    await sleep(120)
  }
  return last
}

try {
  await makeItem(NUM, 'Number', 'NH E2E Value')
  await makeItem(REF, 'Number', 'NH E2E Value Reference')
  await makeItem(NULLI, 'Number', 'NH E2E Value Unknown')
  await putState(NUM, '123')
  await putState(REF, '100')
  await putState(NULLI, 'NULL')

  // what the server really holds for the sparkline item, so the check below asserts the truth about
  // this target rather than assuming persistence is there
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const hist = await fetch(BASE + '/rest/persistence/items/' + encodeURIComponent(SPARK_ITEM) + '?starttime=' + since + '&boundary=true', {
    headers: AUTH,
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  const histPoints = Array.isArray(hist?.data) ? hist.data.length : 0

  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 3, id: 'nh-e2e-value', name: 'E2E Value', columns: 12, rowHeight: 28, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  // seeded before the app is ever loaded: the config is fetched once at startup, so a dashboard
  // created after that is one the running app has never heard of
  await fetch(NS + '/' + encodeURIComponent(MIG_UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const migSeed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: MIG_UID,
      component: 'neohab:dashboard',
      config: {
        version: 2,
        id: 'nh-e2e-valuemigrate',
        name: 'E2E Value Migrate',
        columns: 12,
        rowHeight: 28,
        gap: 6,
        widgets: [
          {
            id: 'w-old',
            type: 'stat',
            config: { item: NUM, label: 'Old stat', unit: 'W', caption: 'Was a stat', badge: 'OLD', subText: 'kept' },
            layout: { lg: { x: 0, y: 0, w: 4, h: 6 } },
          },
          {
            id: 'w-oldcentre',
            type: 'stat',
            config: { item: NUM, label: 'Old centred', align: 'center' },
            layout: { lg: { x: 4, y: 0, w: 4, h: 6 } },
          },
          {
            id: 'w-oldvalue',
            type: 'value',
            config: { item: NUM, label: 'Old value' },
            layout: { lg: { x: 8, y: 0, w: 4, h: 6 } },
          },
        ],
      },
    }),
  })
  ok('seed a dashboard written before the merge', migSeed.status === 200, 'status=' + migSeed.status)

  await page.goto(APP + '#/d/nh-e2e-value')
  await page.waitForSelector('.nh-value, .nh-stat, .nh-read', { timeout: 20000 }).catch(() => {})
  await waitReading('Plain', (r) => r.num === '123')
  await sleep(800)

  // ---- every look renders, and each keeps the tree themes are written against ----
  const errTiles = await probe(page, () => document.querySelectorAll('.nh-widget--error').length)
  ok('no tile fell back to the error boundary', errTiles === 0, 'error tiles=' + errTiles)

  const roots = await probe(page, () => ({
    plain: document.querySelectorAll('.nh-value').length,
    stat: document.querySelectorAll('.nh-stat').length,
    read: [...document.querySelectorAll('.nh-read')].map((e) => e.className),
    cells: document.querySelectorAll('.nh-gcell').length,
  }))
  ok('every seeded tile rendered', roots?.cells === WIDGETS.length, `${roots?.cells} of ${WIDGETS.length}`)
  ok(
    'all six new looks are on the page',
    ['spark', 'split', 'bar', 'segment', 'pill', 'hero'].every((s) => roots?.read.some((c) => c.includes('nh-read--' + s))),
    (roots?.read ?? []).join(' | ').slice(0, 220)
  )
  ok(
    'the plain and stat looks still draw their own trees, which every theme is written against',
    roots?.plain > 0 && roots?.stat > 0,
    `nh-value=${roots?.plain} nh-stat=${roots?.stat}`
  )

  const reads = {}
  for (const l of ['Plain', 'Stat', 'Split', 'Bar', 'Segment', 'Pill', 'Hero']) reads[l] = await reading(l)
  ok(
    'every look reads the same value',
    Object.values(reads).every((r) => r && r.num === '123'),
    Object.entries(reads)
      .map(([l, r]) => `${l}:${r?.num}`)
      .join(' ')
  )
  ok(
    'the plain look keeps the value tree and the rest read through the stat classes',
    reads.Plain?.tree === 'value' && ['Stat', 'Split', 'Bar', 'Segment', 'Pill', 'Hero'].every((l) => reads[l]?.tree === 'stat'),
    Object.entries(reads)
      .map(([l, r]) => `${l}:${r?.tree}`)
      .join(' ')
  )
  ok(
    'a caption is drawn in every look that offers one',
    ['Stat', 'Split', 'Bar', 'Segment', 'Pill', 'Hero'].every((l) => reads[l]?.caption === reads[l]?.caption && reads[l]?.caption),
    Object.entries(reads)
      .map(([l, r]) => `${l}:${r?.caption}`)
      .join(' ')
  )

  // the shed is only meaningful if the same tile shows the caption when it has the room, so both
  // halves are asserted together rather than "the short one has none"
  const bandCaps = {}
  for (const l of ['Stat band', 'Split band', 'Bar band', 'Segment band', 'Pill band']) bandCaps[l] = await reading(l)
  ok(
    'a caption is shed on a tile too short to hold it, and is back on the taller one',
    Object.values(bandCaps).every((r) => r && !r.caption) && reads.Stat?.caption === 'Target' && reads.Bar?.caption === 'Tank',
    Object.entries(bandCaps)
      .map(([l, r]) => `${l}:${r?.caption ?? 'shed'}@${r?.cellH}px/${r?.cellFont}px`)
      .join(' ') + ` | tall Stat:${reads.Stat?.caption}@${reads.Stat?.cellH}px`
  )
  const sparkBand = await reading('Spark band')
  const sparkMid = await reading('Spark mid')
  ok(
    'the sparkline drops its plot where there is no room for one, and draws it where there is',
    sparkBand && sparkBand.sparkD === null && sparkMid && typeof sparkMid.sparkD === 'string',
    `band plot=${sparkBand?.sparkD === null ? 'shed' : 'drawn'} mid plot=${sparkMid?.sparkD === null ? 'shed' : 'drawn'}`
  )

  // ---- the parts each look owns ----
  const bar = reads.Bar
  ok(
    'the bar places the reading between the two ends of its own scale',
    bar && bar.trackWidth > 0 && Math.abs(bar.fillWidth / bar.trackWidth - 123 / 200) < 0.03,
    JSON.stringify({ fill: bar?.fillWidth, track: bar?.trackWidth, want: (123 / 200).toFixed(3), got: (bar?.fillWidth / bar?.trackWidth).toFixed(3) })
  )
  ok('the bar names both ends of its scale', JSON.stringify(bar?.ends) === JSON.stringify(['0', '200']), JSON.stringify(bar?.ends))
  const unknownBar = await reading('Unknown')
  ok(
    'an item with no state leaves the bar empty rather than drawing its floor as a reading',
    unknownBar && unknownBar.fillWidth === null && unknownBar.trackWidth > 0,
    JSON.stringify({ fill: unknownBar?.fillWidth, track: unknownBar?.trackWidth, num: unknownBar?.num })
  )

  ok(
    'the segment look asks for the seven-segment face in whatever theme is on',
    /DSEG7/i.test(reads.Segment?.segFont ?? ''),
    String(reads.Segment?.segFont)
  )
  const segFont = await probe(page, () => !!document.getElementById('nh-segment-font'))
  ok('and declares that face itself, since only the LCD theme ships it', segFont === true, 'style tag present=' + segFont)
  ok(
    'a segmentable reading carries the eights that sit behind it',
    reads.Segment?.ghost === '888',
    `ghost=${reads.Segment?.ghost} num=${reads.Segment?.num}`
  )

  const hero = reads.Hero
  ok(
    'the hero look draws the reading far bigger than the plain one',
    hero && reads.Plain && hero.numSize > reads.Plain.numSize * 1.4,
    `hero=${hero?.numSize}px plain=${reads.Plain?.numSize}px`
  )

  // ---- the sparkline, against what this server actually holds ----
  const spark = await waitReading('Spark', (r) => r.sparkD !== null, 10000)
  if (histPoints >= 2) {
    const commands = (spark?.sparkD ?? '').split(/(?=[ML])/).filter(Boolean).length
    ok(
      'the sparkline draws the window the server returned',
      typeof spark?.sparkD === 'string' && commands >= 2 && !/NaN|Infinity/.test(spark.sparkD),
      `${histPoints} points from the server, ${commands} path commands`
    )
    ok(
      'and closes an area under it',
      typeof spark?.sparkArea === 'string' && /Z$/.test(spark.sparkArea) && !/NaN|Infinity/.test(spark.sparkArea),
      (spark?.sparkArea ?? '(none)').slice(-40)
    )
  } else {
    ok(
      'the sparkline draws nothing on a server with no history for it, and does not break the tile',
      spark && spark.sparkD === null && spark.error === false && spark.num !== null,
      `${histPoints} points from the server; tile still reads ${spark?.num}`
    )
  }

  // ---- colour ----
  const sev = await reading('Severity')
  ok(
    'a severity stop colours the reading above the flat colour',
    sev?.mainColor === 'rgb(229, 72, 77)',
    `123 is above the 50 stop, so the 500 stop wins: ${sev?.mainColor}`
  )
  const pillFilled = await reading('Pill filled')
  const pillDark = await reading('Pill dark')
  ok(
    'a filled pill takes the colour, and its ink follows that colour rather than being a constant',
    pillFilled?.pillBg === 'rgb(255, 210, 60)' &&
      pillFilled?.pillInk === 'rgb(16, 22, 28)' &&
      pillDark?.pillBg === 'rgb(27, 58, 92)' &&
      pillDark?.pillInk === 'rgb(255, 255, 255)',
    `amber ${pillFilled?.pillBg} -> ${pillFilled?.pillInk}; navy ${pillDark?.pillBg} -> ${pillDark?.pillInk}`
  )
  const splitFilled = await reading('Split filled')
  ok(
    'a filled split disc takes the colour too',
    splitFilled?.discBg === 'rgb(11, 120, 194)',
    `disc=${splitFilled?.discBg}`
  )
  const pillPlain = await reading('Pill')
  ok(
    'a pill with no colour set keeps the theme accent rather than a guess',
    pillPlain?.pillBg && pillPlain.pillBg !== 'rgba(0, 0, 0, 0)' && pillPlain.pillBg !== pillFilled?.pillBg,
    `bg=${pillPlain?.pillBg}`
  )

  // ---- trend ----
  const up = await waitReading('Up good', (r) => r.arrow === 'up')
  const down = await reading('Up bad')
  const plainTrend = await reading('Up plain')
  ok(
    'the same rise is good, bad or unjudged depending on what good means here',
    up?.arrow === 'up' && up?.arrowTone === 'good' && down?.arrowTone === 'bad' && plainTrend?.arrowTone === 'neutral',
    `good=${up?.arrowTone} bad=${down?.arrowTone} none=${plainTrend?.arrowTone}`
  )
  ok(
    'and a good arrow is green where a bad one is red',
    up?.arrowFill === 'rgb(63, 185, 80)' && down?.arrowFill === 'rgb(255, 107, 112)',
    `good=${up?.arrowFill} bad=${down?.arrowFill}`
  )
  await putState(REF, '200')
  const fell = await waitReading('Up good', (r) => r.arrow === 'down')
  ok(
    'the arrow follows the comparison item live',
    fell?.arrow === 'down' && fell?.arrowTone === 'bad',
    `reference moved to 200, arrow=${fell?.arrow}/${fell?.arrowTone}`
  )
  await putState(REF, '100')
  const second = await reading('Second item')
  ok('a second reading can be another item', second?.sub !== null && second?.sub !== '', `sub=${second?.sub}`)
  ok('or fixed text', reads.Stat?.sub === 'fixed', `sub=${reads.Stat?.sub}`)
  ok('a badge is drawn beside the reading', reads.Stat?.badge === 'DO', `badge=${reads.Stat?.badge}`)

  // ---- alignment ----
  const centred = await reading('Centred')
  const righted = await reading('Righted')
  ok(
    'the stat column can be moved to the middle or the end',
    /nh-stat--center/.test(centred?.statCls ?? '') && /nh-stat--right/.test(righted?.statCls ?? ''),
    `${centred?.statCls} | ${righted?.statCls}`
  )

  // ---- a config of the wrong shape throughout ----
  const hostile = await reading('Hostile')
  ok(
    'a config of the wrong shape falls back to the plain look rather than throwing',
    hostile && hostile.error === false && hostile.tree === 'value' && hostile.num === '123',
    JSON.stringify({ tree: hostile?.tree, num: hostile?.num, error: hostile?.error })
  )
  const hostileDrawn = await reading('Hostile drawn')
  ok(
    'and a look that draws a caption, a badge and a unit drops the ones that are not text, rather than handing React an object',
    hostileDrawn &&
      hostileDrawn.error === false &&
      hostileDrawn.num === '123' &&
      hostileDrawn.caption === null &&
      hostileDrawn.badge === null &&
      hostileDrawn.sub === null,
    JSON.stringify({
      error: hostileDrawn?.error,
      num: hostileDrawn?.num,
      caption: hostileDrawn?.caption,
      badge: hostileDrawn?.badge,
      sub: hostileDrawn?.sub,
      unit: hostileDrawn?.unit
    })
  )

  // ---- nothing draws outside its own tile, in any of the three shapes ----
  const spill = await probe(page, () => {
    const out = []
    let scanned = 0
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const root = cell.querySelector('.nh-value, .nh-stat, .nh-read')
      if (!root) continue
      scanned++
      const cr = cell.getBoundingClientRect()
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      const parts =
        '.nh-value__text, .nh-value__unit, .nh-value__icon, .nh-stat__value, .nh-stat__unit, .nh-stat__caption,' +
        '.nh-stat__badge, .nh-stat__foot, .nh-stat__subvalue, .nh-read__main, .nh-read__track, .nh-read__ends,' +
        '.nh-read__disc, .nh-read__pill, .nh-read__plot'
      for (const el of cell.querySelectorAll(parts)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const over = Math.max(cr.left - r.left, r.right - cr.right, cr.top - r.top, r.bottom - cr.bottom)
        if (over > 1) out.push(`${label}: ${el.className.baseVal ?? el.className} past by ${over.toFixed(1)}px`)
      }
    }
    return { scanned, spills: [...new Set(out)] }
  })
  ok(
    'no look draws past its tile, short and narrow ones included',
    spill && spill.scanned === WIDGETS.length && spill.spills.length === 0,
    `scanned ${spill?.scanned} of ${WIDGETS.length}` + (spill?.spills.length ? ': ' + spill.spills.join(' | ') : '')
  )

  // ---- the settings panel ----
  await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.locator('.nh-cell').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
  const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
  const styleSel = field('Style').locator('select').first()
  const styleN = await styleSel.locator('option').count().catch(() => -1)
  const styleV = await styleSel.inputValue().catch(() => null)
  ok(
    'the panel offers eight styles and starts on the plain one, so a stored value is untouched',
    styleN === 8 && styleV === 'plain',
    JSON.stringify({ styleN, styleV })
  )
  const counts = async () => ({
    align: await field('Alignment').count(),
    min: await field('Input minimum').count(),
    badge: await field('Badge').count(),
    window: await field('History window').count(),
  })
  const plainFields = await counts()
  await styleSel.selectOption('bar').catch(() => {})
  await sleep(300)
  const barFields = await counts()
  await styleSel.selectOption('spark').catch(() => {})
  await sleep(300)
  const sparkFields = await counts()
  await styleSel.selectOption('stat').catch(() => {})
  await sleep(300)
  const statFields = await counts()
  ok(
    'the scale belongs to the bar, the badge to the looks with room for one, and the window to the sparkline',
    plainFields.align === 0 &&
      plainFields.min === 0 &&
      plainFields.badge === 0 &&
      plainFields.window === 0 &&
      barFields.min === 1 &&
      barFields.align === 1 &&
      barFields.badge === 0 &&
      sparkFields.window === 1 &&
      sparkFields.badge === 1 &&
      statFields.badge === 1 &&
      statFields.min === 0,
    JSON.stringify({ plainFields, barFields, sparkFields, statFields })
  )
  const trendSel = field('Trend arrow').locator('select').first()
  await trendSel.selectOption('history').catch(() => {})
  await sleep(300)
  const historyWindow = await field('History window').count()
  ok('and the window is offered for a history trend in any style', historyWindow === 1, 'window fields=' + historyWindow)

  const wasEditing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const editing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  ok('leaving the editor without saving', wasEditing === true && editing === false, `was=${wasEditing} now=${editing}`)

  // ---- a hold offers no control, because the widget only reads ----
  const target = tile('Plain')
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const b = await target.boundingBox().catch(() => null)
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await sleep(750)
    await page.mouse.up()
    await sleep(400)
  }
  let sheet = null
  for (let i = 0; i < 30; i++) {
    sheet = await probe(page, () => {
      const d = document.querySelector('.nh-detail')
      return d
        ? { range: d.querySelectorAll('input[type="range"]').length, buttons: d.querySelectorAll('.nh-quickbtns').length, text: (d.textContent ?? '').slice(0, 160) }
        : null
    })
    if (sheet && /123/.test(sheet.text)) break
    await sleep(150)
  }
  ok(
    'a hold opens the sheet with the reading and no control, since the widget only reads its item',
    sheet && sheet.range === 0 && sheet.buttons === 0 && /123/.test(sheet.text),
    JSON.stringify(sheet)
  )
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)

  /*
   * The pill again, in a theme that colours the reading itself. LCD and Ops both set
   * `.nh-stat__value { color }` directly, and an inherited colour loses to any rule at all - which
   * drew cyan digits on a cyan lozenge, legible in the dark theme and invisible here. A check that
   * only ever runs in one theme cannot see this class of thing.
   */
  const themed = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  await themed.route('**/rest/items/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()))
  await themed.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
      localStorage.setItem('neohab:themeOverride', 'lcd')
    } catch {}
  }, TOKEN)
  await themed.goto(APP + '#/d/nh-e2e-value', { waitUntil: 'domcontentloaded' })
  await themed.waitForSelector('.nh-read--pill', { timeout: 20000 }).catch(() => {})
  await sleep(2500)
  const pillInk = await probe(themed, () => {
    const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const lum = (c) => {
      const f = c.map((v) => {
        const x = v / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
    }
    const out = []
    for (const pill of document.querySelectorAll('.nh-read__pill')) {
      const value = pill.querySelector('.nh-stat__value')
      if (!value) continue
      const bg = rgb(getComputedStyle(pill).backgroundColor)
      const fg = rgb(getComputedStyle(value).color)
      if (bg.length < 3 || fg.length < 3) continue
      const a = lum(bg)
      const b = lum(fg)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      out.push({
        label: pill.closest('.nh-widget')?.querySelector('.nh-widget__labeltext')?.textContent ?? '?',
        bg: getComputedStyle(pill).backgroundColor,
        fg: getComputedStyle(value).color,
        opaque: !/rgba\([^)]*,\s*0(\.\d+)?\)$/.test(getComputedStyle(pill).backgroundColor),
        ratio: Math.round(ratio * 100) / 100,
      })
    }
    return out
  })
  // the theme sets variables rather than an attribute, so the tell that LCD really loaded is the
  // seven-segment face it alone gives a reading - without that precondition this check could pass
  // because no theme CSS applied at all
  const lcdFont = await probe(themed, () => {
    const v = document.querySelector('.nh-read--pill .nh-stat__value')
    return v ? getComputedStyle(v).fontFamily : '(no pill)'
  })
  ok(
    'the pill is opaque and its reading is legible on it in a theme that colours readings',
    /DSEG/i.test(String(lcdFont)) &&
      Array.isArray(pillInk) &&
      pillInk.length >= 2 &&
      pillInk.every((p) => p.opaque && p.ratio >= 4.5),
    `font=${lcdFont} ` + (pillInk ?? []).map((p) => `${p.label}:${p.ratio}:1 (${p.fg} on ${p.bg})`).join(' | ')
  )
  await themed.close()

  // ---- a dashboard stored before the merge ----
  // a hash-only change is a same-document navigation, so the reload is what actually remounts
  await page.goto(APP + '#/d/nh-e2e-valuemigrate')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-stat, .nh-value', { timeout: 20000 }).catch(() => {})
  await waitReading('Old stat', (r) => r.num === '123')
  await sleep(500)
  const old = await reading('Old stat')
  ok(
    'a stored stat comes back as a value in stat style, with everything it carried',
    old && old.error === false && old.tree === 'stat' && old.num === '123' && old.caption === 'Was a stat' && old.badge === 'OLD' && old.sub === 'kept',
    JSON.stringify({ tree: old?.tree, num: old?.num, caption: old?.caption, badge: old?.badge, sub: old?.sub })
  )
  ok(
    'and lays its column out from the left, which is what it did before',
    old && !/nh-stat--center|nh-stat--right/.test(old.statCls ?? ''),
    `class=${old?.statCls}`
  )
  const oldCentre = await reading('Old centred')
  ok('an alignment it had stored is kept', /nh-stat--center/.test(oldCentre?.statCls ?? ''), `class=${oldCentre?.statCls}`)
  const oldValue = await reading('Old value')
  ok(
    'a stored value is still the plain look, so the merge moved nothing on an existing dashboard',
    oldValue && oldValue.tree === 'value' && oldValue.num === '123',
    JSON.stringify({ tree: oldValue?.tree, num: oldValue?.num })
  )
  const migErr = await probe(page, () => document.querySelectorAll('.nh-widget--error').length)
  ok('no tile on the migrated dashboard fell back to the error boundary', migErr === 0, 'error tiles=' + migErr)

  const stored = await (await fetch(NS + '/' + encodeURIComponent(MIG_UID), { headers: AUTH })).json()
  ok(
    'and the migration was not written back to the server on its own',
    stored?.config?.version === 2 && stored?.config?.widgets?.[0]?.type === 'stat',
    `stored version=${stored?.config?.version} type=${stored?.config?.widgets?.[0]?.type}`
  )

  ok('nothing was commanded', posts.length === 0, posts.slice(0, 3).join(' | '))
  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  await browser.close().catch(() => {})
  for (const uid of [UID, MIG_UID]) await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  for (const item of ITEMS_MADE) await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const mine = [UID, MIG_UID]
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => mine.includes(c.uid)).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboards removed', left.length === 0, left.join(','))
  const itemsLeft = []
  for (const item of ITEMS_MADE) {
    const r = await fetch(itemUrl(item), { headers: AUTH }).catch(() => null)
    if (r && r.status === 200) itemsLeft.push(item)
  }
  ok('cleanup: items removed', itemsLeft.length === 0, itemsLeft.join(','))

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
