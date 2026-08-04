/**
 * Portrait/stacked text sizing: stacked rows size their text from the room the row actually
 * has (stackedTextScale) instead of the grid's desktop-proportional scale, which used to sit
 * pinned at its 0.8 floor on every phone and render tiny text in a roomy full-width row.
 *
 * Also guards that nothing else moved: the wide-grid path (landscape phone, laptop, desktop)
 * must keep the exact scale formula it had before.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-portrait{,-tight} (deleted afterwards,
 * cleanup guarded), reads the server's own dashboards strictly read-only, commands nothing.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await chromium.launch({ channel: c, headless: true }) } catch {} } return chromium.launch({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })

const btn = (id, label, x, y, w = 1, h = 1, iconSize = 36) => ({
  id,
  type: 'button',
  config: { label, icon: 'oh:light', iconSize, command: 'ON' },
  layout: { lg: { x, y, w, h } },
})

// Roomy stack: 8 columns -> ~156px stacked rows on a phone.
const ROOMY = {
  uid: 'dashboard:nh-e2e-portrait',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1,
    id: 'nh-e2e-portrait',
    name: 'E2E Portrait',
    columns: 8,
    rowHeight: 'match',
    gap: 4,
    widgets: [
      btn('p-a', 'Master Bed', 0, 0),
      btn('p-long', 'Guest Bedroom Accents', 1, 0),
      btn('p-token', 'Laptop>Studio AVB', 2, 0, 1, 1, 70),
      btn('p-desc', 'gggjjjyyy ppqq', 3, 0),
      { id: 'p-slider', type: 'slider', config: { label: 'Master Bed Lights' }, layout: { lg: { x: 0, y: 1, w: 3, h: 1 } } },
    ],
  },
}

// Tight stack: 36 columns -> ~32px rows, the shape whose text must stay at the floor. Mixed
// heights prove the scale is per row, and the color widget's minPixelHeight floor lifts its own.
const TIGHT = {
  uid: 'dashboard:nh-e2e-portrait-tight',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1,
    id: 'nh-e2e-portrait-tight',
    name: 'E2E Portrait Tight',
    columns: 36,
    rowHeight: 'match',
    gap: 4,
    widgets: [
      btn('t-short', 'Short Row', 0, 0, 2, 1), // ~32px stacked
      btn('t-tall', 'Tall Row', 3, 0, 4, 6), // ~190px stacked
      { id: 't-color', type: 'color', config: { label: 'Colour' }, layout: { lg: { x: 8, y: 0, w: 4, h: 1 } } }, // minPixelHeight floor
    ],
  },
}

/** The scale rule under test, mirrored from web/src/model/layout.ts. */
const wantScale = (iconscale, cellHeight) => Math.max(Math.max(0.8, iconscale), Math.min(1, cellHeight / 96))

for (const d of [ROOMY, TIGHT]) {
  await fetch(NS + '/' + d.uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
  ok('seed: ' + d.uid, r.ok, 'status=' + r.status)
}

/** Per-cell geometry + text metrics, plus ink-level clipping checks. */
const readCells = (page) =>
  page.evaluate(() => {
    const grid = document.querySelector('.nh-grid')
    const cells = [...grid.querySelectorAll('.nh-gcell, .nh-cell')].map((c) => {
      const cr = c.getBoundingClientRect()
      const label = c.querySelector('.nh-button__label, .nh-widget__labeltext')
      let text = null
      if (label) {
        const lr = label.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(label)
        const rects = [...range.getClientRects()]
        text = {
          text: label.textContent,
          font: parseFloat(getComputedStyle(label).fontSize),
          hClipped: label.scrollWidth > label.clientWidth + 1,
          vClipped: label.scrollHeight > label.clientHeight + 0.5,
          inkBelow: rects.length ? Math.max(...rects.map((x) => x.bottom)) - lr.bottom : 0,
          // label ink must stay inside the cell it belongs to
          spills: rects.length ? Math.max(...rects.map((x) => x.bottom)) > cr.bottom + 0.5 : false,
        }
      }
      return {
        h: Math.round(cr.height),
        w: Math.round(cr.width),
        font: parseFloat(getComputedStyle(c).fontSize),
        scale: parseFloat(getComputedStyle(c).getPropertyValue('--nh-textscale')),
        label: text,
      }
    })
    return {
      stacked: grid.classList.contains('nh-grid--stacked'),
      iconscale: parseFloat(getComputedStyle(grid).getPropertyValue('--nh-iconscale')),
      gridScale: getComputedStyle(grid).getPropertyValue('--nh-textscale').trim(),
      docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      cells,
    }
  })

const open = async (browser, width, height, route) => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
      // this suite asserts the app's DEFAULT geometry; the server's global theme belongs to
      // the user (it was `assembly` when this line was added), so pin the default per device
      localStorage.setItem('neohab:themeOverride', 'dark')
    } catch {}
  }, TOKEN)
  const page = await ctx.newPage()
  const errors = []
  const pageErrors = []
  const resource404 = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => {
    errors.push(String(e))
    pageErrors.push(String(e))
  })
  page.on('response', (r) => r.status() >= 400 && resource404.push(r.status() + ' ' + r.url()))
  await page.goto(BASE + '/neohab/index.html#/d/' + route)
  await page.waitForSelector('.nh-gcell', { timeout: 15000 })
  await page.waitForTimeout(800)
  return { ctx, page, errors, pageErrors, resource404 }
}

const browser = await launchBrowser()

try {
  /* ---------- portrait phones + portrait tablet: full-size text in roomy rows ---------- */
  for (const vp of [
    { name: 'phone-360', width: 360, height: 800 },
    { name: 'phone-393', width: 393, height: 851 },
    { name: 'phone-412', width: 412, height: 915 },
    { name: 'tablet-768', width: 768, height: 1024 },
  ]) {
    const { ctx, page, errors } = await open(browser, vp.width, vp.height, 'nh-e2e-portrait')
    const m = await readCells(page)
    ok(`${vp.name}: stacked surface`, m.stacked)
    ok(
      `${vp.name}: every row at full-size text (16px)`,
      m.cells.every((c) => Math.abs(c.font - 16) < 0.2),
      JSON.stringify(m.cells.map((c) => `${c.h}px->${c.font}`))
    )
    ok(
      `${vp.name}: per-row scale = max(gridScale, room)`,
      m.cells.every((c) => Math.abs(c.scale - wantScale(m.iconscale, c.h)) < 0.01),
      JSON.stringify(m.cells.map((c) => [c.h, c.scale, +wantScale(m.iconscale, c.h).toFixed(3)]))
    )
    const labels = m.cells.map((c) => c.label).filter(Boolean)
    ok(
      `${vp.name}: no label ellipsised`,
      labels.every((l) => !l.hClipped),
      JSON.stringify(labels.filter((l) => l.hClipped).map((l) => l.text))
    )
    ok(
      `${vp.name}: no label clipped or spilling its row`,
      labels.every((l) => !l.vClipped && l.inkBelow < 0.05 && !l.spills),
      JSON.stringify(labels.filter((l) => l.vClipped || l.inkBelow >= 0.05 || l.spills).map((l) => l.text))
    )
    ok(`${vp.name}: no horizontal page scroll`, !m.docScrollX)
    ok(`${vp.name}: console clean`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  /* ---------- the fix itself: text is bigger than it used to be, and matches desktop ---------- */
  {
    const { ctx, page } = await open(browser, 393, 851, 'nh-e2e-portrait')
    const phone = await readCells(page)
    await ctx.close()
    ok(
      'phone: text no longer pinned to the 0.8 floor (was 12.8px)',
      phone.cells.every((c) => c.font > 12.8 + 0.2),
      JSON.stringify(phone.cells.map((c) => c.font))
    )
    ok(
      'phone: roomy row reads at normal size, not below it',
      phone.cells.every((c) => c.scale === 1),
      JSON.stringify(phone.cells.map((c) => c.scale))
    )
    ok(
      'phone: scale never grows past 1 (width is not the constraint)',
      phone.cells.every((c) => c.scale <= 1),
      JSON.stringify(phone.cells.map((c) => c.scale))
    )
  }

  /* ---------- tight stack: short rows keep the floor, tall rows do not ---------- */
  {
    const { ctx, page, errors } = await open(browser, 393, 851, 'nh-e2e-portrait-tight')
    const m = await readCells(page)
    const short = m.cells.find((c) => c.label?.text === 'Short Row')
    const tall = m.cells.find((c) => c.label?.text === 'Tall Row')
    const color = m.cells.find((c) => c.label?.text === 'Colour')
    ok('tight: short row stays at the floor (no worse than before)', short && short.h < 96 && Math.abs(short.font - 12.8) < 0.2, JSON.stringify(short && [short.h, short.font]))
    ok('tight: tall row in the same stack gets full-size text', tall && tall.h > 96 && Math.abs(tall.font - 16) < 0.2, JSON.stringify(tall && [tall.h, tall.font]))
    ok('tight: scale is per row, not per dashboard', short && tall && short.font < tall.font, JSON.stringify([short?.font, tall?.font]))
    ok(
      "tight: minPixelHeight floor lifts the colour row's text too",
      color && color.h >= 150 && Math.abs(color.font - 16) < 0.2,
      JSON.stringify(color && [color.h, color.font])
    )
    ok('tight: console clean', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  /* ---------- REGRESSION GUARD: the wide grid is untouched ---------- */
  for (const vp of [
    { name: 'phone-landscape-915', width: 915, height: 411 },
    { name: 'laptop-1366', width: 1366, height: 768 },
    { name: 'desktop-1920', width: 1920, height: 1080 },
    { name: 'desktop-2560', width: 2560, height: 1440 },
  ]) {
    const { ctx, page, errors } = await open(browser, vp.width, vp.height, 'nh-e2e-portrait')
    const m = await readCells(page)
    const expected = Math.max(0.8, m.iconscale)
    ok(`${vp.name}: wide grid, not stacked`, !m.stacked)
    ok(`${vp.name}: grid scale still max(0.8, iconscale)`, Math.abs(parseFloat(m.gridScale) - expected) < 0.001, `${m.gridScale} want ${expected.toFixed(3)}`)
    ok(
      `${vp.name}: cell font still 16 * grid scale (rows unchanged)`,
      m.cells.every((c) => Math.abs(c.font - 16 * expected) < 0.2),
      JSON.stringify(m.cells.map((c) => c.font))
    )
    ok(
      `${vp.name}: no label ellipsised or clipped`,
      m.cells.map((c) => c.label).filter(Boolean).every((l) => !l.hClipped && !l.vClipped && l.inkBelow < 0.05),
      JSON.stringify(m.cells.map((c) => c.label?.text))
    )
    ok(`${vp.name}: console clean`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // The two ends of the range still differ the way they did before the change.
  {
    const a = await open(browser, 915, 411, 'nh-e2e-portrait')
    const land = await readCells(a.page)
    await a.ctx.close()
    const b = await open(browser, 2560, 1440, 'nh-e2e-portrait')
    const wide = await readCells(b.page)
    await b.ctx.close()
    ok('landscape phone still at the 0.8 floor: 12.8px', Math.abs(land.cells[0].font - 12.8) < 0.2, land.cells[0].font + 'px')
    ok('2560 still grows past 1.0 with its icons', parseFloat(wide.gridScale) > 1 && wide.cells[0].font > 16, `${wide.gridScale} ${wide.cells[0].font}px`)
  }

  /* ---------- the phone EDIT surface scales the same way ---------- */
  {
    const { ctx, page, errors } = await open(browser, 393, 851, 'nh-e2e-portrait')
    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForSelector('.nh-grid--stackedit .nh-cell', { timeout: 10000 })
    await page.waitForTimeout(400)
    const m = await readCells(page)
    ok(
      'phone editor: rows get the same full-size text',
      m.cells.length > 0 && m.cells.every((c) => Math.abs(c.font - 16) < 0.2),
      JSON.stringify(m.cells.map((c) => c.font))
    )
    const handleFont = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.nh-cell__type')).fontSize))
    ok('phone editor: handle chrome stays in rem (does not follow the cell)', Math.abs(handleFont - 16) > 0.5, handleFont + 'px')
    ok('phone editor: console clean', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  /* ---------- whatever real dashboards live on this server, portrait, read-only ----------
     Zero clicks - these only render and measure. Routes are the dashboard id, which is not
     necessarily the display name. Derived from the live namespace (never hardcoded: the
     server's dashboards come and go), capped so a dashboard-heavy server stays quick. */
  const liveDash = (await (await fetch(NS)).json())
    .filter((c) => c.uid.startsWith('dashboard:') && !c.uid.startsWith('dashboard:nh-e2e-'))
    .sort((a, b) => (b.config.widgets?.length ?? 0) - (a.config.widgets?.length ?? 0))
    .slice(0, 8)
  // A dashboard's authored Text size (percent) multiplies the automatic scale everywhere
  // (dashTextScale in model/layout.ts) - live dashboards may carry one, so the expected
  // scale must include it or a user setting reads as an app regression.
  const authoredScale = new Map(
    liveDash.map((c) => {
      const v = Number(c.config?.textSize)
      return [c.uid.slice('dashboard:'.length), Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.5, v / 100)) : 1]
    })
  )
  for (const id of liveDash.map((c) => c.uid.slice('dashboard:'.length))) {
    const { ctx, page, pageErrors, resource404 } = await open(browser, 393, 851, encodeURIComponent(id))
    const m = await readCells(page)
    const labels = m.cells.map((c) => c.label).filter(Boolean)
    ok(`real "${id}": stacked, no clipped label`, m.stacked && labels.every((l) => !l.hClipped && !l.vClipped && l.inkBelow < 0.05), JSON.stringify(labels.filter((l) => l.hClipped || l.vClipped).map((l) => l.text)))
    ok(`real "${id}": no label spills its row`, labels.every((l) => !l.spills), JSON.stringify(labels.filter((l) => l.spills).map((l) => l.text)))
    ok(`real "${id}": no horizontal page scroll`, !m.docScrollX)
    const authored = authoredScale.get(id) ?? 1
    ok(
      `real "${id}": every row follows the scale rule`,
      m.cells.every((c) => Math.abs(c.scale - authored * wantScale(m.iconscale, c.h)) < 0.01),
      JSON.stringify(m.cells.filter((c) => Math.abs(c.scale - authored * wantScale(m.iconscale, c.h)) >= 0.01).map((c) => [c.h, c.scale])) +
        ' authored=' + authored
    )
    ok(`real "${id}": no page errors`, pageErrors.length === 0, pageErrors.join(' | '))
    // Resource 404s here can be the server's own data, not our code: imported HABPanel custom
    // widgets often pull stylesheets or icons that no longer exist (or LAN hosts this machine
    // cannot resolve). Assert only that nothing under /neohab (our own bundle+assets) fails.
    const ours = resource404.filter((u) => u.includes('/neohab/'))
    ok(`real "${id}": every neohab asset loaded`, ours.length === 0, ours.join(' | '))
    await ctx.close()
  }
} catch (e) {
  ok('suite ran without crashing', false, String(e))
} finally {
  await browser.close()
  for (const uid of [ROOMY.uid, TIGHT.uid]) {
    const r = await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH }).catch(() => ({ ok: false }))
    ok('cleanup: deleted ' + uid, r.ok || r.status === 404, 'status=' + r.status)
  }
}

let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  -- ' + r.detail : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exitCode = failed ? 1 : 0
