/**
 * The walk a stranger takes, on a server that has never seen neohab.
 *
 * Not a widget suite: it drives the screens somebody meets in their first ten minutes, and checks
 * that what the app SAYS matches what the server can actually do. That is the part no other suite
 * covers, because every other suite signs in first and runs against a lived-in install.
 *
 * It reads the server's version over REST and then asserts the UI agrees with THAT, so the same
 * run is meaningful on openHAB 3.1 and on 5.x - the version-aware shape the proxy and wake-lock
 * suites already use.
 *
 *   NEOHAB_E2E_TARGET=<target>.json node audit-newuser.mjs
 *
 * It creates one dashboard and removes it, and writes nothing else.
 */
import { launchBrowser } from './lib/browser.mjs'
import { getComponent } from './lib/components.mjs'
import { APP, AUTH, BASE, NS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-audit-newuser'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`)
}

const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

// ---- what this server actually is, so every expectation below is derived rather than assumed ----
const root = await (await fetch(BASE + '/rest/', { headers: AUTH })).json()
const rawVersion = root.runtimeInfo?.version ?? root.version
const m = /^\s*(\d+)(?:\.(\d+))?/.exec(String(rawVersion))
const major = Number(m?.[1] ?? 0)
const minor = Number(m?.[2] ?? 0)
const atLeast = (ma, mi) => major > ma || (major === ma && minor >= mi)
const hasLogSocket = atLeast(4, 1)
const hasTagsApi = atLeast(4, 0)
const hasAnonPresets = atLeast(4, 0)
const expectedGaps = [!hasLogSocket && 'log', !hasTagsApi && 'tags', !hasAnonPresets && 'presets'].filter(Boolean)

console.log(`server: openHAB ${rawVersion}  (log socket ${hasLogSocket}, tags api ${hasTagsApi})`)

const browser = await launchBrowser()

// ---------------------------------------------------------------- 1. the deployment itself ----
{
  const index = await fetch(APP)
  ok('1. /neohab/index.html is served', index.status === 200, 'status=' + index.status)
  const html = await index.text()
  const bundle = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)?.[0]
  ok('1. the page names a bundle', !!bundle, bundle ?? 'none')
  const asset = await fetch(BASE + '/neohab/' + bundle)
  ok('1. that bundle is served', asset.status === 200, 'status=' + asset.status)
  // an add-on that does not appear on the openHAB start page is one a new user cannot find
  const tiles = await (await fetch(BASE + '/rest/ui/tiles')).json()
  ok(
    '1. neohab appears on the openHAB start page',
    Array.isArray(tiles) && tiles.some((x) => x.name === 'neohab'),
    JSON.stringify(tiles?.map?.((x) => x.name) ?? tiles)
  )
  const tile = await fetch(BASE + '/neohab/tile.png')
  ok('1. its tile image loads', tile.status === 200, 'status=' + tile.status)
}

// ------------------------------------------------- 2. the first screen, with no account at all ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && isAppResource(msg.location()?.url)) errors.push(msg.text().slice(0, 160))
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)))

  await page.goto(APP)
  await page.waitForSelector('.nh-welcome, .nh-dash', { timeout: 20000 }).catch(() => {})
  await sleep(1200)

  const seen = await probe(page, () => ({
    welcome: !!document.querySelector('.nh-welcome'),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
    links: [...document.querySelectorAll('a')].map((a) => a.textContent?.trim()).filter(Boolean),
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean)
  }))
  ok('2. a stranger gets a welcome screen, not a blank page', seen?.welcome === true, (seen?.text ?? '').slice(0, 120))
  ok(
    '2. it offers a way to find out what neohab is',
    (seen?.links ?? []).some((l) => /guide|start/i.test(l)),
    JSON.stringify(seen?.links ?? [])
  )
  ok(
    '2. it offers a way to sign in',
    (seen?.buttons ?? []).some((b) => /sign in/i.test(b)),
    JSON.stringify(seen?.buttons ?? []).slice(0, 160)
  )
  ok('2. no console errors on the first screen', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// ------------------------------------------------------- 3. the guide the welcome screen links ----
{
  const guide = await fetch(BASE + '/neohab/docs/getting-started.html')
  ok('3. the getting started guide is served from the jar', guide.status === 200, 'status=' + guide.status)
  const body = await guide.text()
  ok('3. it has real content, not an empty shell', body.length > 2000, 'bytes=' + body.length)
}

// -------------------------------------------- 4. signed in: build the first dashboard by hand ----
{
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-audit-newuser',
        name: 'Audit',
        columns: 12,
        rowHeight: 40,
        gap: 6,
        widgets: [{ id: 'w1', type: 'log', config: { label: 'Server log', source: 'openhab' }, layout: { lg: { x: 0, y: 0, w: 6, h: 6 } } }]
      }
    })
  })
  ok('4. a dashboard can be written to the server', seed.status === 200, 'status=' + seed.status)

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && isAppResource(msg.location()?.url)) errors.push(msg.text().slice(0, 160))
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)))
  await page.addInitScript((tok) => localStorage.setItem('neohab:apiToken', tok), AUTH.Authorization.replace('Bearer ', ''))

  await page.goto(APP + '#/d/nh-audit-newuser')
  await page.waitForSelector('.nh-log', { timeout: 20000 }).catch(() => {})
  await sleep(9000)

  const log = await probe(page, () => {
    const el = document.querySelector('.nh-log')
    return {
      status: el?.getAttribute('data-status') ?? null,
      text: el?.parentElement?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
      lines: el?.querySelectorAll('.nh-log__line').length ?? 0,
      errored: !!document.querySelector('.nh-widget--error')
    }
  })
  ok('4. the log tile renders and does not fall into the error boundary', log && !log.errored, JSON.stringify(log).slice(0, 200))

  if (hasLogSocket) {
    ok('4. on 4.1+ the log connects and carries lines', log?.status === 'live', JSON.stringify(log).slice(0, 200))
  } else {
    // the whole point of the change: a server with no log feed is told so, once, and named
    ok('4. on an older server the log tile reports unsupported', log?.status === 'unsupported', JSON.stringify(log).slice(0, 200))
    ok(
      '4. it names the openHAB version it needs',
      /openHAB 4\.1 or newer/i.test(log?.text ?? ''),
      (log?.text ?? '').slice(0, 200)
    )
    ok(
      '4. it names the version this server actually is',
      (log?.text ?? '').includes(String(rawVersion)),
      (log?.text ?? '').slice(0, 200)
    )
    ok('4. it does not claim to be retrying', !/retry|retrying/i.test(log?.text ?? ''), (log?.text ?? '').slice(0, 200))
  }
  ok('4. no console errors while the dashboard is open', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// ---------------------------------------- 5. Settings, About: what this server cannot do ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.addInitScript((tok) => localStorage.setItem('neohab:apiToken', tok), AUTH.Authorization.replace('Bearer ', ''))
  await page.goto(APP + '#/settings')
  await page.waitForSelector('.nh-about', { timeout: 20000 }).catch(() => {})
  await sleep(2500)

  const about = await probe(page, () => {
    const dl = document.querySelector('.nh-about')
    const rows = {}
    let key = null
    for (const el of dl?.children ?? []) {
      if (el.tagName === 'DT') key = el.textContent?.trim() ?? null
      else if (el.tagName === 'DD' && key) rows[key] = el.innerText.replace(/\s+/g, ' ').trim()
    }
    return { rows, gapItems: [...document.querySelectorAll('.nh-about__gaps li')].map((li) => li.textContent?.trim()) }
  })
  const ohRow = Object.entries(about?.rows ?? {}).find(([k]) => /openhab/i.test(k))?.[1] ?? ''
  ok('5. About names the server version', ohRow.includes(String(rawVersion)), ohRow.slice(0, 120))

  const items = about?.gapItems ?? []
  if (expectedGaps.length === 0) {
    ok('5. a modern server is told nothing is missing', items.length === 0, JSON.stringify(items))
  } else {
    ok(
      `5. About lists exactly the ${expectedGaps.length} gap(s) this server has`,
      items.length === expectedGaps.length,
      `expected ${JSON.stringify(expectedGaps)} got ${JSON.stringify(items)}`
    )
    if (!hasLogSocket) {
      ok('5. the log gap is named with its version', items.some((x) => /log widget/i.test(x) && /4\.1/.test(x)), JSON.stringify(items))
    }
    if (!hasTagsApi) {
      ok('5. the semantic tag gap is named with its version', items.some((x) => /semantic tag/i.test(x) && /4\.0/.test(x)), JSON.stringify(items))
    }
    if (!hasAnonPresets) {
      ok('5. the signed-out preset gap is named', items.some((x) => /floor plan/i.test(x)), JSON.stringify(items))
    }
  }
  await ctx.close()
}

// ------------------------------------ 6. the generator, which is where /rest/tags is asked for ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  const requested = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && isAppResource(msg.location()?.url)) errors.push(msg.text().slice(0, 160))
  })
  page.on('request', (r) => {
    if (r.url().includes('/rest/tags')) requested.push(r.url())
  })
  await page.addInitScript((tok) => localStorage.setItem('neohab:apiToken', tok), AUTH.Authorization.replace('Bearer ', ''))
  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile--new, .nh-welcome', { timeout: 20000 }).catch(() => {})
  if (await page.$('.nh-tile--new')) {
    await page.click('.nh-tile--new')
    await page.waitForSelector('button:has-text("Generate from my items…")', { timeout: 8000 }).catch(() => {})
    await page.click('button:has-text("Generate from my items…")').catch(() => {})
  } else {
    await page.click('button:has-text("Generate from my items")').catch(() => {})
  }
  // the source step is the generator actually up and surveying, which is what asks for the tags
  const opened = await page
    .waitForSelector('[data-source="prefix"]', { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  ok('6. the generator opens and reaches its source step', opened === true)
  await sleep(2500)

  // a passing "was asked" check has to see a request; requests=0 would otherwise read as a pass
  if (hasTagsApi) {
    ok('6. a 4.0+ server IS asked for its semantic tags', opened && requested.length > 0, `requests=${requested.length}`)
  } else {
    ok('6. an older server is never asked for /rest/tags', opened && requested.length === 0, `requests=${requested.length}`)
  }
  const sources = await probe(page, () => [...document.querySelectorAll('[data-source]')].length)
  ok('6. the generator offers its sources whatever the server can do', (sources ?? 0) >= 3, 'sources=' + sources)
  ok('6. no console errors from the tags probe', errors.length === 0, errors.join(' | ').slice(0, 300))
  await ctx.close()
}

// --------------------------------------------------------------------------------- cleanup ----
{
  const del = await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
  ok('cleanup: the audit dashboard is removed', del.ok, 'status=' + del.status)
  const gone = await getComponent(NS + '/' + UID)
  ok('cleanup: it is really gone', gone === null)
}

await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${failed.length === 0 ? 'ALL PASS' : failed.length + ' FAILED'}  (${results.length} checks, openHAB ${rawVersion})`)
process.exitCode = failed.length === 0 ? 0 : 1
