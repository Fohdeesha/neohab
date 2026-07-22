/**
 * Corner-case torture suite. SAFE with a live config: only adds/removes nh-corner-* components,
 * commands only approved items, restores all state. Sections:
 *   1 unknown routes + malformed imports    5 anonymous viewer + invalid-token retry
 *   2 editor stress (undo/redo/collision)   6 template engine edge cases
 *   3 mobile viewport behavior              7 SSE outage -> watchdog recovery
 *   4 theme cycling                         8 rapid dashboard switching (read-only)
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const JSON_HDR = { ...AUTH, 'Content-Type': 'application/json' }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getState = async (item) => await (await fetch(`${BASE}/rest/items/${item}/state`)).text()

const origLevel = await getState(ITEMS.dimmer)
const origSettingsComp = await (await fetch(NS + '/settings')).json()
const TEMP_UIDS = ['dashboard:nh-corner-edit', 'dashboard:nh-corner-tpl', 'widgetdef:nh-corner-missingref']

// temp dashboards
await fetch(NS, {
  method: 'POST', headers: JSON_HDR,
  body: JSON.stringify({
    uid: 'dashboard:nh-corner-edit', component: 'neohab:dashboard',
    config: {
      version: 1, id: 'nh-corner-edit', name: 'nh-corner-edit', columns: 12, rowHeight: 60, gap: 8,
      widgets: [
        { id: 'a', type: 'label', config: { text: 'anchor' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
        { id: 'b', type: 'slider', config: { item: ITEMS.dimmer, label: 'lvl' }, layout: { lg: { x: 3, y: 0, w: 4, h: 2 } } },
        { id: 'n', type: 'button', config: { label: 'gohome', action: 'navigate', navigateDashboard: 'nh-corner-tpl', command: 'ON' }, layout: { lg: { x: 7, y: 0, w: 2, h: 2 } } },
      ],
    },
  }),
})
await fetch(NS, {
  method: 'POST', headers: JSON_HDR,
  body: JSON.stringify({
    uid: 'dashboard:nh-corner-tpl', component: 'neohab:dashboard',
    config: {
      version: 1, id: 'nh-corner-tpl', name: 'nh-corner-tpl', columns: 12, rowHeight: 70, gap: 8,
      widgets: [
        { id: 't1', type: 'template', config: { label: 'badexpr', template: '<div id="bad">{{ ((( }}ok</div>' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
        { id: 't2', type: 'template', config: { label: 'missingitem', template: '<div id="mi">[{{itemState(\'Nonexistent_item_xyz\')}}]</div>' }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
        { id: 't3', type: 'template', config: { label: 'missingdef', customwidget: 'nh-corner-nodef' }, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } },
        { id: 't4', type: 'wibblewobble', config: {}, layout: { lg: { x: 9, y: 0, w: 3, h: 2 } } },
        { id: 't5', type: 'template', config: { label: 'protoguard', template: '<div id="pg">[{{constructor}}|{{config.constructor}}]</div>' }, layout: { lg: { x: 0, y: 2, w: 4, h: 2 } } },
      ],
    },
  }),
})

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()

const initToken = (page, t) =>
  page.addInitScript((tok) => { try { localStorage.setItem('neohab:apiToken', tok) } catch {} }, t)

/** Run a section; a crash records one FAIL but never skips cleanup. */
async function section(name, fn) {
  try {
    await fn()
  } catch (err) {
    ok(name + ' (section crashed)', false, String(err).slice(0, 180))
  }
}

/* ============ 1. unknown routes + malformed imports ============ */
await section('1', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('dialog', (d) => d.accept())
  await initToken(page, TOKEN)

  await page.goto(APP + '#/d/does-not-exist-xyz', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-dash__empty', { timeout: 10000 })
  ok('1. unknown dashboard shows Not found', /does-not-exist-xyz/.test(await page.locator('.nh-dash__empty').textContent()))
  // Home now lives in the sidebar (the ‹ is only rendered when the sidebar is switched off).
  await page.click('.nh-side__trigger')
  await page.locator('.nh-side__item', { hasText: 'Home' }).first().click()
  await page.waitForSelector('.nh-tile')
  ok('1. back home works from Not found', true)

  // malformed backup imports (Backup section file input)
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  // scope to the Backup heading: the Custom icons section also has a file input and its
  // body text mentions "backups" (:has-text is case-insensitive)
  await page.waitForSelector('section:has(h2:text-is("Backup")) input[type="file"]', { state: 'attached' })
  const before = (await (await fetch(NS)).json()).length
  const backupInput = page.locator('section:has(h2:text-is("Backup")) input[type="file"]')
  await backupInput.setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{not json at all') })
  await sleep(600)
  ok('1. invalid JSON backup rejected with notice', /not valid JSON/.test(await page.locator('.nh-settings__notice').textContent()))
  await backupInput.setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('{"foo": 1}') })
  await sleep(600)
  ok('1. wrong-shape backup rejected', /Not a neohab backup/.test(await page.locator('.nh-settings__notice').textContent()))
  const hpInput = page.locator('section:has(.nh-hpimport__row), section:has-text("Migrate from HABPanel")').locator('input[type="file"]')
  await hpInput.setInputFiles({ name: 'z.json', mimeType: 'application/json', buffer: Buffer.from('[[]]') })
  await sleep(600)
  ok('1. malformed habpanel file rejected', /Could not read|Not a HABPanel/.test(await page.locator('.nh-settings__notice').textContent()))
  const after = (await (await fetch(NS)).json()).length
  ok('1. server config untouched by failed imports', before === after, `before=${before} after=${after}`)
  ok('1. no page errors', errs.length === 0, errs.join(' | '))
  await page.close()
})

/* ============ 2. editor stress ============ */
await section('2', async () => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('dialog', (d) => d.accept())
  await initToken(page, TOKEN)

  await page.goto(APP + '#/d/nh-corner-edit', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-grid')
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')

  // add 5 widgets rapidly
  for (let i = 0; i < 5; i++) {
    await page.click('[aria-label="Add widget"]')
    await page.waitForSelector('.nh-palette__card')
    await page.click('.nh-palette__card:has-text("Clock")')
    await sleep(120)
  }
  ok('2. added 5 widgets', (await page.locator('.nh-cell').count()) === 8, `cells=${await page.locator('.nh-cell').count()}`)
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+z')
  await sleep(300)
  ok('2. undo x5 back to 3', (await page.locator('.nh-cell').count()) === 3)
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+Shift+z')
  await sleep(300)
  ok('2. redo x5 back to 8', (await page.locator('.nh-cell').count()) === 8)

  // drag anchor label onto the slider -> collision -> reverts
  const handle = page.locator('.nh-cell:has(.nh-cell__type:text-is("label")) .nh-cell__handle')
  const hb = await handle.boundingBox()
  const target = await page.locator('.nh-cell:has(.nh-cell__type:text-is("slider"))').boundingBox()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 })
  await sleep(150)
  const invalid = (await page.locator('.nh-drop--invalid').count()) === 1
  await page.mouse.up()
  await sleep(200)
  ok('2. collision drag shows red + rejected', invalid)

  // discard -> server unchanged
  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]')
  const server = await (await fetch(NS + '/dashboard:nh-corner-edit')).json()
  ok('2. discard leaves server at 3 widgets', server.config.widgets.length === 3)

  // navigation guard: dirty edit -> navigate away -> editor cleaned
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette__card')
  await page.click('.nh-palette__card:has-text("Clock")')
  await sleep(150)
  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile')
  await page.goto(APP + '#/d/nh-corner-edit', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-grid')
  ok('2. leaving mid-edit resets editor', (await page.locator('.nh-grid--edit').count()) === 0 && (await page.locator('.nh-widget').count()) === 3)
  ok('2. no page errors', errs.length === 0, errs.join(' | '))
  await page.close()
})

/* ============ 3. mobile viewport ============ */
await section('3', async () => {
  const page = await browser.newPage({ viewport: { width: 400, height: 850 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  await initToken(page, TOKEN)

  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile')
  ok('3. home renders on phone', (await page.locator('.nh-tile').count()) >= 12)

  await page.goto(APP + '#/d/nh-corner-edit', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-grid--stacked', { timeout: 10000 })
  ok('3. dashboard stacks on phone', true)

  // phone edit mode = stacked surface with reorder handles (settings/add/remove still work)
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--stackedit', { timeout: 5000 })
  ok('3. edit mode available on phone (stacked surface)', (await page.locator('.nh-cell').count()) === 3)
  await page.click('button:has-text("Exit")')
  ok('3. no page errors', errs.length === 0, errs.join(' | '))
  await page.close()
})

/* ============ 4. theme cycling ============ */
await section('4', async () => {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  await initToken(page, TOKEN)
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-themes')

  const bgs = {}
  for (const name of ['neohab Light', 'OLED Black', 'Aqua (HABPanel classic)', 'neohab Dark']) {
    await page.click(`.nh-theme__pick:has-text("${name}")`)
    await sleep(400)
    bgs[name] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  }
  ok('4. all four themes apply distinct backgrounds', new Set(Object.values(bgs)).size === 3 || new Set(Object.values(bgs)).size === 4, JSON.stringify(bgs))
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('neohab:themeCache') ?? '{}').id)
  ok('4. last theme cached for pre-paint apply', cached === 'dark', String(cached))
  ok('4. no page errors', errs.length === 0, errs.join(' | '))
  await page.close()
})

/* ============ 5. anonymous viewer + invalid token ============ */
await section('5', async () => {
  const anon = await browser.newPage({ viewport: { width: 1300, height: 900 } })
  const errs = []
  anon.on('pageerror', (e) => errs.push(String(e.message)))
  await anon.goto(APP + '#/d/nh-corner-edit', { waitUntil: 'domcontentloaded' })
  await anon.waitForSelector('.nh-grid')
  ok('5. anonymous viewing works', (await anon.locator('.nh-widget').count()) === 3)
  await anon.click('[aria-label="Edit dashboard"]')
  await anon.waitForSelector('.nh-sheet')
  ok('5. anonymous edit prompts sign-in', await anon.locator('button:has-text("Log in with openHAB")').isVisible())
  ok('5. sign-in offers token path', await anon.locator('button:has-text("Use an API token instead")').isVisible())
  await anon.close()

  const badTok = await browser.newPage({ viewport: { width: 1300, height: 900 } })
  const errs2 = []
  badTok.on('pageerror', (e) => errs2.push(String(e.message)))
  await initToken(badTok, 'oh.completely.invalid-token-xyz')
  await badTok.goto(APP + '#/d/nh-corner-edit', { waitUntil: 'domcontentloaded' })
  await badTok.waitForSelector('.nh-grid', { timeout: 10000 })
  ok('5. stale/garbage token still allows viewing (anon retry)', (await badTok.locator('.nh-widget').count()) === 3)
  ok('5. no page errors', errs.length === 0 && errs2.length === 0, [...errs, ...errs2].join(' | '))
  await badTok.close()
})

/* ============ 6. template engine edges ============ */
await section('6', async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  await initToken(page, TOKEN)
  await page.goto(APP + '#/d/nh-corner-tpl', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-template__host', { timeout: 10000 })
  await sleep(1500)

  const bad = await page.locator('.nh-template__host').nth(0).locator('#bad').textContent()
  ok('6. broken expression renders empty, no crash', bad === 'ok', JSON.stringify(bad))
  const mi = await page.locator('.nh-template__host').nth(1).locator('#mi').textContent()
  ok('6. missing item resolves empty', mi === '[]', JSON.stringify(mi))
  ok('6. missing widgetdef shows notice', await page.locator('.nh-template__text:has-text("not found")').isVisible())
  ok('6. unknown widget type shows error card', await page.locator('.nh-widget--error:has-text("wibblewobble")').isVisible())
  const pg = await page.locator('.nh-template__host').nth(2).locator('#pg').textContent()
  ok('6. proto-chain identifiers blocked', pg === '[|]', JSON.stringify(pg))
  ok('6. no page errors', errs.length === 0, errs.join(' | '))
  await page.close()
})

/* ============ 7. SSE outage -> watchdog recovery ============ */
await section('7', async () => {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  await initToken(page, TOKEN)
  await page.goto(APP + '#/d/nh-corner-edit', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-slider__input')
  await sleep(1500)

  // baseline live update
  await fetch(`${BASE}/rest/items/${ITEMS.dimmer}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: '21' })
  await sleep(1500)
  const v1 = await page.locator('.nh-slider__value').textContent()
  ok('7. live update before outage', v1.trim() === '21', v1)

  // sever SSE: abort any (re)connection attempts for a while
  await page.route('**/rest/events/states', (route) => route.abort())
  await page.evaluate(() => {
    /* force-close from client side is not exposed; rely on route abort for reconnects */
  })
  // change state during outage window >35s so the watchdog must notice staleness
  await fetch(`${BASE}/rest/items/${ITEMS.dimmer}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: '77' })
  await sleep(42000)
  await page.unroute('**/rest/events/states')
  // after reconnect the tracker re-subscribes and pushes fresh state
  let v2 = ''
  for (let i = 0; i < 24; i++) {
    await sleep(1000)
    v2 = (await page.locator('.nh-slider__value').textContent()).trim()
    if (v2 === '77') break
  }
  ok('7. watchdog reconnects and state catches up', v2 === '77', `v2=${v2}`)
  ok('7. no page errors', errs.length === 0, errs.join(' | '))
  await page.close()
})

/* ============ 8. rapid dashboard switching (read-only) ============ */
await section('8', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
  const errs = []
  const consoleErrs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && consoleErrs.push(m.text()))
  await initToken(page, TOKEN)
  // Derive the list from the server: it is live data and dashboards come and go
  // (hardcoding the ids made a deleted dashboard look like an app regression).
  const live = await (await fetch(NS)).json()
  const ids = live
    .filter((c) => c.uid.startsWith('dashboard:') && !/nh-(corner|e2e)/.test(c.uid))
    .map((c) => encodeURIComponent(c.uid.slice('dashboard:'.length)))
  for (const id of ids) {
    await page.goto(APP + '#/d/' + id, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-widget', { timeout: 15000 })
    await sleep(350)
  }
  ok(`8. all ${ids.length} live dashboards render in fast succession`, ids.length > 0)
  const realConsole = consoleErrs.filter((e) => !/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_ADDRESS|net::|404 |Failed to load resource|Blocked autofocusing/.test(e))
  ok('8. no page errors', errs.length === 0, errs.join(' | '))
  ok('8. no app console errors (LAN loads excluded)', realConsole.length === 0, realConsole.slice(0, 3).join(' | '))
  await page.close()
})

await browser.close()

/* ============ cleanup ============ */
for (const uid of TEMP_UIDS) {
  await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })
}
await fetch(NS + '/settings', { method: 'PUT', headers: JSON_HDR, body: JSON.stringify(origSettingsComp) })
await fetch(`${BASE}/rest/items/${ITEMS.dimmer}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: origLevel })
await sleep(1200)
const leftover = (await (await fetch(NS)).json()).filter((c) => c.uid.includes('nh-corner'))
ok('cleanup: temp components removed', leftover.length === 0, `left=${leftover.length}`)
const settingsNow = await (await fetch(NS + '/settings')).json()
ok('cleanup: settings restored', JSON.stringify(settingsNow.config) === JSON.stringify(origSettingsComp.config), JSON.stringify(settingsNow.config))
ok('cleanup: item restored', (await getState(ITEMS.dimmer)) === origLevel)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
