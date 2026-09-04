/**
 * Responsive / mobile e2e: multi-viewport layout invariants, dynamic icon scaling, color-picker
 * optimistic hold, and the dark-scheme iframe fix. SAFE with a live config: creates only
 * dashboard:nh-e2e-resp (deleted afterwards, cleanup guarded), reads the server's own dashboards
 * strictly read-only (zero clicks there), restores approved item states.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await chromium.launch({ channel: c, headless: true }) } catch {} } return chromium.launch({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => await (await fetch(`${BASE}/rest/items/${item}/state`)).text()
const sendCmd = (item, cmd) =>
  fetch(`${BASE}/rest/items/${item}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: cmd })
const listNs = async () => await (await fetch(NS)).json()

const SWITCH_ITEM = ITEMS.switch
const SLIDER_ITEM = ITEMS.dimmer
const COLOR_ITEM = ITEMS.color
const initial = {
  switch: await getState(SWITCH_ITEM),
  slider: await getState(SLIDER_ITEM),
  color: await getState(COLOR_ITEM),
}

// a LAN-served time page (white courier text, no background - the HABPanel classic)
const TIME_HTML = `<html><head><style>body{overflow:hidden}</style></head><body><center><font color="white" face="Courier"><div style="font-size:33px" id="clockbox">July 14 <br> Tuesday 2026 <br> 5:59 AM</div></font></center></body></html>`

/* ------------------------- seed the suite's own dashboard ------------------------- */

const DASH = {
  uid: 'dashboard:nh-e2e-resp',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1,
    id: 'nh-e2e-resp',
    name: 'E2E Responsive',
    columns: 11,
    rowHeight: 'match',
    gap: 4,
    widgets: [
      // 1x1 buttons with icons - the classic dense lighting-board shape
      { id: 'r-btn1', type: 'button', config: { label: 'Main Room Lights', icon: 'oh:slider', iconSize: 60, item: SWITCH_ITEM, command: 'ON', commandAlt: 'OFF', toggle: true }, layout: { lg: { x: 0, y: 0, w: 1, h: 1 } } },
      { id: 'r-btn2', type: 'button', config: { label: 'A Fairly Long Button Label Indeed', icon: 'mdi:lightbulb-group', iconSize: 120, command: 'ON' }, layout: { lg: { x: 1, y: 0, w: 1, h: 1 } } },
      { id: 'r-btn3', type: 'button', config: { label: 'No Icon Button', command: 'ON' }, layout: { lg: { x: 2, y: 0, w: 1, h: 1 } } },
      { id: 'r-color', type: 'color', config: { item: COLOR_ITEM, label: 'E2E Color' }, layout: { lg: { x: 3, y: 0, w: 3, h: 1 } } },
      { id: 'r-slider', type: 'slider', config: { item: SLIDER_ITEM, label: 'E2E Slider', min: 0, max: 100, step: 1 }, layout: { lg: { x: 6, y: 0, w: 3, h: 1 } } },
      { id: 'r-switch', type: 'switch', config: { item: SWITCH_ITEM, label: 'E2E Switch', icon: 'mdi:lightbulb', iconSize: 32 }, layout: { lg: { x: 9, y: 0, w: 2, h: 2 } } },
      { id: 'r-dial', type: 'dial', config: { item: SLIDER_ITEM, label: 'E2E Dial', readOnly: true }, layout: { lg: { x: 0, y: 1, w: 2, h: 2 } } },
      { id: 'r-tpl', type: 'template', config: { label: 'date time', template: '<iframe name="t" frameborder="0" src="http://home.lan/habpanelstuff/time.html"> </iframe>' }, layout: { lg: { x: 3, y: 1, w: 2, h: 1 } } },
    ],
  },
}

{
  const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(DASH) })
  ok('seed dashboard created', r.ok, String(r.status))
}

/* -------------------------------- helpers (in-page) -------------------------------- */

// cellMetrics/iconScale mirrored from model/layout.ts
const cellRowHeight = (columns, gap, rowHeight, containerWidth) => {
  const colWidth = (containerWidth - gap * (columns - 1)) / columns
  return rowHeight === 'match' ? Math.max(8, colWidth) : rowHeight
}
const expectedScale = (columns, gap, rowHeight, actualRowH) =>
  actualRowH / cellRowHeight(columns, gap, rowHeight, 1920)

const LAYOUT_CHECKS = `(() => {
  const problems = []
  const de = document.documentElement
  if (de.scrollWidth > window.innerWidth + 1) problems.push('page-hscroll:' + de.scrollWidth + '>' + window.innerWidth)
  for (const btn of document.querySelectorAll('.nh-button')) {
    const label = btn.querySelector('.nh-button__label')
    if (!label) continue
    const lb = label.getBoundingClientRect(), bb = btn.getBoundingClientRect()
    const lh = parseFloat(getComputedStyle(label).lineHeight) || 19
    if (lb.top < bb.top - 0.5 || lb.bottom > bb.bottom + 0.5) problems.push('label-outside:' + label.textContent.slice(0, 18))
    if (lb.height < lh - 1) problems.push('label-sliver:' + label.textContent.slice(0, 18) + ':' + lb.height.toFixed(1))
  }
  for (const el of document.querySelectorAll('.nh-color')) {
    const box = el.closest('.nh-widget').getBoundingClientRect()
    const tracks = [...el.querySelectorAll('.nh-color__track')]
    if (tracks.length !== 3) problems.push('color-tracks:' + tracks.length)
    for (const t of tracks) {
      const r = t.getBoundingClientRect()
      if (r.height < 10 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) problems.push('color-track-clipped')
    }
  }
  for (const ic of document.querySelectorAll('.nh-grid .nh-button .nh-icon, .nh-grid .nh-switch .nh-icon')) {
    const w = ic.closest('.nh-widget')
    if (!w) continue
    const ib = ic.getBoundingClientRect(), wb = w.getBoundingClientRect()
    if (ib.height > 0 && (ib.top < wb.top - 0.5 || ib.bottom > wb.bottom + 0.5)) problems.push('icon-overflow')
  }
  return problems
})()`

const iframeDarkCheck = async (page, hostSel) => {
  const el = page.locator(hostSel).first()
  const buf = await el.screenshot()
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height).data
    let bright = 0, dark = 0
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3
      if (v > 200) bright++
      else if (v < 80) dark++
    }
    const total = d.length / 4
    return { brightPct: (bright / total) * 100, darkPct: (dark / total) * 100 }
  }, buf.toString('base64'))
}

/* ------------------------------------ run ------------------------------------ */

const browser = await launchBrowser()
try {
  const VIEWPORTS = [
    { name: 'phone-360', viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'phone-393', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    { name: 'phone-412', viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
    { name: 'tablet-768', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { name: 'laptop-1024', viewport: { width: 1024, height: 768 } },
    { name: 'laptop-1366', viewport: { width: 1366, height: 768 } },
    { name: 'desktop-1920', viewport: { width: 1920, height: 1080 } },
    { name: 'desktop-2560', viewport: { width: 2560, height: 1400 } },
  ]

  const iconHeights = {}
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext(vp.name.startsWith('phone') || vp.name.startsWith('tablet') ? vp : { viewport: vp.viewport })
    // pin the default theme: this suite asserts default geometry, and the server's
    // global theme belongs to the user (it was 'assembly' when this line was added)
    await ctx.addInitScript(() => { try { localStorage.setItem('neohab:themeOverride', 'dark') } catch {} })
    await ctx.route('**://home.lan/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: TIME_HTML })
    )
    const page = await ctx.newPage()
    const errs = []
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    page.on('pageerror', (e) => errs.push(String(e)))

    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-resp')
    await page.waitForSelector('.nh-grid .nh-widget', { timeout: 15000 })
    await sleep(1200)

    const problems = await page.evaluate(LAYOUT_CHECKS)
    ok(`${vp.name}: layout invariants (no clipping/overflow)`, problems.length === 0, problems.slice(0, 4).join(' | '))

    // icon scaling: measure the oh:slider icon on r-btn1 (iconSize 60)
    const stacked = await page.evaluate(`!!document.querySelector('.nh-grid--stacked')`)
    const gridW = await page.evaluate(`document.querySelector('.nh-grid').clientWidth`)
    const rowH = stacked ? cellRowHeight(11, 4, 'match', 1280) : cellRowHeight(11, 4, 'match', gridW)
    const expected = 60 * expectedScale(11, 4, 'match', rowH)
    const iconH = await page.evaluate(`document.querySelector('.nh-button .nh-icon') ? document.querySelector('.nh-button .nh-icon').getBoundingClientRect().height : -1`)
    iconHeights[vp.name] = iconH
    ok(`${vp.name}: icon scales with cells (want ~${expected.toFixed(1)}px)`, Math.abs(iconH - expected) < 2.5 || (iconH < expected && iconH > 12), `got ${iconH.toFixed(1)}`)

    // oversized icon (120px) must shrink instead of clipping its label
    const big = await page.evaluate(`(() => {
      const btns = [...document.querySelectorAll('.nh-button')]
      const b = btns.find((x) => x.textContent.includes('Fairly Long'))
      if (!b) return null
      const ic = b.querySelector('.nh-icon'), lb = b.querySelector('.nh-button__label')
      const ib = ic.getBoundingClientRect(), lr = lb.getBoundingClientRect(), br = b.getBoundingClientRect()
      return { iconH: ib.height, labelH: lr.height, labelInside: lr.bottom <= br.bottom + 0.5 && lr.top >= br.top - 0.5 }
    })()`)
    ok(`${vp.name}: oversized icon yields to label`, big && big.labelInside && big.labelH >= 15, JSON.stringify(big))

    // the unstyled dark-page iframe must not be a white slab
    const px = await iframeDarkCheck(page, '.nh-template__host')
    ok(`${vp.name}: template iframe not white (dark bg + light text)`, px.darkPct > 55 && px.brightPct > 0.15 && px.brightPct < 30, `dark=${px.darkPct.toFixed(0)}% bright=${px.brightPct.toFixed(1)}%`)

    const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
    ok(`${vp.name}: console clean`, realErrs.length === 0, realErrs.slice(0, 2).join(' | '))
    await ctx.close()
  }

  // (widths where the label wraps make the icon yield, so only compare unconstrained sizes)
  ok(
    'icons grow with viewport (stacked < 1920 < 2560)',
    iconHeights['phone-393'] < iconHeights['desktop-1920'] &&
      iconHeights['desktop-1920'] < iconHeights['desktop-2560'],
    JSON.stringify(iconHeights)
  )

  /* ---------------- the server's real dashboards, READ-ONLY (no clicks, ever) ---------------- */

  // Derived from the live namespace, never hardcoded: the three largest dashboards get a phone
  // pass, the largest also a desktop pass.
  const liveResp = (await (await fetch(NS)).json())
    .filter((c) => c.uid.startsWith('dashboard:') && !c.uid.startsWith('dashboard:nh-e2e-'))
    .sort((a, b) => (b.config.widgets?.length ?? 0) - (a.config.widgets?.length ?? 0))
    .slice(0, 3)
    .map((c) => c.config.id)
  const livePairs = liveResp.map((id) => [
    `live "${id}" phone`,
    '#/d/' + encodeURIComponent(id),
    { width: 393, height: 852 },
  ])
  if (liveResp[0]) {
    livePairs.push([`live "${liveResp[0]}" desktop`, '#/d/' + encodeURIComponent(liveResp[0]), { width: 1920, height: 1080 }])
  }
  for (const [name, hash, vp] of livePairs) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, ...(vp.width < 800 ? { isMobile: true, hasTouch: true } : {}) })
    // pin the default theme: this suite asserts default geometry, and the server's
    // global theme belongs to the user (it was 'assembly' when this line was added)
    await ctx.addInitScript(() => { try { localStorage.setItem('neohab:themeOverride', 'dark') } catch {} })
    await ctx.route('**://home.lan/**', (route) =>
      route.request().url().endsWith('time.html')
        ? route.fulfill({ status: 200, contentType: 'text/html', body: TIME_HTML })
        : route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#111"></body></html>' })
    )
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html' + hash)
    await page.waitForSelector('.nh-grid .nh-widget', { timeout: 15000 })
    await sleep(1500)
    const problems = await page.evaluate(LAYOUT_CHECKS)
    ok(`${name}: layout invariants`, problems.length === 0, problems.slice(0, 4).join(' | '))
    await ctx.close()
  }

  /* -------- color cross-talk + slider optimistic hold (approved items only) -------- */

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
    // pin the default theme: this suite asserts default geometry, and the server's
    // global theme belongs to the user (it was 'assembly' when this line was added)
    await ctx.addInitScript(() => { try { localStorage.setItem('neohab:themeOverride', 'dark') } catch {} })
  const posts = []
  await page.route('**/rest/items/' + COLOR_ITEM, (route) => {
    posts.push(route.request().postData())
    route.continue()
  })
  await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-resp')
  await page.waitForSelector('.nh-color__track', { timeout: 15000 })
  await sleep(1500)

  const readHsb = () =>
    page.evaluate(`[...document.querySelectorAll('.nh-color__track')].map((t) => Number(t.value))`)
  const before = await readHsb()

  // Step saturation 20 with the keyboard (coalesces to ONE command after 500ms). Step away
  // from whichever end the live item sits near, or the range input clamps and the assertion
  // becomes unreachable (saturation is the device's, not ours to choose).
  const STEPS = 20
  const down = before[1] >= STEPS
  const wantS = before[1] + (down ? -STEPS : STEPS)
  const sTrack = page.locator('.nh-color__s')
  await sTrack.focus()
  for (let i = 0; i < STEPS; i++) await page.keyboard.press(down ? 'ArrowLeft' : 'ArrowRight')
  await sleep(900) // past the 500ms debounce - command sent

  const justAfter = await readHsb()
  ok('color: exactly one coalesced command', posts.filter(Boolean).length === 1, JSON.stringify(posts))
  ok('color: saturation moved by the stepped amount', Math.abs(justAfter[1] - wantS) <= 1, `${before[1]} -> ${justAfter[1]} (want ${wantS})`)
  ok('color: hue pinned right after commit', justAfter[0] === before[0], `${before[0]} -> ${justAfter[0]}`)
  ok('color: brightness pinned right after commit', justAfter[2] === before[2], `${before[2]} -> ${justAfter[2]}`)

  // the device echoes/fades for a while - sliders must hold through it
  let held = true
  let worst = ''
  for (let t = 0; t < 12; t++) {
    await sleep(300)
    const now = await readHsb()
    if (now[0] !== before[0] || Math.abs(now[1] - justAfter[1]) > 1 || now[2] !== before[2]) {
      held = false
      worst = JSON.stringify(now)
    }
  }
  ok('color: sliders hold steady through device echo (3.6s watch)', held, worst || 'stable')

  // slider widget: drag-free keyboard commit, must not snap back
  const posts2 = []
  await page.route('**/rest/items/' + SLIDER_ITEM, (route) => {
    posts2.push(route.request().postData())
    route.continue()
  })
  const sl = page.locator('.nh-fader__input')
  await sl.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await sleep(900)
  const sent = Number(posts2.filter(Boolean).slice(-1)[0])
  let snapped = ''
  for (let t = 0; t < 10; t++) {
    await sleep(300)
    const v = await page.evaluate(`Number(document.querySelector('.nh-fader__input').value)`)
    if (Math.abs(v - sent) > 1) snapped = `shows ${v}, sent ${sent}`
  }
  ok('slider: no snap-back after commit (3s watch)', !snapped && Number.isFinite(sent), snapped || `sent ${sent}`)
  await ctx.close()
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

/* ------------------------------------ cleanup ------------------------------------ */

await fetch(NS + '/dashboard:nh-e2e-resp', { method: 'DELETE', headers: AUTH })

// restore approved items exactly (color items sometimes need a resend to land precisely)
const restore = (item, val) =>
  val && val !== 'NULL' && val !== 'UNDEF' ? sendCmd(item, val) : Promise.resolve()
await restore(SWITCH_ITEM, initial.switch)
await restore(SLIDER_ITEM, initial.slider)
for (let i = 0; i < 5; i++) {
  await restore(COLOR_ITEM, initial.color)
  await sleep(1600)
  if ((await getState(COLOR_ITEM)) === initial.color) break
}
await sleep(1200)
ok('cleanup: dashboard removed', !(await listNs()).some((c) => c.uid === 'dashboard:nh-e2e-resp'))
ok('cleanup: switch restored', (await getState(SWITCH_ITEM)) === initial.switch, await getState(SWITCH_ITEM))
ok('cleanup: slider restored', (await getState(SLIDER_ITEM)) === initial.slider, await getState(SLIDER_ITEM))
ok('cleanup: color restored', (await getState(COLOR_ITEM)) === initial.color, `${await getState(COLOR_ITEM)} want ${initial.color}`)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
