// Version history suite: capture before a change, coalescing, the diff view, renaming, restoring,
// retention, hash-shared images, turning it off, and a failed capture not failing the save it protects.
import { launchChromium } from './lib/browser.mjs'
import { ALL_NS, APP, AUTH, HISTORY_DATA_NS, HISTORY_NS, NS, TOKEN } from './lib/target.mjs'

{
  const counts = []
  for (const [kind, url] of ALL_NS) counts.push([kind, (await (await fetch(url)).json()).length])
  if (counts.some(([, n]) => n > 0)) {
    console.log(
      'ABORT: ' + counts.map(([k, n]) => `${n} ${k}`).join(' + ') + ' components present - ' +
        'wipe-cycle suite needs empty namespaces (snapshot + wipe first).'
    )
    process.exit(2)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })

const getJson = async (url) => {
  const r = await fetch(url, { headers: AUTH })
  return r.ok ? r.json() : null
}
const del = async (url) => (await fetch(url, { method: 'DELETE', headers: AUTH })).status
const post = async (url, body) =>
  (await fetch(url, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status
const upsert = async (url, body) => {
  const path = url + '/' + encodeURIComponent(body.uid)
  const res = await fetch(path, { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return res.status
  return post(url, body)
}

const histIndex = async () => (await getJson(HISTORY_NS + '/index'))?.config ?? null
const dataUids = async () => ((await getJson(HISTORY_DATA_NS)) ?? []).map((c) => c.uid)
const histUids = async () => ((await getJson(HISTORY_NS)) ?? []).map((c) => c.uid)
const snapshotOf = async (id) => (await getJson(HISTORY_DATA_NS + '/snap:' + id))?.config ?? null

async function waitSnapshots(n, timeout = 15000) {
  const until = Date.now() + timeout
  for (;;) {
    const index = await histIndex()
    const have = index?.snapshots?.length ?? 0
    if (have === n) return index
    if (Date.now() > until) return index
    await sleep(250)
  }
}

const dashboard = (id, name, widgets) => ({
  version: 1,
  id,
  name,
  columns: 12,
  rowHeight: 40,
  widgets,
})
const clock = (id, x) => ({ id, type: 'clock', config: { label: 'Clock ' + id }, layout: { lg: { x, y: 0, w: 3, h: 3 } } })

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
const badResponses = []
page.on('response', (r) => {
  if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.request().method() + ' ' + r.url())
})
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
  } catch {}
}, TOKEN)

async function openSettings() {
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-themes', { timeout: 15000 })
}

const forgetWindow = () => page.evaluate(() => localStorage.removeItem('neohab:lastConfigWrite'))

async function expandFirstRow() {
  const head = page.locator('.nh-histrow__head').first()
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click()
  await page.waitForSelector('.nh-histfield', { timeout: 10000 })
}

async function compareMode(label) {
  await page.click(`button:has-text("${label}")`)
  const settled = async () => {
    await page.waitForFunction(
      () => {
        const detail = document.querySelector('.nh-histdetail')
        return !!detail && !/Loading/.test(detail.textContent ?? '')
      },
      { timeout: 15000 }
    )
  }
  await settled()
  await new Promise((r) => setTimeout(r, 300))
  await settled()
}

async function changeTheme(name, id) {
  await page.click(`.nh-theme__pick:has-text("${name}")`)
  const until = Date.now() + 10000
  for (;;) {
    const settings = await getJson(NS + '/settings')
    if (settings?.config?.theme === id) return true
    if (Date.now() > until) return false
    await sleep(200)
  }
}

try {
  ok(
    'seed dashboard with one widget',
    (await post(NS, { uid: 'dashboard:nh-e2e-hist', component: 'neohab:dashboard', config: dashboard('nh-e2e-hist', 'E2E History', [clock('w-1', 0)]) })) === 200
  )
  ok('history still empty before the app writes anything', (await histUids()).length === 0 && (await dataUids()).length === 0)

  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile:not(.nh-tile--new)')
  await page.click('.nh-tile:not(.nh-tile--new)')
  await page.waitForSelector('.nh-grid')
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0)
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  await page.click('.nh-sheet button:has-text("Clock")')
  await page.click('button:has-text("Save")')
  await page.waitForSelector('.nh-grid:not(.nh-grid--edit)')

  const index1 = await waitSnapshots(1)
  ok('a save creates one restore point', index1?.snapshots?.length === 1, `count=${index1?.snapshots?.length}`)

  const live1 = await getJson(NS + '/dashboard:nh-e2e-hist')
  ok('the change itself was saved (two widgets live)', live1?.config?.widgets?.length === 2, `widgets=${live1?.config?.widgets?.length}`)

  const snap1 = await snapshotOf(index1.snapshots[0].id)
  const snapDash1 = snap1?.components?.find((c) => c.uid === 'dashboard:nh-e2e-hist')
  ok(
    'the restore point holds the state BEFORE the change (one widget)',
    snapDash1?.config?.widgets?.length === 1,
    `widgets in snapshot=${snapDash1?.config?.widgets?.length}`
  )
  ok('the restore point has no server-added fields', snapDash1 && !('props' in snapDash1) && !('timestamp' in snapDash1))
  ok('the first restore point reports no earlier changes', index1.snapshots[0].summary?.count === 0)

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0)
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  await page.click('.nh-sheet button:has-text("Clock")')
  await page.click('button:has-text("Save")')
  await page.waitForSelector('.nh-grid:not(.nh-grid--edit)')
  await sleep(1500)
  const afterSecond = await histIndex()
  ok('a second change soon after reuses the same restore point', afterSecond?.snapshots?.length === 1, `count=${afterSecond?.snapshots?.length}`)
  const live2 = await getJson(NS + '/dashboard:nh-e2e-hist')
  ok('the second change was still saved', live2?.config?.widgets?.length === 3, `widgets=${live2?.config?.widgets?.length}`)

  await forgetWindow()
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0)
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-sheet', { timeout: 5000 })
  await page.click('.nh-sheet button:has-text("Clock")')
  await page.click('button:has-text("Save")')
  await page.waitForSelector('.nh-grid:not(.nh-grid--edit)')
  const index2 = await waitSnapshots(2)
  ok('a change after the window starts a new restore point', index2?.snapshots?.length === 2, `count=${index2?.snapshots?.length}`)
  ok('newest is first', index2.snapshots[0].id !== index1.snapshots[0].id)
  ok(
    'the new point summarises what changed since the previous one',
    index2.snapshots[0].summary?.count === 1 && index2.snapshots[0].summary.names[0] === 'E2E History',
    JSON.stringify(index2.snapshots[0].summary)
  )
  const snap2 = await snapshotOf(index2.snapshots[0].id)
  const snapDash2 = snap2?.components?.find((c) => c.uid === 'dashboard:nh-e2e-hist')
  ok('the new point holds three widgets (the state before the third change)', snapDash2?.config?.widgets?.length === 3)

  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  const section = page.locator('section:has(h2:text-is("Version history"))')
  await section.waitFor({ timeout: 10000 })
  ok('Settings shows the Version history section', await section.isVisible())
  await page.waitForSelector('.nh-hist__row')
  ok('one row per restore point', (await page.locator('.nh-hist__row').count()) === 2, `rows=${await page.locator('.nh-hist__row').count()}`)
  ok('the retention field shows the default of 25', (await page.locator('#nh-hist-limit').inputValue()) === '25')
  ok('the window field shows the default of 5', (await page.locator('#nh-hist-window').inputValue()) === '5')

  const rowTexts = await page.locator('.nh-hist__when').allInnerTexts()
  ok('rows are named by date', /\d{4}/.test(rowTexts[0]) && /\d/.test(rowTexts[1]), rowTexts.join(' | '))
  ok('the oldest row is marked as the starting point', (await page.locator('.nh-hist__row').last().innerText()).includes('Starting point'))
  ok('the newest row names what changed', (await page.locator('.nh-hist__row').first().innerText()).includes('E2E History'))

  await page.locator('.nh-hist__row').first().click()
  await page.waitForSelector('.nh-histdetail')
  await page.waitForSelector('.nh-histrow', { timeout: 10000 })
  ok('selecting a point lists what changed', (await page.locator('.nh-histrow').count()) === 1)
  ok('the changed component is named', (await page.locator('.nh-histrow__name').first().innerText()) === 'E2E History')
  ok(
    'its kind is shown',
    (await page.locator('.nh-histrow__kind').first().innerText()).trim().toLowerCase() === 'changed',
    await page.locator('.nh-histrow__kind').first().innerText()
  )
  ok('the component kind is spelled out', (await page.locator('.nh-histrow__cat').first().innerText()) === 'Dashboard')

  await expandFirstRow()
  const fieldPaths = await page.locator('.nh-histfield__path').allInnerTexts()
  ok('expanding shows the individual fields that differ', fieldPaths.length > 0, fieldPaths.slice(0, 3).join(' | '))
  ok('the widget is named in the path', fieldPaths.some((p) => p.startsWith('widgets[')), fieldPaths.join(' | '))
  ok(
    'widgets are identified by identity, never by their position in the list',
    fieldPaths.every((p) => !/^widgets\[\d+\]/.test(p)),
    fieldPaths.join(' | ')
  )

  await compareMode('Compared with now')
  ok('comparing with now also reports the dashboard', (await page.locator('.nh-histrow').count()) === 1)
  await expandFirstRow()
  ok('comparing with now lists fields too', (await page.locator('.nh-histfield').count()) > 0)
  await compareMode('Changes at this point')

  await page.locator('.nh-hist__row').last().click()
  await page.waitForSelector('.nh-histdetail')
  ok(
    'the earliest point says there is nothing before it',
    await page
      .locator('.nh-histdetail:has-text("earliest restore point")')
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false)
  )

  await page.locator('.nh-hist__row').first().click()
  await page.waitForSelector('.nh-histdetail__label')
  await page.fill('.nh-histdetail__label', 'before the rework')
  await page.locator('.nh-histdetail__label').press('Enter')
  await sleep(1200)
  const renamed = await histIndex()
  ok('a name is stored on the index', renamed?.snapshots?.[0]?.label === 'before the rework', renamed?.snapshots?.[0]?.label)
  const renamedSnap = await snapshotOf(renamed.snapshots[0].id)
  ok('the name is stored on the snapshot too, so a rebuild keeps it', renamedSnap?.label === 'before the rework')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-hist__row')
  ok('the name is shown instead of the date', (await page.locator('.nh-hist__when').first().innerText()) === 'before the rework')

  ok(
    'seed an extra dashboard that the restore must remove',
    (await post(NS, { uid: 'dashboard:nh-e2e-extra', component: 'neohab:dashboard', config: dashboard('nh-e2e-extra', 'E2E Extra', []) })) === 200
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-hist__row')
  await page.locator('.nh-hist__row').last().click()
  await page.waitForSelector('.nh-histdetail')

  const CONFIG_URLS = /\/rest\/ui\/components\/neohab:config/
  let configWrites = 0
  let lastWriteAt = 0
  const writeTimes = []
  const slowWrites = async (route) => {
    if (['PUT', 'POST', 'DELETE'].includes(route.request().method())) {
      configWrites++
      await sleep(400)
      await route.continue()
      lastWriteAt = Date.now()
      writeTimes.push(lastWriteAt)
      return
    }
    await route.continue()
  }
  await page.route(CONFIG_URLS, slowWrites)
  await page.evaluate(() => {
    const w = window
    w.__nhSamples = []
    const btn = () =>
      [...document.querySelectorAll('button')].find((b) =>
        /Restore everything to this point|Working/.test(b.textContent || '')
      )
    w.__nhTimer = setInterval(() => {
      const b = btn()
      if (b) w.__nhSamples.push({ t: Date.now(), d: b.disabled })
    }, 20)
  })
  const restoreBtn = page.locator('button:has-text("Restore everything to this point")')
  await restoreBtn.click()
  await page.waitForFunction(() => /Restored|Restore failed/.test(document.querySelector('.nh-toast__text')?.textContent ?? ''), { timeout: 30000 })
  const doneAt = Date.now()
  const disabledSamples = await page.evaluate(() => {
    const w = window
    clearInterval(w.__nhTimer)
    return w.__nhSamples
  })
  await page.unroute(CONFIG_URLS, slowWrites)
  const firstLive = disabledSamples.find((s) => !s.d)
  const restoreWrites = writeTimes.filter((t) => t <= doneAt)
  const lastRestoreWrite = restoreWrites.length ? Math.max(...restoreWrites) : lastWriteAt
  ok(
    'the Restore button stays disabled until the restore has finished writing',
    disabledSamples.length > 5 && (!firstLive || firstLive.t >= lastRestoreWrite),
    `${disabledSamples.length} samples, ${restoreWrites.length} of ${writeTimes.length} writes during the restore; ` +
      (firstLive ? `went live ${firstLive.t - lastRestoreWrite}ms after its last write` : 'never went live')
  )
  ok('the restore was still writing while that was sampled', configWrites >= 2, `${configWrites} config writes`)
  await page.waitForSelector('.nh-toast__text', { timeout: 30000 })
  const notice = await page.locator('.nh-toast__text').innerText()
  ok('the restore reports what it did', /Restored/.test(notice), notice)

  const afterRestore = await getJson(NS)
  const uidsAfter = afterRestore.map((c) => c.uid).sort()
  ok('components the point did not contain are gone', !uidsAfter.includes('dashboard:nh-e2e-extra'), uidsAfter.join(','))
  const restoredDash = await getJson(NS + '/dashboard:nh-e2e-hist')
  ok('the configuration is back to that point (one widget)', restoredDash?.config?.widgets?.length === 1, `widgets=${restoredDash?.config?.widgets?.length}`)

  const afterRestoreIndex = await histIndex()
  ok(
    'the restore took a restore point of its own first, so it can be undone',
    afterRestoreIndex.snapshots.length === 3,
    `count=${afterRestoreIndex.snapshots.length}`
  )
  const undoSnap = await snapshotOf(afterRestoreIndex.snapshots[0].id)
  ok(
    'that point holds the pre-restore state (the extra dashboard)',
    undoSnap?.components?.some((c) => c.uid === 'dashboard:nh-e2e-extra')
  )

  ok(
    'set the retention to two',
    (await upsert(NS, { uid: 'settings', component: 'neohab:settings', config: { version: 1, theme: 'dark', historyLimit: 2 } })) === 200
  )
  await openSettings()
  const droppedIds = (await histIndex()).snapshots.map((s) => s.id)

  for (const [name, id] of [
    ['OLED Black', 'oled'],
    ['neohab Light', 'light'],
  ]) {
    await forgetWindow()
    ok(`change applied (${id})`, await changeTheme(name, id))
    await sleep(800)
  }
  const pruned = await waitSnapshots(2)
  ok('only the newest two restore points are kept', pruned?.snapshots?.length === 2, `count=${pruned?.snapshots?.length}`)
  const uidsNow = await dataUids()
  const orphaned = droppedIds.filter((id) => uidsNow.includes('snap:' + id) && !pruned.snapshots.some((s) => s.id === id))
  ok('the dropped restore points are deleted, not just delisted', orphaned.length === 0, orphaned.join(','))

  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')
  ok(
    'seed an uploaded icon',
    (await post(NS, { uid: 'icon:nh-e2e-ico', component: 'neohab:icon', config: { version: 1, id: 'nh-e2e-ico', name: 'E2E Icon', dataUri, bytes: dataUri.length } })) === 200
  )
  await openSettings()
  await forgetWindow()
  ok('change applied (aqua)', await changeTheme('Aqua (HABPanel classic)', 'aqua'))
  await sleep(1000)

  const withIcon = await histIndex()
  const iconSnap = await snapshotOf(withIcon.snapshots[0].id)
  const iconEntry = iconSnap?.components?.find((c) => c.uid === 'icon:nh-e2e-ico')
  ok('the icon is in the restore point', !!iconEntry)
  ok('its image body is not copied into the restore point', iconEntry && !('dataUri' in iconEntry.config), JSON.stringify(Object.keys(iconEntry?.config ?? {})))
  ok('it references the image by hash instead', typeof iconEntry?.blobHash === 'string' && iconEntry.blobHash.length === 64, iconEntry?.blobHash)
  const blobUid = 'blob:' + iconEntry.blobHash
  const blob = await getJson(HISTORY_DATA_NS + '/' + blobUid)
  ok('the image body is stored once, under its hash', blob?.config?.dataUri === dataUri)
  ok('the index tracks the image', (withIcon.blobs ?? []).includes(iconEntry.blobHash))

  await forgetWindow()
  ok('change applied (swiss)', await changeTheme('Swiss Sheet', 'swiss'))
  await sleep(1000)
  const twoWithIcon = await histIndex()
  const blobCount = (await dataUids()).filter((u) => u.startsWith('blob:')).length
  ok(
    'a second restore point with the same image shares the one copy',
    blobCount === 1 && twoWithIcon.snapshots.filter((s) => (s.blobs ?? []).includes(iconEntry.blobHash)).length === 2,
    `blobs=${blobCount}`
  )

  ok('delete the icon from the configuration', (await del(NS + '/icon:nh-e2e-ico')) === 200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-hist__row')
  const iconPointIndex = (await histIndex()).snapshots.findIndex((s) => (s.blobs ?? []).includes(iconEntry.blobHash))
  await page.locator('.nh-hist__row').nth(iconPointIndex).click()
  await page.waitForSelector('.nh-histdetail')
  await page.click('button:has-text("Restore everything to this point")')
  await page.waitForSelector('.nh-toast__text', { timeout: 20000 })
  const restoredIcon = await getJson(NS + '/icon:nh-e2e-ico')
  ok('restoring brings the image back whole', restoredIcon?.config?.dataUri === dataUri)

  ok('delete the restored icon from the configuration', (await del(NS + '/icon:nh-e2e-ico')) === 200)
  for (const [name, id] of [
    ['neohab Dark', 'dark'],
    ['OLED Black', 'oled'],
  ]) {
    await forgetWindow()
    ok(`change applied (${id})`, await changeTheme(name, id))
    await sleep(800)
  }
  const finalIndex = await histIndex()
  const stillReferenced = finalIndex.snapshots.some((s) => (s.blobs ?? []).includes(iconEntry.blobHash))
  const blobsLeft = (await dataUids()).filter((u) => u.startsWith('blob:'))
  ok(
    'an image no restore point references any more is deleted',
    !stillReferenced && blobsLeft.length === 0,
    `referenced=${stillReferenced} blobs=${blobsLeft.join(',')}`
  )
  ok('the index stops tracking it too', (finalIndex.blobs ?? []).length === 0)

  ok(
    'no console/page errors',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ') + (badResponses.length ? '  responses: ' + badResponses.slice(0, 5).join(' | ') : '')
  )

  await openSettings()
  await page.waitForSelector('#nh-hist-window')
  const windowBefore = (await getJson(NS + '/settings'))?.config?.historyWindowMin ?? 5
  await page.fill('#nh-hist-window', '120')
  await sleep(900)
  const windowMid = (await getJson(NS + '/settings'))?.config?.historyWindowMin ?? 5
  ok(
    'typing into the retention field writes nothing yet',
    windowMid === windowBefore,
    `stored ${JSON.stringify(windowMid)} while typing (was ${JSON.stringify(windowBefore)})`
  )
  ok('the field still shows what was typed', (await page.locator('#nh-hist-window').inputValue()) === '120')
  await page.locator('#nh-hist-window').press('Tab')
  await sleep(1200)
  ok(
    'blurring commits it',
    (await getJson(NS + '/settings'))?.config?.historyWindowMin === 120,
    JSON.stringify((await getJson(NS + '/settings'))?.config?.historyWindowMin)
  )
  await page.fill('#nh-hist-window', '99999')
  await page.locator('#nh-hist-window').press('Tab')
  await sleep(1200)
  const clamped = (await getJson(NS + '/settings'))?.config?.historyWindowMin
  ok('an out-of-range value is clamped, not stored as typed', clamped === 1440, JSON.stringify(clamped))
  ok('and the field shows the clamped value', (await page.locator('#nh-hist-window').inputValue()) === '1440')

  await openSettings()
  await page.waitForSelector('#nh-hist-limit')
  await page.fill('#nh-hist-limit', '0')
  await page.locator('#nh-hist-limit').press('Tab')
  await sleep(1200)
  ok('turning it off explains what happens', await page.locator('.nh-settings__text:has-text("History is off")').isVisible())
  await forgetWindow()
  await changeTheme('neohab Dark', 'dark')
  await sleep(1500)
  const offUids = [...(await histUids()), ...(await dataUids())]
  ok('with history off the stored points are removed, index included', offUids.length === 0, offUids.join(','))

  ok(
    'turn history back on',
    (await upsert(NS, { uid: 'settings', component: 'neohab:settings', config: { version: 1, theme: 'dark', historyLimit: 25 } })) === 200
  )
  const blockWrites = (route) =>
    ['POST', 'PUT'].includes(route.request().method()) ? route.abort('failed') : route.continue()
  await page.route('**/rest/ui/components/neohab:history**', blockWrites)
  await page.route('**/rest/ui/components/neohab:historydata**', blockWrites)
  await openSettings()
  await forgetWindow()
  const applied = await changeTheme('OLED Black', 'oled')
  ok('the change is still saved when the history cannot be written', applied)
  await page.waitForSelector('.nh-toast', { timeout: 8000 }).catch(() => {})
  const toast = await page.locator('.nh-toast').first().innerText().catch(() => '')
  ok('and the user is told the safety net failed', /restore point/i.test(toast), toast)
  await page.unroute('**/rest/ui/components/neohab:history**')
  await page.unroute('**/rest/ui/components/neohab:historydata**')
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

let cleaned = true
for (const [, url] of ALL_NS) {
  for (const c of (await getJson(url)) ?? []) {
    if ((await del(url + '/' + encodeURIComponent(c.uid))) !== 200) cleaned = false
  }
}
let left = 0
for (const [, url] of ALL_NS) left += ((await getJson(url)) ?? []).length
ok('cleanup: every namespace empty again', cleaned && left === 0, `left=${left}`)

let allPass = true
for (const r of results) {
  if (!r.pass) allPass = false
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exitCode = allPass ? 0 : 1
