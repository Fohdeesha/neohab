/**
 * Camera widget verification.
 *
 * Covers the transport chain, the failure paths, the off-screen policy, tap actions and the
 * settings form. The live-video sections need a camera server in the target configuration
 * ("camera": {kind, server, stream}); without one they self-skip and the rest still runs. The
 * screensaver section deliberately needs no camera server: what it observes is the teardown.
 *
 * Two checks exist because of bugs found by probing a real go2rtc, and both fail on a build
 * without their fix:
 *   - a transport that yields one frame and then dies (a transmuxer mis-parsing a stream) must
 *     be demoted and the chain continued, not retried forever;
 *   - "playing" must mean decoded video, not merely a loadeddata event, or an audio-only
 *     outcome ends the chain on a permanently black cell.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-camera / -camtall and deletes exactly
 * those uids in cleanup (guarded). NO item commands anywhere.
 */
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, CAMERA, UNREACHABLE, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-camera'
const UID_TALL = 'dashboard:nh-e2e-camtall'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const skip = (name, why) => results.push({ name, skip: true, detail: why })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await context.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  // A refused cross-origin WebSocket is the expected, handled outcome for a server that has
  // not opted in; it is the reason the chain exists and must not fail the console check.
  if (/WebSocket connection to .* failed/.test(t)) return
  // "Failed to load resource: 404" names nothing on its own, and a failure nobody can act on is
  // barely a failure. Pair it with the URL, and let a camera host that does not answer be the
  // camera's problem rather than the app's - this suite deliberately points at unreachable ones.
  const url = m.location()?.url ?? ''
  if (url && !isAppResource(url)) return
  errs.push('console: ' + t + (url ? ' <- ' + url : ''))
})
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

const camConfig = (over = {}) => ({
  label: 'Cam', source: CAMERA?.kind ?? 'go2rtc', server: CAMERA?.server ?? UNREACHABLE + 'camera.invalid:1984',
  stream: CAMERA?.stream ?? 'nope', tapAction: 'none', offscreen: 'keep', ...over,
})

/** Replace the test dashboard (POST does not overwrite an existing uid) and load it fresh. */
async function seed(widgets, uid = UID, extra = {}) {
  await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, {
    method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid, component: 'neohab:dashboard',
      config: { version: 1, id: uid.split(':')[1], name: 'E2E Camera', columns: 12, rowHeight: 40, gap: 8, widgets, ...extra },
    }),
  })
  return r.ok
}

async function open(uid = UID) {
  // only the hash differs between loads, which alone would be a same-document navigation
  await page.goto('about:blank')
  await page.goto(APP + '#/d/' + uid.split(':')[1], { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('.nh-camera, .nh-widget', { timeout: 15000 })
}

const cell = (config, layout = { x: 0, y: 0, w: 6, h: 6 }, id = 'w1') => ({ id, type: 'camera', config, layout: { lg: layout } })

const state = () => page.evaluate(() => {
  const host = document.querySelector('.nh-camera__host')
  const v = host?.querySelector('video')
  const img = host?.querySelector('img')
  const q = v?.getVideoPlaybackQuality?.()
  return {
    child: host?.firstElementChild?.tagName ?? null,
    status: document.querySelector('.nh-camera__status')?.textContent ?? null,
    badge: document.querySelector('.nh-camera__badge')?.textContent ?? null,
    hint: document.querySelector('.nh-camera__hint')?.textContent ?? null,
    tap: !!document.querySelector('.nh-camera__tap'),
    video: v ? { w: v.videoWidth, frames: q?.totalVideoFrames ?? 0 } : null,
    img: img ? { w: img.naturalWidth } : null,
  }
})

/** Look inside the embedded player (Playwright reaches cross-origin frames). */
async function innerVideo() {
  for (const f of page.frames()) {
    if (!f.url().includes('stream.html')) continue
    return await f.evaluate(() => {
      const v = document.querySelector('video')
      const q = v?.getVideoPlaybackQuality?.()
      return v ? { w: v.videoWidth, h: v.videoHeight, frames: q?.totalVideoFrames ?? 0, dropped: q?.droppedVideoFrames ?? 0 } : null
    }).catch(() => null)
  }
  return null
}

try {
  // ---------- 1. unconfigured ----------
  ok('seed unconfigured', await seed([cell({ label: 'Cam', source: 'go2rtc', server: '', stream: '' })]))
  await open()
  ok('unconfigured says so', (await state()).status === 'No camera configured', (await state()).status)
  ok('unconfigured has no tap target', !(await state()).tap)

  // ---------- 2. the palette offers it ----------
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette', { timeout: 5000 })
  ok('palette lists Camera', await page.locator('.nh-palette button:has-text("Camera")').first().isVisible())
  await page.keyboard.press('Escape')

  // ---------- 3. live video (needs a camera server) ----------
  if (!CAMERA) {
    skip('live video', 'no "camera" in target configuration')
  } else {
    ok('seed auto', await seed([cell(camConfig({ transport: 'auto' }))]))
    await open()
    await sleep(7000)
    const auto = await state()
    const inner = await innerVideo()
    // Cross-origin WebSocket transports are refused unless the server opts in, so on a stock
    // go2rtc the chain is expected to land on the embedded player - which still runs WebRTC.
    const playing = auto.status === null
    ok('auto: reaches a playing state', playing, JSON.stringify(auto))
    const decoded = inner ? inner.frames > 0 && inner.w > 0 : (auto.video?.frames ?? 0) > 0
    ok('auto: decodes real video frames', decoded, JSON.stringify(inner ?? auto.video))

    ok('seed snapshot', await seed([cell(camConfig({ transport: 'snapshot', snapshotInterval: 1 }))]))
    await open()
    await sleep(4000)
    const snap = await state()
    ok('snapshot: shows an image', snap.child === 'IMG' && snap.status === null, JSON.stringify(snap))
    // regression: the poll used to blank the element for the whole round trip
    ok('snapshot: image stays decoded between polls', (snap.img?.w ?? 0) > 0, JSON.stringify(snap.img))
  }

  // ---------- 3b. the chain falls back when the signalling socket is refused ----------
  // A stock go2rtc rejects cross-origin WebSocket upgrades (403), which is what takes WebRTC and
  // MSE off the table and leaves the server's own player page as the best remaining route.
  // Refusing the socket in the browser reproduces that on any server, including one that has
  // opted in - so this stays meaningful whatever the target is configured to allow.
  if (!CAMERA) {
    skip('fallback when the socket is refused', 'no "camera" in target configuration')
  } else {
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const p2 = await ctx2.newPage()
    await p2.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    await p2.routeWebSocket('**/api/ws**', (ws) => ws.close())

    await seed([cell(camConfig({ transport: 'auto' }))])
    const t0 = Date.now()
    await p2.goto(APP + '#/d/' + UID.split(':')[1], { waitUntil: 'domcontentloaded', timeout: 20000 })
    await p2.waitForSelector('.nh-camera', { timeout: 15000 })

    let embedded = false
    while (Date.now() - t0 < 20000) {
      if ((await p2.evaluate(() => document.querySelector('.nh-camera__host')?.firstElementChild?.tagName)) === 'IFRAME') {
        embedded = true
        break
      }
      await sleep(150)
    }
    const fellBackMs = Date.now() - t0
    ok('refused socket: falls back to the embedded player', embedded, `after ${fellBackMs}ms`)

    // The embedded player is NOT asserted to be showing video here, and cannot be: the route
    // above refuses WebSockets in every frame, including the player's own - which in reality is
    // same-origin and therefore allowed, and is exactly why this fallback is worth having. That
    // it plays is covered by the "auto: decodes real video frames" check against the live server.
    //
    // This documents the known limitation instead: a cross-origin frame cannot be inspected, so
    // reaching it is as far as the widget can tell. If that ever becomes detectable, this check
    // fails and should be replaced by a real one.
    // the element appears before its load event, so give the status a moment to clear
    let status = 'Connecting…'
    const until = Date.now() + 10000
    while (Date.now() < until) {
      status = await p2.evaluate(() => document.querySelector('.nh-camera__status')?.textContent ?? null)
      if (status === null) break
      await sleep(200)
    }
    ok('refused socket: a cross-origin player is trusted once it loads (known limitation)', status === null, String(status))
    await ctx2.close()
  }

  // ---------- 3c. a transport that fails AFTER its first-frame watcher exists ----------
  // The watcher is armed before the signalling work, so a throw in that work (an offer that
  // cannot be created, a socket that closes mid-handshake) left the watcher running with nobody
  // awaiting it: its own 8s connect timeout then rejected into nothing, surfacing as an unhandled
  // rejection in the console long after the chain had already moved on. Making createOffer reject
  // is a deterministic stand-in for that whole class.
  if (!CAMERA) {
    skip('a mid-handshake failure leaves nothing dangling', 'no "camera" in target configuration')
  } else {
    const ctx3 = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const p3 = await ctx3.newPage()
    const late = []
    p3.on('pageerror', (e) => late.push('pageerror: ' + e.message))
    p3.on('console', (m) => {
      if (m.type() !== 'error') return
      const t = m.text()
      if (/WebSocket connection to .* failed/.test(t)) return
      late.push('console: ' + t)
    })
    await p3.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
      // Fail the offer, so WebRTC dies after its watcher is already armed. Top frame only: an
      // init script runs in EVERY frame, so left unguarded this also breaks the offer inside the
      // embedded third-party player the chain falls back to, and that page's own unhandled
      // rejection reads exactly like one of ours. What is under test is how this app settles the
      // work it abandoned, not how someone else's page handles a broken browser.
      if (window.top === window && window.RTCPeerConnection) {
        window.RTCPeerConnection.prototype.createOffer = () => Promise.reject(new Error('e2e: no offer'))
      }
    }, TOKEN)

    await seed([cell(camConfig({ transport: 'auto' }))])
    await p3.goto(APP + '#/d/' + UID.split(':')[1], { waitUntil: 'domcontentloaded', timeout: 20000 })
    await p3.waitForSelector('.nh-camera', { timeout: 15000 })
    // Long enough to cover the abandoned watcher's own 8s connect timeout.
    await sleep(12000)
    const phase = await p3.evaluate(() => document.querySelector('.nh-camera__status')?.textContent ?? null)
    ok(
      'a mid-handshake failure leaves nothing dangling (no late unhandled rejection)',
      late.length === 0,
      late.slice(0, 3).join(' | ')
    )
    ok(
      'and the chain still moved past the broken transport',
      phase === null || !/Connecting/.test(phase),
      String(phase)
    )
    await ctx3.close()
  }

  // ---------- 4. a transport that cannot work ends the chain (no infinite retry) ----------
  // Counts how many times a <video> is inserted: a demoted transport is tried once, whereas the
  // pre-fix build restarted the whole chain every few seconds forever.
  const badUrl = (CAMERA?.server ?? UNREACHABLE + 'camera.invalid:1984') + '/api/stream.m3u8?src=definitely-not-a-stream'
  ok('seed dead stream', await seed([cell({ label: 'Dead', source: 'url', url: badUrl, transport: 'hls', tapAction: 'none', offscreen: 'keep' })]))
  await page.goto('about:blank')
  await page.addInitScript(() => {
    window.__videoAdds = 0
    const tick = () => {
      const cam = document.querySelector('.nh-camera')
      if (!cam) return setTimeout(tick, 100)
      new MutationObserver((rs) => {
        for (const r of rs) for (const n of r.addedNodes) if (n.nodeName === 'VIDEO') window.__videoAdds++
      }).observe(cam, { childList: true, subtree: true })
    }
    tick()
  })
  await open()
  await sleep(14000)
  const dead = await state()
  const adds = await page.evaluate(() => window.__videoAdds ?? -1)
  ok('dead stream: settles on a failure message', /No stream/.test(dead.status ?? ''), JSON.stringify(dead))
  ok('dead stream: names what it tried', /HLS/.test(dead.status ?? ''), dead.status ?? '')
  ok('dead stream: does not retry forever', adds <= 2, `video insertions in 14s: ${adds}`)

  // ---------- 5. off-screen policy ----------
  if (!CAMERA) {
    skip('off-screen policy', 'no "camera" in target configuration')
  } else {
    // camera pushed far down a tall dashboard so it starts outside the viewport
    const filler = Array.from({ length: 6 }, (_, i) => ({
      id: 'f' + i, type: 'label', config: { text: 'filler ' + i }, layout: { lg: { x: 0, y: i * 4, w: 12, h: 4 } },
    }))
    ok('seed tall/stop', await seed([...filler, cell(camConfig({ transport: 'auto', offscreen: 'stop' }), { x: 0, y: 26, w: 6, h: 6 })], UID_TALL))
    await open(UID_TALL)
    await sleep(3000)
    const offscreen = await state()
    ok('off-screen: stopped while out of view', offscreen.child === null, JSON.stringify(offscreen))

    await page.evaluate(() => document.querySelector('.nh-camera')?.scrollIntoView({ block: 'center' }))
    await sleep(6000)
    const onscreen = await state()
    ok('off-screen: starts when scrolled into view', onscreen.child !== null, JSON.stringify(onscreen))

    ok('seed tall/keep', await seed([...filler, cell(camConfig({ transport: 'auto', offscreen: 'keep' }), { x: 0, y: 26, w: 6, h: 6 })], UID_TALL))
    await open(UID_TALL)
    await sleep(4000)
    ok('off-screen "keep": streams even out of view', (await state()).child !== null, JSON.stringify(await state()))
  }

  // ---------- 5a. the screensaver counts as "nobody is looking" ----------
  // The widget's own documentation listed the screensaver among the cases `stop` covers, and it
  // was the one case that did not work: the saver is an OVERLAY, so document.visibilityState
  // stays "visible" and an IntersectionObserver knows nothing about occlusion. Four cameras
  // therefore decoded all night behind a black rectangle, on exactly the wall panels that turn a
  // screensaver on. Needs no camera server: what is being observed is the teardown.
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    await ctx.addInitScript(
      (t) => {
        try {
          localStorage.setItem('neohab:apiToken', t)
          // ~1.2s of idle, which is the floor the saver clamps to.
          localStorage.setItem('neohab:kiosk', JSON.stringify({ kiosk: false, screensaver: 'blank', screensaverMinutes: 0.02, wakeLock: false }))
        } catch {}
      },
      TOKEN
    )
    const saverPage = await ctx.newPage()
    ok('seed for the screensaver', await seed([cell(camConfig({ transport: 'auto', offscreen: 'stop' }))]))
    await saverPage.goto(APP + '#/d/' + UID.split(':')[1], { waitUntil: 'domcontentloaded', timeout: 20000 })
    await saverPage.waitForSelector('.nh-camera', { timeout: 15000 })

    const cameraState = () =>
      saverPage.evaluate(() => ({
        saver: !!document.querySelector('.nh-saver'),
        media: document.querySelectorAll('.nh-camera__host > *').length,
        status: document.querySelector('.nh-camera__status')?.textContent ?? null,
      }))

    // Keep it awake first: the element it has attached is what the screensaver should take away,
    // so its presence is the "before" this section is measured against. (Not the status overlay -
    // a camera that is working shows none, which made an earlier version of this check meaningless.)
    for (let i = 0; i < 8; i++) {
      await saverPage.mouse.move(500 + i, 400)
      await sleep(300)
    }
    const awake = await cameraState()
    ok('screensaver: the camera has a media element before it engages', !awake.saver && awake.media > 0, JSON.stringify(awake))

    // Now leave it alone. page.evaluate generates no input events, so the saver engages.
    await sleep(4000)
    const covered = await cameraState()
    ok('screensaver: it engages when nothing is touched', covered.saver, JSON.stringify(covered))
    ok('screensaver: the camera holds no media element while covered', covered.media === 0, JSON.stringify(covered))

    // Waking it puts the camera back, so this is a pause and not a one-way street. The idle
    // timeout here is ~1.2s, so the page has to be kept awake while the stream reconnects -
    // simply sleeping let the saver engage again and made this look like a one-way street.
    await saverPage.keyboard.press('Space')
    let woken = await cameraState()
    for (let i = 0; i < 20 && (woken.saver || woken.media === 0); i++) {
      await saverPage.mouse.move(500 + (i % 5), 400)
      await sleep(500)
      woken = await cameraState()
    }
    ok('screensaver: waking restarts the camera', !woken.saver && woken.media > 0, JSON.stringify(woken))
    await ctx.close()
  }

  // ---------- 5b. how the name is shown ----------
  // Three modes, and the overlay deliberately has no placement settings of its own: it follows
  // the same per-widget Name alignment / Name position the title bar obeys.
  const named = (over) => cell(camConfig({ label: 'Front Door', transport: 'snapshot', ...over }))

  ok('seed name/header', await seed([named({ labelMode: 'header' })]))
  await open()
  await sleep(1500)
  ok('name "header": drawn in the title bar', (await page.locator('.nh-widget__labeltext').first().textContent()) === 'Front Door')
  ok('name "header": nothing over the picture', (await page.locator('.nh-camera__name').count()) === 0)

  ok('seed name/overlay', await seed([named({ labelMode: 'overlay' })]))
  await open()
  await sleep(1500)
  ok('name "overlay": drawn over the picture', (await page.locator('.nh-camera__name').first().textContent()) === 'Front Door')
  ok('name "overlay": no title bar taking cell height', (await page.locator('.nh-widget__labeltext').count()) === 0)
  const overlayBox = await page.locator('.nh-camera__name').first().boundingBox()
  const camBox = await page.locator('.nh-camera').first().boundingBox()
  ok('name "overlay": sits inside the picture area', overlayBox && camBox && overlayBox.y >= camBox.y - 1 && overlayBox.y < camBox.y + camBox.height, JSON.stringify({ overlayBox, camBox }))
  ok('name "overlay": does not swallow taps', (await page.evaluate(() => getComputedStyle(document.querySelector('.nh-camera__name')).pointerEvents)) === 'none')

  // placement comes from the shared alignment/position settings
  ok('seed name/overlay bottom-right', await seed([named({ labelMode: 'overlay', labelAlign: 'right', labelPosition: 'bottom' })]))
  await open()
  await sleep(1500)
  const placed = await page.evaluate(() => {
    const el = document.querySelector('.nh-camera__name')
    const cs = getComputedStyle(el)
    const cam = document.querySelector('.nh-camera').getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return { justify: cs.justifyContent, fromBottom: Math.round(cam.bottom - box.bottom), fromTop: Math.round(box.top - cam.top) }
  })
  ok('name "overlay": right alignment follows the Name alignment setting', placed.justify === 'flex-end', JSON.stringify(placed))
  ok('name "overlay": bottom position follows the Name position setting', placed.fromBottom < placed.fromTop, JSON.stringify(placed))

  // overlay ink: each colour carried on a shadow of the opposite one
  const inkOf = () => page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.nh-camera__name'))
    return { color: cs.color, shadow: cs.textShadow }
  })
  ok('seed name/overlay white', await seed([named({ labelMode: 'overlay', overlayColor: 'white' })]))
  await open()
  await sleep(1200)
  const white = await inkOf()
  ok('name "overlay": white ink on a dark shadow', /255, 255, 255/.test(white.color) && /rgba?\(0, 0, 0/.test(white.shadow), JSON.stringify(white))

  ok('seed name/overlay black', await seed([named({ labelMode: 'overlay', overlayColor: 'black' })]))
  await open()
  await sleep(1200)
  const black = await inkOf()
  ok('name "overlay": black ink on a light shadow', /rgb\(0, 0, 0\)/.test(black.color) && /rgba?\(255, 255, 255/.test(black.shadow), JSON.stringify(black))

  // The name must preview while editing. It used to render there but sit underneath the
  // edit-mode transport badge, which is drawn at the same corner with an opaque background,
  // so switching to overlay looked like it had done nothing until you left edit mode.
  ok('seed name/overlay edit', await seed([named({ labelMode: 'overlay' })]))
  await open()
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 5000 })
  await sleep(2500)
  const editPreview = await page.evaluate(() => {
    const n = document.querySelector('.nh-camera__name')
    const b = document.querySelector('.nh-camera__badge')
    if (!n) return { name: false }
    const nb = n.getBoundingClientRect()
    const bb = b ? b.getBoundingClientRect() : null
    const overlap = bb && !(nb.right < bb.left || bb.right < nb.left || nb.bottom < bb.top || bb.bottom < nb.top)
    return { name: true, text: n.textContent, badge: !!b, overlap: !!overlap }
  })
  ok('edit mode: the overlaid name previews', editPreview.name && editPreview.text === 'Front Door', JSON.stringify(editPreview))
  // The badge names the transport in use, so it is only drawn while a camera is genuinely
  // playing - which needs a real one. Same precondition as this suite's other live sections.
  if (CAMERA) {
    ok('edit mode: the transport badge does not cover it', editPreview.badge && !editPreview.overlap, JSON.stringify(editPreview))
  } else {
    skip('edit mode: the transport badge does not cover it', 'no "camera" in target configuration')
  }
  await page.click('button:has-text("Exit")')
  await sleep(600)

  ok('seed name/none', await seed([named({ labelMode: 'none' })]))
  await open()
  await sleep(1500)
  ok('name "none": drawn nowhere', (await page.locator('.nh-camera__name').count()) === 0 && (await page.locator('.nh-widget__labeltext').count()) === 0)

  // ---------- 6. tap actions ----------
  ok('seed tap none', await seed([cell(camConfig({ tapAction: 'none' }))]))
  await open()
  ok('tap "none": no tap target rendered', !(await state()).tap)

  ok('seed tap dashboard', await seed([cell(camConfig({ tapAction: 'dashboard', tapDashboard: 'nh-e2e-camtall' }))]))
  await open()
  ok('tap "dashboard": tap target rendered', (await state()).tap)
  await page.click('.nh-camera__tap')
  await sleep(600)
  ok('tap "dashboard": navigates', page.url().includes('nh-e2e-camtall'), page.url().slice(-40))

  // ---------- 7. settings form ----------
  ok('seed settings', await seed([cell(camConfig({ transport: 'auto' }))]))
  await open()
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0, { timeout: 5000 })
  await page.click('.nh-cell')
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })

  // Exact label match: :has-text is a case-insensitive substring, and several hints mention
  // other fields' names ("...build every stream URL from the server address...").
  const labelled = (t) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${t}"))`).first()
  ok('settings: server fields shown for a server source', await labelled('Server address').isVisible())
  ok('settings: camera field has a Find button', await page.locator('.nh-camerafield__find').isVisible())
  ok('settings: direct-URL field hidden for a server source', !(await labelled('Stream URL').isVisible().catch(() => false)))

  // switching to a direct URL swaps which fields apply
  // by label, not by position: the schema gains fields over time and nth=0 silently drifts
  await labelled('Camera server').locator('select').selectOption('url')
  await sleep(400)
  ok('settings: URL field appears for a direct source', await labelled('Stream URL').isVisible())
  ok('settings: server address hidden for a direct source', !(await labelled('Server address').isVisible().catch(() => false)))

  await labelled('Camera server').locator('select').selectOption('go2rtc')
  await sleep(400)

  // Discovery against the real server. Whether it can answer depends on that server allowing
  // this page to read it, so accept either outcome - but never silence.
  if (!CAMERA) {
    skip('settings: discovery', 'no "camera" in target configuration')
  } else {
    await page.click('.nh-camerafield__find')
    await sleep(8000)
    const picks = await page.locator('.nh-camerafield__pick').allTextContents()
    const hints = await page.locator('.nh-sheet .nh-field__hint').allTextContents()
    const answered = picks.length > 0 || hints.some((h) => /camera list|no cameras|not with a camera list/i.test(h))
    ok('settings: Find gives a definite answer', answered, `picks=${picks.length} hints=${hints.length}`)
    if (picks.length > 0) {
      ok('settings: discovered list includes the configured camera', picks.includes(CAMERA.stream), JSON.stringify(picks.slice(0, 8)))
      await page.locator('.nh-camerafield__pick', { hasText: CAMERA.stream }).first().click()
      await sleep(300)
      ok('settings: picking a camera fills the field', (await page.inputValue('.nh-camerafield input')) === CAMERA.stream)
    } else {
      skip('settings: discovered list', 'server does not allow this page to read its camera list')
    }
  }

  // discovery against an address that cannot answer explains itself rather than failing silently
  await page.fill('.nh-camerafield input', '')
  // TEST-NET-1, unroutable; port 1984 rather than a low one Chromium refuses outright
  await labelled('Server address').locator('input').first().fill(UNREACHABLE + '192.0.2.1:1984')
  await page.click('.nh-camerafield__find')
  await page.waitForSelector('.nh-camerafield ~ .nh-field__hint, .nh-field__hint', { timeout: 12000 })
  await sleep(7000)
  const hintText = await page.locator('.nh-sheet .nh-field__hint').allTextContents()
  ok('settings: unreachable server explains the failure', hintText.some((h) => /Could not read the camera list|camera name instead/.test(h)), JSON.stringify(hintText.slice(-2)))

  // ---------- 8. hls.js stays out of the main bundle ----------
  const loaded = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /hls-|player-/.test(n)).map((n) => n.split('/').pop())
  )
  ok('player code is a separate chunk', loaded.some((n) => n.startsWith('player-')), JSON.stringify(loaded))

  ok('no unexpected console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err).slice(0, 200))
} finally {
  for (const uid of [UID, UID_TALL]) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  await browser.close()
  const left = await fetch(NS, { headers: AUTH }).then((r) => r.json()).catch(() => [])
  // scoped to what THIS suite made: an unrelated stray must not fail this suite's cleanup
  const leftover = left.filter((c) => c.uid === UID || c.uid === UID_TALL).map((c) => c.uid)
  ok('cleanup: no leftovers', leftover.length === 0, leftover.join(','))
}

let pass = 0, fail = 0, skipped = 0
for (const r of results) {
  if (r.skip) { skipped++; console.log(`SKIP  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`); continue }
  if (r.pass) { pass++; console.log(`PASS  ${r.name}`) }
  else { fail++; console.log(`FAIL  ${r.name}${r.detail ? '  -> ' + r.detail : ''}`) }
}
console.log(`\n${pass}/${pass + fail} passed${skipped ? `, ${skipped} skipped` : ''}${fail ? ' - FAILURES' : ' - ALL PASS'}`)
process.exitCode = fail ? 1 : 0
