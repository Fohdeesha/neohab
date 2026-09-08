// New-features suite: stacked (phone) drag-reorder, and icons on switch/selection widgets.
// SAFE with a live config: creates only nh-e2e-* components, deletes exactly those, restores item state.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const SWITCH_ITEM = ITEMS.switch

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })

const restGet = async (p) => {
  const r = await fetch(p)
  return { status: r.status, body: r.ok ? await r.json() : null }
}
const restDelete = async (uid) =>
  (await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })).status
const restPost = async (uid, component, config) =>
  (
    await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, component, config }),
    })
  ).status
const sendCmd = (item, val) =>
  fetch(BASE + '/rest/items/' + item, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'text/plain' },
    body: val,
  })
const getState = async (item) => (await fetch(`${BASE}/rest/items/${item}/state`)).text()

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const STACK_UID = 'dashboard:nh-e2e-stack'
const ICONS_UID = 'dashboard:nh-e2e-wicons'
const initialSwitchState = await getState(SWITCH_ITEM)

const browser = await launch()
const consoleErrors = []

try {
  const st1 = await restPost(STACK_UID, 'neohab:dashboard', {
    version: 1,
    id: 'nh-e2e-stack',
    name: 'E2E Stack',
    columns: 12,
    rowHeight: 40,
    widgets: [
      { id: 'w-a', type: 'label', config: { text: 'AAA', fontSize: 20 }, layout: { lg: { x: 0, y: 0, w: 12, h: 2 } } },
      { id: 'w-b', type: 'label', config: { text: 'BBB', fontSize: 20 }, layout: { lg: { x: 0, y: 2, w: 12, h: 2 } } },
      { id: 'w-c', type: 'label', config: { text: 'CCC', fontSize: 20 }, layout: { lg: { x: 0, y: 4, w: 12, h: 2 } } },
    ],
  })
  ok('stack dashboard created', st1 === 200 || st1 === 201, `status=${st1}`)

  const phone = await browser.newPage({ viewport: { width: 400, height: 850 } })
  phone.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  phone.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
  phone.on('dialog', (d) => d.accept())
  await phone.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
    } catch {}
  }, TOKEN)

  await phone.goto(APP + '#/d/nh-e2e-stack', { waitUntil: 'domcontentloaded' })
  await phone.waitForSelector('.nh-grid--stacked', { timeout: 10000 })
  const runOrder = await phone.$$eval('.nh-grid--stacked .nh-widget__body', (els) =>
    els.map((e) => e.textContent?.trim())
  )
  ok('run mode stacks in grid order', runOrder.join(',') === 'AAA,BBB,CCC', runOrder.join(','))

  await phone.click('[aria-label="Edit dashboard"]')
  await phone.waitForSelector('.nh-grid--stackedit', { timeout: 10000 })
  ok('phone edit mode shows the stacked surface', true)
  ok('rows have drag handles', (await phone.locator('.nh-grid--stackedit .nh-cell__handle').count()) === 3)

  const cells = phone.locator('.nh-grid--stackedit .nh-cell')
  const handleC = phone.locator('.nh-grid--stackedit .nh-cell:has-text("CCC") .nh-cell__handle')
  const boxC = await handleC.boundingBox()
  const boxA = await cells.first().boundingBox()
  await phone.mouse.move(boxC.x + boxC.width / 2, boxC.y + boxC.height / 2)
  await phone.mouse.down()
  await phone.mouse.move(boxC.x + boxC.width / 2, boxA.y - 4, { steps: 10 })
  await sleep(150)
  const indicatorVisible = (await phone.locator('.nh-stackdrop').count()) === 1
  await phone.mouse.up()
  ok('drop indicator shows while dragging', indicatorVisible)

  const editOrder = await phone.$$eval('.nh-grid--stackedit .nh-cell .nh-widget__body', (els) =>
    els.map((e) => e.textContent?.trim())
  )
  ok('drag reorders the stack', editOrder.join(',') === 'CCC,AAA,BBB', editOrder.join(','))

  await phone.keyboard.press('Control+z')
  await sleep(200)
  const afterUndo = await phone.$$eval('.nh-grid--stackedit .nh-cell .nh-widget__body', (els) =>
    els.map((e) => e.textContent?.trim())
  )
  ok('undo restores derived order', afterUndo.join(',') === 'AAA,BBB,CCC', afterUndo.join(','))
  await phone.keyboard.press('Control+Shift+z')
  await sleep(200)
  const afterRedo = await phone.$$eval('.nh-grid--stackedit .nh-cell .nh-widget__body', (els) =>
    els.map((e) => e.textContent?.trim())
  )
  ok('redo reapplies the reorder', afterRedo.join(',') === 'CCC,AAA,BBB', afterRedo.join(','))

  await phone.click('button:has-text("Save")')
  await sleep(1500)
  const saved = await restGet(NS + '/' + encodeURIComponent(STACK_UID))
  ok(
    'stackOrder persisted on save',
    JSON.stringify(saved.body?.config?.stackOrder) === JSON.stringify(['w-c', 'w-a', 'w-b']),
    JSON.stringify(saved.body?.config?.stackOrder)
  )

  await phone.waitForSelector('.nh-grid--stacked', { timeout: 10000 })
  const runOrder2 = await phone.$$eval('.nh-grid--stacked .nh-widget__body', (els) =>
    els.map((e) => e.textContent?.trim())
  )
  ok('run mode uses pinned stack order', runOrder2.join(',') === 'CCC,AAA,BBB', runOrder2.join(','))
  const rects = saved.body?.config?.widgets?.map((w) => w.layout?.lg?.y)
  ok('grid rects unchanged by reorder', JSON.stringify(rects) === JSON.stringify([0, 2, 4]), JSON.stringify(rects))

  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  desk.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
  await desk.goto(APP + '#/d/nh-e2e-stack', { waitUntil: 'domcontentloaded' })
  await desk.waitForSelector('.nh-grid:not(.nh-grid--stacked)', { timeout: 10000 })
  const deskFirst = await desk.locator('.nh-grid .nh-widget__body').first().textContent()
  ok('desktop grid unaffected by stack order', deskFirst?.trim() === 'AAA', deskFirst ?? '')
  await desk.close()

  await phone.click('[aria-label="Edit dashboard"]')
  await phone.waitForSelector('.nh-grid--stackedit', { timeout: 10000 })
  await phone.click('[aria-label="Dashboard settings"]')
  await phone.waitForSelector('button:has-text("Reset stack order")', { timeout: 5000 })
  await phone.click('button:has-text("Reset stack order")')
  await sleep(300)
  const afterReset = await phone.$$eval('.nh-grid--stackedit .nh-cell .nh-widget__body', (els) =>
    els.map((e) => e.textContent?.trim())
  )
  ok('reset returns to derived order', afterReset.join(',') === 'AAA,BBB,CCC', afterReset.join(','))
  await phone.click('button:has-text("Save")')
  await sleep(1500)
  const savedReset = await restGet(NS + '/' + encodeURIComponent(STACK_UID))
  ok('reset clears persisted stackOrder', savedReset.body?.config?.stackOrder === undefined)
  await phone.close()

  const st2 = await restPost(ICONS_UID, 'neohab:dashboard', {
    version: 1,
    id: 'nh-e2e-wicons',
    name: 'E2E Widget Icons',
    columns: 12,
    rowHeight: 40,
    widgets: [
      {
        id: 'w-sw',
        type: 'button',
        config: { style: 'switch', toggle: true, nonZeroIsOn: true, item: SWITCH_ITEM, label: 'Guest', icon: 'mdi:lightbulb', iconSize: 40 },
        layout: { lg: { x: 0, y: 0, w: 3, h: 4 } },
      },
      {
        id: 'w-sel',
        type: 'selection',
        config: {
          item: SWITCH_ITEM,
          label: 'Guest Sel',
          icon: 'oh:switch',
          choices: 'ON=On\nOFF=Off',
        },
        layout: { lg: { x: 3, y: 0, w: 4, h: 4 } },
      },
    ],
  })
  ok('icons dashboard created', st2 === 200 || st2 === 201, `status=${st2}`)

  await sendCmd(SWITCH_ITEM, 'OFF')
  await sleep(800)

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
  await page.goto(APP + '#/d/nh-e2e-wicons', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-switch', { timeout: 10000 })
  await sleep(2000)

  const swIcon = page.locator('.nh-switch .nh-icon--mdi')
  ok('switch renders mdi icon', (await swIcon.count()) === 1)
  const tintOff = await swIcon.evaluate((el) => getComputedStyle(el).backgroundColor)

  const selIcon = page.locator('.nh-widget__label .nh-icon--oh')
  ok('selection renders oh header icon', (await selIcon.count()) === 1)
  const selSrc = await selIcon.getAttribute('src')
  ok('selection icon uses server icon URL', /\/icon\/switch/.test(selSrc ?? ''), selSrc ?? '')
  const offActive = await page
    .locator('.nh-selection__btn:has-text("Off")')
    .evaluate((el) => el.classList.contains('nh-selection__btn--active'))
  ok('selection highlights current state (OFF)', offActive)

  await sendCmd(SWITCH_ITEM, 'ON')
  await sleep(2000)
  const uiOn = await page.$eval('.nh-switch', (el) => el.classList.contains('nh-switch--on'))
  const tintOn = await swIcon.evaluate((el) => getComputedStyle(el).backgroundColor)
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nh-primary').trim()
  )
  ok('switch reflects ON via SSE', uiOn)
  ok('mdi icon tints when ON', tintOn !== tintOff, `${tintOff} -> ${tintOn} (primary ${primary})`)
  await page.close()

  ok('no console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

for (const uid of [STACK_UID, ICONS_UID]) {
  const st = await restDelete(uid)
  ok(`cleanup: ${uid} deleted`, st === 200 || st === 404, `status=${st}`)
}
await sendCmd(SWITCH_ITEM, initialSwitchState === 'ON' ? 'ON' : 'OFF')
await sleep(800)
ok('cleanup: switch item restored', (await getState(SWITCH_ITEM)) === initialSwitchState)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exit(allPass ? 0 : 1)
