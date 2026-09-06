// Admin-role gating e2e. The model under test (like openHAB's own UIs): only administrator devices see any
// editing affordance.
// SAFE with a live config: creates only dashboard:nh-e2e-lock (clock/label, nothing commandable), snapshots
// the `settings` component first and restores it VERBATIM, and.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH } from './lib/target.mjs'
import { getSettings, putComponent, restoreSettings, settingsWithoutKeys } from './lib/components.mjs'

const UID = 'dashboard:nh-e2e-lock'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

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

const settingsBefore = await getSettings()
const baseSettings = settingsWithoutKeys(settingsBefore, ['lockEditing', 'allowAnonymousEditing'])
const putSettingsComp = async (comp) => {
  const res = await putComponent(NS, comp)
  if (!res.ok) throw new Error('settings write failed: ' + res.status)
}

const browser = await launch()
const pages = []

try {
  await putSettingsComp(baseSettings)

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

  const admin = await makePage(browser, TOKEN)
  pages.push(admin)
  await admin.page.goto(APP + '#/d/nh-e2e-lock', { waitUntil: 'domcontentloaded' })
  await admin.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('admin: pencil visible', (await admin.page.locator('[aria-label="Edit dashboard"]').count()) === 1)
  await sleep(1000)
  ok('admin: probe ran and returned 200', admin.track.probes.length >= 1 && admin.track.probeStatus === 200,
    `probes=${admin.track.probes.length} status=${admin.track.probeStatus}`)

  await admin.page.goto(APP + '#/settings')
  await admin.page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
  ok('admin: Backup section visible', (await admin.page.locator('section:has(h2:text-is("Backup"))').count()) === 1)
  ok('admin: no anonymous-editing switch exists (the feature is gone)',
    (await admin.page.locator('section:has(h2:text-is("Anonymous editing"))').count()) === 0 &&
      (await admin.page.locator('#nh-set-anonedit').count()) === 0)
  ok('admin: account says administrator',
    (await admin.page.locator('section:has(h2:text-is("Account"))').innerText()).includes('administrator'))

  const anon = await makePage(browser, null)
  pages.push(anon)
  await anon.page.goto(APP + '#/d/nh-e2e-lock', { waitUntil: 'domcontentloaded' })
  await anon.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('anon: dashboard renders (viewing is never gated)', (await anon.page.locator('.nh-widget').count()) >= 2)
  ok('anon: no pencil', (await anon.page.locator('[aria-label="Edit dashboard"]').count()) === 0)
  await sleep(1000)
  ok('anon: admin probe skipped entirely', anon.track.probes.length === 0, String(anon.track.probes.length))

  await anon.page.goto(APP + '#/')
  await anon.page.waitForSelector('.nh-tile', { timeout: 20000 })
  ok('anon: no new-dashboard tile', (await anon.page.locator('.nh-tile--new').count()) === 0)

  await anon.page.goto(APP + '#/settings')
  await anon.page.waitForSelector('#nh-set-devicetheme', { timeout: 20000 })
  for (const h of ['Custom widgets', 'Lighting presets', 'Custom icons', 'Backup']) {
    ok(`anon: "${h}" section hidden`, (await anon.page.locator(`section:has(h2:text-is("${h}"))`).count()) === 0)
  }
  ok('anon: HABPanel import hidden', (await anon.page.locator('section:has(h2:text-is("Migrate from HABPanel"))').count()) === 0)
  ok('anon: shared theme cards hidden (they write panel config)', (await anon.page.locator('.nh-theme__pick').count()) === 0)
  await sleep(1200)
  ok('anon: Settings makes no admin probe either', anon.track.probes.length === 0, String(anon.track.probes.length))
  ok(
    'anon: the persistence row says an administrator is needed',
    /administrator/i.test((await anon.page.locator('.nh-about dd').nth(3).textContent().catch(() => '')) ?? ''),
    (await anon.page.locator('.nh-about dd').nth(3).textContent().catch(() => '')) ?? ''
  )
  ok('anon: per-device theme select still there', (await anon.page.locator('#nh-set-devicetheme').count()) === 1)
  ok('anon: no "New theme"', (await anon.page.locator('button:has-text("New theme")').count()) === 0)
  ok('anon: sidebar toggle hidden', (await anon.page.locator('#nh-set-sidebar').count()) === 0)
  ok('anon: device text size still there', (await anon.page.locator('#nh-set-textsize').count()) === 1)
  ok('anon: kiosk per-device settings still there', (await anon.page.locator('#kiosk-pinned').count()) === 1)
  ok('anon: control-item picker hidden', (await anon.page.locator('#kiosk-controlitem').count()) === 0)
  ok('anon: speech-item picker hidden', (await anon.page.locator('#nh-set-speechitem').count()) === 0)
  ok('anon: Account Sign in still there',
    (await anon.page.locator('section:has(h2:text-is("Account")) button:text-is("Sign in")').count()) === 1)

  const user = await makePage(browser, 'oh.notreal.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  pages.push(user)
  await user.page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await user.page.waitForSelector('#nh-set-devicetheme', { timeout: 20000 })
  await user.page.waitForSelector('section:has(h2:text-is("Account")):has-text("no administrator rights")', { timeout: 10000 })
  ok('user-level: account explains missing admin rights', true)
  ok('user-level: Backup section hidden', (await user.page.locator('section:has(h2:text-is("Backup"))').count()) === 0)
  await user.page.goto(APP + '#/d/nh-e2e-lock')
  await user.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('user-level: no pencil', (await user.page.locator('[aria-label="Edit dashboard"]').count()) === 0)

  await putSettingsComp({
    ...baseSettings,
    config: { ...baseSettings.config, lockEditing: false, allowAnonymousEditing: true },
  })
  await anon.page.goto(APP + '#/d/nh-e2e-lock')
  await anon.page.reload({ waitUntil: 'domcontentloaded' })
  await anon.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('retired keys: still no pencil for a visitor', (await anon.page.locator('[aria-label="Edit dashboard"]').count()) === 0)
  await anon.page.goto(APP + '#/')
  await anon.page.waitForSelector('.nh-tile', { timeout: 20000 })
  ok('retired keys: still no new-dashboard tile', (await anon.page.locator('.nh-tile--new').count()) === 0)
  await anon.page.goto(APP + '#/settings')
  await anon.page.waitForSelector('#nh-set-devicetheme', { timeout: 20000 })
  ok('retired keys: Backup still hidden', (await anon.page.locator('section:has(h2:text-is("Backup"))').count()) === 0)
  ok('retired keys: shared theme cards still hidden', (await anon.page.locator('.nh-theme__pick').count()) === 0)
  await putSettingsComp(baseSettings)

  const wall = await makePage(browser, null)
  pages.push(wall)
  await wall.page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await wall.page.waitForSelector('#nh-set-devicetheme', { timeout: 20000 })
  ok('view-only wall: config sections hidden before sign-in',
    (await wall.page.locator('section:has(h2:text-is("Backup"))').count()) === 0)
  await wall.page.click('section:has(h2:text-is("Account")) button:text-is("Sign in")')
  await wall.page.waitForSelector('.nh-signin', { timeout: 10000 })
  await wall.page.click('button:has-text("Use an API token instead")')
  await wall.page.fill('#nh-token', TOKEN)
  await wall.page.click('button:has-text("Use token")')
  const wallRevealed = await wall.page
    .waitForSelector('section:has(h2:text-is("Backup"))', { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  ok('view-only wall: admin sections appear after sign-in, no reload', wallRevealed)
  await wall.page.goto(APP + '#/d/nh-e2e-lock')
  await wall.page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('view-only wall: pencil visible after sign-in', (await wall.page.locator('[aria-label="Edit dashboard"]').count()) === 1)

  for (const [name, p] of [['admin', admin], ['anon', anon], ['user', user], ['wall', wall]]) {
    ok(`${name}: zero item commands sent`, p.track.itemPosts.length === 0, p.track.itemPosts.join(' '))
    const errs = p.track.errs.filter((e) => !/Failed to load resource.*401|401.*Unauthorized/i.test(e))
    ok(`${name}: console clean`, errs.length === 0, errs.slice(0, 3).join(' | '))
  }
} finally {
  const settingsBack = await restoreSettings(settingsBefore).catch((e) => ({ mode: 'restore FAILED', detail: String(e) }))
  console.log(`cleanup: settings ${settingsBack.mode} (${settingsBack.detail})`)
  try {
    const res = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
    console.log('cleanup: seed deleted', res.status)
  } catch (e) {
    console.log('cleanup: seed delete FAILED', e)
  }
  const after = await getSettings()
  const norm = (o) => (o ? JSON.stringify({ ...o, timestamp: undefined }) : '(no settings component)')
  ok('cleanup: settings content identical', norm(after) === norm(settingsBefore), norm(after))
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
