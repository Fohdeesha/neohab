/**
 * LCD Console theme + segment-display anatomy + per-widget accent color + compass center item.
 *
 * Covers: the DSEG fonts served from the bundle and actually loading; the value widget's
 * segment metadata (data-ghost on digit-only readings, the lone-tenths-digit span, absence on
 * text readings); the ghost pseudo-element drawn ONLY by the LCD theme (content comes from
 * data-ghost, invisible/absent under every other theme); the digital clock's ghost; the
 * universal "Accent color" setting (--nh-cellaccent on the cell, LCD panel border + digit
 * color, and the filled accent tile recolored in a NON-LCD theme via the base stylesheet);
 * the compass upgrades (16-tick bezel, 8-letter rose, center item reading + unit + the
 * cardinal dropping to a small line); the LCD look itself (black void, hairline panel
 * borders, uppercase corner labels, top-right label default with an explicit choice still
 * winning, segment title); and the editor offering the new fields.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-lcd and deletes exactly it. The
 * theme is applied via the per-device localStorage override, so the server's `settings`
 * component is NEVER written. Nothing is ever commanded: every seeded widget is display-only
 * (value/clock/label/compass) and nothing in the app is clicked except editor chrome on the
 * suite's own dashboard. The dimmer/switch/decimal items are only ever read.
 */
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS, DECIMAL_ITEM } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-lcd'
const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const rgb = (s) => {
  let m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s ?? '')
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(s ?? '')
  if (m) return [0, 1, 2].map((i) => Math.round(Number(m[i + 1]) * 255))
  return null
}
const near = (a, b, tol = 8) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol)

const browser = await launch()
const errs = []

async function newPage(themeOverride) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('dialog', (d) => d.accept())
  await page.addInitScript(
    ({ t, theme }) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
        if (theme) localStorage.setItem('neohab:themeOverride', theme)
        else localStorage.removeItem('neohab:themeOverride')
        localStorage.removeItem('neohab:themeCache')
      } catch {}
    },
    { t: TOKEN, theme: themeOverride ?? null }
  )
  return page
}

const GREEN = '#3bf07a'

try {
  const dimmerStart = (await (await fetch(`${BASE}/rest/items/${ITEMS.dimmer}`, { headers: AUTH })).json()).state
  // ---------- seed (display-only widgets; nothing here can command anything) ----------
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-lcd',
        name: 'E2E Lcd',
        columns: 12,
        rowHeight: 'match',
        gap: 4,
        widgets: [
          { id: 'w-num', type: 'value', config: { item: ITEMS.dimmer, label: 'Outdoor' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
          { id: 'w-accent', type: 'value', config: { item: ITEMS.dimmer, label: 'Zone', accentColor: GREEN }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
          { id: 'w-text', type: 'value', config: { item: ITEMS.switch, label: 'State' }, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } },
          { id: 'w-fill', type: 'value', config: { item: ITEMS.dimmer, label: 'Fill', accent: 'filled', accentColor: GREEN }, layout: { lg: { x: 9, y: 0, w: 3, h: 2 } } },
          { id: 'w-clock', type: 'clock', config: { mode: 'digital', showDate: true }, layout: { lg: { x: 0, y: 2, w: 3, h: 2 } } },
          { id: 'w-label', type: 'label', config: { text: 'Friday', fontSize: 30 }, layout: { lg: { x: 3, y: 2, w: 3, h: 2 } } },
          {
            id: 'w-wind',
            type: 'compass',
            config: { item: ITEMS.temperature, centerItem: ITEMS.dimmer, centerUnit: 'MPH', rose: true, label: 'Wind' },
            layout: { lg: { x: 6, y: 2, w: 3, h: 3 } },
          },
          { id: 'w-left', type: 'value', config: { item: ITEMS.dimmer, label: 'Lefty', labelAlign: 'left' }, layout: { lg: { x: 9, y: 2, w: 3, h: 2 } } },
          ...(DECIMAL_ITEM
            ? [{ id: 'w-dec', type: 'value', config: { item: DECIMAL_ITEM, label: 'Tenths' }, layout: { lg: { x: 0, y: 4, w: 3, h: 2 } } }]
            : []),
          // every other readout wears the segment face too - display-only, never touched
          { id: 'w-dial', type: 'dial', config: { item: ITEMS.dimmer, label: 'Dial', readOnly: true, accentColor: GREEN }, layout: { lg: { x: 3, y: 4, w: 3, h: 3 } } },
          { id: 'w-gauge', type: 'dial', config: { item: ITEMS.dimmer, label: 'Gauge', style: 'led', readOnly: true }, layout: { lg: { x: 6, y: 5, w: 3, h: 3 } } },
          { id: 'w-slider', type: 'slider', config: { item: ITEMS.dimmer, label: 'Slider', style: 'plain' }, layout: { lg: { x: 9, y: 4, w: 3, h: 2 } } },
          // never clicked: active comes from the command matching the live state (ember trick)
          { id: 'w-btnon', type: 'button', config: { item: ITEMS.dimmer, label: 'OnBtn', command: String(dimmerStart), toggle: true, accentColor: GREEN }, layout: { lg: { x: 0, y: 6, w: 3, h: 1 } } },
          { id: 'w-btnoff', type: 'button', config: { item: ITEMS.dimmer, label: 'OffBtn', command: '87654', toggle: true }, layout: { lg: { x: 9, y: 6, w: 3, h: 1 } } },
        ],
      },
    }),
  })
  ok('seeded ' + UID, seed.status === 200, 'status=' + seed.status)

  // ---------- A: LCD Console applied via the device override (server settings untouched) ----
  const pa = await newPage('lcd')
  await pa.goto(APP + '#/d/nh-e2e-lcd', { waitUntil: 'domcontentloaded' })
  await pa.waitForSelector('.nh-gcell .nh-value__text', { timeout: 20000 }).catch(() => {})
  // the reading needs its live state before the ghost metadata means anything
  await pa
    .waitForFunction(() => {
      const t = document.querySelector('#w-num .nh-value__text, .nh-gcell .nh-value__text')
      return t && /\d/.test(t.textContent ?? '')
    }, { timeout: 15000 })
    .catch(() => {})

  ok('theme stylesheet injected', (await pa.locator('#nh-theme-css').count()) === 1)
  const bodyBg = rgb(await pa.evaluate(() => getComputedStyle(document.body).backgroundColor))
  ok('black void', near(bodyBg, [0, 0, 0], 3), JSON.stringify(bodyBg))

  // fonts: served from the bundle and actually loading as registered faces
  // (document.fonts.check() alone is worthless here - it answers true for a family with no
  // registered face at all, which is exactly the pre-feature state)
  const fontAssets = await pa.evaluate(async (base) => {
    const sizes = {}
    for (const f of ['dseg7.woff2', 'dseg14.woff2']) {
      const r = await fetch(base + 'fonts/' + f).catch(() => null)
      sizes[f] = r && r.ok ? (await r.arrayBuffer()).byteLength : 0
    }
    return sizes
  }, APP.replace(/index\.html$/, ''))
  ok('DSEG woff2 assets served', fontAssets['dseg7.woff2'] > 5000 && fontAssets['dseg14.woff2'] > 5000, JSON.stringify(fontAssets))
  await pa.evaluate(() => document.fonts.ready)
  const faces = await pa.evaluate(() => [...document.fonts].map((f) => ({ family: f.family, status: f.status })))
  ok('DSEG7 face registered and loaded', faces.some((f) => f.family.replace(/['"]/g, '') === 'DSEG7' && f.status === 'loaded'), JSON.stringify(faces))
  ok('DSEG14 face registered and loaded', faces.some((f) => f.family.replace(/['"]/g, '') === 'DSEG14' && f.status === 'loaded'), JSON.stringify(faces))
  const fam = await pa.evaluate(() => {
    const t = [...document.querySelectorAll('.nh-value__text')].find((el) => /\d/.test(el.textContent ?? ''))
    return t ? getComputedStyle(t).fontFamily : ''
  })
  ok('readings set in the segment face', fam.includes('DSEG7'), fam)

  // ghost metadata + the LCD-only pseudo that draws it
  const ghost = await pa.evaluate(() => {
    const t = [...document.querySelectorAll('.nh-value__text')].find((el) => /^\d+$/.test(el.textContent ?? ''))
    if (!t) return null
    const cs = getComputedStyle(t, '::before')
    return {
      text: t.textContent,
      attr: t.getAttribute('data-ghost'),
      content: cs.content,
      opacity: cs.opacity,
    }
  })
  ok('digit reading carries ghost metadata', ghost && ghost.attr === ghost.text.replace(/\d/g, '8'), JSON.stringify(ghost))
  ok('LCD draws the ghost as unlit segments', ghost && ghost.content === `"${ghost.attr}"` && Number(ghost.opacity) > 0.05 && Number(ghost.opacity) < 0.5, JSON.stringify(ghost))

  // a text reading has nothing to ghost and falls back to the 14-segment face
  const textReading = await pa.evaluate(() => {
    const cell = document.querySelector('.nh-gcell:nth-child(3)')
    const t = cell?.querySelector('.nh-value__text')
    return t ? { text: t.textContent, attr: t.getAttribute('data-ghost') } : null
  })
  ok('text reading carries no ghost', textReading && !/\d/.test(textReading.text ?? '') && textReading.attr === null, JSON.stringify(textReading))

  // clock ghost
  const clockGhost = await pa.evaluate(() => {
    const t = document.querySelector('.nh-clock__time')
    if (!t) return null
    const cs = getComputedStyle(t, '::before')
    return { text: t.textContent, attr: t.getAttribute('data-ghost'), content: cs.content, family: getComputedStyle(t).fontFamily }
  })
  ok('clock carries ghost metadata', clockGhost && clockGhost.attr === clockGhost.text.replace(/\d/g, '8'), JSON.stringify(clockGhost))
  ok('clock set in the segment face with its ghost drawn', clockGhost && clockGhost.family.includes('DSEG7') && clockGhost.content === `"${clockGhost.attr}"`)

  // panels: hairline borders, azure by default, the accent-colored zone in ITS color
  const borders = await pa.evaluate(() => {
    const w = (id) => {
      const el = document.querySelector(`.nh-gcell:nth-child(${id}) .nh-widget`)
      const cs = el ? getComputedStyle(el) : null
      return cs ? { color: cs.borderTopColor, width: cs.borderTopWidth, bg: cs.backgroundColor } : null
    }
    return { plain: w(1), zone: w(2) }
  })
  ok('panel is black with a hairline border', borders.plain && borders.plain.width === '1px' && near(rgb(borders.plain.bg), [0, 0, 0], 3), JSON.stringify(borders.plain))
  ok('accent color paints the panel border', near(rgb(borders.zone?.color), [59, 240, 122]), JSON.stringify(borders.zone))
  const zoneInk = await pa.evaluate(() => {
    const t = document.querySelector('.nh-gcell:nth-child(2) .nh-value__text')
    return t ? getComputedStyle(t).color : ''
  })
  ok('accent color paints the digits', near(rgb(zoneInk), [59, 240, 122]), zoneInk)

  // corner labels: tiny uppercase, top-right by default, explicit Left still wins
  const labelStyle = await pa.evaluate(() => {
    const l = document.querySelector('.nh-gcell:nth-child(1) .nh-widget__labelmain')
    const t = document.querySelector('.nh-gcell:nth-child(1) .nh-widget__label')
    return {
      justify: l ? getComputedStyle(l).justifyContent : '',
      transform: t ? getComputedStyle(t).textTransform : '',
    }
  })
  ok('corner labels uppercase and right-parked by default', labelStyle.transform === 'uppercase' && labelStyle.justify === 'flex-end', JSON.stringify(labelStyle))
  const leftJustify = await pa.evaluate(() => {
    const cells = [...document.querySelectorAll('.nh-gcell')]
    const cell = cells.find((c) => c.querySelector('.nh-widget__labeltext')?.textContent === 'Lefty')
    const l = cell?.querySelector('.nh-widget__labelmain')
    return l ? getComputedStyle(l).justifyContent : ''
  })
  ok('an explicit Left alignment still wins over the theme default', leftJustify === 'flex-start', leftJustify)

  // the segment title in the masthead
  const titleFam = await pa.evaluate(() => getComputedStyle(document.querySelector('.nh-dash__title')).fontFamily)
  ok('masthead title set in the 14-segment face', titleFam.includes('DSEG14'), titleFam)

  // compass: bezel ticks, 8-letter rose, center reading + unit, cardinal dropped small
  ok('16-tick bezel', (await pa.locator('.nh-compass__tick').count()) === 16)
  ok('8-letter rose', (await pa.locator('.nh-compass__rose').count()) === 8)
  await pa
    .waitForFunction(() => /\d/.test(document.querySelector('.nh-compass__value')?.textContent ?? ''), { timeout: 15000 })
    .catch(() => {})
  const windCenter = await pa.evaluate(() => {
    const v = document.querySelector('.nh-compass__value')
    const u = document.querySelector('.nh-compass__valueunit')
    const c = document.querySelector('.nh-compass__cardinal')
    return {
      value: v?.textContent ?? null,
      family: v ? getComputedStyle(v).fontFamily : '',
      unit: u?.textContent ?? null,
      sub: c?.classList.contains('nh-compass__cardinal--sub') ?? false,
    }
  })
  const dimmerNow = await (await fetch(`${BASE}/rest/items/${ITEMS.dimmer}`, { headers: AUTH })).json()
  ok('center item shows the second reading', windCenter.value !== null && parseFloat(windCenter.value) === parseFloat(dimmerNow.state), JSON.stringify({ shown: windCenter.value, item: dimmerNow.state }))
  ok('center unit suffix under it', windCenter.unit === 'MPH', windCenter.unit ?? 'none')
  ok('cardinal drops to a small line under the reading', windCenter.sub === true)
  ok('center reading set in the segment face', windCenter.family.includes('DSEG7'), windCenter.family)

  // ---------- every readout in the segment face; controls flat, active = whole-tile plate ----
  const readouts = await pa.evaluate(() => {
    const fam = (sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).fontFamily : ''
    }
    const dial = document.querySelector('.nh-dial__value')
    return {
      dial: fam('.nh-dial__value'),
      dialFill: dial ? getComputedStyle(dial).fill : '',
      gauge: fam('.nh-gauge__value'),
      slider: fam('.nh-slider__value'),
    }
  })
  ok('dial value set in the segment face', readouts.dial.includes('DSEG7'), readouts.dial)
  ok('dial value takes the panel accent', near(rgb(readouts.dialFill), [59, 240, 122]), readouts.dialFill)
  ok('gauge value set in the segment face', readouts.gauge.includes('DSEG7'), readouts.gauge)
  ok('slider value set in the segment face', readouts.slider.includes('DSEG7'), readouts.slider)

  // controls draw NO inner border - the panel is the card (no double borders)
  const btnBorder = await pa.evaluate(() => {
    const el = document.querySelector('.nh-button')
    const cs = el ? getComputedStyle(el) : null
    return cs ? { style: cs.borderTopStyle, width: cs.borderTopWidth } : null
  })
  ok('buttons are flat panel content (no inner border)', btnBorder && (btnBorder.style === 'none' || btnBorder.width === '0px'), JSON.stringify(btnBorder))

  // active toggle = its WHOLE panel becomes the neon plate (state-matching seed, never clicked)
  await pa
    .waitForFunction(() => document.querySelector('.nh-button--active') !== null, { timeout: 15000 })
    .catch(() => {})
  const plates = await pa.evaluate(() => {
    const cells = [...document.querySelectorAll('.nh-gcell')]
    const find = (label) => cells.find((c) => c.querySelector('.nh-button')?.textContent?.includes(label))
    const bg = (cell) => (cell ? getComputedStyle(cell.querySelector('.nh-widget')).backgroundColor : '')
    return { on: bg(find('OnBtn')), off: bg(find('OffBtn')), active: !!document.querySelector('.nh-button--active') }
  })
  ok('active toggle paints its whole panel in ITS accent', plates.active && near(rgb(plates.on), [59, 240, 122]), JSON.stringify(plates))
  ok('inactive toggle panel stays black', near(rgb(plates.off), [0, 0, 0], 3), plates.off)

  // the tenths digit splits into its own raised span (optional decimal item)
  if (DECIMAL_ITEM) {
    const dec = await pa.evaluate(() => {
      const cells = [...document.querySelectorAll('.nh-gcell')]
      const cell = cells.find((c) => c.querySelector('.nh-widget__labeltext')?.textContent === 'Tenths')
      const t = cell?.querySelector('.nh-value__text')
      const f = t?.querySelector('.nh-value__frac')
      if (!t || !f) return null
      return {
        whole: t.textContent,
        frac: f.textContent,
        fracAttr: f.getAttribute('data-ghost'),
        textPx: parseFloat(getComputedStyle(t).fontSize),
        fracPx: parseFloat(getComputedStyle(f).fontSize),
      }
    })
    ok('one-decimal reading splits its tenths digit', dec && /^\d$/.test(dec.frac) && dec.whole.endsWith(dec.frac), JSON.stringify(dec))
    ok('tenths digit rendered smaller in LCD', dec && dec.fracPx < dec.textPx * 0.7, JSON.stringify(dec))
    ok('tenths ghost is its own 8', dec && dec.fracAttr === '8', dec?.fracAttr ?? 'none')
  } else {
    console.log('SKIP  tenths-digit checks: no items.decimal in the target configuration')
  }

  await pa.close()

  // ---------- B: every other theme is untouched by the anatomy (neohab Dark) ----------
  const pb = await newPage('dark')
  await pb.goto(APP + '#/d/nh-e2e-lcd', { waitUntil: 'domcontentloaded' })
  await pb.waitForSelector('.nh-gcell .nh-value__text', { timeout: 20000 }).catch(() => {})
  await pb
    .waitForFunction(() => {
      const t = document.querySelector('.nh-gcell .nh-value__text')
      return t && /\d/.test(t.textContent ?? '')
    }, { timeout: 15000 })
    .catch(() => {})

  const darkGhost = await pb.evaluate(() => {
    const t = [...document.querySelectorAll('.nh-value__text')].find((el) => /^\d+$/.test(el.textContent ?? ''))
    if (!t) return null
    const cs = getComputedStyle(t, '::before')
    return { content: cs.content, family: getComputedStyle(t).fontFamily }
  })
  ok('dark theme draws NO ghost pseudo', darkGhost && (darkGhost.content === 'none' || darkGhost.content === 'normal'), JSON.stringify(darkGhost))
  ok('dark theme keeps its own face (no DSEG)', darkGhost && !darkGhost.family.includes('DSEG'), darkGhost?.family)
  if (DECIMAL_ITEM) {
    const decDark = await pb.evaluate(() => {
      const f = document.querySelector('.nh-value__frac')
      const t = f?.closest('.nh-value__text')
      return f && t ? { fracPx: parseFloat(getComputedStyle(f).fontSize), textPx: parseFloat(getComputedStyle(t).fontSize) } : null
    })
    ok('tenths span is inert outside LCD (same size)', decDark && Math.abs(decDark.fracPx - decDark.textPx) < 0.5, JSON.stringify(decDark))
  }
  // the base accent-tile recolor: filled + Accent color = that color in ANY theme
  const fillBg = await pb.evaluate(() => {
    const el = document.querySelector('.nh-acc-filled .nh-widget')
    return el ? getComputedStyle(el).backgroundColor : ''
  })
  ok('filled tile takes the per-widget accent color under dark', near(rgb(fillBg), [59, 240, 122]), fillBg)
  await pb.close()

  // ---------- C: the theme card, and the editor offering the new fields ----------
  const pc = await newPage('lcd')
  await pc.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await pc.waitForSelector('.nh-settings', { timeout: 20000 }).catch(() => {})
  ok('LCD Console theme card offered', (await pc.locator('button:has-text("LCD Console")').count()) >= 1)

  await pc.goto(APP + '#/d/nh-e2e-lcd', { waitUntil: 'domcontentloaded' })
  await pc.waitForSelector('[aria-label="Edit dashboard"], .nh-dash__bar button', { timeout: 20000 }).catch(() => {})
  await pc.click('[aria-label="Edit dashboard"]').catch(() => {})
  await pc.waitForSelector('.nh-cell', { timeout: 15000 }).catch(() => {})
  // select the compass by its handle strip (a plain click opens the settings panel)
  const compCell = pc.locator('.nh-cell:has(svg.nh-compass)')
  await compCell.locator('.nh-cell__grip').click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  ok('compass settings offer Center item', (await pc.locator('.nh-sheet .nh-field__label:text-is("Center item")').count()) === 1)
  ok('compass settings offer Center unit suffix', (await pc.locator('.nh-sheet .nh-field__label:text-is("Center unit suffix")').count()) === 1)
  ok('every widget offers Accent color', (await pc.locator('.nh-sheet .nh-field__label:text-is("Accent color")').count()) === 1)
  // leave without saving - the draft was never changed
  await pc.click('button:has-text("Exit")').catch(() => {})
  await pc.close()

  ok('no console/page errors', errs.length === 0, errs.slice(0, 4).join(' | '))
} finally {
  // ---------- cleanup: exactly this suite's component ----------
  const del = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => null)
  const listRes = await fetch(NS, { headers: AUTH })
  const uids = listRes.ok ? (await listRes.json()).map((c) => c.uid) : []
  const leftovers = uids.filter((u) => u === UID)
  ok('cleanup: suite component removed', (del?.status === 200 || del?.status === 404) && leftovers.length === 0, JSON.stringify(leftovers))
  await browser.close()
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exitCode = failed === 0 ? 0 : 1
