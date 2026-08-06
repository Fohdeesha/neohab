/**
 * Admin-role gating + editing lock e2e.
 *
 * Covers: the admin probe (GET /rest/persistence) runs for credentialed devices and is SKIPPED
 * for anonymous ones; lock OFF keeps today's onboarding behavior (pencil visible everywhere,
 * tapping prompts sign-in); a signed-in-but-not-admin device (garbage token -> 401) is sent to
 * the sign-in sheet instead of a doomed editor session; lock ON hides the pencil, the
 * new-dashboard tile and the config sections of Settings from non-admin devices while admin
 * devices keep everything; a locked device can still sign in via Settings > Account and the
 * affordances appear reactively without a reload; the Editing lock section itself is
 * admin-only.
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-lock (clock/label - nothing
 * commandable), snapshots the `settings` component first and restores it VERBATIM, and fails
 * hard if any context ever POSTs to /rest/items.
 */
import { chromium } from 'playwright-core'
import { BASE, APP, NS, TOKEN, AUTH } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-lock'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

/** New page in its own context; tracks probe requests, item POSTs and console errors. */
async function makePage(browser, token) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await ctx.newPage()
  const track = { probes: [], itemPosts: [], errs: [] }
  page.on('pageerror', (e) => track.errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && track.errs.push(m.text()))
  page.on('request', (r) => {
    if (r.url().includes('/rest/persistence') && r.method() === 'GET') track.probes.push(r.url())
    if (r.url().includes('/rest/items/') && r.method() === 'POST') track.itemPosts.push(r.url())
  })
  page.on('response', (r) => {
    if (r.url().endsWith('/rest/persistence') && r.request().method() === 'GET') track.probeStatus = r.status()
  })
  if (token) {
    await page.addInitScript((t) => {
      try { localStorage.setItem('neohab:apiToken', t) } catch {}
    }, token)
  }
  return { ctx, page, track }
}

// ---------- pre-suite snapshot ----------
const settingsBefore = await (await fetch(NS + '/settings', { headers: AUTH })).json()
const putSettings = async (config) => {
  const res = await fetch(NS + '/settings', {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...settingsBefore, config }),
  })
  if (!res.ok) throw new Error('settings PUT failed: ' + res.status)
}

const browser = await launch()
const pages = []

try {
  ok('settings snapshot has no lockEditing yet', settingsBefore.config.lockEditing === undefined,
    String(settingsBefore.config.lockEditing))

  // ---------- seed (nothing commandable) ----------
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-lock',
        name: 'E2E Lock',
        columns: 12,
        rowHeight: 'match',
        gap: 5,
        widgets: [
          { id: 'w-c', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
          { id: 'w-l', type: 'label', config: { text: 'lock suite' }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))

  // ================= lock OFF =================

  // ---------- admin device ----------
  const admin = await makePage(browser, TOKEN)
  pages.push(admin)
  await admin.page.goto(APP + '#/d/nh-e2e-lock', { waitUntil: 'domcontentloaded' })
  await admin.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('admin: pencil visible (lock off)', (await admin.page.locator('[aria-label="Edit dashboard"]').count()) === 1)
  await sleep(1000)
  ok('admin: probe ran and returned 200', admin.track.probes.length >= 1 && admin.track.probeStatus === 200,
    `probes=${admin.track.probes.length} status=${admin.track.probeStatus}`)

  await admin.page.goto(APP + '#/settings')
  await admin.page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
  await admin.page.waitForSelector('section:has(h2:text-is("Editing lock"))', { timeout: 10000 })
  ok('admin: Editing lock section present', true)
  ok('admin: lock checkbox unchecked', !(await admin.page.isChecked('#nh-set-lock')))
  ok('admin: account says administrator',
    (await admin.page.locator('section:has(h2:text-is("Account"))').innerText()).includes('administrator'))

  // ---------- anonymous device ----------
  const anon = await makePage(browser, null)
  pages.push(anon)
  await anon.page.goto(APP + '#/d/nh-e2e-lock', { waitUntil: 'domcontentloaded' })
  await anon.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('anon: pencil visible (lock off, onboarding path)', (await anon.page.locator('[aria-label="Edit dashboard"]').count()) === 1)
  await anon.page.click('[aria-label="Edit dashboard"]')
  await anon.page.waitForSelector('.nh-signin', { timeout: 10000 })
  ok('anon: tapping the pencil prompts sign-in', true)
  ok('anon: did not enter edit mode', (await anon.page.locator('.nh-dash__title:has-text("Editing")').count()) === 0)
  await anon.page.keyboard.press('Escape')
  await anon.page.click('.nh-sheet__close').catch(() => {})
  await sleep(1000)
  ok('anon: admin probe skipped entirely', anon.track.probes.length === 0, String(anon.track.probes.length))

  await anon.page.goto(APP + '#/settings')
  await anon.page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
  ok('anon: no Editing lock section', (await anon.page.locator('section:has(h2:text-is("Editing lock"))').count()) === 0)
  ok('anon: Backup section still visible (lock off)', (await anon.page.locator('section:has(h2:text-is("Backup"))').count()) === 1)
  const anonAccount = anon.page.locator('section:has(h2:text-is("Account"))')
  ok('anon: Account offers Sign in', (await anonAccount.locator('button:text-is("Sign in")').count()) === 1)

  // ---------- signed in but not an admin (garbage token -> 401) ----------
  const user = await makePage(browser, 'oh.notreal.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  pages.push(user)
  await user.page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await user.page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
  await user.page.waitForSelector('section:has(h2:text-is("Account")):has-text("no administrator rights")', { timeout: 10000 })
  ok('user-level: account explains missing admin rights', true)
  await user.page.goto(APP + '#/d/nh-e2e-lock')
  await user.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('user-level: pencil visible (lock off)', (await user.page.locator('[aria-label="Edit dashboard"]').count()) === 1)
  await user.page.click('[aria-label="Edit dashboard"]')
  await user.page.waitForSelector('.nh-signin', { timeout: 10000 })
  ok('user-level: pencil leads to sign-in, not a doomed editor', (await user.page.locator('.nh-dash__title:has-text("Editing")').count()) === 0)

  // ================= lock ON =================
  await putSettings({ ...settingsBefore.config, lockEditing: true })

  await anon.page.goto(APP + '#/d/nh-e2e-lock')
  await anon.page.reload({ waitUntil: 'domcontentloaded' })
  await anon.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('anon+lock: pencil hidden', (await anon.page.locator('[aria-label="Edit dashboard"]').count()) === 0)

  await anon.page.goto(APP + '#/')
  await anon.page.waitForSelector('.nh-tile', { timeout: 20000 })
  ok('anon+lock: no new-dashboard tile', (await anon.page.locator('.nh-tile--new').count()) === 0)

  await anon.page.goto(APP + '#/settings')
  await anon.page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
  for (const h of ['Custom widgets', 'Custom icons', 'Backup', 'Editing lock']) {
    ok(`anon+lock: "${h}" section hidden`, (await anon.page.locator(`section:has(h2:text-is("${h}"))`).count()) === 0)
  }
  // NOT :has-text("HABPanel") - the built-in "Aqua (HABPanel classic)" theme card would match.
  ok('anon+lock: HABPanel import hidden', (await anon.page.locator('section:has(h2:text-is("Migrate from HABPanel"))').count()) === 0)
  ok('anon+lock: theme cards still shown', (await anon.page.locator('.nh-theme__pick').count()) > 0)
  ok('anon+lock: no "New theme"', (await anon.page.locator('button:has-text("New theme")').count()) === 0)
  ok('anon+lock: sidebar toggle hidden', (await anon.page.locator('#nh-set-sidebar').count()) === 0)
  ok('anon+lock: device text size still there', (await anon.page.locator('#nh-set-textsize').count()) === 1)
  ok('anon+lock: kiosk per-device settings still there', (await anon.page.locator('#kiosk-pinned').count()) === 1)
  ok('anon+lock: control-item picker hidden', (await anon.page.locator('#kiosk-controlitem').count()) === 0)
  ok('anon+lock: Account Sign in still there',
    (await anon.page.locator('section:has(h2:text-is("Account")) button:text-is("Sign in")').count()) === 1)

  await user.page.goto(APP + '#/d/nh-e2e-lock')
  await user.page.reload({ waitUntil: 'domcontentloaded' })
  await user.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('user-level+lock: pencil hidden', (await user.page.locator('[aria-label="Edit dashboard"]').count()) === 0)

  await admin.page.goto(APP + '#/d/nh-e2e-lock')
  await admin.page.reload({ waitUntil: 'domcontentloaded' })
  await admin.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('admin+lock: pencil still visible', (await admin.page.locator('[aria-label="Edit dashboard"]').count()) === 1)
  await admin.page.goto(APP + '#/settings')
  await admin.page.waitForSelector('#nh-set-lock', { timeout: 20000 })
  ok('admin+lock: lock checkbox checked', await admin.page.isChecked('#nh-set-lock'))
  ok('admin+lock: Backup section still visible', (await admin.page.locator('section:has(h2:text-is("Backup"))').count()) === 1)

  // ---------- locked device signs in via Settings > Account, affordances appear live ----------
  const wall = await makePage(browser, null)
  pages.push(wall)
  await wall.page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await wall.page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
  ok('locked wall: config sections hidden before sign-in',
    (await wall.page.locator('section:has(h2:text-is("Backup"))').count()) === 0)
  await wall.page.click('section:has(h2:text-is("Account")) button:text-is("Sign in")')
  await wall.page.waitForSelector('.nh-signin', { timeout: 10000 })
  await wall.page.click('button:has-text("Use an API token instead")')
  await wall.page.fill('#nh-token', TOKEN)
  await wall.page.click('button:has-text("Use token")')
  await wall.page.waitForSelector('section:has(h2:text-is("Editing lock"))', { timeout: 15000 })
  ok('locked wall: admin sections appear after sign-in, no reload', true)
  ok('locked wall: Backup back too', (await wall.page.locator('section:has(h2:text-is("Backup"))').count()) === 1)
  await wall.page.goto(APP + '#/d/nh-e2e-lock')
  await wall.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('locked wall: pencil visible after sign-in', (await wall.page.locator('[aria-label="Edit dashboard"]').count()) === 1)

  // ---------- hygiene ----------
  for (const [name, p] of [['admin', admin], ['anon', anon], ['user', user], ['wall', wall]]) {
    ok(`${name}: zero item commands sent`, p.track.itemPosts.length === 0, p.track.itemPosts.join(' '))
    // A credentialed-but-rejected device legitimately logs 401 resource errors (the probe and
    // the client's anonymous retry); everything else must be clean.
    const errs = p.track.errs.filter((e) => !/Failed to load resource.*401|401.*Unauthorized/i.test(e))
    ok(`${name}: console clean`, errs.length === 0, errs.slice(0, 3).join(' | '))
  }
} finally {
  // ---------- cleanup: settings verbatim, seed deleted ----------
  try {
    const res = await fetch(NS + '/settings', {
      method: 'PUT',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsBefore),
    })
    console.log('cleanup: settings restored', res.status)
  } catch (e) {
    console.log('cleanup: settings restore FAILED', e)
  }
  try {
    const res = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
    console.log('cleanup: seed deleted', res.status)
  } catch (e) {
    console.log('cleanup: seed delete FAILED', e)
  }
  const after = await (await fetch(NS + '/settings', { headers: AUTH })).json()
  const norm = (o) => JSON.stringify({ ...o, timestamp: undefined })
  ok('cleanup: settings content identical', norm(after) === norm(settingsBefore))
  const uids = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  ok('cleanup: no leftovers', !uids.includes(UID))

  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  if (fails.length) {
    console.log('FAILURES:', fails.map((f) => f.name).join(' ; '))
    process.exitCode = 1
  } else {
    console.log('ALL PASS')
  }
}
