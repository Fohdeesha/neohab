// Responsive / mobile e2e: multi-viewport layout invariants, dynamic icon scaling, color-picker optimistic
// hold, and the dark-scheme iframe fix.
// SAFE with a live config: creates only dashboard:nh-e2e-resp (deleted afterwards, cleanup guarded), reads
// the server's own dashboards strictly read-only (zero clicks.
import { launchChromium } from './lib/browser.mjs'
import { BASE, NS, TOKEN, AUTH, ITEMS, UNREACHABLE } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['chrome', 'msedge']) { try { return await launchChromium({ channel: c, headless: true }) } catch {} } return launchChromium({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => await (await fetch(`${BASE}/rest/items/${item}/state`, { headers: AUTH })).text()
const sendCmd = (item, cmd) =>
  fetch(`${BASE}/rest/items/${item}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: cmd })
const listNs = async () => await (await fetch(NS, { headers: AUTH })).json()

const SWITCH_ITEM = ITEMS.switch
const SLIDER_ITEM = ITEMS.dimmer
const COLOR_ITEM = ITEMS.color
const initial = {
  switch: await getState(SWITCH_ITEM),
  slider: await getState(SLIDER_ITEM),
  color: await getState(COLOR_ITEM),
}

const TIME_HTML = `<html><head><style>body{overflow:hidden}</style></head><body><center><font color="white" face="Courier"><div style="font-size:33px" id="clockbox">July 14 <br> Tuesday 2026 <br> 5:59 AM</div></font></center></body></html>`

const STROBE_UID = 'dashboard:nh-e2e-strobe'

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
      { id: 'r-btn1', type: 'button', config: { label: 'Main Room Lights', icon: 'oh:slider', iconSize: 60, item: SWITCH_ITEM, command: 'ON', commandAlt: 'OFF', toggle: true }, layout: { lg: { x: 0, y: 0, w: 1, h: 1 } } },
      { id: 'r-btn2', type: 'button', config: { item: ITEMS.switch, label: 'A Fairly Long Button Label Indeed', icon: 'mdi:lightbulb-group', iconSize: 120, command: 'ON' }, layout: { lg: { x: 1, y: 0, w: 1, h: 1 } } },
      { id: 'r-btn3', type: 'button', config: { item: ITEMS.switch, label: 'No Icon Button', command: 'ON' }, layout: { lg: { x: 2, y: 0, w: 1, h: 1 } } },
      { id: 'r-color', type: 'color', config: { item: COLOR_ITEM, label: 'E2E Color' }, layout: { lg: { x: 3, y: 0, w: 3, h: 1 } } },
      { id: 'r-slider', type: 'slider', config: { item: SLIDER_ITEM, label: 'E2E Slider', min: 0, max: 100, step: 1 }, layout: { lg: { x: 6, y: 0, w: 3, h: 1 } } },
      { id: 'r-switch', type: 'button', config: { style: 'switch', toggle: true, nonZeroIsOn: true, item: SWITCH_ITEM, label: 'E2E Switch', icon: 'mdi:lightbulb', iconSize: 32 }, layout: { lg: { x: 9, y: 0, w: 2, h: 2 } } },
      { id: 'r-dial', type: 'dial', config: { item: SLIDER_ITEM, label: 'E2E Dial', readOnly: true }, layout: { lg: { x: 0, y: 1, w: 2, h: 2 } } },
      { id: 'r-tpl', type: 'template', config: { label: 'date time', template: '<iframe name="t" frameborder="0" src="' + UNREACHABLE + 'widget-host.invalid/time.html"> </iframe>' }, layout: { lg: { x: 3, y: 1, w: 2, h: 1 } } },
    ],
  },
}

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

const browser = await launchBrowser()
try {
  {
    for (const uid of [DASH.uid, STROBE_UID]) await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
    const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(DASH) })
    ok('seed dashboard created', r.ok, String(r.status))
  }

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
    await ctx.addInitScript(() => { try { localStorage.setItem('neohab:themeOverride', 'dark') } catch {} })
    await ctx.route('**://widget-host.invalid/**', (route) =>
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

    const stacked = await page.evaluate(`!!document.querySelector('.nh-grid--stacked')`)
    const gridW = await page.evaluate(`document.querySelector('.nh-grid').clientWidth`)
    const rowH = stacked ? cellRowHeight(11, 4, 'match', 1280) : cellRowHeight(11, 4, 'match', gridW)
    const expected = 60 * expectedScale(11, 4, 'match', rowH)
    const iconH = await page.evaluate(`document.querySelector('.nh-button .nh-icon') ? document.querySelector('.nh-button .nh-icon').getBoundingClientRect().height : -1`)
    iconHeights[vp.name] = iconH
    ok(`${vp.name}: icon scales with cells (want ~${expected.toFixed(1)}px)`, Math.abs(iconH - expected) < 2.5 || (iconH < expected && iconH > 12), `got ${iconH.toFixed(1)}`)

    const big = await page.evaluate(`(() => {
      const btns = [...document.querySelectorAll('.nh-button')]
      const b = btns.find((x) => x.textContent.includes('Fairly Long'))
      if (!b) return null
      const ic = b.querySelector('.nh-icon'), lb = b.querySelector('.nh-button__label')
      const ib = ic.getBoundingClientRect(), lr = lb.getBoundingClientRect(), br = b.getBoundingClientRect()
      return { iconH: ib.height, labelH: lr.height, labelInside: lr.bottom <= br.bottom + 0.5 && lr.top >= br.top - 0.5 }
    })()`)
    ok(`${vp.name}: oversized icon yields to label`, big && big.labelInside && big.labelH >= 15, JSON.stringify(big))

    const px = await iframeDarkCheck(page, '.nh-template__host')
    ok(`${vp.name}: template iframe not white (dark bg + light text)`, px.darkPct > 55 && px.brightPct > 0.15 && px.brightPct < 30, `dark=${px.darkPct.toFixed(0)}% bright=${px.brightPct.toFixed(1)}%`)

    const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
    ok(`${vp.name}: console clean`, realErrs.length === 0, realErrs.slice(0, 2).join(' | '))
    await ctx.close()
  }

  ok(
    'icons grow with viewport (stacked < 1920 < 2560)',
    iconHeights['phone-393'] < iconHeights['desktop-1920'] &&
      iconHeights['desktop-1920'] < iconHeights['desktop-2560'],
    JSON.stringify(iconHeights)
  )

  const liveResp = (await (await fetch(NS, { headers: AUTH })).json())
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
    await ctx.addInitScript(() => { try { localStorage.setItem('neohab:themeOverride', 'dark') } catch {} })
    await ctx.route('**://widget-host.invalid/**', (route) =>
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

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
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

  // --- The layout must not strobe when the page height crosses the viewport ----------------------
  //
  // Square cells make the grid's HEIGHT a function of its WIDTH, and a page scrollbar makes the
  // width a function of the height: a board whose height lands within a scrollbar's worth of the
  // viewport flips between the two states every frame. Reported from a real dashboard at 1187x829,
  // measured at 143 flips a second, and the two screenshots were exactly 16px apart.
  //
  // It needs a browser with CLASSIC scrollbars, which headless Chromium suppresses
  // (--hide-scrollbars), so this section gets one of its own.
  const sbOpts = { headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar'] }
  let sbBrowser = null
  for (const c of ['chrome', 'msedge']) {
    try {
      sbBrowser = await launchChromium({ ...sbOpts, channel: c })
      break
    } catch {}
  }
  sbBrowser ??= await launchChromium(sbOpts)
  //
  // A board of its own, because the band is only as wide as `rows x scrollbar / columns`: the seed
  // above is 11 columns and 3 rows, which is a 4px target. Three columns and four rows is 20px.
  {
    const r = await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: STROBE_UID,
        component: 'neohab:dashboard',
        config: {
          version: 1,
          id: 'nh-e2e-strobe',
          name: 'E2E Strobe',
          columns: 3,
          rowHeight: 'match',
          gap: 8,
          widgets: [0, 1, 2, 3].map((y) => ({
            id: 's-' + y,
            type: 'label',
            config: { label: 'Row ' + y },
            layout: { lg: { x: 0, y, w: 3, h: 1 } },
          })),
        },
      }),
    })
    ok('strobe seed created', r.ok, String(r.status))
  }
  try {
    const sbCtx = await sbBrowser.newContext({ viewport: { width: 1200, height: 800 } })
    const sbPage = await sbCtx.newPage()
    await sbCtx.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    await sbPage.goto(BASE + '/neohab/index.html#/d/nh-e2e-strobe', { waitUntil: 'domcontentloaded' })
    await sbPage.reload({ waitUntil: 'domcontentloaded' })
    await sbPage.waitForSelector('.nh-widget', { timeout: 30000 })
    await sleep(1200)

    const gutter = await sbPage.evaluate(() => {
      const d = document.createElement('div')
      d.style.cssText = 'width:100px;height:50px;overflow:scroll;position:absolute;top:-200px'
      document.body.appendChild(d)
      const w = d.offsetWidth - d.clientWidth
      d.remove()
      return w
    })
    // without this the section proves nothing: with no scrollbar there is no loop to find
    ok('the strobe watch really has classic scrollbars', gutter > 0, `scrollbar=${gutter}px`)

    const sample = () =>
      sbPage.evaluate(
        () =>
          new Promise((resolve) => {
            const widths = new Set()
            let frames = 0
            const tick = () => {
              widths.add(document.body.clientWidth)
              if (++frames < 60) requestAnimationFrame(tick)
              else
                resolve({
                  widths: [...widths],
                  scrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight,
                  grid: document.querySelector('.nh-grid')?.clientWidth ?? -1,
                })
            }
            requestAnimationFrame(tick)
          })
      )

    // The band is wherever THIS board's height crosses the viewport, which moves with the theme and
    // the text size, so it is measured rather than written down. `.nh-app` is min-height:100%, so a
    // tall viewport reports its own height back - the content height only shows when it overflows.
    await sbPage.setViewportSize({ width: 1200, height: 300 })
    await sleep(500)
    const pageHeight = await sbPage.evaluate(() => document.documentElement.scrollHeight)

    const sweep = async () => {
      const out = []
      for (let height = pageHeight - 40; height <= pageHeight + 40; height += 4) {
        await sbPage.setViewportSize({ width: 1200, height })
        await sleep(300)
        out.push({ height, ...(await sample()) })
      }
      return out
    }

    const swept = await sweep()
    ok(
      'the sweep really crossed the height where the page stops fitting',
      swept.some((s) => s.scrolls) && swept.some((s) => !s.scrolls),
      `page ${pageHeight}px, heights ${swept[0].height}..${swept.at(-1).height}, scrolling at ${swept.filter((s) => s.scrolls).length}/${swept.length}`
    )
    const flipping = swept.filter((s) => s.widths.length > 1)
    ok(
      'no viewport height makes the layout width oscillate',
      flipping.length === 0,
      flipping.slice(0, 5).map((s) => `${s.height}:${s.widths.join('/')}`).join(' ')
    )
    const widths = new Set(swept.map((s) => s.widths[0]))
    const grids = new Set(swept.map((s) => s.grid))
    ok('and the layout width is the same whether the page scrolls or not', widths.size === 1 && grids.size === 1, `body ${[...widths]} grid ${[...grids]}`)

    // The same sweep with the gutter given back, which is the pre-fix behaviour exactly. Without
    // this the two checks above pass on any build where the sweep happens to miss the band, and
    // nothing would ever say so.
    await sbPage.addStyleTag({ content: 'html { scrollbar-gutter: auto !important; }' })
    await sleep(400)
    const control = await sweep()
    ok(
      'and the watch can still see the fault it exists for',
      control.some((s) => s.widths.length > 1),
      control.filter((s) => s.widths.length > 1).slice(0, 3).map((s) => `${s.height}:${s.widths.join('/')}`).join(' ') || 'nothing oscillated with the gutter given back'
    )
    await sbCtx.close()
  } finally {
    await sbBrowser.close()
  }
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/dashboard:nh-e2e-resp', { method: 'DELETE', headers: AUTH })
await fetch(NS + '/' + STROBE_UID, { method: 'DELETE', headers: AUTH })

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
const leftovers = (await listNs()).map((c) => c.uid).filter((u) => u === 'dashboard:nh-e2e-resp' || u === STROBE_UID)
ok('cleanup: both seeded dashboards removed', leftovers.length === 0, leftovers.join(','))
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
