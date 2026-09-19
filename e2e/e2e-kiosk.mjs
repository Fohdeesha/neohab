// Kiosk/PWA bundle verification: PWA manifest + service worker + offline shell, wake lock, screensaver
// (blank/clock, wake-tap swallowed).
// SAFE with a live config: creates only dashboard:nh-e2e-kiosk and dashboard:nh-e2e-kiosk2; deletes exactly
// those.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS, HTTPS } from './lib/target.mjs'
import { getSettings, patchSettings, restoreSettings } from './lib/components.mjs'

const UID_A = 'dashboard:nh-e2e-kiosk'
const UID_B = 'dashboard:nh-e2e-kiosk2'
const CONTROL_ITEM = ITEMS.dimmer

const SCHEME = HTTPS ? 'HTTPS' : 'HTTP'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch(extraArgs = []) {
  const opts = { headless: true, args: extraArgs }
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, ...opts }) } catch {}
  }
  return launchChromium(opts)
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

async function setKiosk(page, obj) {
  await page.evaluate((o) => {
    if (o === null) localStorage.removeItem('neohab:kiosk')
    else localStorage.setItem('neohab:kiosk', JSON.stringify(o))
  }, obj)
}

const browser = await launch()
let secureBrowser = null
let settingsSnapshot = null
let settingsTouched = false
let initialLevel = null

try {
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

  {
    // A shortcut made from a dashboard has to open that dashboard, and the icon it gets has to
    // survive the launcher's mask.
    const { context, page } = await newPage(browser)
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })

    const geom = await page
      .evaluate(async (url) => {
        const img = new Image()
        await new Promise((res, rej) => {
          img.onload = res
          img.onerror = () => rej(new Error('did not load'))
          img.src = url
        })
        const w = img.naturalWidth
        const c = document.createElement('canvas')
        c.width = w
        c.height = w
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, w, w).data
        const at = (x, y) => {
          const i = (y * w + x) * 4
          return [d[i], d[i + 1], d[i + 2]]
        }
        const plate = at(1, 1)
        let minX = w, minY = w, maxX = -1, maxY = -1, furthest = 0
        for (let y = 0; y < w; y++) {
          for (let x = 0; x < w; x++) {
            const p = at(x, y)
            const isPlate = Math.abs(p[0] - plate[0]) <= 6 && Math.abs(p[1] - plate[1]) <= 6 && Math.abs(p[2] - plate[2]) <= 6
            if (isPlate) continue
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
            const r = Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2) / w
            if (r > furthest) furthest = r
          }
        }
        return { w, drew: maxX >= 0, top: minY, bottom: w - 1 - maxY, left: minX, right: w - 1 - maxX, furthest }
      }, BASE + '/neohab/pwa-maskable-512.png')
      .catch((e) => ({ error: String(e).split('\n')[0] }))

    ok('the maskable icon is served and has a mark on it', geom.drew === true, JSON.stringify(geom))
    ok(
      'the mark is centred in the maskable icon',
      geom.drew === true && Math.abs(geom.top - geom.bottom) <= 1 && Math.abs(geom.left - geom.right) <= 1,
      `top ${geom.top} bottom ${geom.bottom} left ${geom.left} right ${geom.right}`
    )
    // a launcher shows about the middle two thirds of a maskable icon and masks that to a circle,
    // so ink beyond 1/3 of the width from the centre is ink somebody loses
    ok(
      'the mark fits the mask a launcher applies',
      geom.drew === true && geom.furthest <= 0.32,
      'furthest ink ' + Math.round((geom.furthest ?? 0) * 1000) / 10 + '% of the width, want <= 32%'
    )

    const readManifest = async () => {
      const href = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.href ?? '')
      const tag = 'data:application/manifest+json,'
      if (!href.startsWith(tag)) return { href, json: null }
      try {
        return { href, json: JSON.parse(decodeURIComponent(href.slice(tag.length))) }
      } catch {
        return { href, json: null }
      }
    }

    await page.goto(APP + '#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-gcell', { timeout: 15000 }).catch(() => {})
    const onDash = await readManifest()
    ok(
      'a dashboard offers a manifest that starts on it',
      onDash.json?.start_url?.includes('#/d/nh-e2e-kiosk') === true,
      String(onDash.json?.start_url ?? onDash.href.slice(0, 60))
    )
    ok(
      'the shortcut is named after the dashboard',
      onDash.json?.short_name === 'E2E Kiosk' && onDash.json?.name === 'E2E Kiosk - neohab',
      JSON.stringify({ short_name: onDash.json?.short_name, name: onDash.json?.name })
    )
    ok(
      'the page is titled after the dashboard too, which is what iOS names a shortcut from',
      (await page.title()) === 'E2E Kiosk - neohab',
      await page.title()
    )
    ok(
      'it offers the maskable icon',
      onDash.json?.icons?.some((i) => i.purpose === 'maskable' && String(i.src).endsWith('pwa-maskable-512.png')) === true,
      JSON.stringify(onDash.json?.icons?.map((i) => i.src) ?? [])
    )

    // writing a manifest is one thing, the browser taking it is another - and one it rejected
    // would leave the app with no manifest at all, which is worse than the bug being fixed
    let chrome = null
    try {
      const cdp = await context.newCDPSession(page)
      chrome = await cdp.send('Page.getAppManifest')
      await cdp.detach()
    } catch (e) {
      chrome = { unavailable: String(e).split('\n')[0] }
    }
    let chromeRead = null
    try {
      chromeRead = JSON.parse(chrome?.data ?? 'null')
    } catch {}
    ok(
      'the browser reads it and takes no exception to it',
      String(chrome?.url ?? '').startsWith('data:application/manifest+json,') &&
        (chrome?.errors ?? [null]).length === 0 &&
        chromeRead?.start_url?.includes('#/d/nh-e2e-kiosk') === true,
      JSON.stringify({
        url: String(chrome?.url ?? chrome?.unavailable ?? '').slice(0, 40),
        errors: (chrome?.errors ?? []).map((e) => e.message),
        start_url: chromeRead?.start_url,
      })
    )

    await page.goto(APP + '#/d/nh-e2e-kiosk2', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-gcell', { timeout: 15000 }).catch(() => {})
    const onOther = await readManifest()
    // a browser drops the fragment before it decides two shortcuts are the same app, so the
    // dashboard has to be in the part before it as well
    const identity = (m) => String(m.json?.start_url ?? '').split('#')[0]
    ok(
      'two dashboards are two shortcuts, fragment or no fragment',
      identity(onDash) !== identity(onOther) && identity(onOther).includes('app=nh-e2e-kiosk2'),
      identity(onDash) + ' vs ' + identity(onOther)
    )

    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-tile, .nh-welcome', { timeout: 15000 }).catch(() => {})
    const onHome = await readManifest()
    ok(
      'the dashboard list keeps the manifest the add-on ships',
      onHome.href.endsWith('/neohab/manifest.json') && onHome.json === null,
      onHome.href.slice(0, 70)
    )
    ok('and its title', (await page.title()) === 'neohab', await page.title())

    // a launcher that drops the fragment still has ?app= to go on
    await page.goto(APP + '?app=nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-gcell', { timeout: 15000 }).catch(() => {})
    // cells are the tell: the dashboard list draws none, so this cannot pass by landing on it
    const landed = await page.evaluate(() => ({ hash: location.hash, cells: document.querySelectorAll('.nh-gcell').length }))
    ok(
      'a launch with no fragment still opens the dashboard ?app= names',
      landed.hash === '#/d/nh-e2e-kiosk' && landed.cells >= 2,
      JSON.stringify(landed)
    )
    await context.close()

    // Inside an installed app there is no add-to-home-screen to serve, and a browser that found a
    // different manifest under one might take it for an update and rename the icon somebody has.
    // Headless has no standalone mode to emulate, so say so the way a launcher would.
    const installed = await newPage(browser)
    await installed.page.addInitScript(() => {
      const real = window.matchMedia.bind(window)
      window.matchMedia = (q) =>
        q.includes('display-mode: standalone')
          ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {},
              addListener() {}, removeListener() {}, dispatchEvent: () => false }
          : real(q)
    })
    await installed.page.goto(APP + '#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await installed.page.waitForSelector('.nh-gcell', { timeout: 15000 }).catch(() => {})
    const installedHref = await installed.page.evaluate(() => document.querySelector('link[rel="manifest"]')?.href ?? '')
    ok(
      'an installed app is left on the manifest it was installed from',
      installedHref.endsWith('/neohab/manifest.json'),
      installedHref.slice(0, 70)
    )
    await installed.context.close()
  }

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

    // a shortcut into a dashboard launches index.html?app=<id>, which has to match the same
    // precached index.html or a wall panel that is offline gets nothing at all
    await page.goto(APP + '?app=nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
    await sleep(2000)
    const offlineShortcut = await page.evaluate(() => ({
      root: !!document.querySelector('#root')?.children.length,
      app: !!document.querySelector('.nh-app'),
      text: document.body.innerText.slice(0, 80),
    }))
    ok('offline: a shortcut into a dashboard is served from that same shell',
      offlineShortcut.root && offlineShortcut.app, JSON.stringify(offlineShortcut))
    await context.setOffline(false)

    // goto rather than reload: the check above left the page on a shortcut's URL, and what
    // follows is about the dashboard list
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 })
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
    const realErrs = errs.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED'))
    ok('secure-context page: no console errors (offline noise excluded)', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
    await context.close()
  }

  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('#kiosk-wake', { timeout: 15000 })
    const api = await page.evaluate(() => 'wakeLock' in navigator)
    const enabled = await page.isEnabled('#kiosk-wake')
    const hint = await page.locator('text=Browsers only offer this over HTTPS').count()
    ok(`${SCHEME}: the wake lock API is ${HTTPS ? 'available' : 'absent'}`, api === HTTPS, 'api ' + api)
    ok(`${SCHEME}: the toggle is ${HTTPS ? 'usable' : 'disabled'}`, enabled === HTTPS, 'enabled ' + enabled)
    ok(`${SCHEME}: the HTTPS hint is ${HTTPS ? 'not shown' : 'shown'}`, hint === (HTTPS ? 0 : 1), 'hints ' + hint)
    await context.close()
  }

  {
    const { context, page } = await newPage(browser)
    let dialogs = 0
    page.on('dialog', (d) => { dialogs++; void d.accept() })

    await page.goto(APP + '#/d/nh-e2e-kiosk?kiosk=on', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    ok('kiosk(hash param): dashboard route still parses', (await page.locator('.nh-widget').count()) >= 2)
    ok('kiosk: header hidden', (await page.locator('.nh-dash__bar').count()) === 0)
    ok('kiosk: no sidebar trigger / pencil', (await page.locator('.nh-side__trigger, [aria-label="Edit dashboard"]').count()) === 0)
    ok('kiosk via URL is session-only (nothing persisted)',
      await page.evaluate(() => !JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').kiosk))

    await page.evaluate(() => localStorage.setItem('neohab:sidebarPinned', '1'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    const pad = await page.evaluate(() => getComputedStyle(document.querySelector('.nh-app')).paddingLeft)
    ok('kiosk + pinned sidebar: no phantom inset', pad === '0px', pad)
    ok('kiosk + pinned sidebar: no aside rendered', (await page.locator('.nh-side').count()) === 0)
    await page.evaluate(() => localStorage.removeItem('neohab:sidebarPinned'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })

    await page.goto(APP + '?kiosk=on#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tiles', { timeout: 15000 })
    ok('kiosk(search param) home: settings + new-tile hidden',
      (await page.locator('.nh-home__settings, .nh-tile--new').count()) === 0)

    await page.goto(APP + '?kiosk=on#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#kiosk-mode', { timeout: 15000 })
    ok('kiosk: mode checkbox reflects URL override', await page.isChecked('#kiosk-mode'))
    ok('kiosk: follow-control defaults to on in kiosk mode', await page.isChecked('#kiosk-follow'))

    await page.goto(APP + '?kiosk=on#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    const cx = 20, cy = VP.height - 20 // bottom-left corner, empty grid there
    for (let i = 0; i < 3; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(1000) // > TAP_WINDOW_MS: sequence expires
    for (let i = 0; i < 2; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(300)
    const exitBox = page.locator('.nh-kioskexit')
    ok(
      '3 taps + pause + 2 taps does NOT exit',
      dialogs === 0 && (await exitBox.count()) === 0 && (await page.locator('.nh-dash__bar').count()) === 0
    )

    for (let i = 0; i < 5; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(300)
    ok('5 taps show the exit confirm', (await exitBox.count()) === 1, String(await exitBox.count()))
    ok('the confirm is the app’s own, not a native dialog', dialogs === 0, String(dialogs))
    await page.locator('.nh-kioskexit button', { hasText: 'Stay in kiosk mode' }).click()
    await sleep(300)
    ok('declining stays in kiosk', (await page.locator('.nh-dash__bar').count()) === 0 && (await exitBox.count()) === 0)

    for (let i = 0; i < 5; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await exitBox.waitFor({ state: 'visible', timeout: 5000 })
    await page.locator('.nh-kioskexit button', { hasText: 'Exit' }).click()
    await page.waitForSelector('.nh-dash__bar', { timeout: 5000 })
    ok('accepting the confirm exits kiosk (chrome returns)', true)
    ok('the exit is persisted (kiosk:false stored)',
      await page.evaluate(() => JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').kiosk === false))
    await context.close()
  }

  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('#kiosk-mode', { timeout: 15000 })
    page.on('dialog', (d) => d.accept())
    await page.click('#kiosk-mode')
    await sleep(500)
    const hash = await page.evaluate(() => window.location.hash)
    ok('enabling kiosk in settings leaves the (now chromeless) settings screen', hash === '#/', hash)
    ok('kiosk persisted from settings', await page.evaluate(() => JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').kiosk === true))
    const cx = 20, cy = VP.height - 20
    for (let i = 0; i < 5; i++) { await page.mouse.click(cx, cy); await sleep(80) }
    await sleep(300)
    await context.close()
  }

  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('#kiosk-pinned', { timeout: 15000 })
    await page.selectOption('#kiosk-pinned', 'nh-e2e-kiosk')
    ok('pin stored', await page.evaluate(() => JSON.parse(localStorage.getItem('neohab:kiosk') || '{}').pinnedDashboard === 'nh-e2e-kiosk'))
    await page.goto(APP, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.location.hash === '#/d/nh-e2e-kiosk', { timeout: 10000 }).catch(() => {})
    ok('app start lands on the pinned dashboard', (await page.evaluate(() => window.location.hash)) === '#/d/nh-e2e-kiosk')
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(1500)
    ok('deep link wins over the pin', (await page.evaluate(() => window.location.hash)) === '#/settings')
    await page.evaluate(() => { window.location.hash = '#/' })
    await sleep(800)
    ok('manual Home visit is not re-redirected', (await page.evaluate(() => window.location.hash)) === '#/')
    await context.close()
  }

  {
    const { context, page } = await newPage(browser)
    await page.goto(APP + '#/d/nh-e2e-kiosk', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await setKiosk(page, { kiosk: false, screensaver: 'clock', screensaverMinutes: 0.05, wakeLock: false })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-grid', { timeout: 15000 })
    await page.waitForSelector('.nh-saver', { timeout: 10000 })
    const saver = await page.locator('.nh-saver').boundingBox()
    ok('clock saver engages after the idle timeout', !!saver)
    ok('saver covers the whole viewport', saver && saver.width === VP.width && saver.height === VP.height, JSON.stringify(saver))
    const time = await page.locator('.nh-saver__time').textContent().catch(() => null)
    ok('clock shows a time', !!time && /\d/.test(time), String(time))

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

    await setKiosk(page, { kiosk: false, screensaver: 'blank', screensaverMinutes: 0.05, wakeLock: false })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-saver', { timeout: 10000 })
    ok('blank saver has no clock', (await page.locator('.nh-saver__clock').count()) === 0)
    await page.mouse.move(600, 400) // pointer movement wakes too
    await sleep(300)
    ok('pointer movement wakes the blank saver', (await page.locator('.nh-saver').count()) === 0)
    await context.close()
  }

  {
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
