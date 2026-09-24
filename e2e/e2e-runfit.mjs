// Every widget, in RUN mode, measured for two things nothing else checks as a class: that it
// renders at all, and that it does not position anything against the viewport instead of its tile.
//
// The second one is the interesting half. A grid cell is `container-type: size`, which people
// (this project included) read as containing an absolutely positioned child - it does not. Only a
// position, a transform or `contain: layout` does. So an `inset: 0` overlay under a static chain
// is laid out against the VIEWPORT: invisible in the DOM, invisible to every spill scan that
// measures children against their parent, and on top of the whole dashboard swallowing its clicks.
// The editor hides it too, because its cells are absolutely positioned and so DO contain it.
//
// The widget list comes from the palette, so a widget added later is covered without editing this.
// SAFE with a live config: creates and deletes exactly dashboard:nh-e2e-runfit and
// dashboard:nh-e2e-runpast. It saves once through the app - that is the point, since the bug this
// exists for is only visible on a saved dashboard being viewed - and the restore point that save takes
// stays in the browser (lib/sandbox.mjs).
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-runfit'
const PAST_UID = 'dashboard:nh-e2e-runpast'
const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

// An absolutely positioned element is held by the nearest ancestor that is positioned,
// transformed, filtered or has layout containment. container-type is deliberately NOT in this
// list: measured in Chrome, `container-type: size` does not contain an absolute descendant.
const SCAN = () => {
  const holds = (el) => {
    const cs = getComputedStyle(el)
    return cs.position !== 'static' || cs.transform !== 'none' || cs.filter !== 'none' || /paint|layout|strict|content/.test(cs.contain)
  }
  const out = []
  for (const cell of document.querySelectorAll('.nh-gcell')) {
    const cr = cell.getBoundingClientRect()
    const row = {
      name: (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30) || '(no text)',
      w: Math.round(cr.width),
      h: Math.round(cr.height),
      broken: !!cell.querySelector('.nh-wboundary, .nh-widget-error'),
      escaped: null,
    }
    for (const el of cell.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (cs.position !== 'absolute' && cs.position !== 'fixed') continue
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const past = Math.round(Math.max(0, r.right - cr.right, cr.left - r.left, r.bottom - cr.bottom, cr.top - r.top))
      if (past <= 2) continue
      let p = el.parentElement
      let held = false
      while (p) {
        if (holds(p)) { held = p === cell || cell.contains(p); break }
        p = p.parentElement
      }
      if (!held && (!row.escaped || past > row.escaped.past)) {
        row.escaped = { past, cls: String(el.className).slice(0, 44), box: Math.round(r.width) + 'x' + Math.round(r.height) }
      }
    }
    out.push(row)
  }
  return out
}

const browser = await launch()
const errs = []
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage()
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)))
  page.on('console', (m) => {
    if (m.type() === 'error' && isAppResource(m.location()?.url)) errs.push(m.text().slice(0, 140))
  })
  await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
  // nothing this suite does may reach a real device
  await page.route('**/rest/items/*', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 200, body: '' }) : route.continue()))

  for (const uid of [UID, PAST_UID]) await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      tags: [],
      config: { version: 1, id: 'nh-e2e-runfit', name: 'E2E Runfit', columns: 12, rowHeight: 80, widgets: [] },
    }),
  })
  ok('seed dashboard created', seed.status === 200 || seed.status === 201, 'status ' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-runfit')
  await page.waitForSelector('.nh-dash', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 })

  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette__card', { timeout: 10000 })
  const names = await page.$$eval('.nh-palette .nh-palette__card .nh-palette__name', (els) => els.map((e) => e.textContent.trim()))
  ok('the palette names the built-in widgets', names.length >= 20, names.length + ' cards')
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)

  for (const name of names) {
    await page.click('[aria-label="Add widget"]').catch(() => {})
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 }).catch(() => {})
    await page.click(`.nh-palette__card:has(.nh-palette__name:text-is(${JSON.stringify(name)}))`, { timeout: 8000 }).catch(() => {})
    await sleep(320)
  }
  const placed = await page.locator('.nh-grid--edit .nh-cell').count()
  ok('one of every widget is on the grid', placed === names.length, `${placed} of ${names.length}`)

  await page.click('.nh-editbar button:has-text("Save"), button:has-text("Save") >> nth=0').catch(() => {})
  await page.waitForSelector('.nh-grid--edit', { state: 'detached', timeout: 20000 }).catch(() => {})
  await sleep(1500)

  // ---- run mode, which is where the containing block stops being the cell ----
  await page.goto(APP + '#/d/nh-e2e-runfit')
  await page.waitForSelector('.nh-gcell', { timeout: 20000 })
  // long enough for a widget that fetches (chart, timeline, weather) to have settled or failed
  await sleep(6000)

  const desktop = await page.evaluate(SCAN)
  ok('every widget rendered a tile in run mode', desktop.length === names.length, `${desktop.length} of ${names.length}`)
  const broken = desktop.filter((r) => r.broken)
  ok('no widget fell into its error boundary', broken.length === 0, broken.map((r) => r.name).join(' | '))
  const loose = desktop.filter((r) => r.escaped)
  ok(
    'no widget positions anything against the viewport instead of its tile',
    loose.length === 0,
    loose.map((r) => `${r.name}: <${r.escaped.cls}> is ${r.escaped.box} in a ${r.w}x${r.h} tile, ${r.escaped.past}px past it`).join(' | ')
  )

  // an escaped overlay is on top of the whole dashboard, so the give-away is that the thing under
  // the pointer in a DIFFERENT tile belongs to this one
  const hijacked = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.nh-gcell')]
    const bad = []
    for (const c of cells) {
      const r = c.getBoundingClientRect()
      if (r.width < 10 || r.height < 10) continue
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      if (hit && !c.contains(hit)) bad.push(`${(c.innerText || '?').slice(0, 20)} -> ${String(hit.className).slice(0, 30)}`)
    }
    return bad
  })
  ok('nothing from another tile is on top of a tile', hijacked.length === 0, hijacked.join(' | '))

  // ---- and the same on a phone, where the stack changes every tile's shape ----
  await page.setViewportSize({ width: 393, height: 830 })
  await sleep(3000)
  const phone = await page.evaluate(SCAN)
  const phoneLoose = phone.filter((r) => r.escaped)
  ok('nothing escapes its tile in the phone stack either', phoneLoose.length === 0, phoneLoose.map((r) => `${r.name}: ${r.escaped.past}px`).join(' | '))
  ok('no widget breaks in the phone stack', phone.filter((r) => r.broken).length === 0, phone.filter((r) => r.broken).map((r) => r.name).join(' | '))

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))

  // ---- a stored rect the editor never clamped -----------------------------------------------
  // CSS grid answers a column past the track count with an implicit auto-sized track, which
  // collapses to nothing: the widget draws as an 8px sliver at the right-hand edge with no error
  // and nothing in the console. The editor re-clamps whenever the column count changes, so this
  // only reaches a screen from config that did not come through it - a restored backup, a shared
  // partial export, a hand edit, a dashboard written by another build.
  await page.setViewportSize({ width: 1400, height: 950 })
  const lab = (id, text, lg) => ({ id, type: 'label', config: { text, fontSize: 20, shape: 'plain' }, layout: { lg } })
  const past = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: PAST_UID,
      component: 'neohab:dashboard',
      tags: [],
      config: {
        version: 1,
        id: 'nh-e2e-runpast',
        name: 'E2E Runpast',
        columns: 4,
        rowHeight: 200,
        gap: 8,
        widgets: [
          lab('w-in', 'Inside', { x: 0, y: 0, w: 2, h: 1 }),
          lab('w-past', 'Past', { x: 8, y: 0, w: 2, h: 1 }),
          lab('w-wide', 'Wider', { x: 0, y: 1, w: 12, h: 1 }),
        ],
      },
    }),
  })
  ok('seed a dashboard whose rects reach past its columns', past.status === 200 || past.status === 201, 'status ' + past.status)

  // a hash-only goto is a same-document navigation and the app read its component list at boot, so a
  // dashboard seeded since then needs a real reload to exist at all
  await page.goto(APP + '#/d/nh-e2e-runpast')
  await page.reload()
  await page.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
  await sleep(1200)

  const grid = await page.evaluate(() => {
    const g = document.querySelector('.nh-grid')
    const box = (text) => {
      const el = [...document.querySelectorAll('.nh-gcell')].find((c) => (c.innerText || '').trim() === text)
      const r = el?.getBoundingClientRect()
      return r ? { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } : null
    }
    const tracks = getComputedStyle(g).gridTemplateColumns.split(' ').map((t) => Math.round(parseFloat(t)))
    return { tracks, gridW: Math.round(g.getBoundingClientRect().width), inside: box('Inside'), pastEl: box('Past'), wide: box('Wider') }
  })
  // the positive precondition: without a correctly drawn control beside them the width checks below
  // would pass on a grid that had collapsed entirely
  ok(
    'the control tile beside them is drawn at its two columns',
    (grid.inside?.w ?? 0) > 200 && (grid.inside?.h ?? 0) > 150,
    JSON.stringify(grid.inside)
  )
  ok('the grid makes no extra track for a rect past its last column', grid.tracks.length === 4, grid.tracks.join(' '))
  ok('no track collapsed to nothing', grid.tracks.every((t) => t > 100), grid.tracks.join(' '))
  ok(
    'a widget stored past the last column is drawn at full width, not as a sliver',
    grid.pastEl && grid.pastEl.w === grid.inside.w,
    JSON.stringify({ past: grid.pastEl, inside: grid.inside })
  )
  ok(
    'a widget wider than the whole grid is drawn no wider than it',
    grid.wide && grid.wide.w <= grid.gridW + 1 && grid.wide.right <= (grid.inside?.right ?? 0) + grid.gridW,
    JSON.stringify({ wide: grid.wide, gridW: grid.gridW })
  )
} finally {
  await browser.close().catch(() => {})
  for (const uid of [UID, PAST_UID]) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid === UID || c.uid === PAST_UID)
  ok('cleanup: the dashboards are removed', left.length === 0, left.map((c) => c.uid).join(', '))

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
