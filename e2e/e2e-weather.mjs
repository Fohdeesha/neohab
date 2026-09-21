// The weather widget, end to end: the three looks, both data sources, the shared fetch, the settings fields,
// the failure paths and the LCD segment treatment.
// SAFE with a live config: creates and deletes exactly dashboard:nh-e2e-weather and
// dashboard:nh-e2e-weather-tight, saves nothing through the app (REST seed, no restore.
import { readFileSync } from 'node:fs'
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-weather'
const UID_TIGHT = 'dashboard:nh-e2e-weather-tight'
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
  for (const channel of ['chrome', 'msedge']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const FX = {
  temp: String(Math.round(forecast.current.temperature_2m)),
  humidity: Math.round(forecast.current.relative_humidity_2m) + '%',
  high: Math.round(forecast.daily.temperature_2m_max[0]) + '°',
  low: Math.round(forecast.daily.temperature_2m_min[0]) + '°',
  curHour: parseInt(forecast.current.time.slice(11, 13), 10),
  precipToday: forecast.daily.precipitation_probability_max[0] + '%',
  precipThisHour: forecast.current.precipitation_probability + '%',
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
    if (!localStorage.getItem('nh-e2e-keep-theme')) localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, { token: TOKEN })

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
            id: 'w-model',
            type: 'weather',
            config: {
              source: 'openmeteo',
              look: 'compact',
              units: 'imperial',
              location: { name: 'Model Town', lat: 33.3333, lon: 44.4444 },
              model: 'ecmwf_ifs025',
            },
            layout: { lg: { x: 0, y: 12, w: 6, h: 2 } },
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
          {
            id: 'w-narrow',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Narrow', units: 'imperial', location: detroit },
            layout: { lg: { x: 8, y: 8, w: 1, h: 3 } },
          },
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

const readDash = () => {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)]
  const widget = (id) => document.querySelector(`[data-nh-widget="${id}"]`) ?? null
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
  await fetch(NS + '/' + encodeURIComponent(UID_TIGHT), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID_TIGHT,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-weather-tight',
        name: 'E2E Weather Tight',
        columns: 10,
        rowHeight: 'match',
        widgets: [
          {
            id: 'w-tight-bare',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Bare', labelMode: 'none', units: 'imperial', location: detroit, textSize: 110 },
            layout: { lg: { x: 2, y: 0, w: 2, h: 1 } },
          },
          {
            id: 'w-tight',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Tight', units: 'imperial', location: detroit, textSize: 110 },
            layout: { lg: { x: 0, y: 0, w: 2, h: 1 } },
          },
          {
            id: 'w-tight-big',
            type: 'weather',
            config: { source: 'openmeteo', look: 'hero', label: 'Big', units: 'imperial', location: detroit, textSize: 125 },
            layout: { lg: { x: 4, y: 0, w: 2, h: 1 } },
          },
        ],
      },
    }),
  })
  await page.goto(APP + '#/d/nh-e2e-weather')
  await page.waitForSelector('.nh-weather, .nh-weather__empty', { timeout: 25000 }).catch(() => {})
  await page
    .waitForFunction(() => document.querySelectorAll('.nh-weather__col').length > 10, { timeout: 20000 })
    .catch(() => {})
  await sleep(1500)

  const d = await probe(page, readDash)

  ok('all eight widgets render a weather surface or a message', d.weatherCount + d.emptyTexts.length >= 8, `surfaces=${d.weatherCount} messages=${d.emptyTexts.length}`)
  ok('hero look renders', d.heroCount >= 4, 'heroes=' + d.heroCount)
  ok('compact look renders', d.compactCount === 2, 'compacts=' + d.compactCount)
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
  ok(
    "the precipitation detail is today's chance, not this hour's",
    d.heroDetailValues.Precipitation === FX.precipToday && FX.precipToday !== FX.precipThisHour,
    `${d.heroDetailValues.Precipitation} (today ${FX.precipToday}, this hour ${FX.precipThisHour})`
  )

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

  ok('weather icons render and decode', d.iconTotal > 20 && d.iconsLoaded === d.iconTotal, `${d.iconsLoaded}/${d.iconTotal}`)

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

  await page.goto(APP + '#/d/nh-e2e-weather-tight')
  await page.waitForSelector('.nh-weather--hero', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const tight = await probe(page, () => {
    const hero = document.querySelector('.nh-weather--hero')
    if (!hero) return null
    const cell = hero.closest('.nh-gcell, .nh-cell')
    const body = hero.closest('.nh-widget__body')
    const cs = getComputedStyle(body)
    const cellR = cell.getBoundingClientRect()
    const det = hero.querySelector('.nh-weather__details')
    return {
      cellW: Math.round(cellR.width),
      bleed: Math.round(hero.getBoundingClientRect().width - (body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))),
      details: det ? getComputedStyle(det).display : 'absent',
      readings: det ? [...det.querySelectorAll('.nh-weather__detail')].length : 0,
      overflow: Math.round(hero.getBoundingClientRect().right - cellR.right),
      valueOverhang: det
        ? Math.round(
            Math.max(
              ...[...det.querySelectorAll('.nh-weather__detvalue, .nh-weather__detlabel')].map(
                (v) => v.getBoundingClientRect().right - cellR.right
              )
            )
          )
        : 0,
    }
  })
  ok(
    'the panel takes back most of the side padding',
    tight !== null && tight.bleed >= 8 && tight.bleed <= 12,
    JSON.stringify(tight)
  )
  ok(
    'a hero narrower than 300px still shows its readings',
    tight !== null && tight.cellW < 300 && tight.details !== 'none' && tight.readings === 4,
    JSON.stringify(tight)
  )
  ok('and nothing is pushed outside the cell by the wider panel', tight !== null && tight.overflow <= 0, String(tight?.overflow))
  ok(
    'no reading hangs over the tile edge, whatever text size the widget is set to',
    tight !== null && tight.valueOverhang < 0,
    'furthest reading vs the cell edge: ' + tight?.valueOverhang
  )
  // The hero sheds its readings below `5.41em + 31px` of cell height, and with square cells that
  // height follows the PAGE width, so at 1500 this tile sat 1.2px above the shed and any couple of
  // pixels either way decided what the section measured. Measured across widths: 1500 sheds, 1600
  // shows them with 10px to spare and the readings still visibly shrunk (17.7 against a 20px cell),
  // 1850 shows them at full size and stops testing the shrink at all.
  await page.setViewportSize({ width: 1600, height: 1100 })
  await sleep(600)
  const big = await probe(page, () => {
    const label = [...document.querySelectorAll('.nh-widget__labeltext')].find((l) => l.textContent.trim() === 'Big')
    const hero = label?.closest('.nh-gcell, .nh-cell')?.querySelector('.nh-weather--hero')
    if (!hero) return null
    const cell = hero.closest('.nh-gcell, .nh-cell')
    const cr = cell.getBoundingClientRect()
    const det = hero.querySelector('.nh-weather__details')
    const now = hero.querySelector('.nh-weather__now')
    const scrolls = (el) => {
      for (let p = el.parentElement; p && p !== cell; p = p.parentElement) {
        const o = getComputedStyle(p)
        if (/auto|scroll/.test(o.overflowX + ' ' + o.overflowY)) return true
      }
      return false
    }
    const drawn = [...hero.querySelectorAll('*')].filter((e) => {
      const q = e.getBoundingClientRect()
      return q.width > 1 && q.height > 1 && !scrolls(e)
    })
    return {
      shown: det ? getComputedStyle(det).display !== 'none' : false,
      beside: det && now ? det.getBoundingClientRect().left >= now.getBoundingClientRect().right - 1 : false,
      readingFont: det ? parseFloat(getComputedStyle(det.querySelector('.nh-weather__detail')).fontSize) : 0,
      cellFont: parseFloat(getComputedStyle(cell).fontSize),
      bottomOverhang: Math.round(Math.max(...drawn.map((e) => e.getBoundingClientRect().bottom - cr.bottom))),
      rightOverhang: Math.round(Math.max(...drawn.map((e) => e.getBoundingClientRect().right - cr.right))),
    }
  })
  ok(
    'at 125% text the readings stay beside the reading, drawn smaller to fit their column',
    big !== null && big.shown && big.beside && big.readingFont < big.cellFont,
    JSON.stringify(big)
  )
  await page.setViewportSize({ width: 1500, height: 1100 })
  await sleep(400)
  ok(
    'and nothing the hero draws is outside its tile',
    big !== null && big.bottomOverhang <= 0 && big.rightOverhang <= 0,
    JSON.stringify(big)
  )


  const shapes = [
    { name: 'a full-width row on a phone', w: 540, h: 900, wide: true },
    { name: 'a short grid cell', w: 885, h: 420, wide: false },
  ]
  for (const shape of shapes) {
    const p2 = await browser.newPage({ viewport: { width: shape.w, height: shape.h } })
    await p2.addInitScript((cfg) => {
      try {
        localStorage.setItem('neohab:apiToken', cfg.token)
        localStorage.setItem('neohab:themeOverride', 'dark')
      } catch {}
    }, { token: TOKEN })
    await p2.route('https://api.open-meteo.com/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(forecast) })
    )
    await p2.goto(APP + '#/d/nh-e2e-weather-tight')
    await p2.waitForSelector('.nh-weather--hero', { timeout: 20000 }).catch(() => {})
    await sleep(1500)
    const fits = await probe(p2, () =>
      [...document.querySelectorAll('.nh-weather--hero')].map((hero) => {
        const cell = hero.closest('.nh-gcell, .nh-cell')
        const body = hero.closest('.nh-widget__body')
        const cr = cell.getBoundingClientRect()
        const br = body.getBoundingClientRect()
        const det = hero.querySelector('.nh-weather__details')
        const parts = [
          ...hero.querySelectorAll('.nh-weather__temp, .nh-weather__cond, .nh-weather__range, .nh-weather__detvalue'),
        ].filter((e) => e.getBoundingClientRect().width > 0)
        return {
          headed: hero.closest('.nh-widget').classList.contains('nh-widget--headed'),
          cell: { w: Math.round(cr.width), h: Math.round(cr.height) },
          overV: body.scrollHeight - body.clientHeight,
          overH: body.scrollWidth - body.clientWidth,
          past: Math.round(Math.max(0, ...parts.map((e) => e.getBoundingClientRect().bottom - br.bottom))),
          details: det ? getComputedStyle(det).display : 'absent',
          readings: det
            ? [...det.querySelectorAll('.nh-weather__detail')].filter((e) => e.getBoundingClientRect().width > 0).length
            : 0,
          tempPx: Math.round(parseFloat(getComputedStyle(hero.querySelector('.nh-weather__temp')).fontSize)),
          emPx: Math.round(parseFloat(getComputedStyle(cell).fontSize)),
          drawn: parts.map((e) => e.className.replace('nh-weather__', '')),
        }
      })
    )
    const list = Array.isArray(fits) ? fits : []
    ok(`${shape.name}: all three heroes rendered`, list.length === 3, `${list.length} of 3`)
    const spilled = list.filter((f) => f.overV > 0 || f.overH > 0 || f.past > 0)
    ok(
      `${shape.name}: nothing is drawn outside the tile`,
      list.length === 3 && spilled.length === 0,
      spilled.length ? JSON.stringify(spilled) : JSON.stringify(list.map((f) => ({ headed: f.headed, cell: f.cell })))
    )
    ok(
      `${shape.name}: and they really are short tiles`,
      list.length === 3 && list.every((f) => f.cell.h < 130),
      list.map((f) => `${f.cell.w}x${f.cell.h}`).join(' ')
    )
    const bare = list.find((f) => !f.headed)
    if (shape.wide) {
      ok(
        'a wide short row keeps its readings beside the temperature',
        bare !== undefined && bare.cell.w > 400 && bare.details === 'grid' && bare.readings === 4,
        JSON.stringify(bare)
      )
    } else {
      ok(
        'a short cell draws the reading smaller rather than clipping it',
        bare !== undefined && bare.tempPx < 2.6 * bare.emPx,
        `temp ${bare?.tempPx}px vs 2.6em = ${Math.round(2.6 * (bare?.emPx ?? 0))}px`
      )
      ok(
        'and what it cannot fit it sheds, keeping the reading',
        bare !== undefined && bare.drawn.includes('temp') && !bare.drawn.includes('range'),
        (bare?.drawn ?? []).join(',')
      )
    }
    await p2.close()
  }

  await page.goto(APP + '#/d/nh-e2e-weather')
  await page.waitForSelector('.nh-weather--compact', { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  const compactCell = page.locator('.nh-gcell').filter({ has: page.locator('.nh-weather--compact') }).first()
  const box = await compactCell.boundingBox().catch(() => null)
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await sleep(800)
    await page.mouse.up()
    await sleep(600)
  }
  const sheet = await probe(page, () => {
    const panel = document.querySelector('.nh-detail__panel')
    if (!panel) return { open: false }
    const px = (el, prop) => (el ? parseFloat(getComputedStyle(el)[prop]) : 0)
    const block = (sel) => {
      const el = panel.querySelector(sel)
      if (!el) return null
      const cols = [...el.querySelectorAll('.nh-weather__col')]
      const tops = [...new Set(cols.map((c) => Math.round(c.getBoundingClientRect().top)))]
      const r = el.getBoundingClientRect()
      const first = cols[0] ? cols[0].getBoundingClientRect() : null
      const last = cols[cols.length - 1] ? cols[cols.length - 1].getBoundingClientRect() : null
      return {
        cols: cols.length,
        rows: tops.length,
        perRow: tops.map((t) => cols.filter((c) => Math.round(c.getBoundingClientRect().top) === t).length),
        padLeft: first ? Math.round(first.left - r.left) : -1,
        padRight: last ? Math.round(r.right - last.right) : -1,
        width: first && last ? Math.round(last.right - first.left) : 0,
        chip: cols[0] ? getComputedStyle(cols[0]).backgroundColor : '',
        firstChip: cols[0] ? getComputedStyle(cols[0]).backgroundColor : '',
        secondChip: cols[1] ? getComputedStyle(cols[1]).backgroundColor : '',
        labelPx: px(cols[0]?.querySelector('.nh-weather__collabel'), 'fontSize'),
        mainPx: px(cols[0]?.querySelector('.nh-weather__colmain'), 'fontSize'),
        past: Math.max(0, Math.round(r.right - panel.getBoundingClientRect().right)),
      }
    }
    return {
      open: true,
      title: panel.querySelector('.nh-detail__title')?.textContent?.trim() ?? '',
      place: panel.querySelector('.nh-wdetail__place')?.textContent?.trim() ?? '',
      details: [...panel.querySelectorAll('.nh-weather__detlabel')].map((e) => e.textContent.trim()),
      heads: [...panel.querySelectorAll('.nh-wdetail__head')].map((e) => e.textContent.trim()),
      hourly: block('.nh-wdetail__hours'),
      daily: block('.nh-wdetail__days'),
      temp: panel.querySelector('.nh-weather__temp')?.textContent?.trim() ?? '',
      tempPx: px(panel.querySelector('.nh-weather__temp'), 'fontSize'),
      valuePx: px(panel.querySelector('.nh-weather__detvalue'), 'fontSize'),
      panelWidth: Math.round(panel.getBoundingClientRect().width),
      heroWash: getComputedStyle(panel.querySelector('.nh-weather--hero') ?? panel).backgroundImage,
    }
  })
  ok('a hold on a weather tile opens its own view', sheet.open === true && box !== null, JSON.stringify(sheet).slice(0, 120))
  ok('naming the place it is for', sheet.place === detroit.name, sheet.place || '(none)')
  ok('showing the reading the tile shows', sheet.temp === FX.temp, `${sheet.temp} vs ${FX.temp}`)
  ok(
    'with every reading, whatever the tile was set to show',
    ['Feels like', 'Humidity', 'Wind', 'Precipitation'].every((l) => (sheet.details ?? []).includes(l)),
    (sheet.details ?? []).join(',') || '(none)'
  )
  ok(
    'the next twelve hours, in two rows of six',
    sheet.hourly?.cols === 12 && sheet.hourly?.rows === 2 && (sheet.hourly?.perRow ?? []).every((n) => n === 6),
    JSON.stringify({ cols: sheet.hourly?.cols, rows: sheet.hourly?.rows, perRow: sheet.hourly?.perRow })
  )
  ok('and all seven days, in one', sheet.daily?.cols === 7 && sheet.daily?.rows === 1, JSON.stringify({ cols: sheet.daily?.cols, rows: sheet.daily?.rows }))
  ok(
    'both blocks centred, with the week the wider of the two',
    Math.abs((sheet.hourly?.padLeft ?? 0) - (sheet.hourly?.padRight ?? 99)) <= 2 &&
      Math.abs((sheet.daily?.padLeft ?? 0) - (sheet.daily?.padRight ?? 99)) <= 2 &&
      (sheet.daily?.width ?? 0) > (sheet.hourly?.width ?? 0),
    `hours ${sheet.hourly?.padLeft}/${sheet.hourly?.padRight} w=${sheet.hourly?.width}, days ${sheet.daily?.padLeft}/${sheet.daily?.padRight} w=${sheet.daily?.width}`
  )
  ok(
    'each under a heading of its own',
    (sheet.heads ?? []).length === 2 && (sheet.heads ?? []).some((h) => /week/i.test(h)),
    (sheet.heads ?? []).join(' | ') || '(none)'
  )
  ok(
    'set at a size worth reading, not the tile’s',
    (sheet.hourly?.labelPx ?? 0) >= 12 && (sheet.hourly?.mainPx ?? 0) >= 15 && sheet.valuePx >= 18 && sheet.tempPx >= 45,
    `label ${sheet.hourly?.labelPx} main ${sheet.hourly?.mainPx} reading ${sheet.valuePx} temp ${sheet.tempPx}`
  )
  ok(
    'the columns are chips and the reading has a wash behind it',
    sheet.hourly?.chip !== 'rgba(0, 0, 0, 0)' && /gradient/.test(sheet.heroWash ?? ''),
    `${sheet.hourly?.chip} | ${String(sheet.heroWash).slice(0, 40)}`
  )
  ok(
    'the day it opens on is picked out from the rest',
    sheet.daily?.firstChip !== sheet.daily?.secondChip,
    `${sheet.daily?.firstChip} vs ${sheet.daily?.secondChip}`
  )
  ok('nothing hangs outside the panel', (sheet.hourly?.past ?? 1) === 0 && (sheet.daily?.past ?? 1) === 0, `${sheet.hourly?.past} / ${sheet.daily?.past}`)
  ok('and the panel takes the room a full-screen sheet has', sheet.panelWidth > 760, `${sheet.panelWidth}px`)

  for (const shape of [
    { name: 'portrait phone', w: 393, h: 800 },
    { name: 'landscape phone', w: 885, h: 457 },
    { name: 'small window', w: 620, h: 720 },
  ]) {
    await page.setViewportSize({ width: shape.w, height: shape.h })
    for (let i = 0, seen = 0; i < 30 && seen < 2; i++) {
      await sleep(200)
      seen = (await probe(page, () => !!document.querySelector('.nh-wdetail__days'))) ? seen + 1 : 0
    }
    const small = await probe(page, () => {
      const panel = document.querySelector('.nh-detail__panel')
      if (!panel) return { open: false }
      const box = (sel) => {
        const el = panel.querySelector(sel)
        if (!el) return null
        const cols = [...el.querySelectorAll('.nh-weather__col')]
        const tops = [...new Set(cols.map((c) => Math.round(c.getBoundingClientRect().top)))]
        const r = el.getBoundingClientRect()
        return {
          rows: tops.length,
          past: Math.max(0, Math.round(r.right - panel.getBoundingClientRect().right)),
          narrowest: Math.min(...cols.map((c) => Math.round(c.getBoundingClientRect().width))),
        }
      }
      return {
        open: true,
        text: (panel.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60),
        hourly: box('.nh-wdetail__hours'),
        daily: box('.nh-wdetail__days'),
        panelPast: Math.round(panel.getBoundingClientRect().right - window.innerWidth),
        pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    ok(
      `${shape.name}: still two rows of hours and one of days, inside the panel`,
      small.hourly?.rows === 2 && small.daily?.rows === 1 && small.hourly?.past === 0 && small.daily?.past === 0,
      JSON.stringify({ h: small.hourly, d: small.daily, open: small.open, text: small.text })
    )
    ok(
      `${shape.name}: the panel is on screen and the page does not scroll sideways`,
      (small.panelPast ?? 1) <= 0 && (small.pageScroll ?? 1) <= 0,
      `past=${small.panelPast} scroll=${small.pageScroll}`
    )
  }
  await page.setViewportSize({ width: 1500, height: 1100 })
  await sleep(300)
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)
  await page.goto(APP + '#/d/nh-e2e-weather')
  await page.waitForSelector('.nh-weather--striplook', { timeout: 20000 }).catch(() => {})
  await sleep(1200)

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
  ok('hour strip columns are hours, not weekdays', hourLabels.length > 0 && hourLabels.every((l) => /\d/.test(l)), JSON.stringify(hourLabels))

  const noPrecip = await probe(page, () => {
    const heroes = [...document.querySelectorAll('.nh-weather--hero')]
    const target = heroes.find((h) => ![...h.querySelectorAll('.nh-weather__detlabel')].some((l) => l.textContent.trim() === 'Precipitation'))
    if (!target) return null
    return {
      probs: [...target.querySelectorAll('.nh-weather__colprob')].length,
      details: [...target.querySelectorAll('.nh-weather__detlabel')].map((l) => l.textContent.trim()),
    }
  })
  ok('precipitation off removes chance columns and the detail', noPrecip !== null && noPrecip.probs === 0, JSON.stringify(noPrecip))

  const modelHit = forecastHits.find((u) => u.includes('latitude=33.3333'))
  ok('a widget with a model asks for it by name', String(modelHit).includes('models=ecmwf_ifs025'), String(modelHit))
  ok(
    'and a widget without one asks for no model at all',
    forecastHits.filter((u) => !u.includes('latitude=33.3333')).every((u) => !u.includes('models=')),
    forecastHits.filter((u) => u.includes('models=')).length + ' of ' + forecastHits.length + ' name a model'
  )

  const detroitHits = forecastHits.filter((u) => u.includes('latitude=42.3314')).length
  const berlinHits = forecastHits.filter((u) => u.includes('latitude=52.52')).length
  ok('widgets sharing a place share one forecast request', detroitHits === 1, 'detroit=' + detroitHits)
  ok('a second place fetches once more', berlinHits === 1, 'berlin=' + berlinHits)
  ok(
    'imperial units are requested from the service',
    forecastHits.length >= 2 && forecastHits.every((u) => u.includes('temperature_unit=fahrenheit')),
    forecastHits.length + ' urls'
  )

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

  await page.unroute('https://api.open-meteo.com/**')
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(forecast) })
  )
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

  const patternInput = page.locator('.nh-sheet .nh-field:has(.nh-field__label:text-is("Day high pattern")) input')
  await patternInput.click().catch(() => {})
  await page.keyboard.type('Xx_{n}_High', { delay: 15 })
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

  const holdWeather = async () => {
    const cell = page.locator('.nh-gcell').filter({ has: page.locator('.nh-weather--hero') }).first()
    const b = await cell.boundingBox().catch(() => null)
    if (!b) return false
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' })
    await page.waitForSelector('.nh-detail__panel', { timeout: 8000 }).catch(() => {})
    await sleep(600)
    return true
  }
  const opened = await holdWeather()
  const ink = await probe(page, () => {
    const panel = document.querySelector('.nh-detail__panel')
    const temp = panel?.querySelector('.nh-weather__temp')
    const cond = panel?.querySelector('.nh-weather__cond')
    if (!temp || !cond) return null
    const cs = getComputedStyle(temp)
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const m = ctx.measureText(temp.textContent ?? '')
    const box = temp.getBoundingClientRect()
    const size = parseFloat(cs.fontSize)
    const lineHeight = cs.lineHeight === 'normal' ? size * 1.2 : parseFloat(cs.lineHeight)
    const half = (lineHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2
    const baseline = box.top + half + m.fontBoundingBoxAscent
    return {
      inkBottom: Math.round(baseline + m.actualBoundingBoxDescent),
      condTop: Math.round(cond.getBoundingClientRect().top),
      font: cs.fontFamily,
    }
  })
  ok(
    'LCD: the segment digits clear the line under them',
    opened && ink !== null && ink.inkBottom <= ink.condTop,
    ink ? `ink ${ink.inkBottom} vs condition ${ink.condTop} (${ink.font})` : '(no sheet)'
  )
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)
  await page.evaluate(() => {
    localStorage.removeItem('nh-e2e-keep-theme')
    localStorage.setItem('neohab:themeOverride', 'dark')
  })

  ok('no page errors or app-resource failures', errs.length === 0, errs.slice(0, 3).join(' | '))
} finally {
  await browser.close().catch(() => {})
  for (const uid of [UID, UID_TIGHT]) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid === UID || c.uid === UID_TIGHT)
  ok('cleanup: dashboards removed', left.length === 0, left.map((c) => c.uid).join(','))

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
