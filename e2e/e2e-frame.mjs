// Frame widget e2e: a page from an address and from a String item holding one, with reload, the timestamp
// switch, a #fragment, background, the sandbox an item-chosen address always gets, and every state it cannot
// show. SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-frame (neohab:config), and on
// a non-production target the managed items nh_e2e_frameurl, nh_e2e_frameflip, nh_e2e_framehtml,
// nh_e2e_framenull, nh_e2e_framebad, nh_e2e_framemix, nh_e2e_framenum. Commands nothing: every state is set
// over REST. On production it creates no item and runs the address sections only. On a plain-http target it
// also serves one page from a throwaway server on 127.0.0.1, for the browser under test and nothing else.
import http from 'node:http'
import { launchBrowser } from './lib/browser.mjs'
import { APP, AUTH, BASE, HTTPS, NS, PLAIN_HTTP, PRODUCTION, TOKEN, UNREACHABLE, isAppResource } from './lib/target.mjs'
import { skipOnProduction } from './lib/guard.mjs'
import { pickItem } from './lib/ui.mjs'

const UID = 'dashboard:nh-e2e-frame'
const DASH = 'nh-e2e-frame'
const STR = 'nh_e2e_frameurl'
const FLIP = 'nh_e2e_frameflip'
const HTML = 'nh_e2e_framehtml'
const NUL = 'nh_e2e_framenull'
const BAD = 'nh_e2e_framebad'
const MIX = 'nh_e2e_framemix'
const NUM = 'nh_e2e_framenum'
const ITEMS_MADE = [STR, FLIP, HTML, NUL, BAD, MIX, NUM]
const TILE = BASE + '/neohab/tile.png'
// openHAB sends an Image item's bytes as whatever type they claim, so this is a page anyone who may change
// an item can publish on the server's own origin
const ATTACK = BASE + '/rest/items/' + HTML + '/state'
const ELSEWHERE = UNREACHABLE + 'neohab-e2e.invalid/page'
const CLEAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>')
// an address on another origin that redirects to the page above, answered by a route
const REDIRECT = UNREACHABLE + 'neohab-e2e-hop.invalid/redirect'
const PROBE_PAGE =
  '<!doctype html><title>probe</title><script>var r;try{r="read:"+(parent.localStorage.getItem("neohab:apiToken")?"token":"none")}catch(e){r="blocked:"+e.name}parent.postMessage({nhFrameProbe:r},"*")</script>'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (n, v) =>
  fetch(itemUrl(n) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name: n, label }),
  })
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

const frame = (label, config, x, y, w = 3, h = 4) => ({ id: 'w-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), type: 'frame', config: { label, ...config }, layout: { lg: { x, y, w, h } } })

const WIDGETS = [
  frame('Static', { source: 'url', url: TILE }, 0, 0),
  frame('Busted', { source: 'url', url: TILE + '?b=1', refresh: 1 }, 3, 0),
  frame('NoSuffix', { source: 'url', url: TILE + '?ns=1', refresh: 1, cacheBust: false }, 6, 0),
  frame('Fragment', { source: 'url', url: TILE + '?f=1#/route?tab=2', refresh: 1 }, 9, 0),
  // stored before the widget had a source, a timestamp switch or a background
  { id: 'w-legacy', type: 'frame', config: { url: TILE, label: 'Legacy', refresh: 0, sandbox: false }, layout: { lg: { x: 0, y: 4, w: 3, h: 4 } } },
  frame('Hostile cfg', { source: 'constructor', url: 42, item: {}, cacheBust: 'no', background: {}, refresh: 'abc', sandbox: 'yes' }, 3, 4),
  frame('Unset', { source: 'item' }, 6, 4),
  // a page with nothing painted on it, so whatever is behind it is what shows
  frame('Coloured', { source: 'url', url: CLEAR, background: '#ff00ff' }, 9, 4),
  frame('Script url', { source: 'url', url: 'data:text/html,<script>parent.nhOwned=1</script>' }, 0, 8),
]
if (!PRODUCTION) {
  WIDGETS.push(
    frame('Address', { source: 'item', item: STR }, 3, 8),
    frame('AddressRefresh', { source: 'item', item: STR, refresh: 1 }, 6, 8),
    // the switch says off, and an item-chosen address must be sandboxed anyway
    frame('Flip', { source: 'item', item: FLIP, sandbox: false }, 9, 8),
    // the control: the same page typed in by the author with the sandbox off, which is allowed to read
    frame('Typed', { source: 'url', url: ATTACK, sandbox: false }, 0, 12),
    frame('Empty', { source: 'item', item: NUL }, 3, 12),
    frame('Hostile addr', { source: 'item', item: BAD }, 6, 12),
    frame('Picture', { source: 'item', item: HTML }, 9, 12),
    frame('Missing', { source: 'item', item: 'nh_e2e_frame_nonesuch' }, 0, 16),
    frame('Mixed', { source: 'item', item: MIX }, 3, 16)
  )
}

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
const errs = []
const posts = []
const frameLoads = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const url = m.location?.()?.url
  if (!isAppResource(url)) return
  // the one tile pointed at an item the server does not have, on purpose
  if (/nh_e2e_frame_nonesuch/.test(m.text() + (url ?? ''))) return
  errs.push(m.text() + (url ? ' <- ' + url : ''))
})
page.on('dialog', (d) => d.accept().catch(() => {}))
page.on('request', (r) => {
  if (r.isNavigationRequest() && r.frame() !== page.mainFrame()) frameLoads.push(r.url())
})
await page.route('**/neohab-e2e-hop.invalid/**', (r) => r.fulfill({ status: 302, headers: { Location: ATTACK }, body: '' }))
// and a page on another origin that sends its own frame there. It has to be a real server: Chrome will not
// let a page with no address (a route) navigate into a local network, and an http page cannot be framed over
// TLS, so this one is left out of an https run
let hopServer = null
let HOP = null
if (!HTTPS && !PRODUCTION) {
  hopServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!doctype html><script>location.href=' + JSON.stringify(ATTACK) + '</script>')
  })
  await new Promise((r) => hopServer.listen(0, '127.0.0.1', r))
  HOP = `http://127.0.0.1:${hopServer.address().port}/page`
}
await page.route('**/rest/items/**', (r) => {
  if (r.request().method() === 'POST') posts.push(r.request().url())
  return r.continue()
})
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
  if (window.top !== window) return
  window.__probes = []
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.nhFrameProbe !== 'string') return
    const f = [...document.querySelectorAll('iframe')].find((x) => x.contentWindow === e.source)
    window.__probes.push({ title: f ? f.title : null, sandbox: f ? f.getAttribute('sandbox') : null, result: e.data.nhFrameProbe })
  })
}, TOKEN)

const look = (label) =>
  probe(
    page,
    (l) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      if (!w) return null
      const el = w.querySelector('iframe.nh-frame')
      return {
        src: el?.getAttribute('src') ?? null,
        sandbox: el?.getAttribute('sandbox') ?? null,
        bg: el ? getComputedStyle(el).backgroundColor : null,
        mark: el?.dataset.mark ?? null,
        text: (w.querySelector('.nh-image__placeholder, .nh-widget__unset, .nh-widget__errtitle')?.textContent ?? '').trim(),
        error: !!w.closest('.nh-gcell')?.querySelector('.nh-widget--error'),
      }
    },
    label
  )
const waitLook = async (label, want, ms = 8000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await look(label)
    if (last && want(last)) return last
    await sleep(150)
  }
  return last
}
const mark = (labels) =>
  page.evaluate((ls) => {
    for (const l of ls) {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const el = w?.querySelector('iframe.nh-frame')
      if (el) el.dataset.mark = 'first'
    }
  }, labels)
const probes = () => probe(page, () => window.__probes ?? []).then((p) => p ?? [])
const waitProbe = async (title, since, ms = 8000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const found = (await probes()).slice(since).filter((p) => p.title === title)
    if (found.length) return found[found.length - 1]
    await sleep(150)
  }
  return null
}
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
      : JSON.stringify(v)
const brief = (l) => (l ? JSON.stringify(l) : 'null')
const historyLength = () => probe(page, () => history.length)
const near = (px, want) => Array.isArray(px) && px.every((v, i) => Math.abs(v - want[i]) <= 6)
// what is on screen in the middle of a tile's frame, read off a screenshot
const pixelOf = async (label) => {
  const el = page.locator('.nh-widget', { has: page.locator('.nh-widget__labeltext', { hasText: new RegExp('^' + label + '$') }) }).locator('iframe.nh-frame').first()
  const shot = await el.screenshot({ timeout: 5000 }).catch(() => null)
  if (!shot) return null
  return probe(
    page,
    async (b64) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const d = g.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data
      return [d[0], d[1], d[2]]
    },
    shot.toString('base64')
  )
}

try {
  let attackServed = false
  if (!PRODUCTION) {
    for (const n of ITEMS_MADE) await fetch(itemUrl(n), { method: 'DELETE', headers: AUTH }).catch(() => {})
    await makeItem(STR, 'String', 'NH E2E Frame Address')
    await makeItem(FLIP, 'String', 'NH E2E Frame Flip')
    await makeItem(HTML, 'Image', 'NH E2E Frame Page')
    await makeItem(NUL, 'String', 'NH E2E Frame Empty')
    await makeItem(BAD, 'String', 'NH E2E Frame Hostile')
    await makeItem(MIX, 'String', 'NH E2E Frame Mixed')
    await makeItem(NUM, 'Number', 'NH E2E Frame Number')
    await putState(STR, TILE + '?s=1')
    await putState(FLIP, ELSEWHERE)
    await putState(HTML, 'data:text/html;base64,' + Buffer.from(PROBE_PAGE).toString('base64'))
    await putState(NUL, 'NULL')
    await putState(BAD, 'javascript:parent.nhOwned=1')
    await putState(MIX, PLAIN_HTTP + '/neohab/tile.png')
    await putState(NUM, '5')
    // what a frame asks for, with no account: the case this server has to be in for the sandbox to matter
    const served = await fetch(ATTACK, { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }).catch(() => null)
    const type = served?.headers.get('content-type') ?? ''
    attackServed = served?.status === 200 && /^text\/html/.test(type)
    console.log(`note: with no account this server answers the Image item's page with ${served?.status} ${type}`)
  }

  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 2, id: DASH, name: 'E2E Frame', columns: 12, rowHeight: 40, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)
  const seeded = canonical(WIDGETS)

  await page.goto(APP + '#/d/' + DASH)
  await page.waitForSelector('.nh-widget', { timeout: 20000 }).catch(() => {})
  await waitLook('Static', (l) => l.src !== null)
  await sleep(500)
  const historyAtStart = await historyLength()

  const crashed = await probe(page, () =>
    [...document.querySelectorAll('.nh-widget--error')].filter((w) => !w.textContent.includes('nh_e2e_frame_nonesuch')).length
  )
  ok('no tile fell back to the error boundary', crashed === 0, 'error tiles=' + crashed)

  // ---- addresses: everything here needs no item, so it runs on every target
  const stat = await look('Static')
  ok('a typed address loads exactly as written, and its author decides about the sandbox', stat && stat.src === TILE && stat.sandbox === null && stat.bg === 'rgb(255, 255, 255)', brief(stat))
  const legacy = await look('Legacy')
  ok('a frame stored before sources existed still loads its address, the way it always did', legacy && legacy.src === TILE && legacy.sandbox === null, brief(legacy))
  const hostile = await look('Hostile cfg')
  ok('a configuration of the wrong shape everywhere says there is no address instead of breaking', hostile && hostile.src === null && hostile.text === 'No URL configured' && !hostile.error, brief(hostile))
  const unset = await look('Unset')
  ok('an item source with no item yet says to pick one', unset && unset.src === null && /No item yet/.test(unset.text), brief(unset))
  const coloured = await look('Coloured')
  const colouredPx = await pixelOf('Coloured')
  ok(
    'a background colour shows through a page that paints nothing, on a dark theme too',
    coloured && coloured.src === CLEAR && coloured.bg === 'rgb(255, 0, 255)' && near(colouredPx, [255, 0, 255]),
    `bg=${coloured?.bg} pixel=${JSON.stringify(colouredPx)}`
  )
  const script = await look('Script url')
  ok(
    'a typed address that could run script in this page is refused',
    script && script.src === null && script.text === 'That page address cannot be embedded.' && (await probe(page, () => window.nhOwned)) == null,
    brief(script)
  )

  const loadsBefore = frameLoads.length
  await mark(['NoSuffix'])
  await sleep(3500)
  const reloads = frameLoads.slice(loadsBefore)
  const busted = await look('Busted')
  const bustedLoads = new Set(reloads.filter((u) => /tile\.png\?b=1&_=\d+$/.test(u)))
  ok(
    'a reload adds a fresh timestamp after the address’s own parameters, and each one is a new load',
    busted && /\/neohab\/tile\.png\?b=1&_=\d+$/.test(busted.src) && bustedLoads.size >= 2,
    `${busted?.src} distinct timestamped loads=${bustedLoads.size}`
  )
  const nosuffix = await look('NoSuffix')
  ok(
    'with the timestamp off the address is never changed, and each reload is a new frame',
    nosuffix && nosuffix.src === TILE + '?ns=1' && nosuffix.mark === null && !frameLoads.some((u) => u.includes('ns=1') && /[?&]_=/.test(u)),
    brief(nosuffix)
  )
  const frag = await look('Fragment')
  ok(
    'the timestamp goes before a #fragment, which the page keeps its own route in',
    frag && /\/neohab\/tile\.png\?f=1&_=\d+#\/route\?tab=2$/.test(frag.src) && reloads.some((u) => /tile\.png\?f=1&_=\d+/.test(u)),
    frag?.src
  )

  if (!skipOnProduction(ok, 'the String item sections create items')) {
    // ---- a String item: its state is the address
    const addr = await waitLook('Address', (l) => l.src !== null)
    ok(
      'a String item is read as the address of the page, which loads sandboxed',
      addr && addr.src === TILE + '?s=1' && addr.sandbox === 'allow-scripts',
      brief(addr)
    )
    const addrRefresh = await waitLook('AddressRefresh', (l) => /[?&]_=\d+$/.test(l.src ?? ''), 6000)
    ok('and a reload adds the timestamp to the address it holds', addrRefresh && /\/neohab\/tile\.png\?s=1&_=\d+$/.test(addrRefresh.src), brief(addrRefresh))
    await mark(['Address'])
    await putState(STR, TILE + '?v=2')
    const moved = await waitLook('Address', (l) => l.src === TILE + '?v=2')
    ok('a new address in the item loads in a new frame', moved && moved.src === TILE + '?v=2' && moved.mark === null && moved.sandbox === 'allow-scripts', brief(moved))

    // ---- the sandbox: everything an item chooses gets it, whatever the origin, because a page in a frame
    // without one can send that frame anywhere afterwards, and the sandbox is fixed when the frame is made
    const elsewhere = await waitLook('Flip', (l) => l.src !== null)
    ok('an item’s address on another origin is sandboxed too, though the stored switch is off', elsewhere && elsewhere.src === ELSEWHERE && elsewhere.sandbox === 'allow-scripts', brief(elsewhere))
    if (attackServed) {
      const typed = await waitProbe('Typed', 0)
      ok(
        'control: the same page typed in by the author with the sandbox off can read this page’s session',
        typed && typed.result === 'read:token' && typed.sandbox === null,
        JSON.stringify(typed)
      )
      let since = (await probes()).length
      await putState(FLIP, ATTACK)
      const flipped = await waitProbe('Flip', since)
      const flipLook = await look('Flip')
      ok(
        'an item pointed at a page anyone may write on openHAB loads it sandboxed, so it cannot read the session',
        flipped && /^blocked:/.test(flipped.result) && flipped.sandbox === 'allow-scripts' && flipLook?.src === ATTACK,
        JSON.stringify(flipped) + ' ' + brief(flipLook)
      )
      if (HOP) {
        since = (await probes()).length
        await putState(FLIP, HOP)
        const hopped = await waitProbe('Flip', since)
        const hopLook = await look('Flip')
        ok(
          'a page on another origin that sends its own frame there cannot read the session either',
          hopped && /^blocked:/.test(hopped.result) && hopLook?.src === HOP && hopLook.sandbox === 'allow-scripts',
          JSON.stringify(hopped) + ' sandbox=' + hopLook?.sandbox
        )
      } else {
        ok('SKIP: a page that sends its own frame there needs a plain-http target', true)
      }
      since = (await probes()).length
      await putState(FLIP, REDIRECT)
      const redirected = await waitProbe('Flip', since)
      const redirectLook = await look('Flip')
      ok(
        'nor one that redirects there',
        redirected && /^blocked:/.test(redirected.result) && redirectLook?.src === REDIRECT && redirectLook.sandbox === 'allow-scripts',
        JSON.stringify(redirected) + ' sandbox=' + redirectLook?.sandbox
      )
    } else {
      ok('SKIP: the sandbox proof needs a server that serves an Image item’s page to a visitor with no account', true)
    }
    await putState(FLIP, ELSEWHERE)

    const empty = await waitLook('Empty', (l) => l.text !== '')
    ok('a String item with no state says it has no address yet', empty && empty.text === 'This item has no address yet.' && empty.src === null, brief(empty))
    const bad = await waitLook('Hostile addr', (l) => l.text !== '')
    ok(
      'a String item holding an address that could run script is refused',
      bad && bad.src === null && bad.text === 'That page address cannot be embedded.' && (await probe(page, () => window.nhOwned)) == null,
      brief(bad)
    )
    const pic = await waitLook('Picture', (l) => l.text !== '')
    ok('an Image item is not loaded as a page, and says why', pic && pic.src === null && pic.text === 'This item holds a picture, not a page address.', brief(pic))
    const missing = await waitLook('Missing', (l) => l.text === 'nh_e2e_frame_nonesuch')
    ok('an item the server does not have is named on the tile', missing && missing.src === null && missing.text === 'nh_e2e_frame_nonesuch', brief(missing))
    const mixed = await waitLook('Mixed', (l) => l.src !== null || /HTTPS/.test(l.text))
    if (HTTPS) {
      ok('over HTTPS a String item’s http:// address is reported, not silently blocked', mixed && mixed.src === null && /served over HTTPS/.test(mixed.text), brief(mixed))
    } else {
      ok('over plain http a String item’s http:// address loads', mixed && mixed.src === PLAIN_HTTP + '/neohab/tile.png', brief(mixed))
    }

    // ---- the hold sheet, pressed on the name row: the frame only reads its item, so the sheet offers nothing
    const labelEl = page.locator('.nh-gcell .nh-widget__labeltext', { hasText: /^Address$/ }).first()
    await labelEl.scrollIntoViewIfNeeded().catch(() => {})
    const b = await labelEl.boundingBox().catch(() => null)
    if (b) {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.down()
      await sleep(750)
      await page.mouse.up()
      await sleep(400)
    }
    let sheet = null
    for (let i = 0; i < 30; i++) {
      sheet = await probe(page, () => {
        const d = document.querySelector('.nh-detail')
        return d ? { range: d.querySelectorAll('input[type="range"]').length, buttons: d.querySelectorAll('.nh-quickbtns, .nh-detail__control button').length, text: (d.textContent ?? '').slice(0, 800) } : null
      })
      if (sheet && sheet.text.includes('tile.png?v=2')) break
      await sleep(150)
    }
    ok('a hold on its name opens the item’s sheet with the address and no control', sheet && sheet.range === 0 && sheet.buttons === 0 && sheet.text.includes('tile.png?v=2'), JSON.stringify(sheet))
    await page.keyboard.press('Escape').catch(() => {})
    await sleep(400)
  }

  // reloads, new addresses and a sandbox flip all happened above; none of them may be a step back
  const historyAfter = await historyLength()
  ok('no reload or new address added a step to the browser’s Back', historyAtStart !== null && historyAfter === historyAtStart, `history ${historyAtStart} -> ${historyAfter}`)
  // and the measurement can see one: a loaded frame sent somewhere else does add a step
  await probe(page, (u) => {
    const f = [...document.querySelectorAll('iframe.nh-frame')].find((x) => x.title === 'Static')
    if (f) f.src = u
  }, TILE + '?control=1')
  await sleep(1200)
  const historyControl = await historyLength()
  ok('control: sending a loaded frame to a new address in place does add one', historyControl === historyAfter + 1, `history ${historyAfter} -> ${historyControl}`)

  if (!PRODUCTION) {
    // ---- the settings panel
    await page.reload()
    await page.waitForSelector('.nh-widget', { timeout: 20000 }).catch(() => {})
    await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
    const editCell = (label) => page.locator('.nh-cell', { has: page.locator('.nh-widget__labeltext', { hasText: new RegExp('^' + label + '$') }) }).first()
    await editCell('Address').click({ timeout: 5000 }).catch(() => {})
    await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
    const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
    const sourceSel = field('Page source').locator('select').first()
    const panel = async () => ({
      source: await sourceSel.inputValue({ timeout: 3000 }).catch(() => null),
      options: await sourceSel.locator('option').count().catch(() => -1),
      url: await field('Page URL').count(),
      item: await field('openHAB Item').count(),
      itemValue: await field('openHAB Item').locator('input').first().inputValue({ timeout: 3000 }).catch(() => null),
      sandbox: await field('Sandbox the embedded page').count(),
      stamp: await field('Add a timestamp to the address when refreshing').count(),
      background: await field('Background').count(),
    })
    const first = await panel()
    ok(
      'an item-bound frame offers its item instead of an address, and no sandbox switch',
      first.source === 'item' && first.options === 2 && first.url === 0 && first.item === 1 && first.itemValue === STR && first.sandbox === 0 && first.stamp === 0 && first.background === 1,
      JSON.stringify(first)
    )
    await sourceSel.selectOption('url', { timeout: 5000 }).catch(() => {})
    await sleep(300)
    const asUrl = await panel()
    ok('switching to an address brings back the address field and the sandbox switch', first.item === 1 && asUrl.source === 'url' && asUrl.url === 1 && asUrl.item === 0 && asUrl.sandbox === 1, JSON.stringify(asUrl))
    await sourceSel.selectOption('item', { timeout: 5000 }).catch(() => {})
    await sleep(300)

    const input = field('openHAB Item').locator('input').first()
    await input.fill('', { timeout: 5000 }).catch(() => {})
    await input.click({ timeout: 5000 }).catch(() => {})
    // a partial name: an exact one binds itself, and the list is what this asks about
    await page.keyboard.type('nh_e2e_fra', { delay: 40 })
    await sleep(600)
    const offered = await probe(page, () => [...document.querySelectorAll('.nh-picker__option .nh-picker__name')].map((e) => e.textContent.trim()))
    ok(
      'the item picker offers String items and leaves Image and Number items out',
      Array.isArray(offered) && offered.includes(STR) && offered.includes(NUL) && offered.includes(FLIP) && !offered.includes(HTML) && !offered.includes(NUM),
      JSON.stringify(offered)
    )
    await input.fill('', { timeout: 5000 }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
    const landed = (await input.count()) > 0 ? await pickItem(page, input, NUL) : '<no item field>'
    ok('picking another String item from the picker binds it', landed === NUL, landed)
    const swapped = await waitLook('Address', (l) => l.text === 'This item has no address yet.', 6000)
    ok('and the tile follows the new item straight away', swapped && swapped.src === null && swapped.text === 'This item has no address yet.', brief(swapped))

    await page.keyboard.press('Escape').catch(() => {})
    await editCell('Busted').click({ timeout: 5000 }).catch(() => {})
    await sleep(500)
    const stampField = field('Add a timestamp to the address when refreshing')
    const stampShown = await stampField.count()
    const stampOn = await stampField.locator('input[type="checkbox"]').first().isChecked({ timeout: 3000 }).catch(() => null)
    // the hint is the field's next sibling, not inside it
    const stampHint = await stampField.locator('xpath=following-sibling::*[1][contains(@class, "nh-field__hint")]').textContent({ timeout: 3000 }).catch(() => null)
    await editCell('NoSuffix').click({ timeout: 5000 }).catch(() => {})
    await sleep(500)
    const stampOff = await field('Add a timestamp to the address when refreshing').locator('input[type="checkbox"]').first().isChecked({ timeout: 3000 }).catch(() => null)
    ok(
      'a reloading frame offers the timestamp switch, on unless it was turned off, and its hint is about pages',
      stampShown === 1 && stampOn === true && stampOff === false && /keep showing the page/.test(stampHint ?? ''),
      JSON.stringify({ stampShown, stampOn, stampOff, stampHint: (stampHint ?? '').slice(0, 50) })
    )

    await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
    await sleep(800)
    const stored = await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })
      .then((r) => r.json())
      .catch(() => null)
    const same = !!stored && canonical(stored.config.widgets) === seeded
    ok('leaving the editor without saving left the dashboard as it was', same, stored ? (same ? 'stored widgets identical to the seed' : 'stored widgets differ from the seed') : 'unreadable')
  }

  ok('nothing was commanded', posts.length === 0, posts.slice(0, 3).join(' | '))
  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  hopServer?.close()
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  if (!PRODUCTION) for (const item of ITEMS_MADE) await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => c.uid === UID).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboard removed', left.length === 0, left.join(','))
  const itemsLeft = []
  for (const item of ITEMS_MADE) {
    const r = await fetch(itemUrl(item), { headers: AUTH }).catch(() => null)
    if (r && r.status === 200) itemsLeft.push(item)
  }
  ok('cleanup: test items removed', itemsLeft.length === 0, itemsLeft.join(','))
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log('\n' + (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') + '  (' + (results.length - failed.length) + '/' + results.length + ')')
  process.exitCode = failed.length === 0 ? 0 : 1
}
