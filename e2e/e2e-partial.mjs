/**
 * Partial export / import e2e: one dashboard, custom widget or theme as a file.
 *
 * Covers: exporting a dashboard from the editor's dashboard-settings panel brings the custom
 * widget definition, the uploaded icon and the uploaded background it references (and nothing
 * else); exporting a widget definition and a theme; the file is refused by version; importing
 * offers a copy or an overwrite, and a copy never touches what is already there (renaming the
 * dashboard, its definition and the references between them, with fresh widget instance ids);
 * unchanged dependencies are reused rather than duplicated; importing onto a clean server
 * restores the original ids; overwrite puts the file's content back; a second identical import
 * is a no-op; a whole-configuration backup still goes down the merge/replace path.
 *
 * SAFE with a live config: creates only uids starting `dashboard:nh-e2e-pd`, `widgetdef:nh-e2e-p`,
 * `icon:nh-e2e-p`, `background:nh-e2e-p`, `theme:nh-e2e-p` (plus the `-2` copies the import
 * makes), and deletes exactly those. Commands NOTHING (clock + template widgets only). The
 * version-history namespaces are snapshotted and restored, since importing legitimately writes
 * a restore point.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { APP, NS, TOKEN, AUTH, HISTORY_NS, HISTORY_DATA_NS } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEJMDGgAgBLcAEPtvE4TQAAAABJRU5ErkJggg=='

const DASH = 'nh-e2e-pdash'
const DEF = 'nh-e2e-pdef'
const ICON = 'nh-e2e-picon'
const BG = 'nh-e2e-pbg'
const THEME = 'nh-e2e-ptheme'
const BROKEN = 'nh-e2e-pdbroken'

const uid = (kind, id) => `${kind}:${id}`
const list = async (ns = NS) => (await (await fetch(ns, { headers: AUTH })).json())
const get = async (u) => {
  const r = await fetch(NS + '/' + encodeURIComponent(u), { headers: AUTH })
  return r.ok ? r.json() : null
}
const del = async (u, ns = NS) => fetch(ns + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH }).catch(() => {})
const put = async (component) => {
  await del(component.uid)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(component),
  })
  return r.ok
}
const norm = (c) => JSON.stringify({ component: c?.component, config: c?.config })

/* the components this suite plants: a dashboard using a template widget (a custom definition),
   a custom icon on a button, and an uploaded background */
const dashComponent = (id = DASH, name = 'E2E Partial') => ({
  uid: uid('dashboard', id),
  component: 'neohab:dashboard',
  config: {
    version: 1,
    id,
    name,
    columns: 12,
    rowHeight: 'match',
    gap: 5,
    background: 'bg:' + BG,
    stackOrder: ['w-two', 'w-one', 'w-three'],
    widgets: [
      { id: 'w-one', type: 'template', config: { label: 'Tpl', customwidget: DEF, config: {} }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
      { id: 'w-two', type: 'button', config: { label: 'Btn', icon: 'custom:' + ICON, action: 'command' }, layout: { lg: { x: 3, y: 0, w: 2, h: 2 } } },
      { id: 'w-three', type: 'clock', config: {}, layout: { lg: { x: 5, y: 0, w: 3, h: 2 } } },
    ],
  },
})
const defComponent = { uid: uid('widgetdef', DEF), component: 'neohab:widgetdef', config: { version: 1, id: DEF, name: 'E2E Partial Def', template: '<div>partial</div>' } }
const iconComponent = { uid: uid('icon', ICON), component: 'neohab:icon', config: { version: 1, id: ICON, name: 'E2E Partial Icon', dataUri: PNG, bytes: 120 } }
const bgComponent = { uid: uid('background', BG), component: 'neohab:background', config: { version: 1, id: BG, dataUri: PNG, bytes: 120 } }
const themeComponent = {
  uid: uid('theme', THEME),
  component: 'neohab:theme',
  config: { id: THEME, name: 'E2E Partial Theme', scheme: 'dark', tokens: { bg: '#101010', surface: '#202020', 'surface-2': '#303030', border: '#404040', text: '#f0f0f0', 'text-dim': '#a0a0a0', primary: '#ee4400', brand: '#ee4400', radius: '4px' } },
}

/** A dashboard pointing at a definition that does not exist, for the missing-reference report. */
const brokenComponent = {
  uid: uid('dashboard', BROKEN),
  component: 'neohab:dashboard',
  config: {
    version: 1, id: BROKEN, name: 'E2E Partial Broken', columns: 12, rowHeight: 'match',
    widgets: [{ id: 'w1', type: 'template', config: { customwidget: 'nh-e2e-pgone' }, layout: { lg: { x: 0, y: 0, w: 2, h: 2 } } }],
  },
}

const MINE = /^(dashboard:nh-e2e-pd|widgetdef:nh-e2e-p|icon:nh-e2e-p|background:nh-e2e-p|theme:nh-e2e-p)/

const historyBefore = await list(HISTORY_NS)
const historyDataBefore = await list(HISTORY_DATA_NS)

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
const page = await ctx.newPage()
const errs = []
const dialogs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept() })
await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

/** Click something that downloads a file and return the parsed JSON. */
const grab = async (clicker) => {
  const [download] = await Promise.all([page.waitForEvent('download'), clicker()])
  return { name: download.suggestedFilename(), json: JSON.parse(readFileSync(await download.path(), 'utf8')) }
}

/** Feed a JSON object to the Backup section's import input. */
const importFile = async (obj, fileName = 'partial.json') => {
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section:has(h2:text-is("Backup"))', { timeout: 20000 })
  await page
    .locator('section:has(h2:text-is("Backup")) input[type="file"]')
    .setInputFiles({ name: fileName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) })
}

try {
  ok('seed: dashboard', await put(dashComponent()))
  ok('seed: widget definition', await put(defComponent))
  ok('seed: custom icon', await put(iconComponent))
  ok('seed: uploaded background', await put(bgComponent))
  ok('seed: custom theme', await put(themeComponent))
  ok('seed: dashboard with a dead reference', await put(brokenComponent))
  const dashBefore = await get(uid('dashboard', DASH))

  /* ------------------- export a dashboard from the editor ------------------- */
  await page.goto(APP + `#/d/${DASH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 })
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-name', { timeout: 10000 })

  const exported = await grab(() => page.click('button:has-text("Export this dashboard")'))
  const dashFile = exported.json
  const fileUids = dashFile.components.map((c) => c.uid)
  ok('download is named for the dashboard', exported.name === `neohab-dashboard-${DASH}.json`, exported.name)
  ok('manifest: partial format version 2', dashFile.manifest.formatVersion === 2, String(dashFile.manifest.formatVersion))
  ok('manifest: kind dashboard', dashFile.manifest.kind === 'dashboard')
  ok('manifest: names the primary', dashFile.manifest.primary === uid('dashboard', DASH))
  ok('file: dashboard first', fileUids[0] === uid('dashboard', DASH), fileUids[0])
  ok('file: brings the widget definition', fileUids.includes(uid('widgetdef', DEF)))
  ok('file: brings the custom icon', fileUids.includes(uid('icon', ICON)))
  ok('file: brings the uploaded background', fileUids.includes(uid('background', BG)))
  ok('file: no settings component', !fileUids.includes('settings'))
  ok('file: no unrelated dashboards', fileUids.filter((u) => u.startsWith('dashboard:')).length === 1, fileUids.join(','))
  ok('file: no unrelated theme', !fileUids.some((u) => u.startsWith('theme:')))
  ok('file: exactly the 4 expected components', fileUids.length === 4, String(fileUids.length))
  ok('file: base64 blobs last', fileUids.indexOf(uid('widgetdef', DEF)) < fileUids.indexOf(uid('icon', ICON)), fileUids.join(','))

  // exporting the draft, not the saved version
  await page.fill('#nh-dash-name', 'E2E Partial Draft')
  await sleep(300)
  const draftExport = await grab(() => page.click('button:has-text("Export this dashboard")'))
  ok('unsaved edits are in the exported file', draftExport.json.components[0].config.name === 'E2E Partial Draft', String(draftExport.json.components[0].config.name))
  const stillSaved = await get(uid('dashboard', DASH))
  ok('exporting a draft does not save it', stillSaved.config.name === 'E2E Partial', String(stillSaved.config.name))
  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 })

  /* ------------------- export a widget definition and a theme ------------------- */
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-deflist', { timeout: 20000 })
  const defRow = page.locator('.nh-deflist__row', { hasText: 'E2E Partial Def' })
  const defExport = await grab(() => defRow.locator('button:has-text("Export")').click())
  ok('widget definition export is named for it', defExport.name === `neohab-widgetdef-${DEF}.json`, defExport.name)
  ok('widget definition export holds just the definition', defExport.json.components.map((c) => c.uid).join(',') === uid('widgetdef', DEF), defExport.json.components.map((c) => c.uid).join(','))
  ok('widget definition export: kind widgetdef', defExport.json.manifest.kind === 'widgetdef')

  const themeExport = await grab(() => page.click(`[aria-label="Export theme E2E Partial Theme"]`))
  ok('theme export is named for it', themeExport.name === `neohab-theme-${THEME}.json`, themeExport.name)
  ok('theme export holds just the theme', themeExport.json.components.map((c) => c.uid).join(',') === uid('theme', THEME))
  ok('theme export: kind theme', themeExport.json.manifest.kind === 'theme')

  /* ------------------- a file from the future is refused ------------------- */
  await importFile({ ...dashFile, manifest: { ...dashFile.manifest, formatVersion: 3 } })
  await page.waitForSelector('.nh-settings__notice', { timeout: 10000 })
  const versionNotice = await page.textContent('.nh-settings__notice')
  ok('unknown file version is refused', /Unsupported file version/.test(versionNotice ?? ''), String(versionNotice))
  ok('refusing a file offers no import buttons', (await page.locator('button:has-text("Import as a copy")').count()) === 0)

  /* ------------------- the file matches what is stored: nothing to do ------------------- */
  await importFile(dashFile)
  await page.waitForSelector('.nh-settings__importchoice', { timeout: 15000 })
  const sameCard = await page.textContent('.nh-settings__importchoice')
  ok('card names the dashboard and its dependencies', /E2E Partial/.test(sameCard ?? '') && /3 things/.test(sameCard ?? ''), String(sameCard).slice(0, 120))
  ok('an identical file says there is nothing to import', /nothing to import/.test(sameCard ?? ''), String(sameCard).slice(0, 160))
  ok('an identical file offers no import at all', (await page.locator('.nh-settings__importchoice button:has-text("Import")').count()) === 0)
  ok('an identical file offers no overwrite', (await page.locator('button:has-text("Overwrite existing")').count()) === 0)
  ok('an identical file offers Close', (await page.locator('.nh-settings__importchoice button:has-text("Close")').count()) === 1)
  await page.click('.nh-settings__importchoice button:has-text("Close")')
  ok('closing dismisses the card', (await page.locator('.nh-settings__importchoice').count()) === 0)

  /* ------------------- import as a copy (a real collision) ------------------- */
  // the stored dashboard now differs from the file, which is what makes it a conflict
  await put({ ...dashComponent(), config: { ...dashComponent().config, name: 'Renamed by hand' } })
  await importFile(dashFile)
  await page.waitForSelector('button:has-text("Import as a copy")', { timeout: 15000 })
  const card = await page.textContent('.nh-settings__importchoice')
  ok('a conflicting file warns that the name is taken', /same name is already here/.test(card ?? ''), String(card).slice(0, 160))
  ok('a conflicting file offers overwrite', (await page.locator('button:has-text("Overwrite existing")').count()) === 1)
  ok('overwrite says how much it would replace', /replaces 1 item/.test(card ?? ''), String(card).slice(0, 200))

  await page.click('button:has-text("Import as a copy")')
  await page.waitForSelector('.nh-settings__notice:has-text("Imported as a copy")', { timeout: 20000 })
  const copyNotice = await page.textContent('.nh-settings__notice')
  ok('copy notice names the new id', /nh-e2e-pdash-2/.test(copyNotice ?? ''), String(copyNotice))

  const copy = await get(uid('dashboard', DASH + '-2'))
  ok('copy exists on the server', copy !== null)
  ok('copy config id follows its uid', copy?.config.id === DASH + '-2', String(copy?.config.id))
  ok('copy name is suffixed', copy?.config.name === 'E2E Partial (2)', String(copy?.config.name))
  ok('copy has fresh widget ids', copy?.config.widgets.every((w) => !['w-one', 'w-two', 'w-three'].includes(w.id)), copy?.config.widgets.map((w) => w.id).join(','))
  ok('copy stackOrder was remapped to the new ids', copy?.config.stackOrder.every((id) => copy.config.widgets.some((w) => w.id === id)), String(copy?.config.stackOrder))
  ok('copy keeps the same widget count', copy?.config.widgets.length === 3)
  const tpl = copy?.config.widgets.find((w) => w.type === 'template')
  ok('copy reuses the unchanged widget definition', tpl?.config.customwidget === DEF, String(tpl?.config.customwidget))
  ok('no duplicate widget definition was created', (await get(uid('widgetdef', DEF + '-2'))) === null)
  ok('no duplicate icon was created', (await get(uid('icon', ICON + '-2'))) === null)
  ok('the hand-renamed original is left alone', (await get(uid('dashboard', DASH)))?.config.name === 'Renamed by hand', String((await get(uid('dashboard', DASH)))?.config.name))

  await del(uid('dashboard', DASH + '-2'))
  await put(dashComponent())
  ok('restored the seeded dashboard', norm(await get(uid('dashboard', DASH))) === norm(dashBefore))

  /* --------- import as a copy when a dependency differs: the copy must be self-consistent --------- */
  await put({ ...defComponent, config: { ...defComponent.config, template: '<div>MINE, not the file’s</div>' } })
  await importFile(dashFile)
  await page.waitForSelector('button:has-text("Import as a copy")', { timeout: 15000 })
  await page.click('button:has-text("Import as a copy")')
  await page.waitForSelector('.nh-settings__notice:has-text("Imported as a copy")', { timeout: 20000 })
  const copy2 = await get(uid('dashboard', DASH + '-2'))
  const copiedDef = await get(uid('widgetdef', DEF + '-2'))
  ok('a differing definition is copied, not overwritten', copiedDef !== null)
  ok('my edited definition survives', (await get(uid('widgetdef', DEF)))?.config.template.includes('MINE'), '')
  ok('copied definition carries the file content', copiedDef?.config.template === '<div>partial</div>', String(copiedDef?.config.template))
  const tpl2 = copy2?.config.widgets.find((w) => w.type === 'template')
  ok('the copied dashboard points at the copied definition', tpl2?.config.customwidget === DEF + '-2', String(tpl2?.config.customwidget))
  ok('copied definition name is suffixed', copiedDef?.config.name === 'E2E Partial Def (2)', String(copiedDef?.config.name))

  // it must actually render: the copy resolves its definition rather than showing "not found"
  await page.goto(APP + `#/d/${DASH}-2`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  // the template engine is a lazy chunk, and the rendered output lives in the host's shadow root
  await page.waitForSelector('.nh-template__host', { timeout: 20000 })
  const rendered = await page.evaluate(async () => {
    const host = document.querySelector('.nh-template__host')
    for (let i = 0; i < 40 && !(host?.shadowRoot?.textContent ?? '').includes('partial'); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return { text: document.body.innerText, shadow: host?.shadowRoot?.textContent ?? '' }
  })
  ok('the copied dashboard renders its template widget', rendered.shadow.includes('partial'), rendered.shadow.slice(0, 60))
  ok('no "widget was not found" notice on the copy', !/was not found/.test(rendered.text), '')

  await del(uid('dashboard', DASH + '-2'))
  await del(uid('widgetdef', DEF + '-2'))
  await put(defComponent)

  /* ------------------- overwrite ------------------- */
  await put({ ...dashComponent(), config: { ...dashComponent().config, name: 'Renamed by hand' } })
  await importFile(dashFile)
  await page.waitForSelector('button:has-text("Overwrite existing")', { timeout: 15000 })
  dialogs.length = 0
  await page.click('button:has-text("Overwrite existing")')
  await page.waitForSelector('.nh-settings__notice:has-text("Imported")', { timeout: 20000 })
  ok('overwrite asks first', dialogs.some((d) => /Overwrite/.test(d)), dialogs.join(' | '))
  const overwritten = await get(uid('dashboard', DASH))
  ok('overwrite restored the file content', overwritten?.config.name === 'E2E Partial', String(overwritten?.config.name))
  ok('overwrite kept the original widget ids', overwritten?.config.widgets.map((w) => w.id).join(',') === 'w-one,w-two,w-three', overwritten?.config.widgets.map((w) => w.id).join(','))
  ok('overwrite made no copy', (await get(uid('dashboard', DASH + '-2'))) === null)

  /* ---------- after an overwrite the stored state IS the file, byte for byte ---------- */
  await importFile(dashFile)
  await page.waitForSelector('.nh-settings__importchoice', { timeout: 15000 })
  const afterOverwriteCard = await page.textContent('.nh-settings__importchoice')
  ok('re-importing after an overwrite has nothing to do', /nothing to import/.test(afterOverwriteCard ?? ''), String(afterOverwriteCard).slice(0, 160))
  ok('and so offers no copy', (await page.locator('button:has-text("Import as a copy")').count()) === 0)
  await page.click('.nh-settings__importchoice button:has-text("Close")')

  /* ------------------- clean server: original ids come back ------------------- */
  for (const u of [uid('dashboard', DASH), uid('widgetdef', DEF), uid('icon', ICON), uid('background', BG)]) await del(u)
  await importFile(dashFile)
  await page.waitForSelector('.nh-settings__importchoice', { timeout: 15000 })
  const freshCard = await page.textContent('.nh-settings__importchoice')
  ok('nothing-collides card says so', /nothing of yours is touched/.test(freshCard ?? ''), String(freshCard).slice(0, 120))
  ok('no overwrite button when nothing collides', (await page.locator('button:has-text("Overwrite existing")').count()) === 0)
  ok('button reads Import, not Import as a copy', (await page.locator('button:has-text("Import as a copy")').count()) === 0 && (await page.locator('.nh-settings__importchoice button:has-text("Import")').count()) === 1)
  await page.click('.nh-settings__importchoice button:has-text("Import")')
  await page.waitForSelector('.nh-settings__notice:has-text("Imported")', { timeout: 20000 })
  const restoredNotice = await page.textContent('.nh-settings__notice')
  ok('fresh import reports the count', /Imported 4 items/.test(restoredNotice ?? ''), String(restoredNotice))
  ok('dashboard restored under its own id', (await get(uid('dashboard', DASH))) !== null)
  ok('definition restored under its own id', (await get(uid('widgetdef', DEF))) !== null)
  ok('icon restored under its own id', (await get(uid('icon', ICON))) !== null)
  ok('background restored under its own id', (await get(uid('background', BG))) !== null)

  /* ------------------- missing references are reported, not hidden ------------------- */
  await page.goto(APP + `#/d/${BROKEN}`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-widget', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 })
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-name', { timeout: 10000 })
  const brokenExport = await grab(() => page.click('button:has-text("Export this dashboard")'))
  ok('a dashboard with a dead reference still exports', brokenExport.json.components.length === 1, String(brokenExport.json.components.length))
  await page.waitForSelector('.nh-toast', { timeout: 10000 })
  const toast = await page.textContent('.nh-toast')
  ok('the dead reference is reported', /no longer exist/.test(toast ?? '') && /nh-e2e-pgone/.test(toast ?? ''), String(toast))
  await page.click('button:has-text("Exit")')

  /* ------------------- a full backup still uses merge / replace ------------------- */
  await importFile({ manifest: { app: 'neohab', formatVersion: 1, exportedAt: 'x' }, components: [dashComponent('nh-e2e-pdfull', 'E2E Partial Full')] }, 'neohab-config.json')
  await page.waitForSelector('.nh-settings__importchoice', { timeout: 15000 })
  ok('a whole-configuration backup offers merge', (await page.locator('button:has-text("Merge into current")').count()) === 1)
  ok('a whole-configuration backup offers replace', (await page.locator('button:has-text("Replace everything")').count()) === 1)
  ok('a whole-configuration backup offers no copy', (await page.locator('button:has-text("Import as a copy")').count()) === 0)
  await page.click('.nh-settings__importchoice button:has-text("Cancel")')

  const realErrs = errs.filter((e) => !/ERR_NAME_NOT_RESOLVED/.test(e))
  ok('console clean', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err).slice(0, 200))
} finally {
  for (const c of await list()) {
    if (MINE.test(c.uid)) await del(c.uid)
  }
  const left = (await list()).map((c) => c.uid).filter((u) => MINE.test(u) || u.includes('nh-e2e'))
  ok('cleanup: no leftovers', left.length === 0, left.join(','))

  // importing writes a restore point; put the history namespaces back exactly as they were
  for (const [ns, before] of [[HISTORY_NS, historyBefore], [HISTORY_DATA_NS, historyDataBefore]]) {
    for (const c of await list(ns)) await del(c.uid, ns)
    for (const c of before) {
      await fetch(ns, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).catch(() => {})
    }
  }
  const histAfter = (await list(HISTORY_NS)).length + (await list(HISTORY_DATA_NS)).length
  ok('cleanup: version history restored', histAfter === historyBefore.length + historyDataBefore.length, String(histAfter))

  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
