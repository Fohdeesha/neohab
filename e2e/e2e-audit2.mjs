/**
 * Audit fixes for configuration that did not come from the editor.
 *
 * The editor validates what it writes, but a dashboard component can also arrive from a backup, a
 * shared partial export or a hand edit, and is then stored verbatim. Everything here is that kind
 * of input:
 *   - importer survives a widget type that names an Object.prototype member ("constructor")
 *   - a nameless dashboard component no longer takes down the whole config load
 *   - backup import writes before deleting (a failed replace cannot leave you with nothing)
 *   - a nonsensical column count (0) still renders, instead of dividing the cell size to Infinity
 *   - a gap that is not a number does the same, in the one geometry field that had no guard
 *   - a rect that is not a rect is repaired at the read, rather than becoming a NaN free-spot
 *     search and a grid-row counted backwards from the end of the grid
 *   - a widget whose config throws is ONE broken tile: it used to unmount the entire app, so a
 *     blank page was all you got and the editor that could fix it went with it
 *   - a stored tablet rect wider than the tablet grid is clamped into it
 *   - label widget font size scales with the cell like everything else
 *   - a component written by a NEWER neohab is refused, explained, kept whole and never
 *     collected: the danger is not that it fails to render, it is that an old build would treat
 *     everything it referenced as unused and delete it
 *   - a widget bound to an item NAMED after an Object.prototype member renders as an unset
 *     widget, not as the boundary's error tile: the state map is a miss for it, and a miss on an
 *     ordinary object answers with a function that no `?? fallback` catches
 *   - a malformed hash does not blank the app: `decodeURIComponent` used to throw during App's
 *     own render, which is above every boundary the app had
 *   - and when a screen DOES fail, it fails as a panel with a way out rather than as a blank page.
 *     A last-resort wall has to be tested with an injected failure - leaving a real bug in place
 *     as the fixture would be the wrong trade - so the config RESPONSE is poisoned for one page
 *     rather than a component being stored: nothing persists, and the server is untouched
 *   - ItemPicker: does selecting an item leave the list open? (behaviour probe)
 *
 * SAFE: creates only nh-e2e-a2* components, exact-uid cleanup, commands nothing. It DOES save
 * one of its own dashboards through the app, which mints a restore point - that is the point,
 * since the collector under test runs immediately after a save.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await chromium.launch({ channel: c, headless: true }) } catch {} } return chromium.launch({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const created = []

const put = async (comp) => {
  await fetch(NS + '/' + comp.uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(comp) })
  if (r.ok) created.push(comp.uid)
  return r.ok
}

// A dashboard with a label widget (font scaling) + a nameless dashboard (load robustness)
await put({
  uid: 'dashboard:nh-e2e-a2',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2', name: 'E2E Audit2', columns: 12, rowHeight: 'match', gap: 5,
    widgets: [
      { id: 'a2-label', type: 'label', config: { text: 'Scaled', fontSize: 40 }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
      { id: 'a2-btn', type: 'button', config: { label: 'Pick', command: 'ON' }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
    ],
  },
})
// Widgets bound to items NAMED after Object.prototype members. openHAB item names are
// `[a-zA-Z_][a-zA-Z0-9_]*` (ItemUtil.isValidItemName), so every one of these is a name a person
// can really give an item - and none of them needs to EXIST for the bug to bite, because the
// failing read is the MISS: on an ordinary map `states['constructor']` answers with the `Object`
// function, which is truthy, so `isOn` then read `.state` off it and threw.
await put({
  uid: 'dashboard:nh-e2e-a2-proto',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-proto', name: 'E2E Audit2 Proto', columns: 12, rowHeight: 'match', gap: 5,
    widgets: [
      { id: 'a2p-sw', type: 'switch', config: { item: 'constructor', label: 'Ctor' }, layout: { lg: { x: 0, y: 0, w: 2, h: 2 } } },
      { id: 'a2p-val', type: 'value', config: { item: 'toString', label: 'Str' }, layout: { lg: { x: 2, y: 0, w: 2, h: 2 } } },
      { id: 'a2p-btn', type: 'button', config: { item: 'hasOwnProperty', label: 'Has', command: 'ON', toggle: true }, layout: { lg: { x: 4, y: 0, w: 2, h: 2 } } },
      { id: 'a2p-proto', type: 'switch', config: { item: '__proto__', label: 'Proto' }, layout: { lg: { x: 6, y: 0, w: 2, h: 2 } } },
    ],
  },
})
// nameless dashboard: config load used to throw on .name.localeCompare and lose EVERYTHING
await put({
  uid: 'dashboard:nh-e2e-a2-nameless',
  component: 'neohab:dashboard',
  tags: [],
  config: { version: 1, id: 'nh-e2e-a2-nameless', columns: 4, rowHeight: 'match', widgets: [] },
})
// columns: 0 divided the column width to Infinity, which took the row height and the icon scale
// with it. It only bites a 'match' dashboard - a numeric rowHeight was returned as-is and hid the
// divide, which is why that is a SEPARATE case below rather than the same one.
await put({
  uid: 'dashboard:nh-e2e-a2-nocols',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-nocols', name: 'E2E Audit2 NoCols', columns: 0, rowHeight: 'match', gap: 5,
    widgets: [{ id: 'a2-v', type: 'label', config: { text: 'Survives' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
  },
})
// a zero fixed row height, from the same unvalidated config
await put({
  uid: 'dashboard:nh-e2e-a2-norow',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-norow', name: 'E2E Audit2 NoRow', columns: 12, rowHeight: 0, gap: 5,
    widgets: [{ id: 'a2-r', type: 'label', config: { text: 'Floored' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
  },
})
// a gap that is not a number: the column count and the row height were guarded and this was not,
// so the cell width came out NaN and the grid had nothing to lay anything out with
await put({
  uid: 'dashboard:nh-e2e-a2-nogap',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-nogap', name: 'E2E Audit2 NoGap', columns: 12, rowHeight: 'match', gap: 'wide',
    widgets: [{ id: 'a2-g', type: 'label', config: { text: 'Gapped' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
  },
})
// a rect that is not a rect. An unreadable height made findFreeSpot return y: NaN - which was
// then SAVED onto the next widget added - and a negative y became a grid-row counted from the
// end of the grid, so the widget rendered somewhere nobody put it.
await put({
  uid: 'dashboard:nh-e2e-a2-badrect',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-badrect', name: 'E2E Audit2 BadRect', columns: 12, rowHeight: 'match', gap: 5,
    widgets: [
      { id: 'a2-bad', type: 'label', config: { text: 'Repaired' }, layout: { lg: { x: -4, y: -5, w: 0, h: 'tall' } } },
      { id: 'a2-good', type: 'label', config: { text: 'Neighbour' }, layout: { lg: { x: 4, y: 0, w: 2, h: 2 } } },
    ],
  },
})
// a widget whose stored config is the wrong SHAPE. Guards live at each read, but a widget that
// throws during render used to unmount the whole React tree - the dashboard, the editor and the
// way to Settings went together, leaving a blank page and no route back to the cause.
await put({
  uid: 'dashboard:nh-e2e-a2-throws',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-throws', name: 'E2E Audit2 Throws', columns: 12, rowHeight: 'match', gap: 5,
    widgets: [
      { id: 'a2-chart', type: 'chart', config: { series: {}, thresholds: 'none' }, layout: { lg: { x: 0, y: 0, w: 6, h: 3 } } },
      { id: 'a2-tl', type: 'timeline', config: { series: 'nope', colorMaps: 7 }, layout: { lg: { x: 6, y: 0, w: 6, h: 3 } } },
      { id: 'a2-alive', type: 'label', config: { text: 'Still here' }, layout: { lg: { x: 0, y: 3, w: 3, h: 2 } } },
      { id: 'a2-nosuch', type: 'notawidget', config: {}, layout: { lg: { x: 3, y: 3, w: 3, h: 2 } } },
    ],
  },
})
// a stored tablet rect wider than the tablet grid it lands in
await put({
  uid: 'dashboard:nh-e2e-a2-mdwide',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id: 'nh-e2e-a2-mdwide', name: 'E2E Audit2 MdWide', columns: 12, mdColumns: 4, rowHeight: 'match', gap: 5,
    widgets: [
      { id: 'a2-md', type: 'label', config: { text: 'Wide' }, layout: { lg: { x: 0, y: 0, w: 12, h: 1 }, md: { x: 0, y: 0, w: 9, h: 1 } } },
      { id: 'a2-md2', type: 'label', config: { text: 'Edge' }, layout: { lg: { x: 0, y: 1, w: 12, h: 1 }, md: { x: 3, y: 1, w: 2, h: 1 } } },
    ],
  },
})

const browser = await launchBrowser()
try {
  /* --------- nameless dashboard must not break the config load --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/')
    await page.waitForSelector('.nh-tile, .nh-welcome', { timeout: 15000 })
    await page.waitForTimeout(800)
    const tiles = await page.locator('.nh-tile:not(.nh-tile--new)').count()
    // the live count varies - what matters is that this suite's own two tiles made it through
    ok('config loads despite a nameless dashboard', tiles >= 2, 'tiles=' + tiles)
    ok('no page error from the nameless dashboard', errs.length === 0, errs.join('|'))
    await ctx.close()
  }

  /* --------- a nonsensical column count still renders --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-nocols')
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await page.waitForTimeout(600)
    const geom = await page.evaluate(() => {
      const grid = document.querySelector('.nh-grid')
      const cell = document.querySelector('.nh-gcell')
      const cs = getComputedStyle(grid)
      const r = cell?.getBoundingClientRect()
      return {
        rows: cs.gridAutoRows,
        cols: cs.gridTemplateColumns,
        scale: cs.getPropertyValue('--nh-iconscale'),
        cellW: r ? Math.round(r.width) : -1,
        cellH: r ? Math.round(r.height) : -1,
        label: document.querySelector('.nh-label')?.textContent ?? '',
      }
    })
    // The row height is the tell: 'match' derives it from the column width, so a zero column
    // count used to make it Infinity - a cell taller than any screen, with nothing readable in it.
    const rowPx = parseFloat(geom.rows)
    ok('columns=0: the row height is finite and sane', Number.isFinite(rowPx) && rowPx > 0 && rowPx < 4000, geom.rows)
    ok('columns=0: the widget renders at a finite height', geom.cellH > 0 && geom.cellH < 4000, JSON.stringify(geom))
    ok('columns=0: the column template is valid CSS', /px|fr/.test(geom.cols) && !/Infinity|NaN/.test(geom.cols), geom.cols)
    ok('columns=0: the icon scale is a number', Number.isFinite(parseFloat(geom.scale)), geom.scale)
    ok('columns=0: the widget is still there', geom.label === 'Survives', geom.label)
    ok('columns=0: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
    await ctx.close()
  }

  /* --------- a zero fixed row height is floored rather than collapsed --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-norow')
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await page.waitForTimeout(600)
    const rowH = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.nh-grid')).gridAutoRows))
    const cellH = await page.evaluate(() => Math.round(document.querySelector('.nh-gcell').getBoundingClientRect().height))
    ok('rowHeight=0 is floored to something visible', rowH >= 8, String(rowH))
    ok('rowHeight=0: the cell has height', cellH > 0, String(cellH))
    await ctx.close()
  }

  /* --------- a gap that is not a number --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-nogap')
    // Tolerant: a NaN cell width leaves the grid with no size at all, so it never becomes
    // "visible" and a plain wait would time out and take every later check in this suite with it.
    // The assertions below are what should fail here, not the wait.
    await page.waitForSelector('.nh-grid', { state: 'attached', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    const g = await page.evaluate(() => {
      const grid = document.querySelector('.nh-grid')
      const cell = document.querySelector('.nh-gcell')
      if (!grid) return { rows: 'no grid', gap: 'no grid', h: 0, w: 0 }
      return {
        rows: getComputedStyle(grid).gridAutoRows,
        gap: getComputedStyle(grid).gap,
        h: cell ? Math.round(cell.getBoundingClientRect().height) : 0,
        w: cell ? Math.round(cell.getBoundingClientRect().width) : 0,
      }
    })
    ok('gap="wide": the row height is a real length', /px/.test(g.rows) && !/NaN/.test(g.rows), JSON.stringify(g))
    // A pixel value, not merely "no NaN": an unreadable gap resolved to the CSS keyword `normal`,
    // which contains no NaN either, so testing for that alone passed on the broken build too.
    ok('gap="wide": the gap falls back to the default length', /^8px/.test(g.gap), g.gap)
    ok('gap="wide": the widget has a size', g.h > 0 && g.w > 0, JSON.stringify(g))
    await ctx.close()
  }

  /* --------- a rect that is not a rect --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-badrect')
    await page.waitForSelector('.nh-gcell', { state: 'attached', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    const rects = await page.evaluate(() =>
      [...document.querySelectorAll('.nh-gcell')].map((c) => {
        const cs = getComputedStyle(c)
        const box = c.getBoundingClientRect()
        return {
          text: c.querySelector('.nh-label')?.textContent ?? '',
          rowStart: cs.gridRowStart,
          colStart: cs.gridColumnStart,
          h: Math.round(box.height),
          w: Math.round(box.width),
          top: Math.round(box.top),
        }
      })
    )
    const bad = rects.find((r) => r.text === 'Repaired')
    ok('a corrupt rect still renders both widgets', rects.length === 2, JSON.stringify(rects))
    ok('the repaired widget has a real size', !!bad && bad.h > 0 && bad.w > 0, JSON.stringify(bad))
    ok(
      'a negative row is not counted from the end of the grid',
      !!bad && Number(bad.rowStart) >= 1 && Number(bad.colStart) >= 1,
      JSON.stringify(bad)
    )
    // A NaN maxY meant the free-spot search never ran, and the widget added next was stored at
    // y: NaN. Adding one here proves the search still works on this dashboard. Every step is
    // tolerant so a build that cannot get this far fails the assertions rather than the suite.
    await page.click('[aria-label="Edit dashboard"]').catch(() => {})
    await page.waitForSelector('.nh-grid--edit', { state: 'attached', timeout: 10000 }).catch(() => {})
    await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0).catch(() => {})
    await page.click('[aria-label="Add widget"]').catch(() => {})
    await page.waitForSelector('.nh-palette__card', { timeout: 10000 }).catch(() => {})
    await page.locator('.nh-palette__card', { hasText: 'Clock' }).first().click().catch(() => {})
    await page.waitForTimeout(600)
    const added = await page.evaluate(() =>
      [...document.querySelectorAll('.nh-cell')].map((c) => getComputedStyle(c).gridRowStart)
    )
    ok('adding a widget beside a corrupt rect places it', added.length === 3, JSON.stringify(added))
    ok('no widget lands on a NaN row', added.every((r) => /^\d+$/.test(r)), JSON.stringify(added))
    await ctx.close()
  }

  /* --------- an item named after an Object.prototype member --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-proto')
    await page.waitForSelector('.nh-gcell', { state: 'attached', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll('.nh-gcell')].map((c) => ({
        errored: !!c.querySelector('.nh-widget--error'),
        label: c.querySelector('.nh-widget__labeltext')?.textContent ?? '',
      }))
    )
    ok('all four prototype-named bindings render', tiles.length === 4, JSON.stringify(tiles))
    ok(
      'none of them becomes the boundary error tile',
      tiles.length === 4 && tiles.every((t) => !t.errored),
      JSON.stringify(tiles)
    )
    // The switch is the one that used to throw: `isOn` read `.state` off the Object function.
    const sw = await page.locator('.nh-switch').count()
    ok('the switch bound to an item called constructor draws a switch', sw >= 1, 'switches=' + sw)
    await ctx.close()
  }

  /* --------- a screen that fails, fails as a panel with a way out --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    // The boundary names itself in the console when it catches something. Asserting that is what
    // stops this whole section passing for the wrong reason: without it, a poison that failed to
    // throw would look exactly like a boundary that worked.
    const caught = []
    page.on('console', (m) => {
      if (m.type() === 'error' && /failed to render/.test(m.text())) caught.push(m.text())
    })
    // One dashboard whose widget list holds a null entry. `widgetsOf` guards the LIST, and this is
    // a valid list, so the null reaches the render and throws there - a plain render failure above
    // every widget boundary, which is exactly what the app-level wall is for. It is also a chosen
    // poison: it breaks ONE dashboard's route, so home and settings still work and the panel's own
    // links are a real way out. (A name that is not a string breaks every screen that lists
    // dashboards at once, which is why that one is coerced at load rather than left to the wall.)
    //
    // Injected into the RESPONSE, not stored: the component list carries a literal colon, so the
    // route needs a RegExp (a glob does not match it), and poisoning one page leaves the server
    // exactly as it was.
    await page.route(/\/rest\/ui\/components\/neohab:config/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      const body = await res.json()
      body.push({
        uid: 'dashboard:nh-e2e-a2-poison',
        component: 'neohab:dashboard',
        config: {
          version: 1,
          id: 'nh-e2e-a2-poison',
          name: 'E2E Poison',
          columns: 12,
          rowHeight: 'match',
          widgets: [null],
        },
      })
      return route.fulfill({ response: res, body: JSON.stringify(body) })
    })
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-poison')
    await page.waitForTimeout(2500)
    const state = await page.evaluate(() => ({
      panel: document.querySelectorAll('.nh-appfail').length,
      title: document.querySelector('.nh-appfail__title')?.textContent ?? '',
      message: (document.querySelector('.nh-appfail__text')?.textContent ?? '').length,
      actions: [...document.querySelectorAll('.nh-appfail__actions a, .nh-appfail__actions button')].map(
        (a) => a.getAttribute('href') ?? a.tagName.toLowerCase()
      ),
      blank: (document.getElementById('root')?.childElementCount ?? 0) === 0,
    }))
    ok('the poisoned screen really did throw', caught.length > 0, caught[0] ?? 'nothing was caught')
    ok('a screen that throws shows a panel rather than a blank page', state.panel === 1 && !state.blank, JSON.stringify(state))
    ok('the panel says what went wrong', state.title.length > 0 && state.message > 0, JSON.stringify(state))
    ok('and offers a way out', state.actions.includes('#/') && state.actions.includes('#/settings'), JSON.stringify(state.actions))
    // The way out has to actually work, or a wall you cannot leave is no better than a blank page.
    // Measured on tiles that really rendered, not on `main.nh-app`, which is there whatever
    // happened - the first version of this check asserted the latter and passed while the panel
    // was still on screen.
    await page.click('.nh-appfail__actions a[href="#/"]').catch(() => {})
    await page.waitForTimeout(1800)
    const recovered = await page.evaluate(() => ({
      panel: document.querySelectorAll('.nh-appfail').length,
      tiles: document.querySelectorAll('.nh-tile').length,
    }))
    ok('following it leaves the panel behind', recovered.panel === 0, JSON.stringify(recovered))
    ok('and lands on a screen that really rendered', recovered.tiles > 0, JSON.stringify(recovered))
    await page.unroute(/\/rest\/ui\/components\/neohab:config/)
    await ctx.close()
  }

  /* --------- a malformed hash does not blank the app --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    // `#/d/100%` is a hash a person can type and a chat client can produce by mangling a link.
    // The app never writes one (navigate() always encodes), which is why it went unseen: the
    // throw happened inside App's own render, above every boundary the app had, so the result
    // was a blank page with no header and no route to Settings.
    await page.goto(BASE + '/neohab/index.html#/d/100%')
    await page.waitForTimeout(2000)
    const shown = await page.evaluate(() => ({
      root: (document.getElementById('root')?.childElementCount ?? 0) > 0,
      body: (document.body.innerText || '').trim().length,
      app: document.querySelectorAll('.nh-app').length,
    }))
    ok('a malformed hash still renders the app', shown.root && shown.app > 0, JSON.stringify(shown))
    ok('and it is not a blank page', shown.body > 0, JSON.stringify(shown))
    // Reaching a working route from there is the other half: a wall you cannot leave is no better.
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
    await page.waitForSelector('.nh-gcell', { state: 'attached', timeout: 15000 }).catch(() => {})
    const cells = await page.locator('.nh-gcell').count()
    ok('and a real dashboard still loads afterwards', cells > 0, 'cells=' + cells)
    await ctx.close()
  }

  /* --------- a widget that throws is one broken tile, not a blank app --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-throws')
    // Deliberately tolerant: without a boundary the whole tree unmounts, so there is no cell to
    // wait for and the state read below is what reports it.
    await page.waitForSelector('.nh-gcell', { state: 'attached', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const state = await page.evaluate(() => ({
      cells: document.querySelectorAll('.nh-gcell').length,
      errors: document.querySelectorAll('.nh-widget--error').length,
      alive: document.body.innerText.includes('Still here'),
      header: document.querySelectorAll('.nh-dash__bar').length,
      root: (document.getElementById('root')?.childElementCount ?? 0) > 0,
    }))
    // Without a boundary the whole tree unmounted: no cells, no header, an empty #root.
    ok('every widget on the dashboard still has a cell', state.cells === 4, JSON.stringify(state))
    ok('the working widget beside them still renders', state.alive, JSON.stringify(state))
    ok('the dashboard header survives', state.header === 1 && state.root, JSON.stringify(state))
    ok('the unrenderable widgets say so in their own tiles', state.errors >= 1, JSON.stringify(state))
    // Recovery: the editor is still reachable, which is the whole point of containing it.
    await page.click('[aria-label="Edit dashboard"]').catch(() => {})
    const editable = await page
      .waitForSelector('.nh-grid--edit', { state: 'attached', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    ok('the dashboard can still be edited to fix them', editable)
    await ctx.close()
  }

  /* --------- an oversized stored tablet rect is clamped into the tablet grid --------- */
  {
    // 1000px is inside the tablet band (>= 840, < 1200), so the tablet layout is what renders.
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-mdwide')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.waitForTimeout(600)
    const placed = await page.evaluate(() => {
      const grid = document.querySelector('.nh-grid')
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const gridRight = grid.getBoundingClientRect().right
      return [...document.querySelectorAll('.nh-gcell')].map((c) => {
        const cs = getComputedStyle(c)
        const start = parseInt(cs.gridColumnStart, 10)
        const span = parseInt(String(cs.gridColumnEnd).replace(/\D+/g, ''), 10) || 1
        return {
          text: c.querySelector('.nh-label')?.textContent ?? '',
          col: cs.gridColumnStart,
          colEnd: start + span,
          cols,
          overflowPx: Math.round(c.getBoundingClientRect().right - gridRight),
        }
      })
    })
    // The 9-wide stored rect used to create five implicit columns, so the grid was 9 columns
    // rather than the 4 the dashboard asked for and every other widget was laid out against.
    ok('tablet layout renders with its own column count', placed.every((p) => p.cols === 4), JSON.stringify(placed))
    ok(
      'no tablet cell spans past the last column',
      placed.length === 2 && placed.every((p) => p.colEnd <= 5),
      JSON.stringify(placed)
    )
    await ctx.close()
  }

  /* --------- label font scales with the cell ---------
     The label widget's authored px size follows --nh-textscale, whose floor is chosen by the
     pointer: under a finger a narrow screen scales the label down, under a mouse it never
     drops below its authored size while the rows can hold it (100px and taller, which a
     12-column board reaches at about 1250px; 1300 is inside that). */
  {
    const sizes = {}
    for (const [name, width, touch] of [['1920', 1920, false], ['1300', 1300, false], ['1024-touch', 1024, true]]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, ...(touch ? { hasTouch: true } : {}) })
      await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
      const page = await ctx.newPage()
      await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
      await page.waitForSelector('.nh-label', { timeout: 15000 })
      await page.waitForTimeout(600)
      sizes[name] = await page.evaluate(() => ({
        font: parseFloat(getComputedStyle(document.querySelector('.nh-label')).fontSize),
        scale: parseFloat(getComputedStyle(document.querySelector('.nh-grid')).getPropertyValue('--nh-textscale')),
      }))
      await ctx.close()
    }
    ok('label font = authored 40px * textscale @1920', Math.abs(sizes['1920'].font - 40 * sizes['1920'].scale) < 0.5, JSON.stringify(sizes['1920']))
    ok('label font scales down on a narrow touch screen', sizes['1024-touch'].font < sizes['1920'].font && sizes['1024-touch'].scale < 1, `1024-touch=${JSON.stringify(sizes['1024-touch'])} 1920=${sizes['1920'].font}`)
    ok('label keeps its authored size on a narrower mouse-driven screen', sizes['1300'].scale === 1 && Math.abs(sizes['1300'].font - 40) < 0.5, JSON.stringify(sizes['1300']))
  }

  /* --------- a component from a NEWER neohab is refused, and left strictly alone ---------
     The dangerous case is not that it fails to render, it is what an old build does NEXT: drop
     it from the working set, then treat everything it referenced as unused. So this checks the
     refusal AND that the refusal costs nothing - the plan image belonging to a dashboard this
     build cannot read must survive a collection triggered by an ordinary save. */
  {
    const FUT_BG_ID = 'nh-e2e-a2futbg'
    const FUT_BG = 'background:' + FUT_BG_ID
    const FUT_DASH = 'dashboard:nh-e2e-a2fut'
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
    await put({
      uid: FUT_BG,
      component: 'neohab:background',
      config: { version: 1, id: FUT_BG_ID, dataUri: 'data:image/png;base64,' + PNG.toString('base64'), bytes: PNG.length },
    })
    await put({
      uid: FUT_DASH,
      component: 'neohab:dashboard',
      // version 99: written by a neohab that does not exist yet
      config: {
        version: 99,
        id: 'nh-e2e-a2fut',
        name: 'E2E A2 From The Future',
        columns: 12,
        rowHeight: 'match',
        widgets: [{ id: 'w-fut', type: 'floorplan', config: { image: 'bg:' + FUT_BG_ID }, layout: { lg: { x: 0, y: 0, w: 4, h: 3 } } }],
      },
    })

    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/')
    await page.waitForSelector('.nh-tile, .nh-welcome', { timeout: 15000 })
    await page.waitForTimeout(1000)

    // evaluate-based rather than a locator wait: on a build without this feature the notice
    // never appears, and a wait would abort every check after it instead of failing its own.
    const seen = await page.evaluate(() => ({
      notice: document.querySelectorAll('.nh-incompat').length,
      noticeText: document.querySelector('.nh-incompat')?.textContent ?? '',
      tiles: [...document.querySelectorAll('.nh-tile:not(.nh-tile--new)')].map((el) => el.textContent ?? ''),
    }))
    ok('a dashboard from a newer neohab is not rendered', !seen.tiles.some((t) => t.includes('From The Future')), 'tiles=' + seen.tiles.length)
    ok('the refusal is explained rather than silent', seen.notice === 1, 'notices=' + seen.notice)
    ok('the notice names the component', seen.noticeText.includes('nh-e2e-a2fut'), seen.noticeText.slice(0, 90))
    ok('the rest of the configuration still loaded', seen.tiles.length >= 2, 'tiles=' + seen.tiles.length)
    ok('no page error from a config out of the future', errs.length === 0, errs.join('|'))

    // Now make the app collect. An editor save is the real trigger - and the lesson that put
    // this check here is that a suite which never saves through the app cannot catch a
    // save-time bug. Deliberately NOT the global background field: that belongs to the user.
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForSelector('.nh-grid--edit', { timeout: 8000 })
    await page.click('[aria-label="Add widget"]')
    await page.waitForSelector('.nh-sheet', { timeout: 8000 })
    await page.click('.nh-sheet button:has-text("Clock")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Save")')
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 10000 })
    await page.waitForTimeout(2000)
    const futBgStatus = (await fetch(NS + '/' + encodeURIComponent(FUT_BG), { headers: AUTH })).status
    ok('an image held only by a refused component survives a save-time collection', futBgStatus === 200, 'status ' + futBgStatus)

    // and the component itself was never rewritten by a build that could not read it
    const stored = await (await fetch(NS + '/' + encodeURIComponent(FUT_DASH), { headers: AUTH })).json()
    ok('the refused component is stored exactly as it was', Number(stored?.config?.version) === 99, 'version=' + String(stored?.config?.version))
    await ctx.close()
  }

  /* --------- ItemPicker: is the list still open after selecting? --------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForSelector('.nh-grid--edit .nh-cell', { timeout: 10000 })
    await page.locator('.nh-cell').nth(1).locator('.nh-cell__overlay').click()
    await page.waitForSelector('input[role="combobox"]', { timeout: 10000 })
    const combo = page.locator('input[role="combobox"]').first()
    await combo.click()
    await page.waitForSelector('.nh-picker__list', { timeout: 10000 })
    await page.locator('.nh-picker__option').first().click()
    await page.waitForTimeout(500)
    const stillOpen = await page.locator('.nh-picker__list').count()
    const picked = await combo.inputValue()
    ok('picker: an item was selected', picked.length > 0, 'value=' + picked)
    ok('picker: list closes after selecting (does not re-open)', stillOpen === 0, 'lists open=' + stillOpen)
    await ctx.close()
  }
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  await browser.close()
  for (const uid of created) {
    const r = await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH })
    ok('cleanup: ' + uid + ' removed', r.ok || r.status === 404, 'status=' + r.status)
  }
  // scoped to what THIS suite made: an unrelated stray must not fail this suite's cleanup
  const left = (await (await fetch(NS)).json()).filter((c) => c.uid.includes('nh-e2e-a2'))
  ok('cleanup: no suite leftovers', left.length === 0, JSON.stringify(left.map((c) => c.uid)))
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks`)
console.log(pass === results.length ? 'ALL PASS' : 'SOME FAILED')
process.exitCode = pass === results.length ? 0 : 1
