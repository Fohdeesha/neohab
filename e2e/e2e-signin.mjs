// Sign-in flow e2e: the "Log in with openHAB" button must actually START the PKCE flow.
// SAFE with a live config: creates only dashboard:nh-e2e-pkce and dashboard:nh-e2e-sisave (both
// deleted by exact uid), commands nothing, and only ever signs in as the throwaway user.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, AUTH, TEST_USER, HTTPS } from './lib/target.mjs'

const PKCE_UID = 'dashboard:nh-e2e-pkce'
const SAVE_UID = 'dashboard:nh-e2e-sisave'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()

async function clickLogin(page) {
  await page.waitForSelector('button:has-text("Log in with openHAB")', { timeout: 5000 })
  await Promise.all([
    page.waitForURL('**/auth**', { timeout: 8000 }).catch(() => {}),
    page.click('button:has-text("Log in with openHAB")'),
  ])
  await sleep(300)
  return page.url()
}

function checkAuthUrl(url, label) {
  const u = new URL(url)
  ok(`${label}: navigates to the core /auth page`, u.origin + u.pathname === BASE + '/auth', url.slice(0, 120))
  const q = u.searchParams
  ok(`${label}: S256 challenge method`, q.get('code_challenge_method') === 'S256')
  ok(`${label}: challenge is a 43-char base64url hash`, /^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') ?? ''), q.get('code_challenge') ?? 'none')
  ok(`${label}: state present`, (q.get('state') ?? '').length > 0)
  ok(
    `${label}: redirect_uri is the app page, no query or hash`,
    q.get('redirect_uri') === APP,
    q.get('redirect_uri') ?? 'none'
  )
  ok(`${label}: client_id equals redirect_uri`, q.get('client_id') === q.get('redirect_uri'), q.get('client_id') ?? 'none')
}

try {
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    const rejections = []
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (e) => {
        window.__rej = (window.__rej ?? []).concat(String(e.reason))
      })
    })
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    const subtle = await page.evaluate(() => !!window.crypto.subtle)
    ok(
      HTTPS ? 'this origin has SubtleCrypto, as a secure context must' : 'this origin has no SubtleCrypto (the case that was broken)',
      subtle === HTTPS,
      'subtle ' + subtle
    )
    await page.waitForSelector('h2:text-is("Account")', { timeout: 15000 })
    await page.click('section:has(h2:text-is("Account")) button:has-text("Sign in")')
    const url = await clickLogin(page)
    checkAuthUrl(url, 'settings')
    ok('settings: the openHAB login form rendered', (await page.locator('input[type="password"]').count()) > 0)
    ok('settings: no unhandled rejection', ((await page.evaluate(() => window.__rej ?? [])).length) === 0)

    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Account")', { timeout: 10000 })
    ok('settings: back returns to the app', true)
    await page.close()
  }

  if (!TEST_USER) {
    console.log('SKIP  no throwaway login in the target configuration - credential exchange not exercised (see README)')
  } else {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    page.on('dialog', (d) => d.accept())

    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Account")', { timeout: 15000 })
    await page.click('section:has(h2:text-is("Account")) button:has-text("Sign in")')
    await clickLogin(page)
    await page.fill('input[name="username"]', TEST_USER.name)
    await page.fill('input[type="password"]', TEST_USER.password)
    await Promise.all([
      page.waitForURL((u) => u.pathname.endsWith('/neohab/index.html'), { timeout: 15000 }),
      page.click('form button[type="submit"], form input[type="submit"], form button'),
    ])
    ok('exchange: server redirected back to the app', true, page.url().slice(0, 100))

    await page.waitForFunction(() => !window.location.search.includes('code='), undefined, { timeout: 15000 })
    ok('exchange: auth code stripped from the address', !page.url().includes('code='), page.url().slice(0, 120))
    await page.waitForFunction(() => !!localStorage.getItem('neohab:refreshToken'), undefined, { timeout: 10000 }).catch(() => {})
    ok('exchange: refresh token stored', await page.evaluate(() => !!localStorage.getItem('neohab:refreshToken')))

    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page
      .waitForSelector('text=Signed in as an administrator.', { timeout: 10000 })
      .catch(() => {})
    ok(
      'exchange: admin role read from the session token',
      (await page.locator('text=Signed in as an administrator.').count()) === 1
    )

    // a killed earlier run's copy would answer the check below whatever this session could write
    await fetch(NS + '/' + PKCE_UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tile--new, .nh-welcome__actions button', { timeout: 10000 })
    const viaTile = (await page.locator('.nh-tile--new').count()) === 1
    await page.click(viaTile ? '.nh-tile--new' : '.nh-welcome__actions button:has-text("Create your first dashboard")')
    await page.waitForSelector('#nh-newdash-name', { timeout: 5000 })
    await page.fill('#nh-newdash-name', 'nh-e2e-pkce')
    await page.click('button:has-text("Create dashboard")')
    await sleep(1200)
    const created = await fetch(NS + '/' + PKCE_UID, { headers: AUTH })
    ok('exchange: session token performs an admin write', created.ok)
    await fetch(NS + '/' + PKCE_UID, { method: 'DELETE', headers: AUTH })

    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button:has-text("Sign out on this device")', { timeout: 10000 })
    const refresh = await page.evaluate(() => localStorage.getItem('neohab:refreshToken'))
    let logoutStatus = 0
    page.on('response', (r) => {
      if (r.url().endsWith('/rest/auth/logout')) logoutStatus = r.status()
    })
    await page.click('button:has-text("Sign out on this device")')
    await sleep(1500)
    ok('sign-out: refresh token forgotten', await page.evaluate(() => !localStorage.getItem('neohab:refreshToken')))
    ok(
      'sign-out: account section back to anonymous',
      // scoped to Account: About renders the same words as a role ("not signed in, no live item states")
      (await page.locator('section:has(h2:text-is("Account")) >> text=Not signed in').count()) === 1
    )
    ok('sign-out: the server accepted the revocation', logoutStatus === 200, 'status=' + logoutStatus)
    const reuse = await fetch(BASE + '/rest/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: BASE + '/neohab/index.html',
        refresh_token: refresh ?? '',
      }).toString(),
    })
    ok('sign-out: the session is gone from the server', !reuse.ok, 'reuse status=' + reuse.status)

    const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
    ok('exchange: no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
    await page.close()
  }

  // "Sign in and save" leads with the openHAB login, which is another page: the draft has to survive the trip,
  // and the app has to come back to the dashboard rather than to Home. The save is refused once to get there.
  if (TEST_USER) {
    await fetch(NS + '/' + SAVE_UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
    await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: SAVE_UID,
        component: 'neohab:dashboard',
        config: { version: 3, id: 'nh-e2e-sisave', name: 'NH E2E Sign-in round trip', columns: 12, rowHeight: 'match', widgets: [] }
      })
    })
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
    const page = await ctx.newPage()
    const dialogs = []
    page.on('dialog', (d) => {
      dialogs.push(d.type())
      void d.accept()
    })
    // back on the app, the code is exchanged for a session and the address tidied; leaving before that loses it
    const login = async () => {
      await page.fill('input[name="username"]', TEST_USER.name)
      await page.fill('input[type="password"]', TEST_USER.password)
      await Promise.all([
        page.waitForURL((u) => u.pathname.endsWith('/neohab/index.html'), { timeout: 15000 }),
        page.click('form button[type="submit"], form input[type="submit"], form button')
      ])
      await page.waitForFunction(() => !location.search.includes('code='), undefined, { timeout: 15000 }).catch(() => {})
      await page.waitForFunction(() => !!localStorage.getItem('neohab:refreshToken'), undefined, { timeout: 10000 }).catch(() => {})
    }
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Account")', { timeout: 15000 })
    await page.click('section:has(h2:text-is("Account")) button:has-text("Sign in")')
    await clickLogin(page)
    await login()
    ok('sign in and save: signed in from Settings comes back to Settings', /#\/settings/.test(page.url()), page.url().slice(-40))

    await page.goto(APP + '#/d/nh-e2e-sisave', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.click('[aria-label="Dashboard settings"]')
    await page.fill('#nh-dash-name', 'NH E2E Sign-in round trip, kept')
    // every write of the first save is refused as an expired session would be (an update, then the create it
    // falls back to), so nothing reaches the server until the sign-in has happened
    let refusing = true
    let refused = 0
    await page.route(/neohab(:|%3A)config/, async (route) => {
      const m = route.request().method()
      if ((m === 'PUT' || m === 'POST') && refusing) {
        refused++
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"Authentication required"}}' })
      }
      return route.fallback()
    })
    // exact and scoped: the sidebar lists dashboards by name, and a text match is a case-insensitive substring
    await page.click('.nh-dash__bar button:text-is("Save")')
    await page.waitForSelector('button:has-text("Sign in and save")', { timeout: 10000 }).catch(() => {})
    ok('sign in and save: a refused save offers the sign-in', (await page.locator('button:has-text("Sign in and save")').count()) === 1, 'refused=' + refused)
    refusing = false
    await page.click('button:has-text("Sign in and save")').catch(() => {})
    const authUrl = await clickLogin(page).catch(() => page.url())
    ok('sign in and save: the openHAB login page opened', new URL(authUrl).pathname.endsWith('/auth'), authUrl.slice(0, 80))
    ok('sign in and save: leaving for it asked nothing', !dialogs.includes('beforeunload'), dialogs.join(',') || 'no dialogs')
    await login().catch(() => {})
    await page.waitForFunction(() => location.hash.startsWith('#/d/'), undefined, { timeout: 10000 }).catch(() => {})
    ok('sign in and save: back on the dashboard it started from', page.url().includes('#/d/nh-e2e-sisave'), page.url().slice(-40))
    let saved = null
    for (let i = 0; i < 20 && saved !== 'NH E2E Sign-in round trip, kept'; i++) {
      await sleep(500)
      const r = await fetch(NS + '/' + SAVE_UID, { headers: AUTH })
      saved = r.ok ? (await r.json()).config?.name : null
    }
    ok('sign in and save: the change made before the login is on the server', saved === 'NH E2E Sign-in round trip, kept', String(saved))
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('button:has-text("Sign out on this device")', { timeout: 10000 }).catch(() => {})
    await page.click('button:has-text("Sign out on this device")').catch(() => {})
    await sleep(800)
    await ctx.close()
  }

  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    await page.addInitScript(() => {
      crypto.getRandomValues = () => {
        throw new Error('nh-e2e forced failure')
      }
    })
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Account")', { timeout: 15000 })
    await page.click('section:has(h2:text-is("Account")) button:has-text("Sign in")')
    await page.waitForSelector('button:has-text("Log in with openHAB")', { timeout: 5000 })
    await page.click('button:has-text("Log in with openHAB")')
    await page.waitForSelector('.nh-toasts', { timeout: 5000 }).catch(() => {})
    const toast = await page.locator('.nh-toasts').textContent().catch(() => '')
    ok('a sign-in failure shows a notice', (toast ?? '').includes('Sign-in failed'), (toast ?? '').slice(0, 80))
    ok('the failure did not navigate anywhere', page.url().includes('/neohab/'), page.url())
    await page.close()
  }
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/' + PKCE_UID, { method: 'DELETE', headers: AUTH })
await fetch(NS + '/' + SAVE_UID, { method: 'DELETE', headers: AUTH })
{
  const r = await fetch(NS + '/' + PKCE_UID, { headers: AUTH })
  ok('cleanup: exchange dashboard absent', !r.ok)
  const s = await fetch(NS + '/' + SAVE_UID, { headers: AUTH })
  ok('cleanup: sign-in-and-save dashboard absent', !s.ok)
}

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exitCode = allPass ? 0 : 1
