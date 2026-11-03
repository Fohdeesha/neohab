// Web page dashboards: one page filling everything under the dashboard bar, with no border and no page scroll
// on a desktop and a phone, allowed to go fullscreen; the edit button opens its settings (address, sandbox),
// the New dashboard sheet makes one, the Home tile and the sidebar list it, and an address it cannot embed says
// so. SAFE with a live config: creates dashboard:nh-e2e-page, -pagebad and -pageempty, plus the one the New
// dashboard sheet makes (found by its name, "nh-e2e New page"), and deletes exactly those. The main page is on
// another origin, answered in the browser, since that is the case the fullscreen permission is for; the
// sandboxed one is neohab's own docs, served by the jar. Commands nothing.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, UNREACHABLE, isAppResource } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e.message).slice(0, 120) }))

const DOC = UNREACHABLE + 'nh-e2e-robots.test/'
const DOC_BODY = '<!doctype html><title>robots</title><body style="margin:0"><h1>Robots</h1>' + '<p>a page on another origin</p>'.repeat(40) + '</body>'
const DOC2 = BASE + '/neohab/docs/theming.html'
const NEW_NAME = 'nh-e2e New page'
const SEEDS = {
  'nh-e2e-page': { name: 'E2E Page', page: { url: DOC } },
  'nh-e2e-pagebad': { name: 'E2E Page bad', page: { url: 'javascript:alert(1)' } },
  'nh-e2e-pageempty': { name: 'E2E Page empty', page: { url: '' } }
}
const uidsToClean = async () => {
  const list = (await (await fetch(NS, { headers: AUTH })).json()) ?? []
  return list.filter((c) => Object.keys(SEEDS).some((id) => c.uid === 'dashboard:' + id) || c.config?.name === NEW_NAME).map((c) => c.uid)
}
const del = (uid) => fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
const get = async (uid) => {
  const r = await fetch(NS + '/' + encodeURIComponent(uid), { headers: AUTH })
  return r.ok ? r.json() : null
}

let browser
try {
  for (const uid of await uidsToClean()) await del(uid)
  let seeded = true
  for (const [id, d] of Object.entries(SEEDS)) {
    const r = await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'dashboard:' + id, component: 'neohab:dashboard', config: { version: 3, id, columns: 12, rowHeight: 'match', widgets: [], ...d } })
    })
    seeded = seeded && r.ok
  }
  ok('seed', seeded)

  // real scrollbars: Playwright hides them by default, and then the strip a reserved gutter leaves cannot be seen
  const bars = { ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar'] }
  browser = await launchChromium({ channel: 'chrome', headless: true, ...bars }).catch(() => launchChromium({ headless: true, ...bars }))
  const errs = []
  const newPage = async (viewport, touch) => {
    const ctx = await browser.newContext({ viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
    await ctx.route('**/nh-e2e-robots.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: DOC_BODY }))
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const at = m.location?.()?.url
      if (isAppResource(at) && !/\/neohab\/docs\//.test(at ?? '')) errs.push(m.text() + (at ? ' <- ' + at : ''))
    })
    page.on('dialog', (d) => void d.accept())
    return { ctx, page }
  }
  const open = async (page, id) => {
    await page.goto(APP + '#/d/' + id, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-dash__bar', { timeout: 20000 })
    await page.waitForSelector('.nh-pageframe', { timeout: 5000 }).catch(() => {})
    await sleep(800)
  }
  // where the frame sits, against the bar above it and the window around it
  const fit = (page) =>
    probe(page, () => {
      const f = document.querySelector('iframe.nh-pageframe')
      const bar = document.querySelector('.nh-dash__bar')?.getBoundingClientRect()
      const dash = document.querySelector('.nh-dash')?.getBoundingClientRect()
      if (!f || !bar || !dash) return { frame: !!f, bar: !!bar }
      const r = f.getBoundingClientRect()
      const cs = getComputedStyle(f)
      const se = document.scrollingElement
      return {
        top: Math.round(r.top - bar.bottom),
        left: Math.round(r.left - dash.left),
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
        border: cs.borderTopWidth + ' ' + cs.borderLeftWidth,
        scrolls: se.scrollHeight - se.clientHeight,
        src: f.getAttribute('src'),
        allow: f.getAttribute('allow'),
        allowFull: f.hasAttribute('allowfullscreen'),
        sandbox: f.getAttribute('sandbox')
      }
    })
  const inside = async (page, fn) => {
    const handle = await page.$('iframe.nh-pageframe')
    const frame = await handle?.contentFrame()
    if (!frame) return null
    await frame.waitForLoadState('domcontentloaded').catch(() => {})
    return frame.evaluate(fn).catch((e) => ({ error: String(e.message).slice(0, 80) }))
  }
  const fills = (f) => f && f.top >= -1 && f.top <= 1 && f.left === 0 && f.right === 0 && f.bottom >= 0 && f.bottom <= 1

  // ---- a desktop --------------------------------------------------------------------------------------
  const desk = await newPage({ width: 1400, height: 900 }, false)
  await open(desk.page, 'nh-e2e-page')
  // something taller than the window must not give the dashboard a scrollbar (and with it a strip down the right
  // of the page); the same measurement with the root allowed to scroll again shows the check can see one
  const gutters = await probe(desk.page, () => {
    const g = () => window.innerWidth - document.documentElement.clientWidth
    const tall = document.createElement('div')
    tall.style.height = '3000px'
    document.body.appendChild(tall)
    const withRules = g()
    const st = document.createElement('style')
    st.textContent = 'html { overflow: visible !important }'
    document.head.appendChild(st)
    const without = g()
    st.remove()
    tall.remove()
    return { withRules, without, after: g() }
  })
  ok(
    'a web page dashboard never grows a scrollbar beside its page, even with something taller than the window',
    gutters.withRules === 0 && gutters.without > 0 && gutters.after === 0,
    JSON.stringify(gutters)
  )
  const d1 = await fit(desk.page)
  ok('the page loads at its address', d1.src === DOC, JSON.stringify(d1))
  ok('it fills everything under the bar, to the window edges', fills(d1), JSON.stringify(d1))
  ok('with no border round it', d1.border === '0px 0px', String(d1.border))
  ok('and the dashboard never scrolls, only the page inside it', d1.scrolls <= 0, `document scroll range ${d1.scrolls}px`)
  await desk.page.mouse.move(700, 500)
  await desk.page.mouse.wheel(0, 900)
  await sleep(400)
  ok('a wheel over the page leaves the dashboard where it is', (await desk.page.evaluate(() => window.scrollY)) === 0)
  const docText = await inside(desk.page, () => ({ origin: location.origin, length: document.body?.innerText?.length ?? 0 }))
  ok('the embedded page drew its content', docText?.length > 500 && docText.origin !== new URL(BASE).origin, JSON.stringify(docText))
  ok('it may go fullscreen', /\bfullscreen\b/.test(d1.allow ?? '') && d1.allowFull === true, JSON.stringify({ allow: d1.allow, allowFull: d1.allowFull }))
  const fsOk = await inside(desk.page, () => document.fullscreenEnabled)
  ok('and the page itself is told it can', fsOk === true, JSON.stringify(fsOk))
  const bar = await probe(desk.page, () => ({
    title: document.querySelector('.nh-dash__title')?.textContent,
    edit: !!document.querySelector('[aria-label="Edit dashboard"]')
  }))
  ok('the bar keeps its name and edit button', bar.title === 'E2E Page' && bar.edit === true, JSON.stringify(bar))

  // ---- the edit button opens its settings ---------------------------------------------------------------
  await desk.page.click('[aria-label="Edit dashboard"]', { timeout: 5000 }).catch(() => {})
  await desk.page.waitForSelector('#nh-dash-pageurl', { timeout: 8000 }).catch(() => {})
  const ed = await probe(desk.page, () => ({
    url: document.querySelector('#nh-dash-pageurl')?.value ?? null,
    sandbox: document.querySelector('#nh-dash-pagesandbox')?.checked ?? null,
    grid: !!document.querySelector('#nh-dash-columns, #nh-dash-rowmode, #nh-dash-bg'),
    add: !!document.querySelector('[aria-label="Add widget"]'),
    save: !!document.querySelector('.nh-dash__bar .nh-btn--primary'),
    frame: !!document.querySelector('iframe.nh-pageframe')
  }))
  ok('the edit button opens the settings with the page address in them', ed.url === DOC && ed.sandbox === false, JSON.stringify(ed))
  ok('with no grid settings and no Add widget', ed.grid === false && ed.add === false, JSON.stringify(ed))
  ok('the page stays on screen behind them, with Save in the bar', ed.frame === true && ed.save === true, JSON.stringify(ed))
  await desk.page.fill('#nh-dash-pageurl', DOC2)
  await desk.page.keyboard.press('Enter')
  await sleep(600)
  ok('a new address loads as soon as it is entered', (await fit(desk.page)).src === DOC2, String((await fit(desk.page)).src))
  await desk.page.click('#nh-dash-pagesandbox', { timeout: 3000 }).catch(() => {})
  await sleep(600)
  const sb = await fit(desk.page)
  ok('a page from openHAB itself can be sandboxed, and may still go fullscreen', sb.sandbox === 'allow-scripts' && /\bfullscreen\b/.test(sb.allow ?? ''), JSON.stringify(sb))
  const sbFs = await inside(desk.page, () => document.fullscreenEnabled)
  ok('the sandboxed page is still told it can go fullscreen', sbFs === true, JSON.stringify(sbFs))
  await desk.page.click('.nh-dash__bar button:has-text("Save")', { timeout: 5000 }).catch(() => {})
  await desk.page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 }).catch(() => {})
  const saved = await get('dashboard:nh-e2e-page')
  ok(
    'saving stores the address and the sandbox, and no widgets',
    saved?.config?.page?.url === DOC2 && saved?.config?.page?.sandbox === true && Array.isArray(saved?.config?.widgets) && saved.config.widgets.length === 0,
    JSON.stringify(saved?.config?.page)
  )

  // ---- addresses it cannot show --------------------------------------------------------------------------
  await open(desk.page, 'nh-e2e-pagebad')
  const bad = await probe(desk.page, () => ({ frame: !!document.querySelector('iframe'), text: document.querySelector('.nh-pageframe--empty')?.textContent ?? null }))
  ok('an address that cannot be embedded says so, and loads nothing', bad.frame === false && bad.text === 'That page address cannot be embedded.', JSON.stringify(bad))
  await open(desk.page, 'nh-e2e-pageempty')
  const empty = await probe(desk.page, () => ({ frame: !!document.querySelector('iframe'), text: document.querySelector('.nh-pageframe--empty')?.textContent ?? null }))
  ok('one with no address yet says that', empty.frame === false && empty.text === 'No page address yet.', JSON.stringify(empty))

  // ---- the New dashboard sheet makes one, and Home says what it is ------------------------------------
  await desk.page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await desk.page.waitForSelector('.nh-tile--new', { timeout: 15000 }).catch(() => {})
  const tileMeta = await probe(desk.page, () =>
    [...document.querySelectorAll('.nh-tile')].find((t) => t.querySelector('.nh-tile__name')?.textContent === 'E2E Page')?.querySelector('.nh-tile__meta')?.textContent ?? null
  )
  ok('its Home tile says it is a web page', tileMeta === 'Web page', String(tileMeta))
  await desk.page.click('.nh-tile--new', { timeout: 5000 }).catch(() => {})
  await desk.page.waitForSelector('#nh-newdash-name', { timeout: 5000 }).catch(() => {})
  await desk.page.fill('#nh-newdash-name', NEW_NAME).catch(() => {})
  await desk.page.click('.nh-chip:has-text("A web page")', { timeout: 3000 }).catch(() => {})
  await desk.page.fill('#nh-newdash-url', DOC, { timeout: 3000 }).catch(() => {})
  await desk.page.click('button:has-text("Create dashboard")', { timeout: 3000 }).catch(() => {})
  await desk.page.waitForSelector('iframe.nh-pageframe', { timeout: 10000 }).catch(() => {})
  await sleep(500)
  const made = await fit(desk.page)
  ok('the New dashboard sheet makes a web page dashboard that opens on its page', made.src === DOC && fills(made), JSON.stringify(made))
  const madeUid = (await uidsToClean()).find((u) => !Object.keys(SEEDS).some((id) => u === 'dashboard:' + id))
  const madeCfg = madeUid ? await get(madeUid) : null
  ok('and stores it as one', madeCfg?.config?.page?.url === DOC && madeCfg?.config?.widgets?.length === 0, JSON.stringify(madeCfg?.config?.page))
  await desk.ctx.close()

  // ---- a phone, and the sidebar ----------------------------------------------------------------------------
  const ph = await newPage({ width: 393, height: 850 }, true)
  await open(ph.page, 'nh-e2e-page')
  const p1 = await fit(ph.page)
  ok('on a phone it fills under the bar as well', fills(p1), JSON.stringify(p1))
  ok('and the dashboard does not scroll there either', p1.scrolls <= 0, `document scroll range ${p1.scrolls}px`)
  const trigger = ph.page.locator('.nh-dash__bar .nh-side__trigger')
  const hasTrigger = (await trigger.count()) === 1
  if (hasTrigger) {
    await trigger.click()
    await sleep(400)
    const listed = await ph.page.locator('.nh-side__item', { hasText: 'E2E Page bad' }).count()
    ok('the menu at the top left lists web page dashboards with the rest', listed === 1, `listed=${listed}`)
    await ph.page.locator('.nh-side__item').filter({ has: ph.page.locator('.nh-side__label', { hasText: /^E2E Page bad$/ }) }).click({ timeout: 3000 }).catch(() => {})
    await sleep(600)
    ok('and choosing one opens it', /#\/d\/nh-e2e-pagebad$/.test(ph.page.url()), ph.page.url())
  } else {
    ok('SKIP: the sidebar is turned off in this server’s settings', true)
  }
  await ph.ctx.close()

  ok('console clean', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err?.stack ?? err).slice(0, 300))
} finally {
  for (const uid of await uidsToClean().catch(() => [])) await del(uid)
  const left = await uidsToClean().catch(() => ['(could not list)'])
  ok('cleanup: no leftovers', left.length === 0, left.join(','))
  await browser?.close().catch(() => {})
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
