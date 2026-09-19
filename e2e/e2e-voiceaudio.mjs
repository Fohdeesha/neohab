// Voice & audio e2e: the Settings section, the TTS speech item (spoken on change, primed at boot, per-device
// mute), the web-audio sink (synthetic SSE events.
// SAFE with a live config: creates only dashboard:nh-e2e-voice (deleted), patches the `settings` component
// and restores it VERBATIM, commands only the configured dimmer.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, ITEMS, HTTPS } from './lib/target.mjs'
import { getSettings, patchSettings, putComponent, restoreSettings, settingsWithoutKeys } from './lib/components.mjs'

const UID = 'dashboard:nh-e2e-voice'
const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const getItem = async (name) => (await fetch(`${APP.replace('/neohab/index.html', '')}/rest/items/${name}`, { headers: AUTH })).json()
const postItem = (name, cmd) =>
  fetch(`${APP.replace('/neohab/index.html', '')}/rest/items/${name}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'text/plain' },
    body: String(cmd),
  })

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const settingsOrig = await getSettings()
const dimmer = ITEMS.dimmer
const dimmerOrig = (await getItem(dimmer)).state
console.log(`snapshot: settings ${settingsOrig ? 'present' : 'absent'}, ${dimmer}=${dimmerOrig}`)

// the mic button follows a SHARED setting, so establish it rather than assume whoever runs this
// server left it alone - absent is its default, which is on. Before the browser exists: after a page
// has fetched the configuration once, the next navigation in that context reads its own cached copy.
const micReady = await putComponent(NS, settingsWithoutKeys(settingsOrig, ['voiceButton']))
console.log(`voice button setting established for this run: ${micReady.status}`)

const browser = await launch()

try {
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: 'nh-e2e-voice', name: 'nh-e2e-voice', columns: 12, rowHeight: 'match',
        widgets: [{ id: 'w-clk', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 3 } } }],
      },
    }),
  })

  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Voice & audio")', { timeout: 15000 })
    ok('Voice & audio section present', true)
    ok('play-audio toggle present and on by default', await page.isChecked('#nh-set-playaudio'))
    ok('speak toggle present and on by default', await page.isChecked('#nh-set-speak'))
    ok('per-device voice select present', (await page.locator('#nh-set-voice').count()) === 1)
    ok('Test voice button present', (await page.locator('button:has-text("Test voice")').count()) === 1)
    const unavailable = await page.locator('text=The microphone button needs a Chromium browser and HTTPS.').count()
    ok(
      HTTPS
        ? 'no unavailable notice over HTTPS, where voice input can work'
        : 'voice input honestly marked unavailable on plain HTTP',
      unavailable === (HTTPS ? 0 : 1),
      'notices ' + unavailable
    )
    ok('speech item picker present (admin)', (await page.locator('#nh-set-speechitem').count()) === 1)
    ok('voice button toggle present (admin)', (await page.locator('#nh-set-voicebtn').count()) === 1)

    await page.goto(APP + '#/d/nh-e2e-voice', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 10000 })
    const mic = await page.locator('[aria-label="Voice command"]').count()
    ok(
      HTTPS ? 'the mic button is offered over HTTPS' : 'mic button absent on plain HTTP',
      mic === (HTTPS ? 1 : 0),
      'buttons ' + mic
    )
    const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
    ok('settings section: no page errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
    await page.close()
  }

  {
    const wrote = await patchSettings(settingsOrig, { speechItem: dimmer })
    ok('speech item configured', wrote.ok, `${wrote.status} (server had settings: ${!!settingsOrig})`)

    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page.addInitScript((t) => {
      try { localStorage.setItem('neohab:apiToken', t) } catch {}
      window.__spoken = []
      speechSynthesis.speak = (u) => { window.__spoken.push(u.text) }
    }, TOKEN)
    await page.goto(APP + '#/d/nh-e2e-voice', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-clock', { timeout: 15000 })
    await sleep(2500) // let the speech item's current state arrive and prime

    ok('boot state not spoken (primed)', (await page.evaluate(() => window.__spoken.length)) === 0)

    const target1 = Math.round(Number(dimmerOrig)) === 57 ? 62 : 57
    await postItem(dimmer, target1)
    await page.waitForFunction((v) => window.__spoken.some((s) => s.includes(String(v))), target1, { timeout: 8000 }).catch(() => {})
    const spoken = await page.evaluate(() => window.__spoken)
    ok('state change spoken aloud', spoken.some((s) => s.includes(String(target1))), JSON.stringify(spoken))
    await page.close()

    const page2 = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page2.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
        localStorage.setItem('neohab:audio', JSON.stringify({ speak: false }))
      } catch {}
      window.__spoken = []
      speechSynthesis.speak = (u) => { window.__spoken.push(u.text) }
    }, TOKEN)
    await page2.goto(APP + '#/d/nh-e2e-voice', { waitUntil: 'domcontentloaded' })
    await page2.waitForSelector('.nh-clock', { timeout: 15000 })
    await sleep(2000)
    const target2 = target1 === 57 ? 62 : 57
    await postItem(dimmer, target2)
    await sleep(3000)
    ok('muted device does not speak', (await page2.evaluate(() => window.__spoken.length)) === 0)
    await page2.close()
  }

  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    let audioFetches = 0
    let sseServed = 0
    let mode = 'play' // flipped to 'stop' after the first play is observed

    const wav = Buffer.concat([
      Buffer.from('RIFF'), Buffer.from([36 + 8, 0, 0, 0]), Buffer.from('WAVEfmt '),
      Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x80, 0x3e, 0, 0, 2, 0, 16, 0]),
      Buffer.from('data'), Buffer.from([8, 0, 0, 0]), Buffer.alloc(8),
    ])

    await page.route((url) => url.pathname.endsWith('/audio/nh-e2e-test.wav'), async (route) => {
      audioFetches++
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: wav })
    })
    await page.route((url) => url.pathname === '/rest/events' && (url.search || '').includes('webaudio'), async (route) => {
      sseServed++
      const payload = mode === 'play' ? '"/audio/nh-e2e-test.wav"' : '""'
      const body =
        'event: alive\ndata: {"type":"ALIVE","interval":10}\n\n' +
        `data: {"topic":"openhab/webaudio/playurl","payload":${JSON.stringify(payload)},"type":"PlayURLEvent"}\n\n`
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
    })

    await page.addInitScript((t) => {
      try { localStorage.setItem('neohab:apiToken', t) } catch {}
      window.__plays = []
      window.__pauses = 0
      HTMLAudioElement.prototype.play = function () { window.__plays.push(this.src); return Promise.resolve() }
      const origPause = HTMLAudioElement.prototype.pause
      HTMLAudioElement.prototype.pause = function () { window.__pauses++; return origPause.call(this) }
    }, TOKEN)

    await page.goto(APP + '#/d/nh-e2e-voice', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__plays.length > 0, undefined, { timeout: 15000 }).catch(() => {})
    ok('audio event plays the served stream', (await page.evaluate(() => window.__plays.length)) === 1)
    ok('stream fetched exactly once', audioFetches === 1, `fetches=${audioFetches}`)

    const seen = sseServed
    await sleep(4000)
    ok('SSE stream was re-delivered (reconnects happen)', sseServed > seen, `served=${sseServed}`)
    ok('replayed event de-duplicated (still one play)', (await page.evaluate(() => window.__plays.length)) === 1)

    mode = 'stop'
    await page.waitForFunction(() => window.__pauses > 0, undefined, { timeout: 20000 }).catch(() => {})
    ok('empty-URL event stops playback', (await page.evaluate(() => window.__pauses)) > 0)
    await page.close()

    const page2 = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    let sseHits = 0
    await page2.route((url) => url.pathname === '/rest/events' && (url.search || '').includes('webaudio'), async (route) => {
      sseHits++
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
    })
    await page2.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
        localStorage.setItem('neohab:audio', JSON.stringify({ playAudio: false }))
      } catch {}
    }, TOKEN)
    await page2.goto(APP + '#/d/nh-e2e-voice', { waitUntil: 'domcontentloaded' })
    await page2.waitForSelector('.nh-clock', { timeout: 15000 })
    await sleep(2500)
    ok('audio disabled: no event stream opened', sseHits === 0, `hits=${sseHits}`)
    await page2.close()
  }
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
const settingsBack = await restoreSettings(settingsOrig)
ok(`cleanup: settings ${settingsBack.mode}`, settingsBack.ok, settingsBack.detail)
await postItem(dimmer, dimmerOrig)
await new Promise((r) => setTimeout(r, 1200))
const dimmerAfter = (await getItem(dimmer)).state
ok('cleanup: dimmer restored', String(dimmerAfter) === String(dimmerOrig), `${dimmerAfter} vs ${dimmerOrig}`)
{
  const r = await fetch(NS + '/' + UID, { headers: AUTH })
  ok('cleanup: test dashboard absent', !r.ok)
}

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
