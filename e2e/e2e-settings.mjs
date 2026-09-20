// Settings suite: item picker, theme switching, backup export and replace/merge import.
// Assumes an EMPTY namespace (the wipe/restore cycle); creates its own dashboard over REST.
import { launchChromium } from './lib/browser.mjs'
import { readFileSync } from 'node:fs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'


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

const restGet = async (p) => {
  const r = await fetch(p)
  return { status: r.status, body: r.ok ? await r.json() : null }
}
const restDelete = async (p) => (await fetch(p, { method: 'DELETE', headers: AUTH })).status
const restPost = async (uid, component, config) =>
  (
    await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, component, config }),
    })
  ).status

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
  } catch {}
}, TOKEN)

try {
  const st = await restPost('dashboard:nh-e2e-set', 'neohab:dashboard', {
    version: 1,
    id: 'nh-e2e-set',
    name: 'E2E Picker',
    columns: 12,
    rowHeight: 40,
    widgets: [
      { id: 'w-color', type: 'color', config: { item: ITEMS.color, label: 'Colour' }, layout: { lg: { x: 0, y: 0, w: 3, h: 5 } } },
    ],
  })
  ok('suite dashboard created', st === 200 || st === 201, `status=${st}`)

  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile:not(.nh-tile--new)')
  await page.click('.nh-tile:not(.nh-tile--new)')
  await page.waitForSelector('.nh-grid')
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')

  await page.click('.nh-cell:has(.nh-cell__type:text-is("color")) .nh-cell__overlay')
  await page.waitForSelector('.nh-sheet--side')
  const itemInput = page.locator('.nh-sheet--side .nh-picker input')
  ok('item field shows configured item', (await itemInput.inputValue()) === ITEMS.color, await itemInput.inputValue())

  ok('dropdown button is visible', await page.locator('.nh-picker__toggle').isVisible())
  await page.locator('.nh-picker__toggle').click()
  await page.waitForSelector('.nh-picker__list', { timeout: 3000 })
  await page.waitForSelector('.nh-picker__option', { timeout: 15000 }).catch(() => {})
  const optionCount = await page.locator('.nh-picker__option').count()
  ok('dropdown lists color items', optionCount >= 1, `options=${optionCount}`)
  const firstMeta = await page.locator('.nh-picker__option .nh-picker__meta').first().textContent()
  ok('options are type-filtered (Color)', /Color/.test(firstMeta ?? ''), firstMeta ?? '')
  await page.keyboard.press('Escape')
  ok('escape closes dropdown', (await page.locator('.nh-picker__list').count()) === 0)

  await page.click('button:has-text("Exit")')
  await page.waitForSelector('[aria-label="Edit dashboard"]')

  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.click('.nh-home__settings')
  await page.waitForSelector('.nh-themes')

  const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.click('.nh-theme__pick:has-text("OLED Black")')
  await sleep(800)
  const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ok('theme applies instantly', bgBefore !== bgAfter && bgAfter === 'rgb(0, 0, 0)', `${bgBefore} -> ${bgAfter}`)

  const savedSettings = await restGet(NS + '/settings')
  ok('theme choice persisted to server', savedSettings.status === 200 && savedSettings.body?.config?.theme === 'oled')

  const downloadPromise = page.waitForEvent('download')
  await page.click('button:has-text("Export configuration")')
  const download = await downloadPromise
  const path = await download.path()
  const bundle = JSON.parse(readFileSync(path, 'utf8'))
  ok('export bundle valid', bundle?.manifest?.app === 'neohab' && Array.isArray(bundle.components), `components=${bundle?.components?.length}`)
  ok('export includes settings', bundle.components.some((c) => c.uid === 'settings'))
  ok('export includes suite dashboard', bundle.components.some((c) => c.uid === 'dashboard:nh-e2e-set'))

  const fileInput = page.locator('section:has(h2:text-is("Backup")) input[type="file"]')
  await fileInput.setInputFiles({ name: 'neohab-config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) })
  await page.waitForSelector('.nh-settings__importchoice', { timeout: 5000 })
  ok('import offers merge/replace choice', await page.locator('button:has-text("Merge into current")').isVisible())
  await page.click('button:has-text("Replace everything")')
  await sleep(2500)
  ok('replace import reports success', await page.locator('.nh-toast__text:has-text("Backup imported")').isVisible())
  const afterImport = await restGet(NS + '/settings')
  ok('config intact after replace round-trip', afterImport.status === 200 && afterImport.body?.config?.theme === 'oled')

  const st2 = await restPost('dashboard:nh-e2e-merge', 'neohab:dashboard', {
    version: 1,
    id: 'nh-e2e-merge',
    name: 'E2E Merge Survivor',
    columns: 12,
    rowHeight: 40,
    widgets: [],
  })
  ok('merge-survivor dashboard created', st2 === 200 || st2 === 201, `status=${st2}`)
  await fileInput.setInputFiles({ name: 'neohab-config.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) })
  await page.waitForSelector('.nh-settings__importchoice', { timeout: 5000 })
  await page.click('button:has-text("Merge into current")')
  await sleep(2500)
  ok('merge import reports success', await page.locator('.nh-toast__text:has-text("merged")').isVisible())
  const survivor = await restGet(NS + '/dashboard:nh-e2e-merge')
  ok('merge keeps components not in the bundle', survivor.status === 200)
  const merged = await restGet(NS + '/dashboard:nh-e2e-set')
  ok('merge overwrites components in the bundle', merged.status === 200)

  ok('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

const list = await restGet(NS)
let cleaned = true
for (const c of list.body ?? []) {
  const st = await restDelete(NS + '/' + encodeURIComponent(c.uid))
  if (st !== 200) cleaned = false
}
const empty = await restGet(NS)
ok('cleanup: namespace empty again', cleaned && empty.body?.length === 0, `left=${empty.body?.length}`)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
