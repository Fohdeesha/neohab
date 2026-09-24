// Audit fixes for configuration that did not come from the editor.
import { launchChromium } from './lib/browser.mjs'
import { skipOnProduction } from './lib/guard.mjs'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { pickItem } from './lib/ui.mjs'

const launchBrowser = async () => { for (const c of ['chrome', 'msedge']) { try { return await launchChromium({ channel: c, headless: true }) } catch {} } return launchChromium({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const created = []

const put = async (comp) => {
  await fetch(NS + '/' + comp.uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(comp) })
  if (r.ok) created.push(comp.uid)
  return r.ok
}

/**
 * The prototype-named bindings have to be items the server REALLY has. They used to be names
 * nobody had, which stopped exercising anything the day a widget bound to an absent item started
 * saying so instead of rendering - the section would have gone on passing while testing nothing.
 * openHAB accepts all four as item names (checked: 201 on create, and they come back in
 * /rest/items), so the lookup tables are now driven by a real `constructor` all the way through.
 */
const PROTO_ITEMS = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
const madeItems = []
let protoSkipped = false

const browser = await launchBrowser()
try {
  protoSkipped = skipOnProduction(ok, 'the prototype-named bindings need four managed items created on the server')
  if (!protoSkipped) {
    for (const name of PROTO_ITEMS) {
      const r = await fetch(BASE + '/rest/items/' + name, {
        method: 'PUT',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'Switch', name, label: 'E2E audit2 ' + name })
      })
      if (r.ok) madeItems.push(name)
    }
    await new Promise((r) => setTimeout(r, 800))
    for (const name of PROTO_ITEMS) {
      await fetch(BASE + '/rest/items/' + name + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: 'OFF' })
    }
  }

  await put({
    uid: 'dashboard:nh-e2e-a2',
    component: 'neohab:dashboard',
    tags: [],
    config: {
      version: 1, id: 'nh-e2e-a2', name: 'E2E Audit2', columns: 12, rowHeight: 'match', gap: 5,
      widgets: [
        { id: 'a2-label', type: 'label', config: { text: 'Scaled', fontSize: 40 }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
        { id: 'a2-btn', type: 'button', config: { item: ITEMS.switch, label: 'Pick', command: 'ON' }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
        // left unbound on purpose: the picker check has to be able to see that nothing got bound
        { id: 'a2-unbound', type: 'value', config: { label: 'Unbound' }, layout: { lg: { x: 5, y: 0, w: 2, h: 2 } } },
      ],
    },
  })
  if (!protoSkipped) await put({
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
  await put({
    uid: 'dashboard:nh-e2e-a2-nameless',
    component: 'neohab:dashboard',
    tags: [],
    config: { version: 1, id: 'nh-e2e-a2-nameless', columns: 4, rowHeight: 'match', widgets: [] },
  })
  await put({
    uid: 'dashboard:nh-e2e-a2-nocols',
    component: 'neohab:dashboard',
    tags: [],
    config: {
      version: 1, id: 'nh-e2e-a2-nocols', name: 'E2E Audit2 NoCols', columns: 0, rowHeight: 'match', gap: 5,
      widgets: [{ id: 'a2-v', type: 'label', config: { text: 'Survives' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
    },
  })
  await put({
    uid: 'dashboard:nh-e2e-a2-norow',
    component: 'neohab:dashboard',
    tags: [],
    config: {
      version: 1, id: 'nh-e2e-a2-norow', name: 'E2E Audit2 NoRow', columns: 12, rowHeight: 0, gap: 5,
      widgets: [{ id: 'a2-r', type: 'label', config: { text: 'Floored' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
    },
  })
  await put({
    uid: 'dashboard:nh-e2e-a2-nogap',
    component: 'neohab:dashboard',
    tags: [],
    config: {
      version: 1, id: 'nh-e2e-a2-nogap', name: 'E2E Audit2 NoGap', columns: 12, rowHeight: 'match', gap: 'wide',
      widgets: [{ id: 'a2-g', type: 'label', config: { text: 'Gapped' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
    },
  })
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
    ok('config loads despite a nameless dashboard', tiles >= 2, 'tiles=' + tiles)
    ok('no page error from the nameless dashboard', errs.length === 0, errs.join('|'))
    await ctx.close()
  }

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
    const rowPx = parseFloat(geom.rows)
    ok('columns=0: the row height is finite and sane', Number.isFinite(rowPx) && rowPx > 0 && rowPx < 4000, geom.rows)
    ok('columns=0: the widget renders at a finite height', geom.cellH > 0 && geom.cellH < 4000, JSON.stringify(geom))
    ok('columns=0: the column template is valid CSS', /px|fr/.test(geom.cols) && !/Infinity|NaN/.test(geom.cols), geom.cols)
    ok('columns=0: the icon scale is a number', Number.isFinite(parseFloat(geom.scale)), geom.scale)
    ok('columns=0: the widget is still there', geom.label === 'Survives', geom.label)
    ok('columns=0: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
    await ctx.close()
  }

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

  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-nogap')
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
    ok('gap="wide": the gap falls back to the default length', /^8px/.test(g.gap), g.gap)
    ok('gap="wide": the widget has a size', g.h > 0 && g.w > 0, JSON.stringify(g))
    await ctx.close()
  }

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

  if (!protoSkipped) {
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
    // the section is worthless unless the server really has them, so say so rather than assume
    ok('the four prototype-named items were created on the server', madeItems.length === 4, madeItems.join(', '))
    ok('all four prototype-named bindings render', tiles.length === 4, JSON.stringify(tiles))
    ok(
      'none of them becomes the boundary error tile',
      tiles.length === 4 && tiles.every((t) => !t.errored),
      JSON.stringify(tiles)
    )
    const sw = await page.locator('.nh-switch').count()
    ok('the switch bound to an item called constructor draws a switch', sw >= 1, 'switches=' + sw)
    await ctx.close()
  }

  // a dashboard served with this widget list, only in the browser
  const servePoison = (page, widgets) =>
    page.route(/\/rest\/ui\/components\/neohab:config/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const res = await route.fetch()
      const body = await res.json()
      body.push({
        uid: 'dashboard:nh-e2e-a2-poison',
        component: 'neohab:dashboard',
        config: { version: 1, id: 'nh-e2e-a2-poison', name: 'E2E Poison', columns: 12, rowHeight: 'match', widgets },
      })
      return route.fulfill({ response: res, body: JSON.stringify(body) })
    })

  // a null in the stored widget list used to throw on render; it is repaired where the configuration loads now
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await servePoison(page, [null, { id: 'w-kept', type: 'label', config: { text: 'NH E2E kept' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }])
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-poison')
    await page.waitForTimeout(2500)
    const drawn = await page.evaluate(() => ({
      panel: document.querySelectorAll('.nh-appfail').length,
      title: document.querySelector('.nh-dash__title')?.textContent ?? '',
      kept: document.body.innerText.includes('NH E2E kept'),
    }))
    ok('a null in a stored widget list no longer takes the dashboard down', drawn.panel === 0 && drawn.title === 'E2E Poison' && drawn.kept, JSON.stringify(drawn))
    await ctx.close()
  }

  // and a screen that throws anyway still gets the panel: the throw is forced here, since the data that used to
  // cause one is now repaired before anything renders
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    await ctx.addInitScript(() => {
      if (window.top !== window) return
      const Real = window.ResizeObserver
      window.ResizeObserver = class extends Real {
        constructor(cb) {
          if (location.hash.includes('nh-e2e-a2-poison')) throw new Error('nh-e2e: a screen that throws')
          super(cb)
        }
      }
    })
    const page = await ctx.newPage()
    const caught = []
    page.on('console', (m) => {
      if (m.type() === 'error' && /failed to render/.test(m.text())) caught.push(m.text())
    })
    await servePoison(page, [])
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

  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/100%')
    await page.waitForTimeout(2000)
    const shown = await page.evaluate(() => ({
      root: (document.getElementById('root')?.childElementCount ?? 0) > 0,
      body: (document.body.innerText || '').trim().length,
      app: document.querySelectorAll('.nh-app').length,
    }))
    ok('a malformed hash still renders the app', shown.root && shown.app > 0, JSON.stringify(shown))
    ok('and it is not a blank page', shown.body > 0, JSON.stringify(shown))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
    await page.waitForSelector('.nh-gcell', { state: 'attached', timeout: 15000 }).catch(() => {})
    const cells = await page.locator('.nh-gcell').count()
    ok('and a real dashboard still loads afterwards', cells > 0, 'cells=' + cells)
    await ctx.close()
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2-throws')
    await page.waitForSelector('.nh-gcell', { state: 'attached', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const state = await page.evaluate(() => ({
      cells: document.querySelectorAll('.nh-gcell').length,
      errors: document.querySelectorAll('.nh-widget--error').length,
      alive: document.body.innerText.includes('Still here'),
      header: document.querySelectorAll('.nh-dash__bar').length,
      root: (document.getElementById('root')?.childElementCount ?? 0) > 0,
    }))
    ok('every widget on the dashboard still has a cell', state.cells === 4, JSON.stringify(state))
    ok('the working widget beside them still renders', state.alive, JSON.stringify(state))
    ok('the dashboard header survives', state.header === 1 && state.root, JSON.stringify(state))
    ok('the unrenderable widgets say so in their own tiles', state.errors >= 1, JSON.stringify(state))
    await page.click('[aria-label="Edit dashboard"]').catch(() => {})
    const editable = await page
      .waitForSelector('.nh-grid--edit', { state: 'attached', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    ok('the dashboard can still be edited to fix them', editable)
    await ctx.close()
  }

  {
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
    ok('tablet layout renders with its own column count', placed.every((p) => p.cols === 4), JSON.stringify(placed))
    ok(
      'no tablet cell spans past the last column',
      placed.length === 2 && placed.every((p) => p.colEnd <= 5),
      JSON.stringify(placed)
    )
    await ctx.close()
  }

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

    const stored = await (await fetch(NS + '/' + encodeURIComponent(FUT_DASH), { headers: AUTH })).json()
    ok('the refused component is stored exactly as it was', Number(stored?.config?.version) === 99, 'version=' + String(stored?.config?.version))
    await ctx.close()
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {} }, TOKEN)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a2')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForSelector('.nh-grid--edit .nh-cell', { timeout: 10000 })
    await page.locator('.nh-cell:has(.nh-cell__type:text-is("value")) .nh-cell__overlay').click()
    await page.waitForSelector('input[role="combobox"]', { timeout: 10000 })
    const combo = page.locator('input[role="combobox"]').first()
    const before = await combo.inputValue()
    ok('picker: the widget starts with no item bound', before === '', 'value=' + before)
    const picked = await pickItem(page, combo, ITEMS.dimmer)
    await page.waitForTimeout(200)
    const stillOpen = await page.locator('.nh-picker__list').count()
    ok('picker: clicking an option binds that item', picked === ITEMS.dimmer, 'value=' + picked)
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
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid.includes('nh-e2e-a2'))
  ok('cleanup: no suite leftovers', left.length === 0, JSON.stringify(left.map((c) => c.uid)))

  for (const name of madeItems) {
    await fetch(BASE + '/rest/items/' + name, { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  if (!protoSkipped) {
    const names = await (await fetch(BASE + '/rest/items?fields=name', { headers: AUTH })).json()
    const stray = PROTO_ITEMS.filter((n) => names.some((i) => i.name === n))
    ok('cleanup: the prototype-named items are gone', stray.length === 0, stray.join(', '))
  }
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks`)
console.log(pass === results.length ? 'ALL PASS' : 'SOME FAILED')
process.exitCode = pass === results.length ? 0 : 1
