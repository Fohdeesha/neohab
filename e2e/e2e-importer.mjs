// HABPanel importer e2e. When the target server carries a real habpanel:panelconfig it is imported through
// the settings UI (read-only source) and the result is.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, ITEMS } from './lib/target.mjs'
import { confirmHabpanelImport } from './lib/ui.mjs'


{
  const pre = await (await fetch(NS)).json()
  if (pre.length > 0) {
    console.log('ABORT: namespace holds ' + pre.length + ' components - wipe-cycle suite needs an empty namespace (snapshot + wipe first).')
    process.exit(2)
  }
}


const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const hpBefore = JSON.stringify(await (await fetch(BASE + '/rest/ui/components/habpanel:panelconfig')).json())

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => localStorage.setItem('neohab:apiToken', t), TOKEN)

const confirmImport = (opts) => confirmHabpanelImport(page, opts)

const settingsTheme = async () => {
  const res = await fetch(NS + '/settings')
  return res.ok ? ((await res.json())?.config?.theme ?? null) : null
}

try {
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section:has(h2:text-is("Migrate from HABPanel"))', { timeout: 10000 })
  await sleep(2000) // give the detector time to list any server-side panel configs
  const hpRows = await page.locator('.nh-hpimport__row').count()
  if (hpRows === 0) {
    console.log('SKIP  no HABPanel panel config on this server - running the file-import path only')
  } else {
    const rowText = await page.locator('.nh-hpimport__row').first().textContent()
    const rowDash = Number(/(\d+) dashboards/.exec(rowText ?? '')?.[1] ?? NaN)
    ok('server config detected with a dashboard count', Number.isFinite(rowDash) && rowDash > 0, rowText?.slice(0, 80))

    await page.locator('.nh-hpimport__row').first().locator('button').click()
    await confirmImport()
    await page.waitForSelector('.nh-report__head', { timeout: 30000 })
    const head = (await page.locator('.nh-report__head').textContent()) ?? ''
    const repDash = Number(/(\d+) dashboards/.exec(head)?.[1] ?? NaN)
    const repWidgets = Number(/(\d+) widgets/.exec(head)?.[1] ?? NaN)
    const repDefs = Number(/(\d+) custom widget/.exec(head)?.[1] ?? NaN)
    ok('report agrees with the detected dashboard count', repDash === rowDash, head.slice(0, 100))
    ok('report counts widgets', repWidgets > 0, String(repWidgets))

    const comps = await (await fetch(NS)).json()
    const dashComps = comps.filter((c) => c.uid.startsWith('dashboard:'))
    const defCount = comps.filter((c) => c.uid.startsWith('widgetdef:')).length
    ok('server has the reported dashboards', dashComps.length === repDash, `dash=${dashComps.length}`)
    const storedWidgets = dashComps.reduce((n, c) => n + (c.config.widgets?.length ?? 0), 0)
    ok('stored widget total matches the report', storedWidgets === repWidgets, `${storedWidgets} vs ${repWidgets}`)
    if (Number.isFinite(repDefs)) {
      ok('server has the reported custom widget defs', defCount === repDefs, `defs=${defCount}`)
    }
    const settings = comps.find((c) => c.uid === 'settings')
    ok('a theme was mapped', typeof settings?.config?.theme === 'string' && settings.config.theme.length > 0, settings?.config?.theme)

    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tile')
    const tiles = await page.locator('.nh-tile:not(.nh-tile--new)').count()
    ok('home shows every imported dashboard', tiles === repDash, `tiles=${tiles}`)

    const biggest = dashComps.reduce((a, b) =>
      (a.config.widgets?.length ?? 0) >= (b.config.widgets?.length ?? 0) ? a : b
    )
    await page.goto(APP + '#/d/' + encodeURIComponent(biggest.config.id), { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await sleep(1000)
    const cells = await page.locator('.nh-gcell').count()
    ok(
      'largest imported dashboard renders every widget',
      cells === (biggest.config.widgets?.length ?? 0),
      `${biggest.config.id}: ${cells} vs ${biggest.config.widgets?.length}`
    )
  }

  const synthetic = {
    dashboards: [
      {
        id: 'synth',
        name: 'Synthetic',
        widgets: [
          { type: 'switch', item: ITEMS.switch, name: 'SW', row: 0, col: 0, sizeX: 2, sizeY: 2 },
          { type: 'knob', item: ITEMS.dimmer, name: 'KN', floor: 0, ceil: 100, row: 0, col: 2, sizeX: 2, sizeY: 2 },
          { type: 'timeline', name: 'TL', period: 'D', series: [{ item: ITEMS.dimmer }], row: 2, col: 0, sizeX: 4, sizeY: 2 },
          { type: 'wibble', name: 'unknown', row: 4, col: 0, sizeX: 1, sizeY: 1 },
        ],
      },
    ],
    menucolumns: 1,
    settings: { theme: 'material' },
    customwidgets: {},
  }
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section:has(h2:text-is("Migrate from HABPanel"))')
  const dropSynthetic = () =>
    page
      .locator('section:has(h2:text-is("Migrate from HABPanel")) input[type="file"]')
      .setInputFiles({ name: 'habpanel-config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(synthetic)) })

  // this file carries settings.theme, which is stored once for the whole server: the sheet has to
  // say so before it writes, and has to obey a no
  const themeBefore = await settingsTheme()
  await dropSynthetic()
  await page.waitForSelector('.nh-sheet .nh-hpconfirm', { timeout: 15000 })
  const disclosure = await page.locator('.nh-hpconfirm__shared').textContent()
  ok('the sheet names the shared setting it would change', /Theme/.test(disclosure ?? ''), (disclosure ?? 'none').slice(0, 90))
  ok('and offers it ticked', await page.locator('.nh-hpconfirm__shared input[type="checkbox"]').isChecked())

  await page.click('.nh-hpconfirm__shared input[type="checkbox"]')
  await page.click('.nh-sheet .nh-form__footer button:has-text("Import")')
  await page.waitForSelector('.nh-report__head', { timeout: 15000 })
  ok('declining leaves the shared theme alone', (await settingsTheme()) === themeBefore, `${themeBefore} -> ${await settingsTheme()}`)
  ok(
    'and the report says so rather than claiming it applied',
    /left as they are/.test((await page.locator('.nh-report__list').textContent()) ?? ''),
    'report notes'
  )

  const head2 = await page.locator('.nh-report__head').textContent()
  ok('file import: 1 dashboard, 3 widgets (unknown skipped)', /1 dashboards/.test(head2) && /3 widgets/.test(head2), head2 ?? '')
  const skipNote = await page.locator('.nh-report__item--skip').textContent()
  ok('file import: unknown type reported as skipped', /wibble/.test(skipNote ?? ''), skipNote ?? 'none')

  const synthDash = await (await fetch(NS + '/dashboard:synth')).json()
  const synthTypes = synthDash?.config?.widgets?.map((w) => w.type).sort()
  ok(
    'file import mapping: switch becomes a button, knob a dial, timeline a timeline',
    JSON.stringify(synthTypes) === JSON.stringify(['button', 'dial', 'timeline']),
    JSON.stringify(synthTypes)
  )

  // the same file again, accepted this time: the shared theme it names is what should land.
  // The previous report is still on screen, so wait for the WRITE rather than for the report.
  await dropSynthetic()
  await confirmImport()
  let themeAfter = null
  for (let i = 0; i < 30 && themeAfter !== 'material'; i++) {
    await sleep(500)
    themeAfter = await settingsTheme()
  }
  ok('accepting applies the shared theme', themeAfter === 'material', String(themeAfter))

  ok('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

const hpAfter = JSON.stringify(await (await fetch(BASE + '/rest/ui/components/habpanel:panelconfig')).json())
ok('habpanel:panelconfig untouched', hpBefore === hpAfter)

const list = await (await fetch(NS)).json()
for (const c of list) {
  await fetch(NS + '/' + encodeURIComponent(c.uid), { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } })
}
const after = await (await fetch(NS)).json()
ok('cleanup: namespace empty', Array.isArray(after) && after.length === 0, `left=${after.length}`)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
