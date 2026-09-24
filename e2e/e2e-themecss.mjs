// Per-theme custom CSS + Swiss Sheet themes e2e.
// SAFE with a live config: creates only dashboard:nh-e2e-swiss and the one theme:custom-* the app saves
// (recorded as it is created, deleted in cleanup). The theme picks write the SHARED settings, which stay in
// this browser (lib/sandbox.mjs).
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

const UID = 'dashboard:nh-e2e-swiss'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// what the app has saved as the shared settings, as this browser sees them
const getSettings = async () => (await sb.current())?.config ?? null
const listUids = async () => (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const channels = (color) => {
  const ch = (String(color).match(/[\d.]+/g) ?? []).map(Number)
  return ch.length >= 3 && ch.slice(0, 3).every((v) => v <= 1) ? ch.map((v) => Math.round(v * 255)) : ch
}
const near = (color, want, tol = 2) => {
  const ch = channels(color)
  return ch.length >= 3 && want.every((w, i) => Math.abs(ch[i] - w) <= tol)
}

const sb = await sharedSettings()
const themeUidsBefore = (await listUids()).filter((u) => u.startsWith('theme:'))

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
await sb.install(page)
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try { localStorage.setItem('neohab:apiToken', t) } catch {}
}, TOKEN)

try {
  const presetState = (await (await fetch(BASE + `/rest/items/${ITEMS.switch}/state`, { headers: AUTH })).text()).trim()
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-swiss',
        name: 'E2E Swiss',
        columns: 12,
        rowHeight: 'match',
        gap: 5,
        widgets: [
          { id: 'w-v', type: 'value', config: { item: ITEMS.temperature, label: 'Bedroom Temp' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
          { id: 'w-c', type: 'clock', config: {}, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
          { id: 'w-b', type: 'button', config: { item: ITEMS.switch, label: 'Never Clicked', icon: 'oh:light' }, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } },
          {
            id: 'w-ba',
            type: 'button',
            config: { label: 'State Active', item: ITEMS.switch, command: presetState, toggle: true, icon: 'oh:light' },
            layout: { lg: { x: 9, y: 0, w: 3, h: 2 } },
          },
          { id: 'w-d', type: 'dial', config: { item: ITEMS.temperature, label: 'Gauge', readOnly: true, min: 0, max: 100 }, layout: { lg: { x: 0, y: 2, w: 3, h: 2 } } },
          { id: 'w-s', type: 'slider', config: { item: ITEMS.dimmer, label: 'Level', style: 'plain' }, layout: { lg: { x: 3, y: 2, w: 3, h: 2 } } },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))

  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
  const darkCard = page.locator('.nh-theme__pick:has(.nh-theme__name:text-is("Swiss Sheet"))')
  const lightCard = page.locator('.nh-theme__pick:has(.nh-theme__name:text-is("Swiss Sheet Light"))')
  ok('Swiss Sheet card present', (await darkCard.count()) === 1)
  ok('Swiss Sheet Light card present', (await lightCard.count()) === 1)

  await darkCard.click()
  await sleep(600)
  const bodyStyle = await page.evaluate(() => {
    const s = getComputedStyle(document.body)
    return { bg: s.backgroundColor, img: s.backgroundImage, font: s.fontFamily }
  })
  ok('swiss dark: the page is plain black', bodyStyle.bg === 'rgb(0, 0, 0)', bodyStyle.bg)
  ok('swiss dark: no texture on the page', bodyStyle.img === 'none', bodyStyle.img.slice(0, 40))
  ok('Helvetica system stack applied, no bundled font', /Helvetica/.test(bodyStyle.font) && !/Instrument/.test(bodyStyle.font), bodyStyle.font)
  ok('theme style element injected', await page.evaluate(() => !!document.getElementById('nh-theme-css')))
  const fontFetches = await page.evaluate(() =>
    performance.getEntriesByType('resource').filter((r) => /\.woff2?$/.test(r.name)).map((r) => r.name.split('/').pop()))
  ok('the theme downloads no webfont', fontFetches.length === 0, fontFetches.join(', '))

  await page.goto(APP + '#/d/nh-e2e-swiss')
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  const frame = await page.$eval('.nh-gcell .nh-widget', (el) => {
    const s = getComputedStyle(el)
    const a = getComputedStyle(el, '::after')
    return {
      bgImg: s.backgroundImage,
      bgColor: s.backgroundColor,
      topW: s.borderTopWidth,
      bottomW: s.borderBottomWidth,
      sideW: s.borderLeftWidth,
      radius: s.borderRadius,
      shadow: s.boxShadow,
      after: a.content,
    }
  })
  ok('widget UNBOXED: transparent, no borders', frame.bgColor === 'rgba(0, 0, 0, 0)' && frame.topW === '0px' && frame.bottomW === '0px' && frame.sideW === '0px', `${frame.bgColor} t${frame.topW} b${frame.bottomW} s${frame.sideW}`)
  ok('widget carries no motif or texture', frame.bgImg === 'none', frame.bgImg.slice(0, 30))
  ok('widget square corners', frame.radius === '0px', frame.radius)
  ok('widget no shadow', frame.shadow === 'none', frame.shadow)
  ok('no corner bracket pseudo-element', frame.after === 'none', frame.after)
  const labelStyle = await page.$eval('.nh-widget__label', (el) => {
    const s = getComputedStyle(el)
    return { tf: s.textTransform, rule: s.borderTopWidth, ruleColor: s.borderTopColor, weight: s.fontWeight, color: s.color, ml: s.marginLeft }
  })
  ok('the name row carries a 2px rule in the text colour', labelStyle.rule === '2px' && labelStyle.ruleColor === 'rgb(242, 242, 242)', `${labelStyle.rule} ${labelStyle.ruleColor}`)
  ok('caption lowercase, regular weight, dim', labelStyle.tf === 'lowercase' && labelStyle.weight === '400' && labelStyle.color === 'rgb(140, 145, 153)', `${labelStyle.tf} ${labelStyle.weight} ${labelStyle.color}`)
  ok('caption flush with the rule (rule inset by margin, not padding)', labelStyle.ml === '8px', labelStyle.ml)
  const valuePos = await page.$eval('.nh-value', (el) => {
    const body = el.closest('.nh-widget__body')
    const b = body.getBoundingClientRect()
    const v = el.getBoundingClientRect()
    return { left: v.left - b.left, topGap: v.top - b.top, bodyH: b.height, weight: getComputedStyle(el.querySelector('.nh-value__text')).fontWeight }
  })
  ok('reading sits top-left, set bold', valuePos.left < 12 && valuePos.topGap < valuePos.bodyH / 3 && valuePos.weight === '700', JSON.stringify(valuePos))

  const btn = await page.$eval('.nh-button:not(.nh-button--active)', (el) => {
    const s = getComputedStyle(el)
    const widget = el.closest('.nh-widget')
    return {
      radius: s.borderRadius,
      face: s.backgroundImage,
      shadow: s.boxShadow,
      bg: s.backgroundColor,
      borderW: s.borderTopWidth,
      headed: widget.classList.contains('nh-widget--headed'),
      widgetRule: getComputedStyle(widget).borderTopWidth,
    }
  })
  ok('button squared by theme CSS', btn.radius === '0px', btn.radius)
  ok('button outlined and transparent, no reticle', btn.bg === 'rgba(0, 0, 0, 0)' && btn.borderW === '1px' && btn.face === 'none' && btn.shadow === 'none', `${btn.bg} ${btn.borderW} ${btn.face.slice(0, 20)}`)
  ok('a headerless button has no rule above it', !btn.headed && btn.widgetRule === '0px', `headed=${btn.headed} rule=${btn.widgetRule}`)
  const plate = await page
    .waitForSelector('.nh-button--active', { timeout: 15000 })
    .then(async (el) => {
      await sleep(300)
      return el.evaluate((n) => {
        const s = getComputedStyle(n)
        return { bg: s.backgroundColor, color: s.color, border: s.borderTopColor }
      })
    })
    .catch(() => null)
  ok('active toggle = plate in the text colour, page-colour ink', !!plate && near(plate.bg, [242, 242, 242]) && plate.color === 'rgb(0, 0, 0)', JSON.stringify(plate) + ' state=' + presetState)
  const iconFilters = await page.$$eval('.nh-icon--img', (els) => els.map((el) => getComputedStyle(el).filter))
  ok('image icons keep their color (no filter)', iconFilters.length > 0 && iconFilters.every((f) => f === 'none'), iconFilters.join(' | '))

  const dial = await page.$eval('.nh-dial', (el) => {
    const track = getComputedStyle(el.querySelector('.nh-dial__track'))
    const fill = el.querySelector('.nh-dial__fill')
    return { track: track.stroke, cap: track.strokeLinecap, width: track.strokeWidth, fill: fill ? getComputedStyle(fill).stroke : null }
  })
  ok('dial track is the flat grey, square-ended', dial.track === 'rgb(43, 43, 43)' && dial.cap === 'butt', `${dial.track} ${dial.cap} ${dial.width}`)
  ok('dial fills in the text colour', dial.fill === 'rgb(242, 242, 242)', String(dial.fill))
  const slider = await page.$eval('.nh-slider__input', (el) => {
    const s = getComputedStyle(el)
    return { appearance: s.appearance || s.webkitAppearance, bg: s.backgroundColor }
  })
  ok('slider is a flat custom track', slider.appearance === 'none', JSON.stringify(slider))

  const barRule = await page.$eval('.nh-dash__bar', (el) => {
    const s = getComputedStyle(el)
    return { bw: s.borderBottomWidth, bc: s.borderBottomColor, img: s.backgroundImage }
  })
  ok('2px rule under the masthead, no gradient', barRule.bw === '2px' && barRule.bc === 'rgb(242, 242, 242)' && barRule.img === 'none', `${barRule.bw} ${barRule.bc} ${barRule.img.slice(0, 20)}`)
  const mark = await page.$eval('.nh-dash__title', (el) => {
    const s = getComputedStyle(el, '::before')
    return { w: s.width, bg: s.backgroundColor, tf: getComputedStyle(el).textTransform, weight: getComputedStyle(el).fontWeight }
  })
  ok('title lowercase bold with a red mark', mark.w === '9px' && mark.bg === 'rgb(226, 56, 42)' && mark.tf === 'lowercase' && mark.weight === '700', JSON.stringify(mark))

  await page.goto(APP + '#/')
  await page.waitForSelector('.nh-tile', { timeout: 20000 })
  await page.mouse.move(0, 0)
  await sleep(250)
  const tile = await page.$eval('.nh-tile:not(.nh-tile--new)', (el) => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, bgImg: s.backgroundImage, topW: s.borderTopWidth, topC: s.borderTopColor, sideW: s.borderLeftWidth }
  })
  ok('tile = unboxed section under a 2px rule', tile.bg === 'rgba(0, 0, 0, 0)' && tile.bgImg === 'none' && tile.topW === '2px' && tile.topC === 'rgb(242, 242, 242)' && tile.sideW === '0px', JSON.stringify(tile))
  const newTile = await page.$eval('.nh-tile--new', (el) => {
    const s = getComputedStyle(el)
    return { style: s.borderTopStyle, w: s.borderTopWidth }
  })
  ok('new-dashboard tile still dashed', newTile.style === 'dashed' && newTile.w === '1px', JSON.stringify(newTile))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.getElementById('nh-theme-css'), null, { timeout: 5000 })
  const reloadBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok('swiss survives reload via theme cache', reloadBg === 'rgb(0, 0, 0)', reloadBg)

  await page.goto(APP + '#/settings')
  await page.waitForSelector('.nh-theme__pick')
  await lightCard.click()
  await sleep(600)
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok('swiss light bg white', lightBg === 'rgb(255, 255, 255)', lightBg)
  await page.goto(APP + '#/d/nh-e2e-swiss')
  await page.waitForSelector('.nh-widget')
  const lightRule = await page.$eval('.nh-widget__label', (el) => getComputedStyle(el).borderTopColor)
  ok('light variant rules in near-black ink', lightRule === 'rgb(17, 17, 17)', lightRule)
  const lightPlate = await page
    .waitForSelector('.nh-button--active', { timeout: 15000 })
    .then(async (el) => {
      await sleep(300)
      return el.evaluate((n) => ({ bg: getComputedStyle(n).backgroundColor, color: getComputedStyle(n).color }))
    })
    .catch(() => null)
  ok('light variant: active plate is ink with white lettering', !!lightPlate && near(lightPlate.bg, [17, 17, 17]) && lightPlate.color === 'rgb(255, 255, 255)', JSON.stringify(lightPlate))

  await page.goto(APP + '#/settings')
  await page.waitForSelector('.nh-theme__pick')
  const sharedBefore = (await getSettings())?.theme
  await page.click('button:has-text("New theme")')
  await page.waitForSelector('#theme-css', { timeout: 10000 })

  ok('a new theme does not inherit the active theme stylesheet', (await page.inputValue('#theme-css')) === '')
  await page.click('.nh-tokengroup__head:has-text("Semantic")')
  await sleep(200)
  const activePrimary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nh-primary').trim().toLowerCase())
  ok('a new theme does inherit its colours',
    (await page.inputValue('#tok-primary')).toLowerCase() === activePrimary,
    `${await page.inputValue('#tok-primary')} vs ${activePrimary}`)
  ok('a new theme does not inherit a pinned accent ink', (await page.inputValue('#tok-accent-ink')) === '',
    JSON.stringify(await page.inputValue('#tok-accent-ink')))

  await page.fill('#tok-primary', '#00ff00')
  await sleep(350)
  const previewed = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nh-primary').trim())
  ok('live preview: a token change applies before saving', previewed.toLowerCase() === '#00ff00', previewed)
  const previewUnsaved = (await listUids()).filter((u) => u.startsWith('theme:') && !themeUidsBefore.includes(u))
  ok('live preview stores nothing on the server', previewUnsaved.length === 0, previewUnsaved.join())

  const inkLight = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nh-accent-ink').trim())
  await page.fill('#tok-primary', '#101010')
  await sleep(300)
  const inkDark = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nh-accent-ink').trim())
  ok('accent ink flips with the accent it sits on',
    inkLight.toLowerCase() !== '#ffffff' && inkDark.toLowerCase() === '#ffffff',
    JSON.stringify({ onGreen: inkLight, onNearBlack: inkDark }))

  await page.click('.nh-tokengroup__head:has-text("Chart palette")')
  await sleep(200)
  ok('the chart palette is editable in the UI', (await page.locator('#tok-chart-1').count()) === 1)
  await page.click('.nh-tokengroup__head:has-text("Instruments")')
  await sleep(200)
  ok('the instrument tokens are editable in the UI', (await page.locator('#tok-band-light').count()) === 1)

  ok('contrast is reported for the pairs that meet on screen',
    (await page.locator('.nh-contrast__row').count()) >= 4,
    String(await page.locator('.nh-contrast__row').count()))

  await page.fill('#tok-primary', activePrimary)
  await page.click('button:has-text("Start from")')
  await page.waitForFunction(() => document.querySelector('#theme-css')?.value?.includes('Helvetica'), null, { timeout: 10000 })
  const copied = await page.inputValue('#theme-css')
  ok('the stylesheet can be copied on request', copied.includes("'Helvetica Neue'") && copied.includes('.nh-widget__label'),
    copied.slice(0, 40) + '…')

  const MARKER = 'body { letter-spacing: 0.31px; }'
  await page.fill('#theme-css', MARKER)
  await page.fill('#theme-name', 'E2E CSS Theme')

  await page.click('button:has-text("Save theme")')
  await sleep(900)
  ok('saving a theme leaves the shared theme alone', (await getSettings())?.theme === sharedBefore,
    JSON.stringify({ before: sharedBefore, after: (await getSettings())?.theme }))

  const newThemeUids = (await listUids()).filter((u) => u.startsWith('theme:') && !themeUidsBefore.includes(u))
  ok('one custom theme on server', newThemeUids.length === 1, newThemeUids.join())
  if (newThemeUids.length === 1) {
    const comp = await (await fetch(NS + '/' + encodeURIComponent(newThemeUids[0]), { headers: AUTH })).json()
    ok('server component carries css', comp?.config?.css === MARKER, String(comp?.config?.css).slice(0, 40))
    ok('server component carries the edited tokens', comp?.config?.tokens?.primary?.toLowerCase() === activePrimary,
      String(comp?.config?.tokens?.primary))

    await page.click(`.nh-theme__pick:has(.nh-theme__name:text-is("E2E CSS Theme"))`)
    await sleep(900)
    const spacing = await page.evaluate(() => getComputedStyle(document.body).letterSpacing)
    ok('picking the saved theme applies its CSS', spacing === '0.31px', spacing)
    ok('picking it does set the shared theme', (await getSettings())?.theme === newThemeUids[0].slice('theme:'.length),
      String((await getSettings())?.theme))
  }

  await page.click('.nh-theme__pick:has(.nh-theme__name:text-is("neohab Dark"))')
  await sleep(600)
  ok('style element removed on css-less theme', await page.evaluate(() => !document.getElementById('nh-theme-css')))
  const plainSpacing = await page.evaluate(() => getComputedStyle(document.body).letterSpacing)
  ok('marker CSS gone', plainSpacing === 'normal', plainSpacing)

  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite crashed', false, String(e && e.message))
} finally {
  try {
    await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
    // only the themes the app created in this run: a diff of the namespace would take one somebody else saved meanwhile
    const leftoverThemes = [...sb.created].filter((u) => u.startsWith('theme:') && !themeUidsBefore.includes(u))
    for (const u of leftoverThemes) await fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH })
    const untouched = await sb.verify()
    ok('cleanup: the shared settings on the server were never written', untouched.ok, untouched.detail)
    console.log(`CLEANUP  dashboard deleted, ${leftoverThemes.length} theme(s) deleted`)
    const uids = await listUids()
    console.log('CLEANUP  leftovers: ' + uids.filter((u) => u.includes('nh-e2e') || u.includes('custom-')).join(', ') || 'none')
  } catch (e) {
    console.log('CLEANUP FAILED: ' + String(e && e.message))
  }
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => f.name).join(' | '))
    process.exitCode = 1
  }
}
