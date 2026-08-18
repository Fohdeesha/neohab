/**
 * Kiosk/PWA bundle verification: PWA manifest + service worker + offline shell, wake lock,
 * screensaver (blank/clock, wake-tap swallowed), kiosk mode (chrome hidden, ?kiosk URL params,
 * 5-tap corner exit), per-device pinned dashboard, and the dashboard-control item.
 *
 * SAFE with a live config:
 *   - creates only dashboard:nh-e2e-kiosk and dashboard:nh-e2e-kiosk2; deletes exactly those.
 *   - the `settings` component is snapshotted, modified (controlItem) and restored verbatim.
 *   - item commands: the dimmer item ONLY (approved test item); initial state recorded and
 *     restored (the restore doubles as the follow-off check).
 *   - service worker tests run in throwaway Playwright profiles (nothing persists).
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { getSettings, patchSettings, restoreSettings } from './lib/components.mjs'

const UID_A = 'dashboard:nh-e2e-kiosk'
const UID_B = 'dashboard:nh-e2e-kiosk2'
const CONTROL_ITEM = ITEMS.dimmer

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch(extraArgs = []) {
  const opts = { headless: true, args: extraArgs }
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, ...opts }) } catch {}
  }
  return chromium.launch(opts)
}

const VP = { width: 1400, height: 950 }

async function newPage(browser) {
  const context = await browser.newContext({ viewport: VP })
  const page = await context.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
  return { context, page, errs }
}

/** Overwrite this device's kiosk settings and reload (must already be on the app origin). */
async function setKiosk(page, obj) {
  await page.evaluate((o) => {
    if (o === null) localStorage.removeItem('neohab:kiosk')
    else localStorage.setItem('neohab:kiosk', JSON.stringify(o))
  }, obj)
}

const browser = await launch()
let secureBrowser = null
let settingsSnapshot = null
/** Whether this suite wrote the settings component, so cleanup knows to put it back. */
let settingsTouched = false
let initialLevel = null

try {
  // ---------- seed ----------
  for (const [uid, id, name] of [[UID_A, 'nh-e2e-kiosk', 'E2E Kiosk'], [UID_B, 'nh-e2e-kiosk2', '57']]) {
    const r = await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        component: 'neohab:dashboard',
        config: {
          version: 1, id, name, columns: 12, rowHeight: 40, gap: 8,
          widgets: [
            { id: 'w-a', type: 'clock', config: { showDate: false }, layout: { lg: { x: 4, y: 2, w: 3, h: 2 } } },
            { id: 'w-b', type: 'label', config: { text: name }, layout: { lg: { x: 4, y: 5, w: 3, h: 2 } } },
          ],
        },
      }),
    })
    ok('seed ' + uid, r.ok, String(r.status))
  }
  const st = await fetch(BASE + '/rest/items/' + CONTROL_ITEM + '/state')
  initialLevel = (await st.text()).trim()
  ok('recorded initial ' + CONTROL_ITEM, st.ok && initialLevel.length > 0, initialLevel)

  // ================= 1. PWA assets served from the jar =================
  {
    const mf = await fetch(BASE + '/neohab/manifest.json')
    const mfJson = mf.ok ? await mf.json() : null
    ok('manifest.json served + valid', mfJson && mfJson.name === 'neohab' && mfJson.display === 'standalone',
      String(mf.status))
    ok('manifest declares 192/512 + maskable icons',
      mfJson && mfJson.icons?.length === 3 && mfJson.icons.some((i) => i.purpose === 'maskable'))
    const sw = await fetch(BASE + '/neohab/sw.js')
    const swText = sw.ok ? await sw.text() : ''
    ok('sw.js served', sw.ok, String(sw.status))
    ok('sw.js precaches the app shell', swText.includes('precacheAndRoute') && swText.includes('index.html'))
    ok('sw.js never touches /rest', !swText.includes('/rest'))
    for (const icon of ['pwa-192.png', 'pwa-512.png']) {
      const r = await fetch(BASE + '/neohab/' + icon)
      const buf = new Uint8Array(await r.arrayBuffer())
      ok(icon + ' served as PNG', r.ok && buf[0] === 0x89 && buf[1] === 0x50, String(r.status))
    }
    const html = await (await fetch(APP)).text()
    ok('index.html links the manifest', html.includes('manifest.json'))
  }

  // ================= 2. service worker + offline shell (secure-treated profile) =================
  {
    secureBrowser = await launch(['--unsafely-treat-insecure-origin-as-secure=' + BASE])
    const { context, page, errs } = await newPage(secureBrowser)
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const swReady = await page.evaluate(() =>
      Promise.race([
        navigator.serviceWorker?.ready.then((r) => r.active ? r.scope : 'no-active'),
        new Promise((r) => setTimeout(() => r('timeout'), 15000)),
      ])
    )
    ok('service worker registers (secure context)', String(swReady).includes('/neohab/'), String(swReady))
    await sleep(1500) // let precache finish
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys()
      const urls = []
      for (const k of keys) {
        for (const req of await (await caches.open(k)).keys()) urls.push(req.url)
      }
      return { keys, urls }
    })
    ok('precache populated', cached.urls.some((u) => u.includes('/neohab/index.html')), cached.keys.join(','))
    ok('no /rest response ever cached', !cached.urls.some((u) => u.includes('/rest/')),
      cached.urls.filter((u) => u.includes('/rest/')).slice(0, 3).join(','))

    // offline: the shell still comes up (config fetch fails, app renders its error/welcome state)
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
    await sleep(2500)
    const offlineShell = await page.evaluate(() => ({
      root: !!document.querySelector('#root')?.children.length,
      app: !!document.querySelector('.nh-app'),
      text: document.body.innerText.slice(0, 120),
    }))
    ok('offline: app shell served from the service worker', offlineShell.root && offlineShell.app,
      JSON.stringify(offlineShell))
    await context.setOffline(false)

    // wake lock exists here and actually engages
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-home__status', { timeout: 15000 })
    ok('wake lock API present (secure context)', await page.evaluate(() => 'wakeLock' in navigator))
    await setKiosk(page, { kiosk: false, screensaver: 'off', screensaverMinutes: 10, wakeLock: true })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#kiosk-wake', { timeout: 15000 })
    ok('wake toggle enabled + checked', await page.isEnabled('#kiosk-wake') && await page.isChecked('#kiosk-wake'))
    const awakeText = await page.waitForSelector('text=The screen is being kept awake.', { timeout: 5000 }).catch(() => null)
    const probe = awakeText ? 'granted' : await page.evaluate(() =>
      navigator.wakeLock.request('screen').then(() => 'granted', (e) => 'denied:' + e.name))
    ok('wake lock actually granted', awakeText !== null || probe === 'granted', String(probe))
    // The offline section legitimately produces resource-load errors while the network is cut;
    // anything else (real page/app errors) still fails here.
    const realErrs = errs.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED'))
    ok('secure-context page: no console errors (offline noise excluded)', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
    await context.close()
  }

  // ================= 3. plain-HTTP device: honest hint, no dead toggle =================
  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('#kiosk-wake', { timeout: 15000 })
    ok('HTTP: wake lock API absent', await page.evaluate(() => !('wakeLock' in navigator)))
    ok('HTTP: wake toggle disabled', !(await page.isEnabled('#kiosk-wake')))
    ok('HTTP: HTTPS hint shown', (await page.locator('text=only offer the wake lock over HTTPS').count()) === 1)
    await context.close()
  }

  // ================= 4. kiosk mode: URL params, chrome, 5-tap exit =================
  {
    const { context, page } = await newPage(browser)
    let dialogs = 0
    let acceptDialogs = true
    page.on('dialog', (d) => { dialogs++; acceptDialogs ? d.accept() : d.dismiss() })

    // hash-query variant + route parsing tolerance
    await page.goto(APP + '#/d/nh-e2e-kiosk?kiosk=on', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    ok('kiosk(hash param): dashboard route still parses', (await page.locator('.nh-widget').count()) >= 2)
    ok('kiosk: header hidden', (await page.locator('.nh-dash__bar').count()) === 0)
    ok('kiosk: no sidebar trigger / pencil', (await page.locator('.nh-side__trigger, [aria-label="Edit dashboard"]').count()) === 0)
    ok('kiosk via URL is session-only (nothing persisted)',
      await page.evaluate(() => !JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').kiosk))

    // pinned sidebar + kiosk: the aside is gone AND the 260px inset with it (the layout hook is
    // kiosk-aware; failing that, kiosk mode would show a blank stripe where the pin insets)
    await page.evaluate(() => localStorage.setItem('neohab:sidebarPinned', '1'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    const pad = await page.evaluate(() => getComputedStyle(document.querySelector('.nh-app')).paddingLeft)
    ok('kiosk + pinned sidebar: no phantom inset', pad === '0px', pad)
    ok('kiosk + pinned sidebar: no aside rendered', (await page.locator('.nh-side').count()) === 0)
    await page.evaluate(() => localStorage.removeItem('neohab:sidebarPinned'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })

    // Home in kiosk: no settings button, no new-dashboard tile
    await page.goto(APP + '?kiosk=on#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tiles', { timeout: 15000 })
    ok('kiosk(search param) home: settings + new-tile hidden',
      (await page.locator('.nh-home__settings, .nh-tile--new').count()) === 0)

    // settings page in kiosk: kiosk + follow checkboxes reflect the mode
    await page.goto(APP + '?kiosk=on#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#kiosk-mode', { timeout: 15000 })
    ok('kiosk: mode checkbox reflects URL override', await page.isChecked('#kiosk-mode'))
    ok('kiosk: follow-control defaults to on in kiosk mode', await page.isChecked('#kiosk-follow'))

    // 5-tap corner exit: interrupted sequence does nothing, complete one exits
    await page.goto(APP + '?kiosk=on#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    const cx = 20, cy = VP.height - 20 // bottom-left corner, empty grid there
    for (let i = 0; i < 3; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(1000) // > TAP_WINDOW_MS: sequence expires
    for (let i = 0; i < 2; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(300)
    ok('3 taps + pause + 2 taps does NOT exit', dialogs === 0 && (await page.locator('.nh-dash__bar').count()) === 0)

    acceptDialogs = false // first full sequence: dismiss the confirm - must stay in kiosk
    for (let i = 0; i < 5; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(300)
    ok('5 taps show the exit confirm', dialogs === 1, String(dialogs))
    ok('dismissing the confirm stays in kiosk', (await page.locator('.nh-dash__bar').count()) === 0)

    acceptDialogs = true
    for (let i = 0; i < 5; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await page.waitForSelector('.nh-dash__bar', { timeout: 5000 })
    ok('accepting the confirm exits kiosk (chrome returns)', true)
    ok('the exit is persisted (kiosk:false stored)',
      await page.evaluate(() => JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').kiosk === false))
    await context.close()
  }

  // ================= 5. kiosk toggle in settings navigates out =================
  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('#kiosk-mode', { timeout: 15000 })
    page.on('dialog', (d) => d.accept())
    // click, not check(): the toggle navigates away, and check()'s post-verify would race the unmount
    await page.click('#kiosk-mode')
    await sleep(500)
    const hash = await page.evaluate(() => window.location.hash)
    ok('enabling kiosk in settings leaves the (now chromeless) settings screen', hash === '#/', hash)
    ok('kiosk persisted from settings', await page.evaluate(() => JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').kiosk === true))
    // exit again via taps so the profile ends clean
    const cx = 20, cy = VP.height - 20
    for (let i = 0; i < 5; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(300)
    await context.close()
  }

  // ================= 6. pinned start dashboard =================
  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('#kiosk-pinned', { timeout: 15000 })
    await page.selectOption('#kiosk-pinned', 'nh-e2e-kiosk')
    ok('pin stored', await page.evaluate(() => JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').pinnedDashboard === 'nh-e2e-kiosk'))
    await page.goto(APP, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.location.hash === '#/d/nh-e2e-kiosk', { timeout: 10000 }).catch(() => {})
    ok('app start lands on the pinned dashboard', (await page.evaluate(() => window.location.hash)) === '#/d/nh-e2e-kiosk')
    // a deep link wins over the pin - reload so the start-redirect logic actually re-runs
    // (a bare hash change is a same-document navigation and would prove nothing)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(1500)
    ok('deep link wins over the pin', (await page.evaluate(() => window.location.hash)) === '#/settings')
    // navigating Home by hand stays Home (redirect is start-only)
    await page.evaluate(() => { window.location.hash = '#/' })
    await sleep(800)
    ok('manual Home visit is not re-redirected', (await page.evaluate(() => window.location.hash)) === '#/')
    await context.close()
  }

  // ================= 7. screensaver =================
  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await setKiosk(page, { kiosk: false, screensaver: 'clock', screensaverMinutes: 0.05, wakeLock: false })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    // hands off: idle for ~3s + check interval
    await page.waitForSelector('.nh-saver', { timeout: 10000 })
    const saver = await page.locator('.nh-saver').boundingBox()
    ok('clock saver engages after the idle timeout', !!saver)
    ok('saver covers the whole viewport', saver && saver.width === VP.width && saver.height === VP.height, JSON.stringify(saver))
    const time = await page.locator('.nh-saver__time').textContent().catch(() => null)
    ok('clock shows a time', !!time && /\d/.test(time), String(time))

    // the waking tap is swallowed (a bubble listener on window must never see it)
    await page.evaluate(() => {
      window.__sawDown = 0
      window.addEventListener('pointerdown', () => { window.__sawDown++ })
    })
    await page.mouse.click(700, 500)
    await sleep(300)
    ok('tap wakes the saver', (await page.locator('.nh-saver').count()) === 0)
    ok('the waking tap was swallowed', (await page.evaluate(() => window.__sawDown)) === 0)
    await page.mouse.click(700, 500)
    await sleep(100)
    ok('the next tap flows normally', (await page.evaluate(() => window.__sawDown)) === 1)

    // blank mode has no clock
    await setKiosk(page, { kiosk: false, screensaver: 'blank', screensaverMinutes: 0.05, wakeLock: false })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-saver', { timeout: 10000 })
    ok('blank saver has no clock', (await page.locator('.nh-saver__clock').count()) === 0)
    await page.mouse.move(600, 400) // pointer movement wakes too
    await sleep(300)
    ok('pointer movement wakes the blank saver', (await page.locator('.nh-saver').count()) === 0)
    await context.close()
  }

  // ================= 8. dashboard-control item =================
  {
    // snapshot + patch the global settings component
    // A fresh server has no settings component at all: snapshotting null is correct, and
    // cleanup then removes what this suite created rather than leaving it behind.
    settingsSnapshot = await getSettings()
    settingsTouched = true
    const put = await patchSettings(settingsSnapshot, { controlItem: CONTROL_ITEM })
    ok('controlItem configured', put.ok, `${put.status} (server had settings: ${!!settingsSnapshot})`)

    const target = initialLevel === '57' ? '58' : '57' // dashboard B is named "57"
    const expectHash = initialLevel === '57' ? null : '#/d/nh-e2e-kiosk2'

    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await setKiosk(page, { kiosk: false, screensaver: 'off', screensaverMinutes: 10, wakeLock: false, followControl: true })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await sleep(2500) // SSE connect + tracked-set debounce + priming state

    await fetch(BASE + '/rest/items/' + CONTROL_ITEM, {
      method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: target,
    })
    if (expectHash) {
      await page.waitForFunction((h) => window.location.hash === h, expectHash, { timeout: 8000 }).catch(() => {})
      ok('control item change navigates to the named dashboard',
        (await page.evaluate(() => window.location.hash)) === expectHash,
        await page.evaluate(() => window.location.hash))
    } else {
      ok('control item check skipped (initial state collided with the test value)', true, initialLevel)
    }

    // follow off: restoring the initial value must NOT navigate (this also restores the item)
    await setKiosk(page, { kiosk: false, screensaver: 'off', screensaverMinutes: 10, wakeLock: false, followControl: false })
    await page.goto(APP + '#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await sleep(2500)
    await fetch(BASE + '/rest/items/' + CONTROL_ITEM, {
      method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: initialLevel,
    })
    await sleep(3000)
    ok('follow off: no navigation', (await page.evaluate(() => window.location.hash)) === '#/d/nh-e2e-kiosk')
    await context.close()
  }

  // ================= 9. run-mode regression: plain browsing untouched =================
  {
    const { context, page, errs } = await newPage(browser)
    await page.goto(APP + '#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-dash__bar', { timeout: 15000 })
    ok('plain mode: header + pencil + trigger all present',
      (await page.locator('.nh-dash__bar').count()) === 1 &&
      (await page.locator('[aria-label="Edit dashboard"]').count()) === 1 &&
      (await page.locator('.nh-side__trigger').count()) === 1)
    await sleep(1500)
    ok('no console/page errors in plain mode', errs.length === 0, errs.slice(0, 3).join(' | '))
    await context.close()
  }
} catch (e) {
  ok('suite crashed', false, String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e))
} finally {
  // ---------- cleanup: exact uids only; settings restored verbatim; item state restored ----------
  for (const uid of [UID_A, UID_B]) {
    const d = await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })
    ok('cleanup: ' + uid + ' deleted', d.ok || d.status === 404, String(d.status))
  }
  if (settingsTouched) {
    const back = await restoreSettings(settingsSnapshot)
    ok(`cleanup: settings ${back.mode}`, back.ok, back.detail)
  }
  if (initialLevel !== null) {
    const cur = (await (await fetch(BASE + '/rest/items/' + CONTROL_ITEM + '/state')).text()).trim()
    if (cur !== initialLevel) {
      await fetch(BASE + '/rest/items/' + CONTROL_ITEM, {
        method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: initialLevel,
      })
      await sleep(1500)
    }
    const fin = (await (await fetch(BASE + '/rest/items/' + CONTROL_ITEM + '/state')).text()).trim()
    ok('cleanup: ' + CONTROL_ITEM + ' back at initial', fin === initialLevel, `${fin} vs ${initialLevel}`)
  }
  await browser.close()
  if (secureBrowser) await secureBrowser.close()
}

let fails = 0
for (const r of results) {
  if (!r.pass) fails++
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(`\n${results.length - fails}/${results.length} checks passed`)
process.exitCode = fails === 0 ? 0 : 1
