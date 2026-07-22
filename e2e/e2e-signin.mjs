/**
 * Sign-in flow e2e: the "Log in with openHAB" button must actually START the PKCE flow -
 * navigate to the core-served /auth login page with a well-formed S256 challenge - from both
 * entry points (Settings > Account, and the dashboard pencil), on ANY origin. On plain-HTTP
 * origins SubtleCrypto does not exist, and a missing fallback once left the button silently
 * dead (found by a user, not by the suites - hence this suite). Also proves a failure inside
 * authorize() surfaces as a notice instead of vanishing into an unhandled rejection.
 *
 * SAFE with a live config: creates nothing, commands nothing, signs nothing in (it stops at
 * the server's login form - completing the exchange needs user credentials no test has).
 */
import { chromium } from 'playwright-core'
import { BASE, APP } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}
const browser = await launch()

/** Click the PKCE button and return the URL it lands on (or the unchanged URL on failure). */
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
}

try {
  // ---------- entry point 1: Settings > Account (anonymous device, plain HTTP) ----------
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    const rejections = []
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (e) => {
        window.__rej = (window.__rej ?? []).concat(String(e.reason))
      })
    })
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    ok('this origin has no SubtleCrypto (the case that was broken)', !(await page.evaluate(() => !!window.crypto.subtle)))
    await page.waitForSelector('h2:text-is("Account")', { timeout: 15000 })
    await page.click('section:has(h2:text-is("Account")) button:has-text("Sign in")')
    const url = await clickLogin(page)
    checkAuthUrl(url, 'settings')
    ok('settings: the openHAB login form rendered', (await page.locator('input[type="password"]').count()) > 0)
    ok('settings: no unhandled rejection', ((await page.evaluate(() => window.__rej ?? [])).length) === 0)

    // back lands in the app, still anonymous, still working
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Account")', { timeout: 10000 })
    ok('settings: back returns to the app', true)
    await page.close()
  }

  // ---------- entry point 2: the dashboard pencil (when this server shows one) ----------
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-home', { timeout: 15000 })
    const tile = page.locator('.nh-tile:not(.nh-tile--new)').first()
    if ((await tile.count()) === 0) {
      console.log('SKIP  no dashboards on this server - pencil entry point not exercised')
    } else {
      await tile.click()
      await page.waitForSelector('.nh-dash__bar', { timeout: 10000 })
      const pencil = page.locator('[aria-label="Edit dashboard"]')
      if ((await pencil.count()) === 0) {
        console.log('SKIP  editing lock hides the pencil for anonymous devices - entry point not exercised')
      } else {
        await pencil.click()
        const url = await clickLogin(page)
        checkAuthUrl(url, 'pencil')
      }
    }
    await page.close()
  }

  // ---------- a failure inside authorize() must surface, never vanish ----------
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

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
