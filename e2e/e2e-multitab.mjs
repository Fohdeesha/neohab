/**
 * Multiple tabs open against the same server.
 *
 * Event streams are permanent connections and a browser only allows six per origin for ALL its
 * tabs together, so a tab that opens its own quickly starves the origin: before the tab link,
 * the third neohab tab rendered its dashboard and then sat there dead, because the POST that
 * tells the server which items to track could never get a socket. One tab now holds the stream
 * for the whole browser and relays states to the rest.
 *
 * Covers: many tabs all live, exactly one connection holder, relayed state changes, the union of
 * different dashboards' items, handover when the holder closes, and the notice a tab shows when
 * updates really have stopped.
 *
 * SAFE: creates only dashboard:nh-e2e-mt*, deletes exactly those, and commands only the
 * configured dimmer item - recorded first and restored at the end.
 */
import { launchChromium } from './lib/browser.mjs'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await launchChromium({ channel: c, headless: true }) } catch {} } return launchChromium({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const created = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const put = async (comp) => {
  await fetch(NS + '/' + comp.uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(comp) })
  if (r.ok) created.push(comp.uid)
  return r.ok
}
const itemState = async (name) => (await fetch(`${BASE}/rest/items/${name}/state`, { headers: AUTH }).then((r) => r.text())).trim()
const command = async (name, value) => fetch(`${BASE}/rest/items/${name}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(value) })

const dash = (id, name, item) => ({
  uid: `dashboard:${id}`,
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1, id, name, columns: 12, rowHeight: 'match', gap: 5,
    widgets: [{ id: 'v1', type: 'value', config: { item, label: 'Val' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
  },
})

// The dimmer carries the relay checks; the temperature item only has to differ from it so that
// two dashboards need genuinely different items (the union check).
await put(dash('nh-e2e-mt', 'E2E Multitab', ITEMS.dimmer))
await put(dash('nh-e2e-mt2', 'E2E Multitab 2', ITEMS.temperature))

const initialDimmer = await itemState(ITEMS.dimmer)

/** Count the streams a tab holds, and remember them across reloads. */
const INSTRUMENT = () => {
  window.__streams = []
  const Orig = window.EventSource
  window.EventSource = class extends Orig {
    constructor(url, init) {
      super(url, init)
      window.__streams.push(String(url).includes('/states') ? 'states' : 'audio')
    }
  }
}

const browser = await launchBrowser()
const errors = []
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
  await ctx.addInitScript(INSTRUMENT)

  const value = (p) => p.locator('.nh-value__text').first().innerText().catch(() => '(none)')
  const streams = (p) => p.evaluate(() => window.__streams ?? [])
  const openTab = async (id = 'nh-e2e-mt') => {
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push(String(e)))
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await p.goto(`${BASE}/neohab/index.html#/d/${id}`, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('.nh-widget', { timeout: 20000 }).catch(() => {})
    return p
  }

  /* ---------- 1. six tabs, all live ---------- */
  const tabs = []
  for (let i = 0; i < 6; i++) tabs.push(await openTab())
  await sleep(5000)

  const values = []
  for (const p of tabs) values.push(await value(p))
  const allLive = values.every((v) => v !== '(none)' && v !== '-')
  ok('six tabs all show item state (3rd tab was dead before the tab link)', allLive, values.join(' | '))

  /* ---------- 2. exactly one tab holds the connections ---------- */
  const perTab = []
  for (const p of tabs) perTab.push(await streams(p))
  const holders = perTab.filter((s) => s.length > 0)
  ok('exactly one tab opens streams', holders.length === 1, perTab.map((s, i) => `tab${i + 1}=[${s}]`).join(' '))
  ok('the other five open none', perTab.filter((s) => s.length === 0).length === 5)
  const totalStreams = perTab.flat().length
  ok('whole browser holds at most two streams', totalStreams <= 2, `total=${totalStreams}`)

  /* ---------- 2b. the web-audio stream: on the holder, and only when the server has the sink -------- */
  const sinks = await fetch(`${BASE}/rest/audio/sinks`, { headers: AUTH }).then((r) => r.json()).catch(() => [])
  const hasWebAudio = Array.isArray(sinks) && sinks.some((s) => s.id === 'webaudio')
  const holderStreams = holders[0] ?? []
  if (hasWebAudio) {
    // Sharing must not quietly switch the feature off: the holder carries it for everyone.
    ok('the holder also carries the web-audio stream', holderStreams.includes('audio'), `[${holderStreams}]`)
  } else {
    ok('no web-audio stream when the server has no such sink', !holderStreams.includes('audio'), `[${holderStreams}]`)
  }

  /* ---------- 3. a state change reaches every tab ---------- */
  const target = String((Number(initialDimmer) || 0) === 55 ? 45 : 55)
  await command(ITEMS.dimmer, target)
  await sleep(3000)
  const after = []
  for (const p of tabs) after.push(await value(p))
  ok('every tab receives the relayed state change', after.every((v) => v.replace(/[^\d.]/g, '').startsWith(target)), after.join(' | '))

  /* ---------- 4. tabs on different dashboards each get their own items ---------- */
  const other = await openTab('nh-e2e-mt2')
  await sleep(4000)
  const otherValue = await value(other)
  const stillLive = await value(tabs[0])
  ok('a tab on another dashboard gets its own item tracked', otherValue !== '(none)' && otherValue !== '-', `other=${otherValue}`)
  ok('adding it does not disturb the first dashboard', stillLive.replace(/[^\d.]/g, '').startsWith(target), `first=${stillLive}`)
  const otherStreams = await streams(other)
  ok('the new tab opens no stream of its own', otherStreams.length === 0, `[${otherStreams}]`)

  /* ---------- 4b. audio relayed from the holder plays in a follower ---------- */
  {
    const follower = tabs.find((_, i) => i !== perTab.findIndex((s) => s.length > 0))
    await follower.route('**/nh-e2e-relay.wav', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from('RIFF$\x00\x00\x00WAVEfmt ', 'binary') })
    )
    await follower.evaluate(() => {
      window.__played = []
      HTMLAudioElement.prototype.play = function () {
        window.__played.push(this.src)
        return Promise.resolve()
      }
    })
    // Stand in for the holder's stream: the relay itself is what this checks.
    await follower.evaluate((url) => {
      new BroadcastChannel('neohab:tablink').postMessage({ t: 'playurl', url, from: 'e2e-holder' })
    }, `${BASE}/nh-e2e-relay.wav`)
    await sleep(1500)
    const played = await follower.evaluate(() => window.__played ?? [])
    ok('a follower plays audio relayed by the holder', played.length === 1, `played=${played.length}`)
  }

  /* ---------- 5. handover when the connection holder closes ---------- */
  const holderIndex = perTab.findIndex((s) => s.length > 0)
  await tabs[holderIndex].close()
  const survivors = tabs.filter((_, i) => i !== holderIndex)
  let handover = false
  for (let i = 0; i < 20 && !handover; i++) {
    await sleep(1000)
    for (const p of survivors) if ((await streams(p)).length > 0) handover = true
    if (!handover && (await streams(other)).length > 0) handover = true
  }
  ok('another tab takes over the connection', handover)

  const target2 = target === '55' ? '35' : '55'
  await command(ITEMS.dimmer, target2)
  await sleep(3000)
  const afterHandover = []
  for (const p of survivors) afterHandover.push(await value(p))
  ok('states keep flowing to every surviving tab after handover', afterHandover.every((v) => v.replace(/[^\d.]/g, '').startsWith(target2)), afterHandover.join(' | '))

  for (const p of survivors) await p.close()
  await other.close()

  /* ---------- 6. a tab that really has no updates says so ---------- */
  {
    const solo = await ctx.newPage()
    // Block the stream outright: no relay, no reconnect - exactly what a dead link looks like.
    await solo.route('**/rest/events/states**', (route) => route.abort())
    await solo.goto(`${BASE}/neohab/index.html#/d/nh-e2e-mt`, { waitUntil: 'domcontentloaded' })
    const appeared = await solo.waitForSelector('.nh-live', { timeout: 25000 }).then(() => true).catch(() => false)
    ok('a tab with no live connection shows the notice', appeared)
    const text = appeared ? await solo.locator('.nh-live').innerText() : ''
    ok('the notice explains that states may be stale', /out of date/i.test(text), text.slice(0, 70))
    const clickable = appeared ? await solo.locator('.nh-live').evaluate((el) => getComputedStyle(el).pointerEvents) : ''
    ok('the notice never swallows taps', clickable === 'none', clickable)
    await solo.unroute('**/rest/events/states**')
    await solo.reload({ waitUntil: 'domcontentloaded' })
    await solo.waitForSelector('.nh-widget', { timeout: 20000 }).catch(() => {})
    const gone = await solo.waitForSelector('.nh-live', { timeout: 12000, state: 'detached' }).then(() => true).catch(() => true)
    const visible = await solo.locator('.nh-live').count()
    ok('the notice clears once updates resume', gone && visible === 0, `count=${visible}`)
    await solo.close()
  }

  /* ---------- 7. no console noise anywhere ---------- */
  const real = errors.filter((e) => !/Failed to load resource/i.test(e))
  ok('no page errors across all tabs', real.length === 0, real.slice(0, 2).join(' | '))
} finally {
  await browser.close()
  await command(ITEMS.dimmer, initialDimmer).catch(() => {})
  await sleep(500)
  const restored = await itemState(ITEMS.dimmer).catch(() => '?')
  ok(`dimmer restored to its initial state (${initialDimmer})`, restored === initialDimmer, `got=${restored}`)
  for (const uid of created) await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH }).then((r) => r.json()).then((l) => l.filter((c) => c.uid.includes('nh-e2e-mt'))).catch(() => [])
  ok('cleanup left nothing behind', left.length === 0, `left=${left.length}`)
}

let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exitCode = failed ? 1 : 0
