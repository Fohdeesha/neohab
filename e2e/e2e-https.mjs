/**
 * neohab served over TLS.
 *
 * Everything here is either only true over HTTPS or only false over HTTPS, so none of it can be
 * seen by a battery against a plain-HTTP server - which, until now, was every battery this project
 * has ever run. Four things change when openHAB is reached at https://:
 *
 *   1. the page becomes a SECURE CONTEXT, so the service worker registers (the PWA does nothing at
 *      all over http), the wake lock is offered, and `crypto.subtle` exists - which means the PKCE
 *      challenge takes a completely different code path from the one the http suites exercise;
 *   2. every `http://` address the page would LOAD is blocked as mixed content, silently, which is
 *      what the widgets and the settings form now say out loud;
 *   3. REST, the item-state stream and every asset travel over TLS;
 *   4. the certificate has to be one the browser accepts, which openHAB's self-signed one is not.
 *
 * That last point is the reason the harness passes `--ignore-certificate-errors` (see
 * lib/target.mjs): it makes the origin trusted, the way a real deployment behind a real
 * certificate is. It is also the honest limit of this suite - it says nothing about what a browser
 * does when it does NOT trust the certificate, which the README covers instead.
 *
 * SAFE: creates only dashboard:nh-e2e-https and deletes exactly that in a guarded cleanup, reads
 * the configured dimmer without ever commanding it, and writes no settings. Self-skips with a
 * clear line when the target is not an https:// address, so it is inert in the ordinary battery.
 */
import { launchBrowser } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS, HTTPS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-https'
const DASH = 'nh-e2e-https'
const ITEM = ITEMS.dimmer

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Read something out of the page without letting a missing element abort the section. */
const probe = async (page, fn, arg) => {
  try {
    return await page.evaluate(fn, arg)
  } catch {
    return {}
  }
}

if (!HTTPS) {
  console.log('e2e-https: target is ' + BASE + ', not an https:// address - skipping.')
  console.log('           Run it with NEOHAB_E2E_TARGET pointing at an HTTPS target to exercise it.')
  console.log('\nALL PASS (0 checks, skipped)')
  process.exit(0)
}

let browser
try {
  // ================= seed =================
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: DASH,
        name: 'E2E HTTPS',
        columns: 12,
        rowHeight: 'match',
        widgets: [
          // A live reading, so the item-state stream is proved to arrive over TLS.
          { id: 'w-val', type: 'value', config: { item: ITEM, label: 'Level' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
          // The three addresses the page would LOAD. All http, all on this same box, so they are
          // reachable in principle and mixed content is the only reason they cannot be used.
          { id: 'w-frame', type: 'frame', config: { url: 'http://192.168.1.27:9033/neohab/index.html', label: 'Frame' }, layout: { lg: { x: 3, y: 0, w: 4, h: 3 } } },
          { id: 'w-img', type: 'image', config: { url: 'http://192.168.1.27:9033/neohab/tile.png', label: 'Image' }, layout: { lg: { x: 7, y: 0, w: 3, h: 3 } } },
          { id: 'w-cam', type: 'camera', config: { source: 'url', url: 'http://192.168.1.27:9033/stream.m3u8', label: 'Cam' }, layout: { lg: { x: 0, y: 3, w: 4, h: 3 } } },
          // The counterexample: an https address of our own, which must NOT be warned about.
          { id: 'w-ok', type: 'image', config: { url: BASE + '/neohab/tile.png', label: 'Fine' }, layout: { lg: { x: 4, y: 3, w: 3, h: 3 } } },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, 'HTTP ' + seed.status)

  // The REST layer itself, over TLS, before a browser is involved.
  const rest = await fetch(BASE + '/rest/', { headers: AUTH })
  const root = rest.ok ? await rest.json() : {}
  ok('REST answers over TLS', rest.ok && !!root.version, 'HTTP ' + rest.status + ' runtime ' + (root.runtimeInfo?.version ?? '?'))

  browser = await launchBrowser()

  // ================= 1. a secure context, and what that buys =================
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const failures = []
    page.on('console', (m) => {
      if (m.type() === 'error' && isAppResource(m.location().url ?? '')) failures.push(m.text().slice(0, 120))
    })
    await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})

    const caps = await probe(page, () => ({
      secure: window.isSecureContext,
      protocol: location.protocol,
      subtle: !!window.crypto?.subtle,
      wakeLock: !!navigator.wakeLock,
      clipboard: !!navigator.clipboard?.writeText,
      serviceWorker: !!navigator.serviceWorker,
      cells: document.querySelectorAll('.nh-gcell').length,
    }))
    ok('the page is a secure context', caps.secure === true, JSON.stringify(caps.protocol))
    ok('crypto.subtle is available', caps.subtle === true)
    ok('the wake lock is offered', caps.wakeLock === true)
    ok('the clipboard is available', caps.clipboard === true)
    ok('the dashboard renders over TLS', (caps.cells ?? 0) >= 5, 'cells ' + caps.cells)

    // The wake lock, actually taken. e2e-kiosk can only ask for it behind a browser flag that
    // pretends an http origin is secure; here it is the real thing.
    const lock = await probe(page, async () => {
      try {
        const s = await navigator.wakeLock.request('screen')
        const held = !s.released
        await s.release()
        return { held }
      } catch (e) {
        return { held: false, err: String(e).slice(0, 80) }
      }
    })
    ok('a screen wake lock is granted', lock.held === true, lock.err ?? '')

    // The item-state stream, over TLS. The value widget shows the placeholder until a state
    // arrives, and the live-status pill appears when the stream is not carrying anything.
    let text = ''
    for (let i = 0; i < 40; i++) {
      text = String((await probe(page, () => document.querySelector('.nh-value__text')?.textContent ?? '')) || '')
      if (text && text.trim() !== '-') break
      await sleep(500)
    }
    const rested = await fetch(BASE + '/rest/items/' + ITEM, { headers: AUTH })
    const live = rested.ok ? (await rested.json()).state : ''
    ok('an item state arrives over TLS', !!text && text.trim() !== '-', 'shows ' + JSON.stringify(text) + ', server says ' + JSON.stringify(live))
    const pill = await page.locator('.nh-live').count().catch(() => 0)
    ok('live updates are not reported as stalled', pill === 0, 'notices ' + pill)

    ok('no app resource failed over TLS', failures.length === 0, failures.slice(0, 3).join(' | '))
    await context.close()
  }

  // ================= 2. mixed content: what the page may not load =================
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
    await sleep(1500)

    const drawn = await probe(page, () => {
      const cell = (n) => document.querySelectorAll('.nh-gcell')[n]
      const textOf = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
      return {
        // The three widgets that would load an http address say so, rather than drawing an empty
        // frame, a broken image and a camera that looks switched off.
        frame: textOf(cell(1)),
        image: textOf(cell(2)),
        camera: textOf(cell(3)),
        frames: document.querySelectorAll('.nh-frame iframe').length,
        // The https image is untouched: present, and actually decoded.
        okImg: (() => {
          const i = cell(4)?.querySelector('img')
          return i ? { present: true, w: i.naturalWidth } : { present: false, w: 0 }
        })(),
      }
    })
    const says = (s) => /https/i.test(s) && /http:\/\//.test(s)
    ok('the frame widget says why it is empty', says(drawn.frame ?? ''), JSON.stringify(drawn.frame))
    ok('an http address is not embedded anyway', drawn.frames === 0, 'iframes ' + drawn.frames)
    ok('the image widget says why', says(drawn.image ?? ''), JSON.stringify(drawn.image))
    ok('the camera widget says why', says(drawn.camera ?? ''), JSON.stringify(drawn.camera))
    ok(
      'an https image is left alone and decodes',
      drawn.okImg?.present === true && (drawn.okImg?.w ?? 0) > 0,
      JSON.stringify(drawn.okImg)
    )

    // And the browser really would have refused it, which is what the message is claiming.
    const blocked = await probe(page, async () => {
      try {
        await fetch('http://192.168.1.27:9033/rest/')
        return { fetch: 'allowed' }
      } catch (e) {
        return { fetch: 'blocked', why: String(e).slice(0, 60) }
      }
    })
    ok('the browser does block an http fetch from this page', blocked.fetch === 'blocked', JSON.stringify(blocked))

    await context.close()
  }

  // ================= 3. the settings form warns as the address is typed =================
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await context.newPage()
    await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
    await page.locator('[aria-label="Edit dashboard"]').click().catch(() => {})
    await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
    // The image widget, whose URL field is one of the declared subresource fields.
    await page.locator('.nh-cell').nth(2).click().catch(() => {})
    await page.waitForSelector('.nh-form', { timeout: 10000 }).catch(() => {})

    const field = page.locator('.nh-field', { has: page.locator('input') }).filter({ hasText: 'Image URL' })
    const warnFor = async () => (await page.locator('.nh-field__warn').count().catch(() => 0))
    ok('an http address is flagged in its own field', (await warnFor()) >= 1, 'warnings ' + (await warnFor()))

    // Typed, not filled: the point is that the answer arrives while the address is being written.
    // Each check reads the count either side of its own typing, so neither can pass on a build
    // that never warns about anything - which is what "0 warnings, therefore correct" would be.
    const input = field.locator('input').first()
    const retype = async (value) => {
      const before = await warnFor()
      await input.click().catch(() => {})
      await input.press('Control+a').catch(() => {})
      await input.press('Backspace').catch(() => {})
      await input.type(value, { delay: 10 }).catch(() => {})
      await sleep(300)
      return { before, after: await warnFor() }
    }
    const toHttps = await retype('https://example.invalid/x.png')
    ok('the warning goes when the address becomes https', toHttps.before === 1 && toHttps.after === 0, JSON.stringify(toHttps))
    const toHttp = await retype('http://example.invalid/x.png')
    ok('and comes back when it becomes http again', toHttp.before === 0 && toHttp.after === 1, JSON.stringify(toHttp))

    // Leave without saving: this suite writes nothing through the app.
    page.once('dialog', (d) => void d.accept())
    await page.locator('.nh-dash__bar button', { hasText: 'Exit' }).click().catch(() => {})
    await sleep(500)
    await context.close()
  }

  // ================= 4. PKCE takes the SubtleCrypto path, and gets it right =================
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Settings > Account > Sign in opens the sheet; the PKCE button lives in the sheet, not on
    // the page. Same route e2e-signin drives over http.
    await page.waitForSelector('h2:text-is("Account")', { timeout: 20000 }).catch(() => {})
    await page.click('section:has(h2:text-is("Account")) button:has-text("Sign in")').catch(() => {})
    await page.waitForSelector('button:has-text("Log in with openHAB")', { timeout: 10000 }).catch(() => {})
    await Promise.all([
      page.waitForURL('**/auth**', { timeout: 15000 }).catch(() => {}),
      page.click('button:has-text("Log in with openHAB")').catch(() => {}),
    ])
    await sleep(400)

    const url = new URL(page.url())
    const challenge = url.searchParams.get('code_challenge') ?? ''
    ok('the login flow reaches openHAB over TLS', url.protocol === 'https:' && url.pathname === '/auth', page.url().slice(0, 60))
    ok('it asks for S256', url.searchParams.get('code_challenge_method') === 'S256')

    // The challenge SubtleCrypto produced, checked against SubtleCrypto. Over http this whole
    // branch is dead - `crypto.subtle` is undefined there and the bundled SHA-256 runs instead -
    // so this is the only place the shipped secure-context path is ever executed.
    const verifier = await page.evaluate(() => sessionStorage.getItem('neohab:codeVerifier')).catch(() => null)
    ok('a verifier was stored', !!verifier && verifier.length >= 43, 'length ' + (verifier ?? '').length)
    const expected = await page
      .evaluate(async (v) => {
        const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))
        let s = ''
        for (const b of d) s += String.fromCharCode(b)
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      }, verifier ?? '')
      .catch(() => '')
    ok('the challenge is the SHA-256 of that verifier', !!challenge && challenge === expected, challenge.slice(0, 12) + ' vs ' + String(expected).slice(0, 12))
    ok('the login form is served', (await page.locator('form input[type="password"]').count().catch(() => 0)) === 1)
    await context.close()
  }

  // ================= 5. the PWA, which does not exist at all over http =================
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded', timeout: 30000 })

    const sw = await page
      .evaluate(
        () =>
          new Promise((res) => {
            setTimeout(() => res({ state: 'timeout' }), 20000)
            navigator.serviceWorker?.ready.then(
              (r) => res({ state: r.active ? 'active' : 'registered', scope: r.scope }),
              (e) => res({ state: 'rejected', err: String(e).slice(0, 100) })
            )
          })
      )
      .catch((e) => ({ state: 'threw', err: String(e).slice(0, 100) }))
    ok('the service worker registers over TLS', sw.state === 'active', JSON.stringify(sw))

    // Give the precache a moment to finish, then look at what it actually holds.
    let cached = { n: 0, names: [], rest: [] }
    for (let i = 0; i < 20; i++) {
      cached = await probe(page, async () => {
        const names = await caches.keys()
        const urls = []
        for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push(r.url)
        return { n: urls.length, names, rest: urls.filter((u) => /\/rest\//.test(u)) }
      })
      if ((cached.n ?? 0) > 10) break
      await sleep(500)
    }
    ok('the app shell is precached', (cached.n ?? 0) > 10, cached.n + ' entries in ' + JSON.stringify(cached.names))
    // The standing rule from the day the PWA landed: item states must never be served from a
    // cache, because stale readings are worse than an honest failure.
    ok('nothing under /rest/ is cached', (cached.rest ?? []).length === 0, (cached.rest ?? []).slice(0, 2).join(' '))

    const manifest = await fetch(BASE + '/neohab/manifest.json')
    ok('the manifest is served over TLS', manifest.ok && /json/.test(manifest.headers.get('content-type') ?? ''), 'HTTP ' + manifest.status + ' ' + manifest.headers.get('content-type'))
    await context.close()
  }
} catch (err) {
  ok('suite ran to completion', false, String(err).slice(0, 300))
} finally {
  if (browser) await browser.close().catch(() => {})
  // Cleanup, and its own check: exactly what this suite made, and nothing else.
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
  const mine = left.filter((c) => c.uid === UID)
  ok('cleanup left nothing of this suite behind', mine.length === 0, mine.map((c) => c.uid).join(', '))
}

let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
}
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'} (${results.length} checks)`)
process.exitCode = failed === 0 ? 0 : 1
