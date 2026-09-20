// Reverse-proxy sign-in + openHAB phone app hooks e2e.
// SAFE with a live config: creates only dashboard:nh-e2e-proxy, deletes exactly that, and commands NOTHING.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const DASH = 'nh-e2e-proxy'
const UID = 'dashboard:' + DASH
const del = async (u) => fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH }).catch(() => {})
const seed = async () => {
  await del(UID)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: DASH, name: 'E2E Proxy', columns: 12, rowHeight: 60,
        widgets: [
          { id: 'w1', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
          {
            id: 'w2',
            type: 'chart',
            config: { series: [{ item: ITEMS.temperature }], period: '1h', live: false, refresh: 3600 },
            layout: { lg: { x: 3, y: 0, w: 5, h: 3 } },
          },
          { id: 'w3', type: 'value', config: { item: ITEMS.temperature }, layout: { lg: { x: 8, y: 0, w: 2, h: 2 } } },
        ],
      },
    }),
  })
  return r.ok
}

const browser = await launch()
const errs = []

async function makeContext(initScript) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const seen = []
  ctx.on('request', (req) => {
    if (req.url().includes('/rest/')) {
      seen.push({ url: req.url(), headers: req.headers(), type: req.resourceType(), method: req.method() })
    }
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('dialog', (d) => void d.accept())
  await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
  if (initScript) await ctx.addInitScript(initScript)
  return { ctx, page, seen }
}

try {
  ok('seed dashboard', await seed())

  {
    const { ctx, page, seen } = await makeContext()
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('section:has(h2:text-is("Account"))', { timeout: 20000 })
    const withAuth = seen.filter((r) => r.headers.authorization)
    ok('without a proxy the token goes as Bearer', withAuth.length > 0 && withAuth.every((r) => /^Bearer /.test(r.headers.authorization)), String(withAuth[0]?.headers.authorization).slice(0, 12))
    ok('and no openHAB-token header is used', seen.every((r) => !r.headers['x-openhab-token']))
    ok('Account offers a sign-out (a token is stored)', (await page.locator('button:has-text("Sign out on this device")').count()) === 1)
    await ctx.close()
  }

  {
    const { ctx, page, seen } = await makeContext()
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('section:has(h2:text-is("Account"))', { timeout: 20000 })
    ok('Account offers a proxy sign-in while signed in', (await page.locator('button:has-text("Sign in to a reverse proxy")').count()) === 1)
    await page.click('button:has-text("Sign in to a reverse proxy")')
    await page.waitForSelector('#nh-proxy-user', { timeout: 10000 })
    ok('the sheet opens straight on the proxy form', await page.isVisible('#nh-proxy-pass'))
    await page.fill('#nh-proxy-user', 'proxyuser')
    await page.fill('#nh-proxy-pass', 'proxypass')
    await page.uncheck('#nh-proxy-remember')
    await page.click('button:has-text("Use proxy credentials")')
    await page.waitForSelector('.nh-toast', { timeout: 10000 })
    ok('a notice confirms the proxy sign-in', /Proxy sign-in applied/.test((await page.textContent('.nh-toast')) ?? ''), String(await page.textContent('.nh-toast')))
    ok('Account reports it', /reverse proxy as “proxyuser”/.test((await page.textContent('.nh-settings')) ?? ''), '')

    seen.length = 0
    await page.goto(APP + `#/d/${DASH}`)
    await page.waitForSelector('.nh-widget', { timeout: 20000 })
    await page.waitForFunction(() => !document.querySelector('.nh-chart__status'), { timeout: 30000 }).catch(() => {})
    await sleep(1200)
    const isStream = (r) =>
      r.method === 'GET' &&
      (r.type === 'eventsource' || /\/rest\/events\/states$/.test(r.url) || /\/rest\/events\?topics=/.test(r.url))
    const rest = seen.filter((r) => r.url.includes('/rest/') && !isStream(r))
    const streams = seen.filter(isStream)
    const expected = 'Basic ' + Buffer.from('proxyuser:proxypass').toString('base64')
    ok(
      'requests go out with the proxy credentials',
      rest.length > 0 && rest.every((r) => /^Basic /.test(r.headers.authorization ?? '')),
      `${rest.length}: ` +
        rest.filter((r) => !/^Basic /.test(r.headers.authorization ?? '')).map((r) => r.url.split('/rest/')[1]).join(',')
    )
    ok(
      'event streams carry no header, as the browser requires (known limitation)',
      streams.every((r) => (r.headers.authorization ?? '') === ''),
      `${streams.length} stream request(s)`
    )
    ok('base64 encoded as the proxy expects', rest.some((r) => r.headers.authorization === expected), String(rest[0]?.headers.authorization))
    ok('the token moved to X-OPENHAB-TOKEN', rest.some((r) => (r.headers['x-openhab-token'] ?? '').startsWith('oh.')), Object.keys(rest[0]?.headers ?? {}).join(','))
    ok('no Bearer header remains', rest.every((r) => !/^Bearer /.test(r.headers.authorization ?? '')))
    const history = rest.filter((r) => r.url.includes('/rest/persistence/'))
    ok('a history fetch carries them', history.length > 0 && history.every((r) => r.headers.authorization === expected), String(history.length))
    const track = rest.filter((r) => /\/rest\/events\/states\//.test(r.url))
    ok('the item-tracking POST carries them too', track.length > 0 && track.every((r) => r.headers.authorization === expected), `${track.length} tracked-item POSTs`)

    const storage = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))
    ok('the password is not written to our storage', !storage.includes('proxypass'), '')
    ok('nor the username', !storage.includes('proxyuser'), '')

    seen.length = 0
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-widget', { timeout: 20000 })
    await sleep(600)
    const after = seen.filter((r) => r.url.includes('/rest/'))
    ok('a reload does not resurrect them from anywhere', after.every((r) => !/^Basic /.test(r.headers.authorization ?? '')), String(after[0]?.headers.authorization).slice(0, 12))
    await ctx.close()
  }

  {
    const { ctx, page, seen } = await makeContext()
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('section:has(h2:text-is("Account"))', { timeout: 20000 })
    await page.click('button:has-text("Sign in to a reverse proxy")')
    await page.waitForSelector('#nh-proxy-user', { timeout: 10000 })
    await page.fill('#nh-proxy-user', 'tempuser')
    await page.fill('#nh-proxy-pass', 'temppass')
    await page.uncheck('#nh-proxy-remember')
    await page.click('button:has-text("Use proxy credentials")')
    await page.waitForSelector('.nh-settings__text:has-text("reverse proxy as")', { timeout: 10000 })
    await page.click('button:has-text("Sign out on this device")')
    await page.waitForSelector('button:has-text("Sign in")', { timeout: 10000 })
    ok('signing out clears the proxy status', (await page.locator('.nh-settings__text:has-text("reverse proxy as")').count()) === 0)
    seen.length = 0
    await page.goto(APP + `#/d/${DASH}`)
    await page.waitForSelector('.nh-widget', { timeout: 20000 })
    await sleep(600)
    ok('and the requests that follow carry no Basic header', seen.every((r) => !/^Basic /.test(r.headers.authorization ?? '')))
    await ctx.close()
  }

  {
    const { ctx, page, seen } = await makeContext(() => {
      window.__ohapp = { fullscreen: 0, pin: 0, exit: 0 }
      window.OHApp = {
        getBasicCredentialsUsername: () => 'appuser',
        getBasicCredentialsPassword: () => 'apppass',
        goFullscreen: () => {
          window.__ohapp.fullscreen++
        },
        pinToHome: () => {
          window.__ohapp.pin++
        },
        exitToApp: () => {
          window.__ohapp.exit++
        },
      }
    })
    await page.goto(APP + `#/d/${DASH}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-widget', { timeout: 20000 })
    await sleep(800)
    const rest = seen.filter((r) => r.url.includes('/rest/'))
    const expected = 'Basic ' + Buffer.from('appuser:apppass').toString('base64')
    ok('credentials from the app are used without asking', rest.some((r) => r.headers.authorization === expected), String(rest[0]?.headers.authorization).slice(0, 10))
    ok('and the token still travels in its own header', rest.some((r) => (r.headers['x-openhab-token'] ?? '').startsWith('oh.')))

    await page.goto(APP + '#/')
    await page.waitForSelector('.nh-home__app', { timeout: 20000 })
    ok('the app offers add-to-home-screen', (await page.locator('button:has-text("Add to the home screen")').count()) === 1)
    ok('and back-to-the-app', (await page.locator('button:has-text("Back to the openHAB app")').count()) === 1)
    await page.click('button:has-text("Add to the home screen")')
    await page.click('button:has-text("Back to the openHAB app")')
    const calls = await page.evaluate(() => window.__ohapp)
    ok('pin to home called the app', calls.pin === 1, JSON.stringify(calls))
    ok('exit to app called the app', calls.exit === 1, JSON.stringify(calls))

    await page.goto(APP + '#/settings')
    await page.waitForSelector('button:has-text("Enter fullscreen")', { timeout: 20000 })
    await page.click('button:has-text("Enter fullscreen")')
    await sleep(300)
    const afterFs = await page.evaluate(() => window.__ohapp)
    ok('fullscreen asks the app rather than the webview', afterFs.fullscreen === 1, JSON.stringify(afterFs))
    await ctx.close()
  }

  {
    const { ctx, page } = await makeContext()
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-home', { timeout: 20000 })
    ok('no app-only buttons in a plain browser', (await page.locator('.nh-home__app').count()) === 0)
    await ctx.close()
  }

  const realErrs = errs.filter((e) => !/Fullscreen|fullscreen|permissions policy|Document not active/.test(e))
  ok('console clean', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err).slice(0, 250))
} finally {
  await del(UID)
  const uids = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  ok('cleanup: no leftovers', !uids.includes(UID), uids.filter((u) => u.includes('nh-e2e')).join(','))
  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
