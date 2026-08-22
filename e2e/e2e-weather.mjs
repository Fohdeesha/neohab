/**
 * The weather widget, end to end: the three looks, both data sources, the shared fetch, the
 * settings fields, the failure paths and the LCD segment treatment.
 *
 * Every Open-Meteo request is answered from the fixture files in fixtures/ via page.route -
 * the suite never talks to the real service, so it is deterministic, works offline, and a
 * battery cannot be failed by a third party. The checks that compare readings compare against
 * the SAME fixture the routes serve, and the fixture is internally consistent (hour columns
 * derive from its own current time), so it never goes stale.
 *
 * SAFE with a live config: creates and deletes exactly dashboard:nh-e2e-weather, saves
 * nothing through the app (REST seed, no restore point), commands nothing - the items-mode
 * widget only READS the harness temperature item. The theme is pinned per device
 * (themeOverride), so the shared settings component is never written.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { APP, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-weather'
const forecast = JSON.parse(readFileSync(new URL('./fixtures/weather-forecast.json', import.meta.url), 'utf8'))
const geocode = JSON.parse(readFileSync(new URL('./fixtures/weather-geocode.json', import.meta.url), 'utf8'))

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => ({}))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

/** Expected strings derived from the fixture, so the checks and the routes cannot disagree. */
const FX = {
  temp: String(Math.round(forecast.current.temperature_2m)),
  humidity: Math.round(forecast.current.relative_humidity_2m) + '%',
  high: Math.round(forecast.daily.temperature_2m_max[0]) + '°',
  low: Math.round(forecast.daily.temperature_2m_min[0]) + '°',
  curHour: parseInt(forecast.current.time.slice(11, 13), 10),
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
page.on('dialog', (d) => d.accept()) // Exit with a dirty draft confirms; the draft is meant to be discarded
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
await page.addInitScript((cfg) => {
  try {
    localStorage.setItem('neohab:apiToken', cfg.token)
    // pin the default theme for the geometry/ghost checks - but an init script runs on EVERY
    // load, so the LCD section sets a keep flag before switching themes or this would clobber it
    if (!localStorage.getItem('nh-e2e-keep-theme')) localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, { token: TOKEN })

// Route ALL Open-Meteo traffic to the fixtures, counting forecast requests per URL.
let forecastHits = []
await page.route('https://api.open-meteo.com/**', (route) => {
  forecastHits.push(route.request().url())
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(forecast) })
})
await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(geocode) })
)

const detroit = { name: 'Detroit, Michigan, US', lat: 42.3314, lon: -83.0458 }
const berlin = { name: 'Berlin, DE', lat: 52.52, lon: 13.405 }

async function seed() {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const res = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-weather',
        name: 'E2E Weather',
        columns: 12,
        rowHeight: 'match',
        widgets: [
          {
            id: 'w-hero',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Hero', units: 'imperial', location: detroit },
            layout: { lg: { x: 0, y: 0, w: 5, h: 4 } },
          },
          {
            id: 'w-compact',
            type: 'weather',
            config: { source: 'openmeteo', look: 'compact', units: 'imperial', location: detroit },
            layout: { lg: { x: 5, y: 0, w: 7, h: 2 } },
          },
          {
            id: 'w-strip-days',
            type: 'weather',
            config: { source: 'openmeteo', look: 'strip', stripOf: 'days', units: 'imperial', location: detroit, days: 7 },
            layout: { lg: { x: 5, y: 2, w: 7, h: 2 } },
          },
          {
            id: 'w-strip-hours',
            type: 'weather',
            config: {
              source: 'openmeteo',
              look: 'strip',
              stripOf: 'hours',
              stripCurrent: false,
              units: 'imperial',
              location: detroit,
            },
            layout: { lg: { x: 0, y: 4, w: 6, h: 2 } },
          },
          {
            id: 'w-noprecip',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', showPrecip: false, units: 'imperial', location: berlin },
            layout: { lg: { x: 6, y: 4, w: 6, h: 4 } },
          },
          {
            id: 'w-items',
            type: 'weather',
            config: { source: 'items', look: 'hero', label: 'Sensor', tempItem: ITEMS.temperature },
            layout: { lg: { x: 0, y: 6, w: 6, h: 2 } },
          },
          {
            id: 'w-unset',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero' },
            layout: { lg: { x: 0, y: 8, w: 4, h: 2 } },
          },
          {
            id: 'w-small',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Small', units: 'imperial', location: detroit },
            layout: { lg: { x: 4, y: 8, w: 4, h: 2 } },
          },
          // a narrow hero: no width to put the readings beside the temperature, so they go under
          {
            id: 'w-narrow',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Narrow', units: 'imperial', location: detroit },
            layout: { lg: { x: 8, y: 8, w: 1, h: 3 } },
          },
          // named, and told not to draw it
          {
            id: 'w-noname',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Hidden', labelMode: 'none', units: 'imperial', location: detroit },
            layout: { lg: { x: 0, y: 10, w: 4, h: 2 } },
          },
        ],
      },
    }),
  })
  return res.status === 200 || res.status === 201
}

/* Runs IN THE PAGE: everything the render checks need, in one pass. */
const readDash = () => {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)]
  const widget = (id) => document.querySelector(`[data-nh-widget="${id}"]`) ?? null
  // widgets are not tagged by id, so find them by their seeded order in the grid
  const cells = q('.nh-gcell .nh-weather, .nh-cell .nh-weather')
  const byLook = {
    hero: q('.nh-weather--hero'),
    compact: q('.nh-weather--compact'),
    strip: q('.nh-weather--striplook'),
  }
  const first = byLook.hero[0]
  const cols = (root) => q('.nh-weather__col', root).map((c) => ({
    label: c.querySelector('.nh-weather__collabel')?.textContent?.trim() ?? '',
    main: c.querySelector('.nh-weather__colmain')?.textContent?.trim() ?? '',
    prob: c.querySelector('.nh-weather__colprob')?.textContent?.trim() ?? null,
    iconLoaded: (c.querySelector('img.nh-icon--img')?.naturalWidth ?? 0) > 0,
  }))
  const strips = first ? q('.nh-weather__strip', first) : []
  const icons = q('.nh-weather img.nh-icon--img')
  return {
    weatherCount: cells.length,
    heroCount: byLook.hero.length,
    compactCount: byLook.compact.length,
    stripLookCount: byLook.strip.length,
    heroTemp: first?.querySelector('.nh-weather__temp')?.textContent?.trim() ?? null,
    heroTempGhost: first?.querySelector('.nh-weather__temp')?.getAttribute('data-ghost') ?? null,
    heroUnit: first?.querySelector('.nh-weather__tempunit')?.textContent?.trim() ?? null,
    heroCond: first?.querySelector('.nh-weather__cond')?.textContent?.trim() ?? null,
    heroRange: first?.querySelector('.nh-weather__range')?.textContent?.trim() ?? null,
    heroDetails: first ? q('.nh-weather__detail', first).map((d) => d.querySelector('.nh-weather__detlabel')?.textContent?.trim()) : [],
    heroDetailValues: first
      ? Object.fromEntries(
          q('.nh-weather__detail', first).map((d) => [
            d.querySelector('.nh-weather__detlabel')?.textContent?.trim(),
            d.querySelector('.nh-weather__detvalue')?.textContent?.trim(),
          ])
        )
      : {},
    heroStripCount: strips.length,
    heroHourCols: strips[0] ? cols(strips[0]) : [],
    heroDayCols: strips[1] ? cols(strips[1]) : [],
    iconTotal: icons.length,
    iconsLoaded: icons.filter((i) => i.naturalWidth > 0).length,
    emptyTexts: q('.nh-weather__empty').map((e) => e.textContent?.trim() ?? ''),
  }
}

try {
  ok('seed dashboard created', await seed())
  await page.goto(APP + '#/d/nh-e2e-weather')
  await page.waitForSelector('.nh-weather, .nh-weather__empty', { timeout: 25000 }).catch(() => {})
  // wait for the forecast fetch to land and the icons to decode
  await page
    .waitForFunction(() => document.querySelectorAll('.nh-weather__col').length > 10, { timeout: 20000 })
    .catch(() => {})
  await sleep(1500)

  const d = await probe(page, readDash)

  /* ---- section 1: the three looks render from the fixture ---- */
  ok('all eight widgets render a weather surface or a message', d.weatherCount + d.emptyTexts.length >= 8, `surfaces=${d.weatherCount} messages=${d.emptyTexts.length}`)
  ok('hero look renders', d.heroCount >= 4, 'heroes=' + d.heroCount)
  ok('compact look renders', d.compactCount === 1)
  ok('strip look renders twice', d.stripLookCount === 2)
  ok('hero temp is the fixture reading', d.heroTemp === FX.temp, `${d.heroTemp} vs ${FX.temp}`)
  ok('hero unit is imperial', d.heroUnit === '°F', String(d.heroUnit))
  ok('hero condition is the translated WMO label', d.heroCond === 'Mainly clear', String(d.heroCond))
  ok('hero range is the fixture high/low', d.heroRange === `${FX.high} / ${FX.low}`, String(d.heroRange))
  ok(
    'details row shows the four readings',
    ['Feels like', 'Humidity', 'Wind', 'Precipitation'].every((l) => d.heroDetails.includes(l)),
    d.heroDetails.join(',')
  )
  ok('humidity detail matches the fixture', d.heroDetailValues.Humidity === FX.humidity, String(d.heroDetailValues.Humidity))
  ok('wind detail carries a cardinal', /\d+ mph [A-Z]{1,3}$/.test(d.heroDetailValues.Wind ?? ''), String(d.heroDetailValues.Wind))

  /* ---- section 2: forecast columns ---- */
  ok('hero shows hourly and daily strips', d.heroStripCount === 2, 'strips=' + d.heroStripCount)
  ok('hourly columns default to 12', d.heroHourCols.length === 12, String(d.heroHourCols.length))
  const nextHour = (FX.curHour + 1) % 24
  const firstHourLabel = d.heroHourCols[0]?.label ?? ''
  const expected12h = ((nextHour + 11) % 12) + 1
  ok(
    'the first hour column is the hour after the fixture current time',
    firstHourLabel.includes(String(nextHour)) || firstHourLabel.includes(String(expected12h)),
    `${firstHourLabel} (expect hour ${nextHour})`
  )
  ok('daily columns default to 5, first labelled Today', d.heroDayCols.length === 5 && d.heroDayCols[0]?.label === 'Today', d.heroDayCols.map((c) => c.label).join(','))
  ok('a day column shows high and low', (d.heroDayCols[0]?.main ?? '').includes(FX.high) && (d.heroDayCols[0]?.main ?? '').includes(FX.low), String(d.heroDayCols[0]?.main))

  /* ---- section 3: icons actually decode (the vis pass caught them hidden) ---- */
  ok('weather icons render and decode', d.iconTotal > 20 && d.iconsLoaded === d.iconTotal, `${d.iconsLoaded}/${d.iconTotal}`)

  /* ---- section 3a: the hero fills its tile, and its name can be dropped ---- */
  // Reported: a hero in a wide one-row tile used half the box and drew a "WEATHER" title over an
  // obviously-weather panel. The readings sit BESIDE the temperature wherever there is width for
  // them and underneath where there is not, and nothing may overflow the widget either way -
  // measured, because a row that does not fit is clipped mid-value rather than dropped.
  const heroes = await probe(page, () =>
    [...document.querySelectorAll('.nh-gcell')]
      .map((cell) => {
        const hero = cell.querySelector('.nh-weather--hero')
        if (!hero) return null
        const now = hero.querySelector('.nh-weather__now')?.getBoundingClientRect()
        const det = hero.querySelector('.nh-weather__details')
        const main = hero.querySelector('.nh-weather__heromain')?.getBoundingClientRect()
        const body = cell.querySelector('.nh-widget__body')?.getBoundingClientRect()
        const shown = det && getComputedStyle(det).display !== 'none' ? det.getBoundingClientRect() : null
        return {
          label: cell.querySelector('.nh-widget__labeltext')?.textContent?.trim() ?? null,
          w: Math.round(cell.offsetWidth),
          h: Math.round(cell.offsetHeight),
          details: !!shown,
          beside: !!(shown && now && shown.left >= now.right - 2),
          overflow: main && body ? Math.round(main.bottom - body.bottom) : null,
        }
      })
      .filter(Boolean)
  )
  const hero = (label) => (heroes ?? []).find((x) => x.label === label)
  ok('every hero was measured', Array.isArray(heroes) && heroes.length >= 6, `heroes=${heroes?.length}`)
  ok(
    'a wide hero puts the readings beside the temperature',
    !!hero('Hero')?.beside && !!hero('Small')?.beside,
    JSON.stringify([hero('Hero'), hero('Small')])
  )
  ok(
    'a narrow hero puts them underneath instead',
    hero('Narrow')?.details === true && hero('Narrow')?.beside === false,
    JSON.stringify(hero('Narrow'))
  )
  ok(
    'nothing in a hero overflows its widget',
    (heroes ?? []).every((x) => x.overflow === null || x.overflow <= 1),
    JSON.stringify((heroes ?? []).map((x) => `${x.label}:${x.overflow}`))
  )
  const hiddenName = await probe(page, () =>
    [...document.querySelectorAll('.nh-gcell')].some((c) => c.querySelector('.nh-widget__labeltext')?.textContent?.trim() === 'Hidden')
  )
  ok('a name told not to show leaves no title bar', hiddenName === false, String(hiddenName))

  /* ---- section 3b: a short hero sheds its hourly strip (tight-cell rule) ---- */
  const small = await probe(page, () => {
    const heroes = [...document.querySelectorAll('.nh-weather--hero')]
    const target = heroes.find((h) => h.closest('.nh-widget')?.querySelector('.nh-widget__labeltext')?.textContent?.trim() === 'Small')
    if (!target) return null
    return {
      temp: target.querySelector('.nh-weather__temp')?.textContent?.trim(),
      hourly: [...target.querySelectorAll('.nh-weather__strip:not(.nh-weather__strip--days)')].filter(
        (s) => getComputedStyle(s).display !== 'none'
      ).length,
      cellHeight: Math.round(target.closest('.nh-gcell, .nh-cell')?.getBoundingClientRect().height ?? 0),
    }
  })
  ok(
    'a short hero cell sheds the hourly strip but keeps the reading',
    small !== null && small.temp === FX.temp && small.hourly === 0,
    JSON.stringify(small)
  )

  /* ---- section 4: strip look details ---- */
  const stripInfo = await probe(page, () => {
    const strips = [...document.querySelectorAll('.nh-weather--striplook')]
    const read = (root) => ({
      cols: [...root.querySelectorAll('.nh-weather__col')].length,
      labels: [...root.querySelectorAll('.nh-weather__collabel')].slice(0, 3).map((e) => e.textContent.trim()),
      mini: root.querySelector('.nh-weather__mini') !== null,
      probs: [...root.querySelectorAll('.nh-weather__colprob')].length,
    })
    return { days: strips[0] ? read(strips[0]) : null, hours: strips[1] ? read(strips[1]) : null }
  })
  ok('day strip shows 7 columns with a current block', stripInfo.days?.cols === 7 && stripInfo.days?.mini === true, JSON.stringify(stripInfo.days?.labels))
  ok('hour strip hides the current block when asked', stripInfo.hours?.mini === false, 'cols=' + stripInfo.hours?.cols)
  const hourLabels = stripInfo.hours?.labels ?? []
  // positive precondition first: an empty list must fail, not pass vacuously
  ok('hour strip columns are hours, not weekdays', hourLabels.length > 0 && hourLabels.every((l) => /\d/.test(l)), JSON.stringify(hourLabels))

  /* ---- section 5: precipitation toggle ---- */
  const noPrecip = await probe(page, () => {
    const heroes = [...document.querySelectorAll('.nh-weather--hero')]
    // the Berlin hero is the one whose details lack the Precipitation entry
    const target = heroes.find((h) => ![...h.querySelectorAll('.nh-weather__detlabel')].some((l) => l.textContent.trim() === 'Precipitation'))
    if (!target) return null
    return {
      probs: [...target.querySelectorAll('.nh-weather__colprob')].length,
      details: [...target.querySelectorAll('.nh-weather__detlabel')].map((l) => l.textContent.trim()),
    }
  })
  ok('precipitation off removes chance columns and the detail', noPrecip !== null && noPrecip.probs === 0, JSON.stringify(noPrecip))

  /* ---- section 6: shared fetch - many widgets, two places, two requests ---- */
  const detroitHits = forecastHits.filter((u) => u.includes('latitude=42.3314')).length
  const berlinHits = forecastHits.filter((u) => u.includes('latitude=52.52')).length
  ok('widgets sharing a place share one forecast request', detroitHits === 1, 'detroit=' + detroitHits)
  ok('a second place fetches once more', berlinHits === 1, 'berlin=' + berlinHits)
  ok(
    'imperial units are requested from the service',
    forecastHits.length >= 2 && forecastHits.every((u) => u.includes('temperature_unit=fahrenheit')),
    forecastHits.length + ' urls'
  )

  /* ---- section 7: items mode and the unconfigured message ---- */
  const itemsView = await probe(page, () => {
    const heroes = [...document.querySelectorAll('.nh-weather--hero')]
    const sensor = heroes.find((h) => h.closest('.nh-widget')?.querySelector('.nh-widget__labeltext')?.textContent?.trim() === 'Sensor')
    return sensor
      ? { temp: sensor.querySelector('.nh-weather__temp')?.textContent?.trim(), strips: sensor.querySelectorAll('.nh-weather__strip').length }
      : null
  })
  ok('items mode shows the live item reading', itemsView !== null && /\d/.test(itemsView.temp ?? ''), JSON.stringify(itemsView))
  ok('items mode has no hourly strip', itemsView !== null && itemsView.strips === 0, 'strips=' + itemsView?.strips)
  ok(
    'an unconfigured widget says to set a location',
    d.emptyTexts.some((t) => t.includes('Set a location')),
    JSON.stringify(d.emptyTexts)
  )

  /* ---- section 8: the failure path - a place the network cannot answer ---- */
  await page.unroute('https://api.open-meteo.com/**')
  await page.route('https://api.open-meteo.com/**', (route) => route.abort())
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-weather',
        name: 'E2E Weather',
        columns: 12,
        rowHeight: 'match',
        widgets: [
          {
            id: 'w-fail',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', units: 'imperial', location: { lat: 10, lon: 10 } },
            layout: { lg: { x: 0, y: 0, w: 5, h: 3 } },
          },
        ],
      },
    }),
  })
  await page.goto(APP + '#/d/nh-e2e-weather', { waitUntil: 'domcontentloaded' })
  await page.reload()
  await page.waitForSelector('.nh-weather__empty', { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  const failText = await probe(page, () => [...document.querySelectorAll('.nh-weather__empty')].map((e) => e.textContent.trim()))
  ok(
    'an unreachable forecast says so and mentions the internet',
    Array.isArray(failText) && failText.some((t) => t.includes('Could not fetch') && t.includes('internet')),
    JSON.stringify(failText)
  )

  /* ---- section 9: the editor - location search, pattern preview, showIf gating ---- */
  await page.unroute('https://api.open-meteo.com/**')
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(forecast) })
  )
  // every wait here is guarded: on a build without the feature the ASSERTIONS must be what
  // fails, never an abort that swallows the rest of the suite
  await page.click('[aria-label="Edit dashboard"]').catch(() => {})
  await page.waitForSelector('.nh-grid--edit .nh-cell', { timeout: 15000 }).catch(() => {})
  await page.click('.nh-grid--edit .nh-cell >> nth=0 >> .nh-cell__grip').catch(() => {})
  await page.waitForSelector('.nh-sheet', { timeout: 10000 }).catch(() => {})
  await sleep(400)

  const styleOptions = await probe(page, () => {
    const sel = [...document.querySelectorAll('.nh-sheet select')].find((s) =>
      s.closest('.nh-field')?.querySelector('.nh-field__label')?.textContent?.trim() === 'Style'
    )
    return sel ? [...sel.options].map((o) => o.textContent.trim()) : null
  })
  ok('the Style select offers the three looks', JSON.stringify(styleOptions) === JSON.stringify(['Hero', 'Compact row', 'Forecast strip']), JSON.stringify(styleOptions))

  // location search against the fixture geocoder
  await page.fill('.nh-sheet .nh-camerafield input', 'detroit').catch(() => {})
  await page.click('.nh-sheet .nh-camerafield__find').catch(() => {})
  await page.waitForSelector('.nh-sheet .nh-camerafield__pick', { timeout: 8000 }).catch(() => {})
  const placeCount = await page.locator('.nh-sheet .nh-camerafield__pick').count()
  ok('the place search lists fixture results', placeCount === 8, 'results=' + placeCount)
  await page.click('.nh-sheet .nh-camerafield__pick >> nth=0').catch(() => {})
  await sleep(500)
  const coords = await probe(page, () => {
    const inputs = [...document.querySelectorAll('.nh-sheet .nh-weatherloc__coord input')]
    return { lat: inputs[0]?.value, lon: inputs[1]?.value, current: document.querySelector('.nh-sheet .nh-weatherloc__current')?.textContent?.trim() }
  })
  ok('picking a place fills the coordinates', Math.abs(parseFloat(coords.lat) - 42.33143) < 0.01 && Math.abs(parseFloat(coords.lon) - -83.04575) < 0.01, JSON.stringify(coords))
  ok('the picked place is named under the search', (coords.current ?? '').includes('Detroit'), String(coords.current))

  // switch the source to items: the location field leaves, the pickers and patterns arrive
  await page
    .selectOption('.nh-sheet .nh-field:has(.nh-field__label:text-is("Weather source")) select', 'items')
    .catch(() => {})
  await sleep(600)
  const itemsPanel = await probe(page, () => ({
    location: document.querySelector('.nh-sheet .nh-weatherloc__coords') !== null,
    pickers: [...document.querySelectorAll('.nh-sheet .nh-field__label')].filter((l) => l.textContent.includes('item')).length,
    pattern: [...document.querySelectorAll('.nh-sheet .nh-field__label')].some((l) => l.textContent.trim() === 'Day high pattern'),
  }))
  ok('items mode hides the location and offers the pickers', itemsPanel.location === false && itemsPanel.pickers >= 5 && itemsPanel.pattern === true, JSON.stringify(itemsPanel))

  // the pattern preview, typed per keystroke (the picker lesson: fill masks per-keystroke bugs)
  const patternInput = page.locator('.nh-sheet .nh-field:has(.nh-field__label:text-is("Day high pattern")) input')
  await patternInput.click().catch(() => {})
  await page.keyboard.type('Xx_{n}_High', { delay: 15 })
  // the preview waits for the item catalog, which a large server takes a moment to list
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('.nh-sheet .nh-field__hint')].some((e) => e.textContent.startsWith('Found ')),
      { timeout: 10000 }
    )
    .catch(() => {})
  const previewMissing = await probe(page, () =>
    [...document.querySelectorAll('.nh-sheet .nh-field__hint')].map((e) => e.textContent.trim()).find((t) => t.startsWith('Found '))
  )
  ok('a non-resolving pattern reports what is missing', typeof previewMissing === 'string' && previewMissing.includes('Found 0 of 5') && previewMissing.includes('Xx_1_High'), String(previewMissing))
  await patternInput.fill('Xx_High', { timeout: 5000 }).catch(() => {})
  await sleep(500)
  const previewNoN = await probe(page, () =>
    [...document.querySelectorAll('.nh-sheet .nh-field__hint')].map((e) => e.textContent.trim()).find((t) => t.includes('{n}'))
  )
  ok('a pattern without {n} says it needs one', typeof previewNoN === 'string' && previewNoN.includes('needs {n}'), String(previewNoN))

  await page.click('button:has-text("Exit")').catch(() => {})
  await page.waitForSelector('.nh-grid--edit', { state: 'detached', timeout: 8000 }).catch(() => {})

  /* ---- section 10: the LCD segment treatment, and its inertness in dark ---- */
  // leaving the editor remounts the widget, which waits a beat before its first fetch
  await page.waitForSelector('.nh-weather__temp', { timeout: 15000 }).catch(() => {})
  const darkGhost = await probe(page, () => {
    const temp = document.querySelector('.nh-weather__temp')
    if (!temp) return null
    return { ghost: temp.getAttribute('data-ghost'), before: getComputedStyle(temp, '::before').content }
  })
  ok('dark: the ghost metadata exists but draws nothing', darkGhost !== null && darkGhost.ghost === '88' && darkGhost.before === 'none', JSON.stringify(darkGhost))

  await page.evaluate(() => {
    localStorage.setItem('nh-e2e-keep-theme', '1')
    localStorage.setItem('neohab:themeOverride', 'lcd')
  })
  await page.reload()
  await page.waitForSelector('.nh-weather__temp', { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  const lcdGhost = await probe(page, () => {
    const temp = document.querySelector('.nh-weather__temp')
    if (!temp) return null
    return { before: getComputedStyle(temp, '::before').content, font: getComputedStyle(temp).fontFamily }
  })
  ok('LCD: the temp draws in DSEG with the ghost underlay', lcdGhost !== null && lcdGhost.before === '"88"' && lcdGhost.font.includes('DSEG'), JSON.stringify(lcdGhost))
  await page.evaluate(() => {
    localStorage.removeItem('nh-e2e-keep-theme')
    localStorage.setItem('neohab:themeOverride', 'dark')
  })

  ok('no page errors or app-resource failures', errs.length === 0, errs.slice(0, 3).join(' | '))
} finally {
  await browser.close().catch(() => {})
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid === UID)
  ok('cleanup: dashboard removed', left.length === 0)

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
