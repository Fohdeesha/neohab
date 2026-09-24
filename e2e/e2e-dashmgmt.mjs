// Dashboard management e2e: create from Home, rename + grid settings in the editor panel, undo/redo, save,
// delete.
// SAFE with a live config: touches only dashboard:nh-e2e-mgmt, which is deleted in cleanup.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-mgmt'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const getComp = async () => {
  const r = await fetch(NS + '/' + UID, { headers: AUTH })
  return r.ok ? r.json() : null
}

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

try {
  // a killed earlier run's copy would make the app name this one nh-e2e-mgmt-2
  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile--new, .nh-welcome__actions button', { timeout: 15000 })
  const viaTile = (await page.locator('.nh-tile--new').count()) === 1
  ok('a way to create a dashboard on Home', viaTile || (await page.locator('.nh-welcome').count()) === 1,
    viaTile ? 'the + tile' : 'the welcome card')
  await page.click(viaTile ? '.nh-tile--new' : '.nh-welcome__actions button:has-text("Create your first dashboard")')
  await page.waitForSelector('#nh-newdash-name', { timeout: 5000 })
  await page.fill('#nh-newdash-name', 'nh-e2e-mgmt')
  await page.click('button:has-text("Create dashboard")')
  await page.waitForSelector('.nh-dash__bar', { timeout: 10000 })
  await sleep(800)
  ok('navigates into the new dashboard', page.url().includes('#/d/nh-e2e-mgmt'), page.url())
  const created = await getComp()
  ok('empty dashboard persisted to server', created?.config?.name === 'nh-e2e-mgmt', JSON.stringify(created?.config ?? null)?.slice(0, 80))
  ok('new dashboard defaults to square cells', created?.config?.rowHeight === 'match', String(created?.config?.rowHeight))

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-name', { timeout: 5000 })
  ok('dashboard settings panel opens', true)

  await page.fill('#nh-dash-name', 'Managed')
  const title = await page.textContent('.nh-dash__title')
  ok('rename previews live in the toolbar', title?.includes('Managed'), title ?? '')

  await page.fill('#nh-dash-columns', '6')
  await page.selectOption('#nh-dash-rowmode', 'fixed')
  await page.waitForSelector('#nh-dash-rowpx', { timeout: 3000 })
  await page.fill('#nh-dash-rowpx', '60')
  await page.fill('#nh-dash-gap', '12')

  await page.click('[aria-label="Undo"]')
  ok('undo reverts the gap edit', (await page.inputValue('#nh-dash-gap')) === '8')
  await page.click('[aria-label="Redo"]')
  ok('redo restores the gap edit', (await page.inputValue('#nh-dash-gap')) === '12')

  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  await page.click('.nh-sheet button:has-text("Clock")')
  await sleep(300)
  await page.click('button:has-text("Save")')
  await sleep(1200)
  const saved = await getComp()
  const c = saved?.config ?? {}
  ok('saved: renamed', c.name === 'Managed', String(c.name))
  ok('saved: columns 6', Number(c.columns) === 6, String(c.columns))
  ok('saved: fixed row height 60', Number(c.rowHeight) === 60, String(c.rowHeight))
  ok('saved: gap 12', Number(c.gap) === 12, String(c.gap))
  ok('saved: clock widget kept', Array.isArray(c.widgets) && c.widgets.length === 1 && c.widgets[0].type === 'clock', JSON.stringify(c.widgets?.map((w) => w.type) ?? []))

  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile--new', { timeout: 10000 })
  ok('Home shows the renamed tile', (await page.locator('.nh-tile:has-text("Managed")').count()) === 1)

  await page.click('.nh-tile:has-text("Managed")')
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 5000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 5000 })
  await page.click('[aria-label="Dashboard settings"]')
  await page.waitForSelector('#nh-dash-name', { timeout: 5000 })
  await page.click('button:has-text("Delete dashboard")')
  await sleep(1500)
  ok('delete returns to Home', page.url().endsWith('#/') || (await page.locator('.nh-home').count()) === 1, page.url())
  ok('component removed from server', (await getComp()) === null)
  ok('tile gone from Home', (await page.locator('.nh-tile:has-text("Managed")').count()) === 0)

  const realErrs = errs.filter((e) => !/ERR_NAME|ERR_CONNECTION|net::|404|Failed to load resource/.test(e))
  ok('no page/console errors', realErrs.length === 0, realErrs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
ok('cleanup: test dashboard absent', (await getComp()) === null)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
