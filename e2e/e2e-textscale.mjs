/**
 * Text scaling and small-cell layout:
 *   - widget text scales with the cell (--nh-textscale) down to a floor that depends on the
 *     pointer: 0.8 under a finger; under a mouse the room the row has, 1.0 from 100px rows
 *     easing to 0.8 at 85px (a monitor never draws small text, and a row that short cannot
 *     hold it)
 *   - tight cells reclaim nested padding, so small-cell labels stop ellipsising
 *   - button labels are not bottom-clipped (glyph ink inside its own line box)
 *   - long unbreakable tokens break instead of ellipsising the whole label
 *   - rollershutter never paints its buttons over the widget label
 *   - template engine: ng-repeat outranks ng-if on the same element (AngularJS parity)
 *   - openHAB icon recovers after a transient 404 (onLoad clears the hidden flag)
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-scale (deleted afterwards, cleanup
 * guarded), reads the server's own dashboards strictly read-only (zero clicks), commands nothing.
 *
 * Every context pins the per-device theme override to the default theme: this suite asserts
 * the app's DEFAULT geometry, and the server's global theme belongs to the user - under a
 * theme with its own font (Operations' Montserrat, 2026-08-03) the ink-box arithmetic is that
 * theme's business, not this suite's.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await chromium.launch({ channel: c, headless: true }) } catch {} } return chromium.launch({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })

const UID = 'dashboard:nh-e2e-scale'
const DASH = {
  uid: UID,
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1,
    id: 'nh-e2e-scale',
    name: 'E2E Scale',
    columns: 12,
    rowHeight: 'match',
    gap: 5,
    widgets: [
      // 1x1 buttons with the long labels that used to ellipsise to "Gu…"
      { id: 's-long', type: 'button', config: { label: 'Guest Bedroom Accents', icon: 'oh:colorwheel', iconSize: 75, command: 'ON' }, layout: { lg: { x: 0, y: 0, w: 1, h: 1 } } },
      { id: 's-token', type: 'button', config: { label: 'Laptop>Studio AVB', icon: 'oh:screen', iconSize: 70, command: 'ON' }, layout: { lg: { x: 1, y: 0, w: 1, h: 1 } } },
      { id: 's-desc', type: 'button', config: { label: 'gggjjjyyy ppqq', command: 'ON' }, layout: { lg: { x: 2, y: 0, w: 1, h: 1 } } },
      // 2x2 rollershutter: the shape that overflowed its buttons over the label. Bound to a
      // deliberately nonexistent item - it is never clicked and only its geometry is measured.
      { id: 's-roll', type: 'rollershutter', config: { item: 'nh_e2e_no_such_roller', label: 'Garage Door' }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
      // template exercising ng-repeat + ng-if on the SAME element
      {
        id: 's-tpl',
        type: 'template',
        config: {
          label: 'repeat-if',
          template:
            '<ul><li ng-repeat="n in [1,2,3,4]" ng-if="n != 2" class="row">item-{{n}}</li></ul>',
        },
        layout: { lg: { x: 5, y: 0, w: 4, h: 2 } },
      },
      // openHAB icon whose name only resolves for some states
      { id: 's-icon', type: 'button', config: { label: 'Transient', icon: 'oh:light', iconSize: 40, item: ITEMS.switch, command: 'ON' }, layout: { lg: { x: 9, y: 0, w: 1, h: 1 } } },
    ],
  },
}

await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
const seed = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(DASH) })
ok('seed: suite dashboard created', seed.ok, 'status=' + seed.status)

const browser = await launchBrowser()

try {
  /* ---------------- text scale math + no clipping, across viewports ---------------- */
  // A phone is a TOUCH context: the text-scale floor is chosen by the pointer, not the width,
  // so a 915px viewport with a mouse is a narrow desktop window and gets the desktop floor.
  for (const vp of [
    { name: 'phone-landscape', width: 915, height: 411, touch: true },
    { name: 'window-1190', width: 1190, height: 768 },
    { name: 'laptop-1366', width: 1366, height: 768 },
    { name: 'desktop-1920', width: 1920, height: 1080 },
    { name: 'desktop-2560', width: 2560, height: 1440 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, ...(vp.touch ? { hasTouch: true } : {}) })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-scale')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.waitForTimeout(900)

    const m = await page.evaluate(() => {
      const grid = document.querySelector('.nh-grid')
      const gs = getComputedStyle(grid)
      const labels = [...document.querySelectorAll('.nh-button__label')].map((l) => {
        const r = l.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(l)
        const rects = [...range.getClientRects()]
        return {
          text: l.textContent,
          hClipped: l.scrollWidth > l.clientWidth + 1,
          vClipped: l.scrollHeight > l.clientHeight + 0.5,
          inkBelow: rects.length ? Math.max(...rects.map((x) => x.bottom)) - r.bottom : 0,
          lines: rects.length,
          boxH: l.clientHeight,
          lineH: parseFloat(getComputedStyle(l).lineHeight),
        }
      })
      // does any body content paint over the label row?
      let overlaps = 0
      for (const cell of document.querySelectorAll('.nh-gcell')) {
        const wl = cell.querySelector('.nh-widget__label')
        const body = cell.querySelector('.nh-widget__body')
        if (!wl || !body) continue
        const lr = wl.getBoundingClientRect()
        for (const k of body.querySelectorAll('*')) {
          const kr = k.getBoundingClientRect()
          if (kr.height > 0 && kr.top < lr.bottom - 1 && kr.bottom > lr.top + 1) overlaps++
        }
      }
      return {
        textscale: parseFloat(gs.getPropertyValue('--nh-textscale')),
        iconscale: parseFloat(gs.getPropertyValue('--nh-iconscale')),
        rowH: parseFloat(gs.gridAutoRows),
        cellFont: parseFloat(getComputedStyle(document.querySelector('.nh-gcell')).fontSize),
        docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        labels,
        overlaps,
      }
    })

    // textScale = max(floor, iconScale): the floor is 0.8 under a finger, and under a mouse the
    // room the row has, 1 from 100px rows easing to 0.8 at 85px - the rule lives in
    // model/layout.ts (textFloor), mirrored here
    const floor = vp.touch ? 0.8 : 0.8 + 0.2 * Math.max(0, Math.min(1, (m.rowH - 85) / 15))
    const expected = Math.max(floor, m.iconscale)
    ok(`${vp.name}: textscale = max(floor ${floor.toFixed(3)}, iconscale)`, Math.abs(m.textscale - expected) < 0.001, `${m.textscale} want ${expected.toFixed(3)} (rows ${m.rowH}px)`)
    ok(`${vp.name}: cell font = 16 * textscale`, Math.abs(m.cellFont - 16 * m.textscale) < 0.2, `${m.cellFont}px`)
    ok(`${vp.name}: no horizontal page scroll`, !m.docScrollX)
    ok(`${vp.name}: no label ellipsised`, m.labels.every((l) => !l.hClipped), JSON.stringify(m.labels.filter((l) => l.hClipped).map((l) => l.text)))
    // A label whose text FITS the 3-line cap must not shave any glyph ink (the original bug).
    // One that exceeds the cap is truncated by design - which font the active theme uses decides
    // where a given label wraps - but the cut must land exactly on a line boundary, never through
    // a glyph row.
    ok(
      `${vp.name}: no label bottom-clipped`,
      m.labels.every((l) =>
        l.vClipped
          ? Math.abs(l.boxH - Math.round(l.boxH / l.lineH) * l.lineH) < 1.5
          : l.inkBelow < 0.05
      ),
      JSON.stringify(m.labels.map((l) => (l.vClipped ? `cap@${l.boxH}/${l.lineH.toFixed(1)}` : +l.inkBelow.toFixed(2))))
    )
    ok(`${vp.name}: roller never overlaps its label`, m.overlaps === 0, 'overlaps=' + m.overlaps)

    if (vp.name === 'phone-landscape') {
      const longLabel = m.labels.find((l) => l.text === 'Guest Bedroom Accents')
      ok('phone: long label wraps instead of ellipsising', longLabel && longLabel.lines >= 2 && !longLabel.hClipped, JSON.stringify(longLabel))
      const token = m.labels.find((l) => l.text === 'Laptop>Studio AVB')
      ok('phone: unbreakable token breaks, not ellipsised', token && !token.hClipped, JSON.stringify(token))
      ok('phone: floor engaged (text bigger than raw scale)', m.textscale === 0.8 && m.iconscale < 0.8, `icon=${m.iconscale.toFixed(3)} text=${m.textscale}`)
    }
    if (vp.name === 'laptop-1366') {
      // The mouse floor: the cells are smaller than a desktop's (icons shrink) and the text does
      // not follow them down - a label never renders below its normal size under a mouse once
      // the row can hold it.
      ok('laptop (mouse): floor 1.0 engaged (text at normal size while icons shrink)', m.rowH >= 100 && m.textscale === 1 && m.iconscale < 1, `rows=${m.rowH} icon=${m.iconscale.toFixed(3)} text=${m.textscale}`)
    }
    if (vp.name === 'window-1190') {
      // A narrow mouse window whose rows are inside the 85-100px band: the floor eases between
      // the two ends rather than sitting at either. Measured before the easing existed:
      // full-size text in a row this short put a switch and a colour picker outside their
      // tiles, and a three-word label squeezed its icon out.
      ok('window-1190 (mouse): a row between 85px and 100px eases the floor between 0.8 and 1', m.rowH > 85 && m.rowH < 100 && m.textscale > 0.8 && m.textscale < 1 && Math.abs(m.textscale - (0.8 + 0.2 * (m.rowH - 85) / 15)) < 0.001, `rows=${m.rowH} text=${m.textscale.toFixed(3)}`)
    }
    if (vp.name === 'desktop-2560') {
      ok('2560: text grows with icons (scale > 1)', m.textscale > 1 && Math.abs(m.textscale - m.iconscale) < 0.001, `text=${m.textscale.toFixed(3)}`)
    }
    ok(`${vp.name}: console clean`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  /* ---------------- template: ng-repeat outranks ng-if ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-scale')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.waitForTimeout(1500)
    const items = await page.evaluate(() => {
      const host = document.querySelector('.nh-template__host')
      if (!host || !host.shadowRoot) return null
      return [...host.shadowRoot.querySelectorAll('li.row')].map((li) => li.textContent.trim())
    })
    // AngularJS: repeat expands first, the condition is judged per item -> 1,3,4 (2 filtered)
    ok('template: ng-repeat + ng-if on one element renders the list', Array.isArray(items) && items.length === 3, JSON.stringify(items))
    ok('template: ng-if filters per item, not the whole list', JSON.stringify(items) === JSON.stringify(['item-1', 'item-3', 'item-4']), JSON.stringify(items))
    await ctx.close()
  }

  /* ---------------- icon recovers from a transient 404 ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    // Phase 1: every icon fetch 404s. (Not "the first one only": the icon legitimately
    // re-fetches when SSE delivers the item state, so a one-shot 404 is repaired before the
    // assertion can see it - which is the fix working, but proves nothing.)
    let serve404 = true
    await page.route('**/icon/light**', (route) =>
      serve404 ? route.fulfill({ status: 404, body: '' }) : route.continue()
    )
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-scale')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.waitForTimeout(1200)
    // This dashboard has several oh: icons; the routed one is the only one that 404s, so
    // pick it by src - a bare .nh-icon--oh would grab the first (colorwheel), which loads
    // fine and would hide the whole point of the test.
    const LIGHT = '[...document.querySelectorAll(".nh-icon--oh")].find(i => i.src.includes("/icon/light"))'
    const hiddenAfter404 = await page.evaluate(`(() => { const img = ${LIGHT}; return img ? img.style.visibility : 'none' })()`)
    ok('icon: hidden after a 404 (no broken glyph)', hiddenAfter404 === 'hidden', 'visibility=' + hiddenAfter404)
    // Phase 2: the set now serves this state. Re-fetch the way a state change does.
    serve404 = false
    await page.evaluate(`(() => { const img = ${LIGHT}; img.src = img.src + '&retry=1' })()`)
    await page.waitForTimeout(1200)
    const visibleAfterLoad = await page.evaluate(
      `(() => { const img = ${LIGHT}; return { vis: img.style.visibility, complete: img.complete, w: img.naturalWidth } })()`
    )
    ok('icon: visible again once a later state loads', visibleAfterLoad.vis === '' && visibleAfterLoad.w > 0, JSON.stringify(visibleAfterLoad))
    await ctx.close()
  }

  /* ---------------- the server's real dashboards, read-only ---------------- */
  // Derived from the live namespace (dashboards come and go); the four largest get a pass.
  const liveScale = (await (await fetch(NS, { headers: AUTH })).json())
    .filter((c) => c.uid.startsWith('dashboard:') && !c.uid.startsWith('dashboard:nh-e2e-'))
    .sort((a, b) => (b.config.widgets?.length ?? 0) - (a.config.widgets?.length ?? 0))
    .slice(0, 4)
    .map((c) => ({ id: c.config.id, name: c.config.name ?? c.config.id }))
  for (const d of liveScale) {
    const ctx = await browser.newContext({ viewport: { width: 915, height: 411 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/' + encodeURIComponent(d.id))
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.waitForTimeout(1200)
    const bad = await page.evaluate(() => {
      const out = { ellipsised: [], clipped: [], overlaps: 0 }
      for (const l of document.querySelectorAll('.nh-button__label')) {
        if (l.scrollWidth > l.clientWidth + 1) out.ellipsised.push(l.textContent)
        if (l.scrollHeight > l.clientHeight + 0.5) out.clipped.push(l.textContent)
      }
      for (const cell of document.querySelectorAll('.nh-gcell')) {
        const wl = cell.querySelector('.nh-widget__label')
        const body = cell.querySelector('.nh-widget__body')
        if (!wl || !body) continue
        const lr = wl.getBoundingClientRect()
        for (const k of body.querySelectorAll('*')) {
          const kr = k.getBoundingClientRect()
          if (kr.height > 0 && kr.top < lr.bottom - 1 && kr.bottom > lr.top + 1) out.overlaps++
        }
      }
      return out
    })
    ok(`real "${d.name}" phone: no label ellipsised`, bad.ellipsised.length === 0, JSON.stringify(bad.ellipsised))
    ok(`real "${d.name}" phone: no label bottom-clipped`, bad.clipped.length === 0, JSON.stringify(bad.clipped))
    ok(`real "${d.name}" phone: nothing overlaps a label`, bad.overlaps === 0, 'overlaps=' + bad.overlaps)
    await ctx.close()
  }
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  await browser.close()
  const del = await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
  ok('cleanup: suite dashboard removed', del.ok || del.status === 404, 'status=' + del.status)
  // scoped to what THIS suite made: an unrelated stray must not fail this suite's cleanup
  const left = (await (await fetch(NS)).json()).filter((c) => c.uid === UID)
  ok('cleanup: no suite leftovers', left.length === 0, JSON.stringify(left.map((c) => c.uid)))
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks`)
console.log(pass === results.length ? 'ALL PASS' : 'SOME FAILED')
// exitCode rather than process.exit(): exiting while playwright's handles are still closing
// trips a libuv assertion on Windows.
process.exitCode = pass === results.length ? 0 : 1
