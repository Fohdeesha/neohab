// Background images e2e. Covers: a global background URL set in Settings paints the Home screen and any
// dashboard without one of its own.
// SAFE with a live config: creates only dashboard:nh-e2e-bg1/-bg2/-bg3, whatever the app itself creates
// through the upload and the import checks (recorded, and deleted by exact uid), and HELD_BG. The shared
// `settings` stay in the browser (lib/sandbox.mjs), and the app may not delete anything that was on the
// server before the run: its background collector would otherwise take a person's own upload with it.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH } from './lib/target.mjs'
import { confirmHabpanelImport } from './lib/ui.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

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

const GLOBAL_URL = 'https://example.invalid/global-bg.png'
const DASH_URL = 'https://example.invalid/dash-bg.png'
const HELD_ID = 'nh-e2e-held'
const HELD_BG = 'background:' + HELD_ID
const HELD_DASH = 'dashboard:nh-e2e-bg3'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEJMDGgAgBLcAEPtvE4TQAAAABJRU5ErkJggg==',
  'base64'
)

const bgUids = async () => (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid).filter((u) => u.startsWith('background:'))
const sb = await sharedSettings()
const bgUidsBefore = await bgUids()
const OWN_DASHBOARDS = ['dashboard:nh-e2e-bg1', 'dashboard:nh-e2e-bg2', HELD_DASH]

const seed = async (id, name, config = {}) => {
  const uid = 'dashboard:' + id
  await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid,
      component: 'neohab:dashboard',
      config: {
        version: 1, id, name, columns: 12, rowHeight: 'match', gap: 5,
        widgets: [{ id: 'w1', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
        ...config,
      },
    }),
  })
  return r.ok
}

const bgOf = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).backgroundImage)

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
await sb.install(ctx)
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

try {
  // the app may now delete what this run makes and nothing that was here before it
  await sb.guardExisting()
  ok('seed bg1 (no own background)', await seed('nh-e2e-bg1', 'E2E BG One'))
  ok('seed bg2 (own background)', await seed('nh-e2e-bg2', 'E2E BG Two', { background: DASH_URL }))

  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#nh-set-bg', { timeout: 20000 })
  await page.fill('#nh-set-bg', GLOBAL_URL)
  // the field commits on Enter or on leaving it, not on every keystroke
  await page.press('#nh-set-bg', 'Enter')
  await sleep(1200)
  const savedSettings = await sb.current()
  ok('global background persisted', savedSettings?.config?.background === GLOBAL_URL, String(savedSettings?.config?.background))

  await page.goto(APP + '#/')
  await page.waitForSelector('.nh-tile', { timeout: 20000 })
  ok('Home paints the global background', (await bgOf(page, '.nh-home')).includes('global-bg.png'))

  await page.goto(APP + '#/d/nh-e2e-bg1')
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('dashboard without its own background inherits the global one', (await bgOf(page, '.nh-dash')).includes('global-bg.png'))

  await page.goto(APP + '#/d/nh-e2e-bg2')
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  ok('per-dashboard background overrides the global one', (await bgOf(page, '.nh-dash')).includes('dash-bg.png'))

  await page.goto(APP + '#/settings')
  await page.waitForSelector('#nh-set-bg', { timeout: 20000 })
  await page
    .locator('.nh-bgfield input[type="file"]')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG })
  await page.waitForFunction(() => {
    const inp = document.querySelector('#nh-set-bg')
    return inp && inp.placeholder.includes('KB')
  }, { timeout: 15000 })
  let afterUpload = await sb.current()
  for (let i = 0; i < 40 && !/^bg:/.test(afterUpload?.config?.background ?? ''); i++) {
    await sleep(250)
    afterUpload = await sb.current()
  }
  ok('upload stored as a bg: reference', /^bg:/.test(afterUpload?.config?.background ?? ''), String(afterUpload?.config?.background))
  const uploaded = await bgUids()
  ok('one background component created', uploaded.length === bgUidsBefore.length + 1, uploaded.join(','))
  const newBgUid = uploaded.find((u) => !bgUidsBefore.includes(u))
  const storedBg = await (await fetch(NS + '/' + encodeURIComponent(newBgUid), { headers: AUTH })).json()
  ok('upload stored losslessly as PNG', (storedBg.config.dataUri ?? '').startsWith('data:image/png'), (storedBg.config.dataUri ?? '').slice(0, 24))
  ok('field shows a preview thumbnail', (await page.locator('.nh-bgfield__thumb').count()) === 1)

  await page.goto(APP + '#/')
  await page.waitForSelector('.nh-tile', { timeout: 20000 })
  ok('Home paints the uploaded image (data URI)', (await bgOf(page, '.nh-home')).includes('data:image/png'))

  await page.goto(APP + '#/settings')
  await page.waitForSelector('#nh-export-bg', { timeout: 20000 })
  ok('export toggle appears once a background exists, default on', await page.isChecked('#nh-export-bg'))

  const grabExport = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export configuration")'),
    ])
    const path = await download.path()
    return JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'))
  }

  const full = await grabExport()
  const uidsInOrder = full.components.map((c) => c.uid)
  ok('full export contains the background', uidsInOrder.includes(newBgUid), '')
  ok('full export: settings first', uidsInOrder[0] === 'settings', uidsInOrder[0])
  const firstBlob = uidsInOrder.findIndex((u) => u.startsWith('icon:') || u.startsWith('background:'))
  const lastNonBlob = uidsInOrder.map((u) => !u.startsWith('icon:') && !u.startsWith('background:')).lastIndexOf(true)
  ok('full export: base64 blobs come after everything else', firstBlob === -1 || firstBlob > lastNonBlob, `firstBlob=${firstBlob} lastNonBlob=${lastNonBlob}`)
  ok('full export: backgrounds are the very last components', uidsInOrder[uidsInOrder.length - 1].startsWith('background:'), uidsInOrder[uidsInOrder.length - 1])

  await page.uncheck('#nh-export-bg')
  const slim = await grabExport()
  const slimUids = slim.components.map((c) => c.uid)
  ok('toggle off: no background components in the export', !slimUids.some((u) => u.startsWith('background:')), '')
  ok('toggle off: everything else still exported', slimUids.length === uidsInOrder.length - uidsInOrder.filter((u) => u.startsWith('background:')).length, `${slimUids.length} vs ${uidsInOrder.length}`)
  await page.check('#nh-export-bg')

  await page.goto(APP + '#/settings')
  await page.waitForSelector('#nh-set-bg', { timeout: 20000 })
  await page.fill('#nh-set-bg', GLOBAL_URL)
  // the field commits on Enter or on leaving it, not on every keystroke
  await page.press('#nh-set-bg', 'Enter')
  let gcLeft = null
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    gcLeft = await bgUids()
    if (gcLeft.length === bgUidsBefore.length) break
  }
  ok('orphaned upload garbage-collected', gcLeft.length === bgUidsBefore.length, gcLeft.join(','))

  for (const uid of [HELD_BG, HELD_DASH]) await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: HELD_BG,
      component: 'neohab:background',
      config: { version: 1, id: HELD_ID, dataUri: 'data:image/png;base64,' + PNG.toString('base64'), bytes: PNG.length },
    }),
  })
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: HELD_DASH,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-bg3',
        name: 'E2E BG Held',
        columns: 12,
        rowHeight: 'match',
        widgets: [{ id: 'w-held', type: 'clock', config: { someImage: 'bg:' + HELD_ID }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
      },
    }),
  })
  await page.goto(APP + '#/settings')
  await page.waitForSelector('#nh-set-bg', { timeout: 20000 })
  await page.fill('#nh-set-bg', GLOBAL_URL + '?2')
  // the field commits on Enter or on leaving it, not on every keystroke
  await page.press('#nh-set-bg', 'Enter')
  await sleep(2500)
  const heldStatus = (await fetch(NS + '/' + encodeURIComponent(HELD_BG), { headers: AUTH })).status
  ok('an image referenced only from a widget config survives a collection', heldStatus === 200, 'status ' + heldStatus)

  await page.goto(APP + '#/d/nh-e2e-bg1')
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 })
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-bg', { timeout: 10000 })
  await page.fill('#nh-dash-bg', DASH_URL)
  await page.press('#nh-dash-bg', 'Enter')
  await sleep(400)
  ok('editor live-previews the dashboard background', (await bgOf(page, '.nh-dash')).includes('dash-bg.png'))
  await page.click('button:has-text("Save")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })
  const savedDash = await (await fetch(NS + '/dashboard:nh-e2e-bg1', { headers: AUTH })).json()
  ok('per-dashboard background persisted on Save', savedDash.config.background === DASH_URL, String(savedDash.config.background))

  const synthetic = {
    dashboards: [{ id: 'synthbg', name: 'Synth BG', widgets: [] }],
    settings: { background_image: 'https://example.invalid/habpanel-bg.jpg' },
    customwidgets: {},
  }
  await page.goto(APP + '#/settings')
  await page.waitForSelector('section:has(h2:text-is("Migrate from HABPanel"))', { timeout: 20000 })
  await page
    .locator('section:has(h2:text-is("Migrate from HABPanel")) input[type="file"]')
    .setInputFiles({ name: 'habpanel-config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(synthetic)) })
  await confirmHabpanelImport(page)
  await page.waitForSelector('.nh-report__head', { timeout: 15000 })
  const importedSettings = await sb.current()
  ok('importer set the global background', importedSettings?.config?.background === 'https://example.invalid/habpanel-bg.jpg', String(importedSettings?.config?.background))
  ok('import report mentions the background', (await page.locator('.nh-report__item:has-text("background")').count()) >= 1)

  const realErrs = errs.filter((e) => !/ERR_NAME_NOT_RESOLVED/.test(e))
  ok('console clean', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} finally {
  // exactly what this run made: its own seeds, and what the app created through the sandbox
  const mine = [...new Set([...OWN_DASHBOARDS, HELD_BG, ...sb.created])]
  for (const uid of mine) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const untouched = await sb.verify().catch((e) => ({ ok: false, detail: String(e) }))
  ok('cleanup: the shared settings on the server were never written', untouched.ok, untouched.detail)
  const uids = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  ok('cleanup: no leftovers', !uids.some((u) => mine.includes(u)), uids.filter((u) => mine.includes(u)).join(','))
  const lost = bgUidsBefore.filter((u) => !uids.includes(u))
  ok('cleanup: every background that was on the server before the run is still there', lost.length === 0,
    lost.join(',') + (sb.kept.length ? ` (app deletes kept off the server: ${sb.kept.join(',')})` : ''))

  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
