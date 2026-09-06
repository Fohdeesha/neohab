/**
 * Assembly theme + the widget hooks it rides on.
 *
 * Covers: the Assembly theme itself (bundled Poppins, glass tiles with backdrop blur and
 * hairline mint borders, the lit green page, the whole-tile active-button treatment, header
 * icon chips, panel-group hairlines, glass masthead, dashed + tile), the solid-arc band films
 * (--nh-band-light / --nh-band-shade: present and lit under Assembly, present but fully
 * transparent under the default theme - the inert-by-default contract), the dial's
 * "Maximum beside the value" reading ("30 / 58"), and the dial's new header icon.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-assembly and deletes exactly it.
 * The theme is applied through the per-device override, so `settings` is never written. The
 * dimmer is commanded via REST only (recorded first, restored at the end); the seeded toggle
 * button binds the switch item with command == its CURRENT state, so it lights from SSE alone
 * and nothing is ever clicked.
 */
import { launchChromium } from './lib/browser.mjs'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const ID = 'nh-e2e-assembly'
const UID = 'dashboard:' + ID
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
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const rgba = (s) => {
  let m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s ?? '')
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(s ?? '')
  if (m) return [...[0, 1, 2].map((i) => Math.round(Number(m[i + 1]) * 255)), m[4] === undefined ? 1 : Number(m[4])]
  return null
}
const near = (a, b, tol = 10) => !!a && !!b && b.every((v, i) => Math.abs((a[i] ?? 0) - v) <= tol)

const browser = await launch()
const errs = []

async function newPage(theme) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('dialog', (d) => d.accept())
  await page.addInitScript(
    ({ t, th }) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
        if (th) localStorage.setItem('neohab:themeOverride', th)
        else localStorage.removeItem('neohab:themeOverride')
      } catch {}
    },
    { t: TOKEN, th: theme }
  )
  return page
}

/** Evaluate without letting a missing element abort the run (pre-feature builds must fail
    their own checks, not everything after the first). */
const probe = async (page, fn, arg) => {
  try {
    return (await page.evaluate(fn, arg)) ?? {}
  } catch (e) {
    return { probeError: String(e && e.message).slice(0, 100) }
  }
}
/** Poll a probe until pred holds or the budget runs out; returns the last value either way. */
async function poll(page, fn, pred, ms = 8000) {
  const t0 = Date.now()
  let last
  for (;;) {
    last = await probe(page, fn)
    if (pred(last) || Date.now() - t0 > ms) return last
    await sleep(250)
  }
}

const w = (id, type, x, y, ww, h, config) => ({ id, type, config, layout: { lg: { x, y, w: ww, h } } })

const initialDimmer = await itemState(ITEMS.dimmer)
const switchState = await itemState(ITEMS.switch)

try {
  // a value well inside 0..58 so the arc has a span and both films exist
  await sendItem(ITEMS.dimmer, 30)
  await sleep(700)

  // ---------- seed ----------
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: ID,
        name: 'E2E Assembly',
        columns: 8,
        rowHeight: 'match',
        gap: 12,
        widgets: [
          // explicit band color, to prove the film design leaves the band's own paint alone
          w('g1', 'dial', 0, 0, 2, 2, {
            item: ITEMS.dimmer, label: 'LP - 1', icon: 'mdi:chart-arc', style: 'arc', readOnly: true,
            showMax: true, min: 0, max: 58, step: 1, arcStart: 215, arcSweep: 290, color: '#2196f3',
            markers: [{ value: 44, color: '#f0813c' }],
          }),
          w('g2', 'dial', 2, 0, 2, 2, {
            item: ITEMS.dimmer, label: 'Plain', style: 'arc', readOnly: true, min: 0, max: 100, step: 1,
          }),
          w('b1', 'button', 4, 0, 2, 2, {
            item: ITEMS.switch, label: 'Zone A', icon: 'mdi:robot-industrial', iconSize: 40,
            toggle: true, command: switchState,
          }),
          // media + caption: the zone-card layout; its icon must be suppressed by the media
          w('b3', 'button', 6, 2, 2, 1, {
            label: 'Zone C', command: 'noop', icon: 'mdi:factory', caption: 'Vision line',
            imageUrl:
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23123f24'/%3E%3C/svg%3E",
          }),
          w('b2', 'button', 6, 0, 2, 2, {
            item: ITEMS.switch, label: 'Zone B', icon: 'mdi:robot-industrial', iconSize: 40,
            toggle: true, command: 'never-match',
          }),
          w('l1', 'label', 0, 2, 2, 1, { text: 'Bare Label' }),
          w('s1', 'stat', 2, 2, 2, 1, { item: ITEMS.dimmer, label: 'Stat', icon: 'mdi:factory', group: 'Panel' }),
          w('s2', 'stat', 4, 2, 2, 1, { item: ITEMS.dimmer, label: 'Stat 2', group: 'Panel' }),
        ],
      },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  // ---------- Assembly theme, dashboard ----------
  const page = await newPage('assembly')
  await page.goto(`${BASE}/neohab/index.html#/d/${ID}`, { waitUntil: 'load', timeout: 60000 })
  const arcs = await poll(page, () => document.querySelectorAll('.nh-dial--arc').length, (n) => n === 2)
  ok('two arc gauges render', arcs === 2, 'count=' + JSON.stringify(arcs))
  // the reading arrives over SSE; wait for it before reading center text
  await poll(page, () => document.querySelector('.nh-gauge__value')?.textContent ?? '', (t) => String(t).includes('30'))

  ok('token: --nh-primary is the board green',
    (await probe(page, () => document.documentElement.style.getPropertyValue('--nh-primary').trim())) === '#40d364')

  const font = await probe(page, async () => {
    await document.fonts.ready
    return {
      body: getComputedStyle(document.body).fontFamily,
      loaded: [...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'Poppins' && f.status === 'loaded'),
      fetch400: await fetch('fonts/poppins-400.woff2').then((r) => r.ok).catch(() => false),
      fetch600: await fetch('fonts/poppins-600.woff2').then((r) => r.ok).catch(() => false),
    }
  })
  ok('body font is Poppins', String(font.body ?? '').startsWith('Poppins'), String(font.body).slice(0, 40))
  ok('a Poppins face actually loaded', font.loaded === true)
  ok('poppins woff2 served from the jar', font.fetch400 === true && font.fetch600 === true)

  const glass = await probe(page, () => {
    const el = [...document.querySelectorAll('.nh-widget')].find((e) => !e.classList.contains('nh-widget--bare'))
    const cs = getComputedStyle(el)
    return { bf: cs.backdropFilter, bg: cs.backgroundColor, bc: cs.borderTopColor, br: cs.borderRadius, bgi: cs.backgroundImage }
  })
  ok('tiles are glass: backdrop blur', String(glass.bf ?? '').includes('blur'), String(glass.bf))
  ok('tiles are translucent', (rgba(glass.bg)?.[3] ?? 1) < 0.8, String(glass.bg))
  ok('hairline mint border', (rgba(glass.bc)?.[3] ?? 0) > 0.04 && near(rgba(glass.bc), [190, 255, 210, 0], 40), String(glass.bc))
  ok('rounded 14px corners', glass.br === '14px', String(glass.br))

  const bare = await probe(page, () => {
    const cs = getComputedStyle(document.querySelector('.nh-widget--bare'))
    return { bg: cs.backgroundColor, bf: cs.backdropFilter }
  })
  ok('bare label stays bare (no surface, no blur)', (rgba(bare.bg)?.[3] ?? 1) === 0 && bare.bf === 'none', JSON.stringify(bare))

  const body = await probe(page, async () => {
    const cs = getComputedStyle(document.body)
    return {
      bgi: cs.backgroundImage,
      ff: cs.fontFamily,
      hallFetch: await fetch('backgrounds/assembly-hall.jpg').then((r) => r.ok).catch(() => false),
    }
  })
  ok('page is lit, not flat: body gradient', String(body.bgi ?? '').includes('radial-gradient'))
  ok('the hall backdrop is a body layer', String(body.bgi ?? '').includes('assembly-hall.jpg'), String(body.bgi).slice(0, 80))
  ok('hall backdrop served from the jar', body.hallFetch === true)

  // ---------- band films ----------
  const films = await probe(page, () => {
    const g1 = [...document.querySelectorAll('.nh-dial--arc')][0]
    const band = g1?.querySelector('.nh-gauge__band')
    const light = g1?.querySelector('.nh-gauge__bandlight')
    const shade = g1?.querySelector('.nh-gauge__bandshade')
    const tipStops = light
      ? [...g1.querySelectorAll(`#${light.getAttribute('stroke').slice(5, -1)} stop`)].map(
          (s) => getComputedStyle(s).stopColor
        )
      : null
    return {
      bandStroke: band?.getAttribute('stroke'),
      lightPaint: light?.getAttribute('stroke') ?? 'absent',
      shadePaint: shade?.getAttribute('stroke') ?? 'absent',
      tipStops,
      cap: band ? getComputedStyle(band).strokeLinecap : null,
      trackW: g1 ? getComputedStyle(g1.querySelector('.nh-gauge__btrack')).strokeWidth : null,
      face: g1 ? getComputedStyle(g1.querySelector('.nh-gauge__face')).fill : null,
      center: (() => {
        const c = g1?.querySelector('.nh-gauge__center')
        return c ? getComputedStyle(c).fill : 'absent'
      })(),
    }
  })
  ok('band keeps its own attribute paint', films.bandStroke === '#2196f3', String(films.bandStroke))
  ok('tip film present with gradient paint', String(films.lightPaint).startsWith('url(#nh-g-tip-'), String(films.lightPaint))
  ok('shade film present with gradient paint', String(films.shadePaint).startsWith('url(#nh-g-shade-'), String(films.shadePaint))
  ok('film is LIT under Assembly (tip stop opacity ~0.5)',
    (rgba(films.tipStops?.[1])?.[3] ?? 0) > 0.3, JSON.stringify(films.tipStops))
  ok('round caps under Assembly', films.cap === 'round', String(films.cap))
  ok('thin dim track under Assembly', films.trackW === '2.4px', String(films.trackW))
  ok('open face: sector transparent', (rgba(films.face)?.[3] ?? 1) === 0, String(films.face))
  ok('open face: center disc transparent', (rgba(films.center)?.[3] ?? 1) === 0, String(films.center))

  // ---------- showMax + dial header icon ----------
  const center = await probe(page, () => {
    const dials = [...document.querySelectorAll('.nh-dial--arc')]
    const cells = dials.map((d) => d.closest('.nh-widget'))
    return {
      max1: dials[0]?.querySelector('.nh-gauge__max')?.textContent ?? 'absent',
      max2: dials[1]?.querySelector('.nh-gauge__max')?.textContent ?? 'absent',
      icon1: !!cells[0]?.querySelector('.nh-widget__label .nh-icon'),
      icon2: !!cells[1]?.querySelector('.nh-widget__label .nh-icon'),
      chip1: cells[0]
        ? getComputedStyle(cells[0].querySelector('.nh-widget__labelmain'), '::before').backgroundImage
        : 'absent',
    }
  })
  ok('showMax draws "/ 58"', String(center.max1).trim() === '/ 58', JSON.stringify(center.max1))
  ok('no showMax -> no max text', center.max2 === 'absent', String(center.max2))
  ok('dial header icon renders', center.icon1 === true)
  ok('dial without icon has none', center.icon2 === false)
  ok('header icon sits on a green chip', String(center.chip1).includes('gradient'), String(center.chip1).slice(0, 60))

  // ---------- buttons: the zone-card treatment ----------
  const btn = await poll(page, () => {
    const active = document.querySelector('.nh-button--active')
    if (!active) return {}
    const tile = active.closest('.nh-widget')
    // the icon-carrying resting button (b2) - the media button (b3) has no icon by design
    const rest = [...document.querySelectorAll('.nh-button')].find(
      (b) => !b.classList.contains('nh-button--active') && !b.querySelector('.nh-button__media')
    )
    return {
      tileBorder: getComputedStyle(tile).borderTopColor,
      tileBg: getComputedStyle(tile).backgroundColor,
      restBg: rest ? getComputedStyle(rest).backgroundColor : null,
      restBorder: rest ? getComputedStyle(rest).borderTopWidth : null,
      restIcon: rest ? getComputedStyle(rest.querySelector('.nh-icon--mdi')).backgroundColor : null,
      activeIcon: getComputedStyle(active.querySelector('.nh-icon--mdi')).backgroundColor,
    }
  }, (r) => !!r.tileBorder)
  // zone-card media + caption on the active button (b1 carries imageUrl + caption)
  const media = await probe(page, () => {
    const withMedia = document.querySelector('.nh-button__media')?.closest('.nh-button')
    const plain = [...document.querySelectorAll('.nh-button')].find((b) => !b.querySelector('.nh-button__media'))
    return {
      count: document.querySelectorAll('.nh-button__media').length,
      fit: withMedia ? getComputedStyle(withMedia.querySelector('.nh-button__media')).objectFit : null,
      caption: withMedia?.querySelector('.nh-button__caption')?.textContent ?? 'absent',
      iconSuppressed: withMedia ? !withMedia.querySelector('.nh-icon') : null,
      align: withMedia ? getComputedStyle(withMedia).alignItems : null,
      labelWeight: withMedia ? getComputedStyle(withMedia.querySelector('.nh-button__label')).fontWeight : null,
      plainAlign: plain ? getComputedStyle(plain).alignItems : null,
      plainHasCaption: plain ? !!plain.querySelector('.nh-button__caption') : null,
    }
  })
  ok('button media renders (cover fit)', media.count === 1 && media.fit === 'cover', JSON.stringify([media.count, media.fit]))
  ok('button caption renders', media.caption === 'Vision line', String(media.caption))
  ok('media replaces the icon', media.iconSuppressed === true)
  ok('Assembly lays a media button out as a zone card', media.align === 'flex-start' && media.labelWeight === '600',
    JSON.stringify([media.align, media.labelWeight]))
  ok('a plain button keeps the centered layout', media.plainAlign === 'center' && media.plainHasCaption === false,
    JSON.stringify([media.plainAlign, media.plainHasCaption]))
  ok('active button paints its whole tile: green border', near(rgba(btn.tileBorder), [64, 211, 100], 25), String(btn.tileBorder))
  ok('resting button is flat tile content', String(btn.restBg).includes('rgba(0, 0, 0, 0)') && btn.restBorder === '0px',
    JSON.stringify([btn.restBg, btn.restBorder]))
  ok('resting mono icon takes the green cast', near(rgba(btn.restIcon), [140, 225, 161], 16), String(btn.restIcon))
  ok('active mono icon is full primary', near(rgba(btn.activeIcon), [64, 211, 100], 12), String(btn.activeIcon))

  // ---------- group frame + masthead ----------
  const chrome = await probe(page, () => {
    const g = document.querySelector('.nh-group')
    const bar = document.querySelector('.nh-dash__bar')
    return {
      groups: document.querySelectorAll('.nh-group').length,
      gBorder: g ? getComputedStyle(g).borderTopColor : null,
      barBf: bar ? getComputedStyle(bar).backdropFilter : null,
    }
  })
  ok('panel group framed', chrome.groups === 1 && (rgba(chrome.gBorder)?.[3] ?? 0) > 0.15, JSON.stringify(chrome))
  ok('masthead is glass', String(chrome.barBf ?? '').includes('blur'), String(chrome.barBf))
  await page.close()

  // ---------- Home: tiles + the + tile ----------
  const home = await newPage('assembly')
  await home.goto(`${BASE}/neohab/index.html#/`, { waitUntil: 'load', timeout: 60000 })
  await poll(home, () => document.querySelectorAll('.nh-tile').length, (n) => n > 0)
  const tiles = await probe(home, () => {
    const t = document.querySelector('.nh-tile:not(.nh-tile--new)')
    const plus = document.querySelector('.nh-tile--new')
    return {
      bf: t ? getComputedStyle(t).backdropFilter : null,
      plusStyle: plus ? getComputedStyle(plus).borderTopStyle : null,
      plusBg: plus ? getComputedStyle(plus).backgroundColor : null,
    }
  })
  ok('home tiles are glass', String(tiles.bf ?? '').includes('blur'), String(tiles.bf))
  ok('+ tile keeps its dashed invitation', tiles.plusStyle === 'dashed' && (rgba(tiles.plusBg)?.[3] ?? 1) === 0,
    JSON.stringify([tiles.plusStyle, tiles.plusBg]))
  await home.close()

  // ---------- default theme: hooks present but INERT ----------
  const dark = await newPage('dark')
  await dark.goto(`${BASE}/neohab/index.html#/d/${ID}`, { waitUntil: 'load', timeout: 60000 })
  await poll(dark, () => document.querySelectorAll('.nh-dial--arc').length, (n) => n === 2)
  // the band (and its films) only exist once the live value arrives - wait for it here too
  await poll(dark, () => document.querySelectorAll('.nh-gauge__bandlight').length, (n) => n >= 1)
  const inert = await probe(dark, () => {
    const g1 = [...document.querySelectorAll('.nh-dial--arc')][0]
    const band = g1?.querySelector('.nh-gauge__band')
    const light = g1?.querySelector('.nh-gauge__bandlight')
    const tipStops = light
      ? [...g1.querySelectorAll(`#${light.getAttribute('stroke').slice(5, -1)} stop`)].map(
          (s) => getComputedStyle(s).stopColor
        )
      : null
    const widget = g1?.closest('.nh-widget')
    const cells = [...document.querySelectorAll('.nh-dial--arc')].map((d) => d.closest('.nh-widget'))
    return {
      tipStops,
      cap: band ? getComputedStyle(band).strokeLinecap : null,
      bf: widget ? getComputedStyle(widget).backdropFilter : null,
      bgAlpha: widget ? getComputedStyle(widget).backgroundColor : null,
      max1: g1?.querySelector('.nh-gauge__max')?.textContent ?? 'absent',
      icon1: !!cells[0]?.querySelector('.nh-widget__label .nh-icon'),
      chip: cells[0]
        ? getComputedStyle(cells[0].querySelector('.nh-widget__labelmain'), '::before').content
        : 'absent',
      bodyBgi: getComputedStyle(document.body).backgroundImage,
      mediaCount: document.querySelectorAll('.nh-button__media').length,
      mediaAlign: (() => {
        const b = document.querySelector('.nh-button__media')?.closest('.nh-button')
        return b ? getComputedStyle(b).alignItems : null
      })(),
    }
  })
  ok('film is INVISIBLE under the default theme (stop opacity 0)',
    inert.tipStops !== null && (rgba(inert.tipStops?.[1])?.[3] ?? 1) === 0, JSON.stringify(inert.tipStops))
  ok('caps stay butt under the default theme', inert.cap === 'butt', String(inert.cap))
  ok('no glass under the default theme', inert.bf === 'none' && (rgba(inert.bgAlpha)?.[3] ?? 0) === 1,
    JSON.stringify([inert.bf, inert.bgAlpha]))
  ok('showMax works in any theme', String(inert.max1).trim() === '/ 58', String(inert.max1))
  ok('dial header icon works in any theme', inert.icon1 === true)
  ok('no chip outside Assembly', inert.chip === 'none', String(inert.chip))
  ok('no hall backdrop outside Assembly', !String(inert.bodyBgi ?? '').includes('assembly-hall'), String(inert.bodyBgi).slice(0, 60))
  ok('button media works in any theme', inert.mediaCount === 1, String(inert.mediaCount))
  ok('zone-card layout is Assembly-only', inert.mediaAlign === 'center', String(inert.mediaAlign))
  await dark.close()

  ok('no console/page errors', errs.length === 0, errs.slice(0, 4).join(' | '))
} finally {
  // ---------- cleanup: exactly this suite's component, and the dimmer it drove ----------
  const del = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
  const listing = await (await fetch(NS, { headers: AUTH })).json()
  const mine = listing.filter((c) => c.uid === UID)
  ok('cleanup: component deleted', (del.status === 200 || del.status === 404) && mine.length === 0, 'left=' + mine.length)
  await sendItem(ITEMS.dimmer, initialDimmer)
  await sleep(700)
  const after = await itemState(ITEMS.dimmer)
  ok('cleanup: dimmer restored', String(after) === String(initialDimmer), `got=${after} want=${initialDimmer}`)
  await browser.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => f.name).join('; '))
    process.exitCode = 1
  }
}
