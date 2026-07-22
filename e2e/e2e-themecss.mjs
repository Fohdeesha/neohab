/**
 * Per-theme custom CSS + Swiss Sheet themes e2e.
 *
 * Covers: the two Swiss Sheet built-ins appear and apply (tokens + injected stylesheet);
 * widget frames become flat top-ruled sheets (transparent bg, 2px top rule, no radius/shadow,
 * lowercase labels); Home tiles ruled, "+" tile keeps its dashed box; the injected stylesheet
 * survives reload via the pre-paint theme cache; light variant; theme editor gains a Custom CSS
 * textarea (prefilled by "New theme from current", round-trips to the server, applies on save);
 * switching to a css-less theme removes the style element; console clean.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-swiss and one theme:custom-* (found by
 * uid diff, deleted in cleanup). The `settings` component is snapshotted first and restored
 * VERBATIM. Commands NOTHING (label/clock/value widgets; value reads the temperature item).
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-swiss'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const listUids = async () => (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

// ---------- pre-suite snapshots ----------
const settingsBefore = await (await fetch(NS + '/settings', { headers: AUTH })).json()
const themeUidsBefore = (await listUids()).filter((u) => u.startsWith('theme:'))

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try { localStorage.setItem('neohab:apiToken', t) } catch {}
}, TOKEN)

try {
  // ---------- seed a dashboard (nothing commandable is ever clicked) ----------
  // A toggle button whose command EQUALS the item's current state renders active without any
  // interaction - the active red plate is asserted purely from SSE state, zero commands sent.
  const presetState = (await (await fetch(BASE + `/rest/items/${ITEMS.switch}/state`, { headers: AUTH })).text()).trim()
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
          // never clicked - only its computed style is read
          { id: 'w-b', type: 'button', config: { label: 'Never Clicked', icon: 'oh:light' }, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } },
          {
            id: 'w-ba',
            type: 'button',
            config: { label: 'State Active', item: ITEMS.switch, command: presetState, toggle: true, icon: 'oh:light' },
            layout: { lg: { x: 9, y: 0, w: 3, h: 2 } },
          },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))

  // ---------- built-ins present, dark variant applies ----------
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
    return { bg: s.backgroundColor, font: s.fontFamily }
  })
  ok('swiss dark bg applied', bodyStyle.bg === 'rgb(10, 10, 10)', bodyStyle.bg)
  ok('Instrument Sans stack applied', /Instrument Sans/i.test(bodyStyle.font), bodyStyle.font)
  ok('theme style element injected', await page.evaluate(() => !!document.getElementById('nh-theme-css')))
  // the woff2 must actually be served from the jar and load - not just be declared
  const fontLoaded = await page.evaluate(async () => {
    await document.fonts.ready
    return document.fonts.check("16px 'Instrument Sans'")
  })
  ok('Instrument Sans woff2 loads from the jar', fontLoaded)

  // ---------- widget frame is a flat top-ruled sheet ----------
  await page.goto(APP + '#/d/nh-e2e-swiss')
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  const frame = await page.$eval('.nh-gcell .nh-widget', (el) => {
    const s = getComputedStyle(el)
    return {
      bgImg: s.backgroundImage,
      bgColor: s.backgroundColor,
      bgSize: s.backgroundSize,
      topW: s.borderTopWidth,
      bottomW: s.borderBottomWidth,
      radius: s.borderRadius,
      shadow: s.boxShadow,
    }
  })
  ok('widget UNBOXED: clean page-black region, no borders', frame.bgColor === 'rgb(10, 10, 10)' && frame.topW === '0px' && frame.bottomW === '0px', `${frame.bgColor} t${frame.topW} b${frame.bottomW}`)
  ok('two-tone rule layer (red segment into ink run)', frame.bgSize.startsWith('100% 2px') && frame.bgImg.includes('rgb(226, 56, 42)') && frame.bgImg.includes('rgb(242, 242, 242)'), frame.bgSize)
  ok('circle construction motif present', frame.bgImg.includes('radial-gradient'), frame.bgImg.slice(0, 30))
  ok('widget square corners', frame.radius === '0px', frame.radius)
  ok('widget no shadow', frame.shadow === 'none', frame.shadow)
  const bracket = await page.$eval('.nh-gcell .nh-widget', (el) => {
    const s = getComputedStyle(el, '::after')
    return { w: s.borderRightWidth, pe: s.pointerEvents }
  })
  ok('corner registration bracket (inert)', bracket.w === '1px' && bracket.pe === 'none', JSON.stringify(bracket))
  const pageGrid = await page.evaluate(() => getComputedStyle(document.body).backgroundImage)
  ok('drafting grid fills the page background', pageGrid.includes('repeating-linear-gradient'), pageGrid.slice(0, 40))
  const labelStyle = await page.$eval('.nh-widget__label', (el) => {
    const s = getComputedStyle(el)
    return { tf: s.textTransform, underline: s.borderBottomWidth }
  })
  ok('widget label lowercase', labelStyle.tf === 'lowercase', labelStyle.tf)
  ok('label row NOT underlined anymore', labelStyle.underline === '0px', labelStyle.underline)
  // hardcoded 10px + rounded in app.css - only the theme CSS changes these
  const btn = await page.$eval('.nh-button', (el) => {
    const s = getComputedStyle(el)
    return { radius: s.borderRadius, face: s.backgroundImage, shadow: s.boxShadow, bg: s.backgroundColor, borderW: s.borderTopWidth }
  })
  ok('button squared by theme CSS', btn.radius === '0px', btn.radius)
  ok('button outlined-transparent with reticle rings', btn.bg.startsWith('rgba(0, 0, 0, 0') && btn.borderW === '1px' && btn.face.includes('radial-gradient') && btn.shadow === 'none', `${btn.bg} ${btn.borderW}`)
  // state-matching toggle button renders the solid red active plate - from SSE state alone.
  // The class appears only once the item's state ARRIVES over SSE, so wait for it.
  // (and let .nh-button's 100ms background transition finish, or the sample lands mid-flight)
  const plate = await page
    .waitForSelector('.nh-button--active', { timeout: 15000 })
    .then(async (el) => {
      await sleep(300)
      return el.evaluate((n) => {
        const s = getComputedStyle(n)
        return { bg: s.backgroundColor, color: s.color }
      })
    })
    .catch(() => null)
  // lighter pink-leaning red: primary 75% + white 25% = ~rgb(233, 106, 95).
  // Chromium serializes color-mix as color(srgb 0..1 ...) - normalize to 0..255.
  let plateCh = plate ? (plate.bg.match(/[\d.]+/g) ?? []).map(Number) : []
  if (plateCh.length >= 3 && plateCh.slice(0, 3).every((v) => v <= 1)) plateCh = plateCh.map((v) => v * 255)
  const plateOk =
    plateCh.length >= 3 &&
    Math.abs(plateCh[0] - 233) <= 2 &&
    Math.abs(plateCh[1] - 106) <= 2 &&
    Math.abs(plateCh[2] - 95) <= 2
  ok('active toggle = lighter red plate, white text', !!plate && plateOk && plate.color === 'rgb(255, 255, 255)', JSON.stringify(plate) + ' state=' + presetState)
  const iconFilters = await page.$$eval('.nh-icon--img', (els) => els.map((el) => getComputedStyle(el).filter))
  ok('image icons keep their color (no filter)', iconFilters.length > 0 && iconFilters.every((f) => f === 'none'), iconFilters.join(' | '))
  const barRule = await page.$eval('.nh-dash__bar', (el) => {
    const s = getComputedStyle(el)
    return { bw: s.borderBottomWidth, size: s.backgroundSize, img: s.backgroundImage }
  })
  ok('two-tone masthead rule under the header', barRule.bw === '0px' && barRule.size === '100% 3px' && barRule.img.includes('rgb(226, 56, 42)'), `${barRule.bw} ${barRule.size}`)

  // ---------- Home tiles ruled; "+" tile keeps its dashed box ----------
  await page.goto(APP + '#/')
  await page.waitForSelector('.nh-tile', { timeout: 20000 })
  const tile = await page.$eval('.nh-tile:not(.nh-tile--new)', (el) => {
    const s = getComputedStyle(el)
    return { bgImg: s.backgroundImage, bgSize: s.backgroundSize, topW: s.borderTopWidth, sideW: s.borderLeftWidth }
  })
  ok('tile = unboxed sheet section (two-tone rule + motif)', tile.bgImg.includes('radial-gradient') && tile.bgSize.startsWith('100% 2px') && tile.topW === '0px' && tile.sideW === '0px', JSON.stringify({ ...tile, bgImg: tile.bgImg.slice(0, 20) }))
  const newTile = await page.$eval('.nh-tile--new', (el) => {
    const s = getComputedStyle(el)
    return { style: s.borderTopStyle, w: s.borderTopWidth }
  })
  ok('new-dashboard tile still dashed', newTile.style === 'dashed' && newTile.w === '1px', JSON.stringify(newTile))

  // ---------- pre-paint cache path: stylesheet present right after reload ----------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.getElementById('nh-theme-css'), null, { timeout: 5000 })
  const reloadBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok('swiss survives reload via theme cache', reloadBg === 'rgb(10, 10, 10)', reloadBg)

  // ---------- light variant ----------
  await page.goto(APP + '#/settings')
  await page.waitForSelector('.nh-theme__pick')
  await lightCard.click()
  await sleep(600)
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok('swiss light bg white', lightBg === 'rgb(255, 255, 255)', lightBg)
  await page.goto(APP + '#/d/nh-e2e-swiss')
  await page.waitForSelector('.nh-widget')
  const lightRule = await page.$eval('.nh-gcell .nh-widget', (el) => getComputedStyle(el).backgroundImage)
  ok('light variant rules in near-black ink', lightRule.includes('rgb(17, 17, 17)'), lightRule.slice(0, 60))

  // ---------- editor: Custom CSS textarea, prefill, round-trip ----------
  await page.goto(APP + '#/settings')
  await page.waitForSelector('.nh-theme__pick')
  await page.click('button:has-text("New theme from current")')
  await page.waitForSelector('#theme-css', { timeout: 10000 })
  const prefill = await page.inputValue('#theme-css')
  ok('CSS prefilled from current theme', prefill.includes("'Instrument Sans'") && prefill.includes('radial-gradient'), prefill.slice(0, 40) + '…')
  const MARKER = 'body { letter-spacing: 0.31px; }'
  await page.fill('#theme-css', MARKER)
  await page.fill('#theme-name', 'E2E CSS Theme')
  await page.click('button:has-text("Save theme")')
  await sleep(800)
  const spacing = await page.evaluate(() => getComputedStyle(document.body).letterSpacing)
  ok('saved custom CSS applies', spacing === '0.31px', spacing)
  const newThemeUids = (await listUids()).filter((u) => u.startsWith('theme:') && !themeUidsBefore.includes(u))
  ok('one custom theme on server', newThemeUids.length === 1, newThemeUids.join())
  if (newThemeUids.length === 1) {
    const comp = await (await fetch(NS + '/' + encodeURIComponent(newThemeUids[0]), { headers: AUTH })).json()
    ok('server component carries css', comp?.config?.css === MARKER, String(comp?.config?.css).slice(0, 40))
  }

  // ---------- css-less theme removes the stylesheet ----------
  await page.click('.nh-theme__pick:has(.nh-theme__name:text-is("neohab Dark"))')
  await sleep(600)
  ok('style element removed on css-less theme', await page.evaluate(() => !document.getElementById('nh-theme-css')))
  const plainSpacing = await page.evaluate(() => getComputedStyle(document.body).letterSpacing)
  ok('marker CSS gone', plainSpacing === 'normal', plainSpacing)

  // cleanup of the custom theme happens in finally via uid diff
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite crashed', false, String(e && e.message))
} finally {
  // ---------- cleanup: exact uids only, settings restored verbatim ----------
  try {
    await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
    const leftoverThemes = (await listUids()).filter((u) => u.startsWith('theme:') && !themeUidsBefore.includes(u))
    for (const u of leftoverThemes) await fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH })
    const putSettings = await fetch(NS + '/settings', {
      method: 'PUT',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsBefore),
    })
    const settingsAfter = await (await fetch(NS + '/settings', { headers: AUTH })).json()
    const same =
      JSON.stringify({ ...settingsBefore, timestamp: 0 }) === JSON.stringify({ ...settingsAfter, timestamp: 0 })
    console.log(
      `CLEANUP  dashboard deleted, ${leftoverThemes.length} theme(s) deleted, settings restore ${putSettings.status}, verbatim=${same}`,
    )
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
