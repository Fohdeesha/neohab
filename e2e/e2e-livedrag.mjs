// Live dragging: a slider, colour picker or dial commands the device AS it is dragged, throttled, and the
// released value always goes last. SAFE with a live config. Creates and deletes exactly:
// dashboard:nh-e2e-livedrag (neohab:config), managed items nh_e2e_ldim, nh_e2e_ldim2, nh_e2e_lcol (bound to
// nothing, so the commands drive no device). One section needs the shared live-drag setting off, which is
// shown to that browser context only (lib/sandbox.mjs). Saves nothing through the app.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'
import { skipSuiteOnProduction } from './lib/guard.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

skipSuiteOnProduction('every check here drives managed items this suite creates')

const UID = 'dashboard:nh-e2e-livedrag'
const DIM = 'nh_e2e_ldim'
const DIM2 = 'nh_e2e_ldim2'
const COL = 'nh_e2e_lcol'
const INTERVAL = 200

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (n, v) =>
  fetch(itemUrl(n) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const getState = (n) =>
  fetch(itemUrl(n), { headers: AUTH })
    .then((r) => r.json())
    .then((j) => j.state)
    .catch(() => null)
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name: n, label }),
  })
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

const PLAN_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>` +
  `<rect width='800' height='500' fill='#ffffff'/>` +
  `<g stroke='#22252a' stroke-width='6' fill='none'><rect x='40' y='40' width='720' height='420'/></g></svg>`
const PLAN_URI = 'data:image/svg+xml;base64,' + Buffer.from(PLAN_SVG).toString('base64')

const sl = (id, label, item, x, y, extra = {}) => ({
  id: 'w-' + id,
  type: 'slider',
  config: { item, label, style: 'gradient', min: 0, max: 100, step: 1, ...extra },
  layout: { lg: { x, y, w: 4, h: 2 } },
})
const WIDGETS = [
  sl('level', 'Level', DIM, 0, 0),
  sl('plain', 'Plain', DIM, 4, 0, { style: 'plain' }),
  sl('release', 'Release', DIM2, 8, 0, { liveDrag: 'release' }),
  sl('always', 'Always', DIM2, 0, 2, { liveDrag: 'always' }),
  { id: 'w-col', type: 'color', config: { item: COL, label: 'Fader', powerButtons: true }, layout: { lg: { x: 4, y: 2, w: 4, h: 4 } } },
  { id: 'w-dial', type: 'dial', config: { item: DIM, label: 'Dial', style: 'classic', min: 0, max: 100, step: 1 }, layout: { lg: { x: 8, y: 2, w: 2, h: 4 } } },
  { id: 'w-ring', type: 'dial', config: { item: DIM2, label: 'Ring', style: 'arc', min: 0, max: 100, step: 1 }, layout: { lg: { x: 10, y: 2, w: 2, h: 4 } } },
  {
    id: 'w-plan',
    type: 'floorplan',
    config: { label: 'Plan', image: PLAN_URI, presetBar: false, lights: [{ id: 'l-1', item: DIM, x: 50, y: 50, label: 'Lamp' }] },
    layout: { lg: { x: 0, y: 6, w: 6, h: 5 } },
  },
]

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const browser = await launch()
const errors = []
const cmds = []
let reject = false

async function newPage(context) {
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() !== 'error' || !isAppResource(m.location()?.url)) return
    // the browser reports the 400 this suite injects as a resource error: that one line, and nothing else
    if (reject && /\b400\b/.test(m.text()) && (m.location()?.url ?? '').endsWith('/rest/items/' + DIM)) return
    errors.push(m.text() + ' @ ' + (m.location()?.url ?? ''))
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.route('**/rest/items/**', async (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    const item = decodeURIComponent(req.url().split('/rest/items/')[1].split('?')[0])
    cmds.push({ at: Date.now(), item, body: req.postData() })
    if (reject) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Simulated rejection', 'http-code': 400 } }),
      })
    }
    return route.continue()
  })
  return page
}

async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  await context.addInitScript(
    ([theme, token]) => {
      try {
        localStorage.setItem('neohab:themeOverride', theme)
        localStorage.setItem('neohab:apiToken', token)
        localStorage.setItem('neohab:language', 'en')
      } catch {}
    },
    ['dark', TOKEN]
  )
  return context
}

const since = (mark, item) => cmds.filter((c) => c.at >= mark && (!item || c.item === item))
const bodies = (list) => list.map((c) => c.body).join(',')

const boxOf = (page, label, sel) =>
  probe(
    page,
    ([label, sel]) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === label)
      const el = w?.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
    },
    [label, sel]
  )
const valueOf = (page, label, sel) =>
  probe(
    page,
    ([label, sel]) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === label)
      const el = w?.querySelector(sel)
      return el ? (el.value ?? el.textContent) : null
    },
    [label, sel]
  )
const sheetOpen = (page) => probe(page, () => document.querySelector('.nh-detail__panel') !== null)
const closeSheet = async (page) => {
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)
}

// Playwright's own stepped move is over in milliseconds and can never see a throttle, so a drag is paced by hand
async function pacedDrag(page, points, stepMs) {
  await page.mouse.move(points[0].x, points[0].y)
  await page.mouse.down()
  await sleep(30)
  for (const p of points.slice(1)) {
    await page.mouse.move(p.x, p.y)
    await sleep(stepMs)
  }
  await page.mouse.up()
}
const along = (box, f0, f1, n) => Array.from({ length: n + 1 }, (_, i) => ({ x: box.x + box.w * (f0 + ((f1 - f0) * i) / n), y: box.cy }))
const arc = (box, r, a0, a1, n) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    const R = (Math.min(box.w, box.h) / 2) * r
    return { x: box.cx + R * Math.cos(a), y: box.cy + R * Math.sin(a) }
  })

const sampler = (page, sel, prop) =>
  page.evaluate(
    ([sel, prop]) => {
      window.__tl = []
      window.__iv = setInterval(() => {
        const el = document.querySelector(sel)
        const v = el ? (prop === 'value' ? el.value : el.style[prop]) : ''
        if (v !== '' && window.__tl[window.__tl.length - 1] !== v) window.__tl.push(v)
      }, 40)
    },
    [sel, prop]
  )
const readSampler = (page) =>
  probe(page, () => {
    clearInterval(window.__iv)
    return window.__tl
  })

let context, page

try {
  console.log('-- A: setup --')
  await makeItem(DIM, 'Dimmer', 'NH E2E Live Dimmer')
  await makeItem(DIM2, 'Dimmer', 'NH E2E Live Dimmer 2')
  await makeItem(COL, 'Color', 'NH E2E Live Colour')
  await putState(DIM, 20)
  await putState(DIM2, 20)
  await putState(COL, '200,60,70')
  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seeded = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: 'nh-e2e-livedrag', name: 'E2E Live drag', columns: 12, rowHeight: 56, gap: 8, widgets: WIDGETS },
    }),
  })
  ok('seeded the dashboard', seeded.ok, 'HTTP ' + seeded.status)

  context = await newContext()
  page = await newPage(context)
  await page.goto(APP + '#/d/nh-e2e-livedrag', { waitUntil: 'load' })
  await page.waitForSelector('.nh-fplan__glow', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const LEVEL = ['Level', '.nh-fader__input']
  const level = await boxOf(page, ...LEVEL)
  ok('the slider is on screen', level !== null && level.w > 100, JSON.stringify(level))

  console.log('\n-- B: the mechanics, on a slider --')
  // B1: arm with one deliberate move, the first command goes out at once
  let mark = Date.now()
  await page.mouse.move(level.x + level.w * 0.25, level.cy)
  await page.mouse.down()
  await sleep(40)
  const armedAt = Date.now()
  await page.mouse.move(level.x + level.w * 0.25 + 12, level.cy)
  await sleep(120)
  const first = since(mark, DIM)
  ok('the first armed change goes out at once', first.length === 1 && first[0].at - armedAt <= 100, `${first.length} sent, +${first.length ? first[0].at - armedAt : '-'}ms`)

  // then a paced drag, 40 moves 40ms apart
  const path = along(level, 0.25 + 12 / level.w, 0.75, 40)
  for (const p of path.slice(1)) {
    await page.mouse.move(p.x, p.y)
    await sleep(40)
  }
  await page.mouse.up()
  const upAt = Date.now()
  await sleep(500)
  const drag = since(mark, DIM)
  const dragMs = upAt - armedAt
  ok(
    'a long drag is throttled to about five commands a second',
    drag.length >= 3 && drag.length <= Math.ceil(dragMs / INTERVAL) + 2,
    `${drag.length} commands over ${dragMs}ms: ${bodies(drag)}`
  )
  const gaps = drag.slice(1, -1).map((c, i) => c.at - drag[i].at)
  ok('and never two inside the interval', gaps.every((g) => g >= INTERVAL - 40), gaps.join(','))
  const released = await valueOf(page, ...LEVEL)
  ok('the last command is the released value', drag.length > 0 && drag[drag.length - 1].body === released, `last=${drag[drag.length - 1]?.body} thumb=${released}`)
  ok('and nothing follows it', since(upAt + 300, DIM).length === 0, bodies(since(upAt + 300, DIM)))
  await sleep(600)
  ok('the item ends where the thumb was let go', (await getState(DIM)) === released, `state=${await getState(DIM)} thumb=${released}`)

  // B2: a still hold, with live on, sends nothing and opens the sheet
  mark = Date.now()
  await page.mouse.move(level.x + level.w * 0.6, level.cy)
  await page.mouse.down()
  await sleep(900)
  await page.mouse.up()
  await sleep(400)
  ok('a still hold sends nothing with live on', since(mark, DIM).length === 0, bodies(since(mark, DIM)))
  ok('and opens the sheet', (await sheetOpen(page)) === true)
  await closeSheet(page)

  // B3: a press that became a hold, then moved
  mark = Date.now()
  const before = await getState(DIM)
  await page.mouse.move(level.x + level.w * 0.4, level.cy)
  await page.mouse.down()
  await sleep(700)
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(level.x + level.w * 0.4 + i * 10, level.cy)
    await sleep(40)
  }
  await page.mouse.up()
  await sleep(400)
  ok('a drag that started as a hold sends nothing', since(mark, DIM).length === 0, bodies(since(mark, DIM)))
  await closeSheet(page)
  ok('and the thumb goes back to the live value', (await valueOf(page, ...LEVEL)) === before, `thumb=${await valueOf(page, ...LEVEL)} live=${before}`)

  // B4: a 2px wobble during a hold does not arm
  mark = Date.now()
  await page.mouse.move(level.x + level.w * 0.5, level.cy)
  await page.mouse.down()
  await sleep(50)
  await page.mouse.move(level.x + level.w * 0.5 + 2, level.cy + 1)
  await sleep(700)
  await page.mouse.up()
  await sleep(400)
  ok('a 2px wobble during a hold does not arm', since(mark, DIM).length === 0 && (await sheetOpen(page)) === true, `${since(mark, DIM).length} sent, sheet=${await sheetOpen(page)}`)
  await closeSheet(page)

  // B5: a 4px move arms, and the hold never fires
  mark = Date.now()
  await page.mouse.move(level.x + level.w * 0.5, level.cy)
  await page.mouse.down()
  await sleep(50)
  await page.mouse.move(level.x + level.w * 0.5 + 4, level.cy)
  await sleep(700)
  const holdFired = await sheetOpen(page)
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(level.x + level.w * 0.5 + 4 + i * 8, level.cy)
    await sleep(50)
  }
  await page.mouse.up()
  await sleep(400)
  ok('a 4px move arms and the hold does not fire', holdFired === false && (await sheetOpen(page)) === false)
  ok('and the drag commands', since(mark, DIM).length >= 1, bodies(since(mark, DIM)))

  // B6: a refusal mid-drag
  await sleep(800)
  const liveBefore = await getState(DIM)
  reject = true
  mark = Date.now()
  await pacedDrag(page, along(level, 0.3, 0.7, 30), 40)
  await sleep(700)
  const refused = since(mark, DIM)
  ok('a refused command stops the drag', refused.length === 1, `${refused.length} sent: ${bodies(refused)}`)
  const toasts = await probe(page, () => [...document.querySelectorAll('.nh-toast')].map((t) => t.textContent.trim()))
  ok('with one toast', toasts?.length === 1 && toasts[0].includes(DIM), JSON.stringify(toasts))
  ok('and the control shows the live value on release', (await valueOf(page, ...LEVEL)) === liveBefore, `thumb=${await valueOf(page, ...LEVEL)} live=${liveBefore}`)
  reject = false
  await page.click('.nh-toast__close').catch(() => {})
  await sleep(400)

  console.log('\n-- C: the colour picker --')
  const B = ['Fader', 'input.nh-color__b']
  await putState(COL, '200,60,70')
  await sleep(2500)
  const btrack = await boxOf(page, ...B)
  mark = Date.now()
  await pacedDrag(page, along(btrack, 0.7, 0.3, 25), 40)
  await sleep(500)
  const colDrag = since(mark, COL)
  ok(
    'a colour drag sends full h,s,b triples as it goes',
    colDrag.length >= 2 && colDrag.every((c) => /^\d+,\d+,\d+$/.test(c.body)),
    `${colDrag.length}: ${bodies(colDrag)}`
  )
  const bReleased = await valueOf(page, ...B)
  ok('ending on the released colour', colDrag[colDrag.length - 1]?.body === `200,60,${bReleased}`, `last=${colDrag[colDrag.length - 1]?.body} track=${bReleased}`)

  // Off then On: the brightness On brings back is the one from before the drag, not one seen during it
  await putState(COL, '200,60,70')
  await sleep(2500)
  await page.mouse.move(btrack.x + btrack.w * 0.7, btrack.cy)
  await page.mouse.down()
  await sleep(40)
  await page.mouse.move(btrack.x + btrack.w * 0.7 + 12, btrack.cy)
  await sleep(150)
  await putState(COL, '200,60,30') // the lamp reports mid-drag, as a fading one does
  await sleep(500)
  for (const p of along(btrack, 0.7 + 12 / btrack.w, 0, 20).slice(1)) {
    await page.mouse.move(p.x, p.y)
    await sleep(40)
  }
  await page.mouse.up()
  await sleep(2500)
  const dark = await getState(COL)
  ok('a drag to the left end switches the lamp off', typeof dark === 'string' && dark.endsWith(',0'), 'state=' + dark)
  mark = Date.now()
  await page
    .locator('.nh-widget:has(.nh-widget__labeltext:text-is("Fader")) .nh-color__pbtn', { hasText: 'On' })
    .click()
    .catch(() => {})
  await sleep(600)
  const on = since(mark, COL)
  ok('On brings back the brightness from before the drag, not one seen during it', on.length === 1 && on[0].body === '200,60,70', bodies(on))
  await sleep(800)

  console.log('\n-- D: the dials --')
  const dial = await boxOf(page, 'Dial', 'svg.nh-dial')
  mark = Date.now()
  await pacedDrag(page, arc(dial, 0.76, 160, 330, 30), 35)
  await sleep(500)
  const dialDrag = since(mark, DIM)
  ok('a classic dial commands as it turns', dialDrag.length >= 3, `${dialDrag.length}: ${bodies(dialDrag)}`)
  const dialText = await valueOf(page, 'Dial', '.nh-dial__value')
  ok('and ends where the knob stopped', dialDrag.length > 0 && dialText?.startsWith(dialDrag[dialDrag.length - 1].body), `last=${dialDrag[dialDrag.length - 1]?.body} face=${dialText}`)

  const ring = await boxOf(page, 'Ring', 'svg.nh-dial')
  mark = Date.now()
  await pacedDrag(page, arc(ring, 0.88, -60, 120, 30), 35)
  await sleep(500)
  const ringDrag = since(mark, DIM2)
  ok('a ring gauge commands as it turns', ringDrag.length >= 3, `${ringDrag.length}: ${bodies(ringDrag)}`)
  const ringText = await valueOf(page, 'Ring', '.nh-gauge__value')
  ok('and ends where it was let go', ringDrag.length > 0 && ringText?.startsWith(ringDrag[ringDrag.length - 1].body), `last=${ringDrag[ringDrag.length - 1]?.body} face=${ringText}`)

  console.log('\n-- E: the settings --')
  const rel = await boxOf(page, 'Release', '.nh-fader__input')
  mark = Date.now()
  await pacedDrag(page, along(rel, 0.2, 0.8, 25), 40)
  await sleep(500)
  const relDrag = since(mark, DIM2)
  ok('a widget set to Only on release sends once, whatever the shared setting says', relDrag.length === 1, `${relDrag.length}: ${bodies(relDrag)}`)

  // the shared setting off, shown to this one context only and in place before its first page loads
  const sb = await sharedSettings({ liveDrag: false })
  const context2 = await newContext()
  await sb.install(context2)
  const page2 = await newPage(context2)
  await page2.goto(APP + '#/d/nh-e2e-livedrag', { waitUntil: 'load' })
  await page2.waitForSelector('.nh-fader__input', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const level2 = await boxOf(page2, ...LEVEL)
  mark = Date.now()
  await pacedDrag(page2, along(level2, 0.2, 0.8, 25), 40)
  await sleep(500)
  const offDrag = since(mark, DIM)
  ok('with the shared setting off, a widget that follows it sends once', offDrag.length === 1, `${offDrag.length}: ${bodies(offDrag)}`)
  const always = await boxOf(page2, 'Always', '.nh-fader__input')
  mark = Date.now()
  await pacedDrag(page2, along(always, 0.2, 0.8, 25), 40)
  await sleep(500)
  const alwaysDrag = since(mark, DIM2)
  ok('and a widget set to Always still commands as it goes', alwaysDrag.length >= 3, `${alwaysDrag.length}: ${bodies(alwaysDrag)}`)
  const setting = await probe(page2, async () => {
    location.hash = '#/settings/controls'
    await new Promise((r) => setTimeout(r, 800))
    const box = document.getElementById('nh-set-livedrag')
    return box ? { present: true, checked: box.checked } : { present: false }
  })
  ok('the Controls section shows the switch off', setting?.present === true && setting.checked === false, JSON.stringify(setting))
  await context2.close()
  const untouched = await sb.verify().catch((e) => ({ ok: false, detail: String(e) }))
  ok('the shared settings on the server were never written', untouched.ok, untouched.detail)

  console.log('\n-- F: what else follows the drag --')
  await sleep(1000)
  await putState(DIM, 10)
  await sleep(2000)
  await sampler(page, '.nh-fplan__glow', 'backgroundImage')
  await page.evaluate(() => {
    window.__tl2 = []
    window.__iv2 = setInterval(() => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Plain')
      const v = w?.querySelector('input')?.value ?? ''
      if (v !== '' && window.__tl2[window.__tl2.length - 1] !== v) window.__tl2.push(v)
    }, 40)
  })
  await sleep(100)
  mark = Date.now()
  await pacedDrag(page, along(level, 0.1, 0.9, 35), 40)
  await sleep(300)
  const glows = await readSampler(page)
  const plains = await probe(page, () => {
    clearInterval(window.__iv2)
    return window.__tl2
  })
  const sentF = since(mark, DIM)
  ok('the floor plan glow follows a drag on a slider bound to its light', Array.isArray(glows) && glows.length >= 3, `${glows?.length} distinct glows over ${sentF.length} commands`)
  ok('a second control on the same item follows it live too', Array.isArray(plains) && plains.length >= 3, `${plains?.length} distinct values: ${plains?.join(' > ')}`)
  await sleep(1000)

  // the detail sheet's own slider follows the shared setting
  await page.mouse.move(level.x + level.w * 0.5, level.cy)
  await page.mouse.down()
  await sleep(900)
  await page.mouse.up()
  await sleep(500)
  const sheetRange = await probe(page, () => {
    const r = document.querySelector('.nh-detail__panel input[type="range"]')?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null
  })
  ok('the sheet opened with a slider', sheetRange !== null && sheetRange.w > 50, JSON.stringify(sheetRange))
  if (sheetRange) {
    mark = Date.now()
    await pacedDrag(page, along(sheetRange, 0.2, 0.8, 25), 40)
    await sleep(500)
    const sheetDrag = since(mark, DIM)
    ok('the detail sheet slider commands as it goes too', sheetDrag.length >= 3, `${sheetDrag.length}: ${bodies(sheetDrag)}`)
  } else {
    ok('the detail sheet slider commands as it goes too', false, 'no sheet')
  }
  await closeSheet(page)

  ok('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && (e.stack || e.message)))
} finally {
  try {
    await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
    for (const item of [DIM, DIM2, COL]) await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
    const left = await fetch(NS, { headers: AUTH })
      .then((r) => r.json())
      .then((cs) => cs.filter((c) => c.uid === UID).map((c) => c.uid))
      .catch(() => ['<unreadable>'])
    ok('cleanup: dashboard removed', left.length === 0, left.join(','))
    const items = []
    for (const item of [DIM, DIM2, COL]) {
      const r = await fetch(itemUrl(item), { headers: AUTH }).catch(() => null)
      if (r && r.status === 200) items.push(item)
    }
    ok('cleanup: test items removed', items.length === 0, items.join(','))
  } finally {
    await browser.close()
    const failed = results.filter((r) => !r.pass)
    console.log('\n' + (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') + '  (' + (results.length - failed.length) + '/' + results.length + ')')
    process.exitCode = failed.length === 0 ? 0 : 1
  }
}
