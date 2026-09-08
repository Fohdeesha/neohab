// The button widget in both its styles, and the migration that folded the old switch widget into it.
// The two styles differ in more than looks: a switch reads on from the item, a button matches its command
// exactly, so every state check here is written to tell those two rules apart.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-button and
// dashboard:nh-e2e-btnlegacy (neohab:config), managed items nh_e2e_btn and nh_e2e_btnstr.
// It SAVES through the app once, on purpose - the migration has to be proved to write back - so it mints
// one version-history restore point, like any real edit.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-button'
const LEGACY_UID = 'dashboard:nh-e2e-btnlegacy'
const DIM = 'nh_e2e_btn'
const STR = 'nh_e2e_btnstr'
const HOLD_MS = 800 // comfortably past the 500ms threshold

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (item, v) =>
  fetch(itemUrl(item) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const readState = (item) =>
  fetch(itemUrl(item) + '/state', { headers: AUTH })
    .then((r) => r.text())
    .catch(() => '<unreadable>')
const component = (uid) =>
  fetch(NS + '/' + encodeURIComponent(uid), { headers: AUTH })
    .then((r) => (r.status === 200 ? r.json() : null))
    .catch(() => null)

const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

// a button style tile carries its name on the face, a switch style one in a title bar, so a helper has to
// look in both places
const readTile = (label) => {
  const cells = [...document.querySelectorAll('.nh-gcell, .nh-cell')]
  const host = cells.find(
    (c) =>
      c.querySelector('.nh-widget__labeltext')?.textContent?.trim() === label ||
      c.querySelector('.nh-button')?.getAttribute('aria-label') === label ||
      c.querySelector('.nh-switch')?.getAttribute('aria-label') === label
  )
  if (!host) return { found: false }
  const sw = host.querySelector('.nh-switch')
  const btn = host.querySelector('.nh-button')
  return {
    found: true,
    kind: sw ? 'switch' : btn ? 'button' : 'neither',
    on: sw ? sw.classList.contains('nh-switch--on') : btn ? btn.classList.contains('nh-button--active') : null,
    ariaChecked: sw ? sw.getAttribute('aria-checked') : null,
    role: sw ? sw.getAttribute('role') : btn ? 'button' : null,
    track: host.querySelectorAll('.nh-switch__track').length,
    thumb: host.querySelectorAll('.nh-switch__thumb').length,
    stateText: host.querySelector('.nh-switch__state')?.textContent?.trim() ?? null,
    header: host.querySelector('.nh-widget__labeltext')?.textContent?.trim() ?? null,
    headerRows: host.querySelectorAll('.nh-widget__label').length,
    faceLabel: host.querySelector('.nh-button__label')?.textContent?.trim() ?? null,
    icons: host.querySelectorAll('.nh-icon').length
  }
}

const readPanel = () => {
  const panel = document.querySelector('.nh-form')
  if (!panel) return { open: false }
  const labels = [...panel.querySelectorAll('.nh-field__label')].map((e) => e.textContent.trim())
  const styleSelect = [...panel.querySelectorAll('.nh-field')].find(
    (f) => f.querySelector('.nh-field__label')?.textContent?.trim() === 'Style'
  )
  return {
    open: true,
    labels,
    styleOptions: styleSelect ? [...styleSelect.querySelectorAll('option')].map((o) => o.value) : [],
    styleValue: styleSelect?.querySelector('select')?.value ?? null,
    helpButtons: [...panel.querySelectorAll('.nh-field__helpbtn')].map((b) => b.textContent.trim()),
    hints: [...panel.querySelectorAll('.nh-field__hint')].map((p) => p.textContent.trim())
  }
}

const readSheet = () => {
  const panel = document.querySelector('.nh-detail__panel')
  if (!panel) return { open: false }
  return {
    open: true,
    buttons: [...panel.querySelectorAll('.nh-quickbtns button')].map((b) => b.textContent.trim()),
    ranges: panel.querySelectorAll('input[type=range]').length
  }
}

const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await context.newPage()
const errs = []
const commands = []
page.on('pageerror', (e) => errs.push(String(e.message)))
// leaving a dirty editor asks first, and Playwright dismisses a dialog unless told otherwise
page.on('dialog', (d) => void d.accept())
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
await page.route('**/rest/items/**', async (r) => {
  if (r.request().method() === 'POST') commands.push(r.request().postData())
  return r.continue()
})
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
    localStorage.setItem('neohab:language', 'en')
  } catch {}
}, TOKEN)

const sent = () => commands.splice(0, commands.length)

const pressTile = async (label) => {
  const r = await probe(page, readTile, label)
  if (!r?.found) return false
  await page
    .click(`.nh-gcell:has(.nh-switch[aria-label="${label}"]), .nh-gcell:has(.nh-button[aria-label="${label}"])`, { timeout: 5000 })
    .catch(() => {})
  return true
}

async function stateSettles(item, want, ms = 6000) {
  const until = Date.now() + ms
  let last = ''
  while (Date.now() < until) {
    last = await readState(item)
    if (last === want) return last
    await sleep(120)
  }
  return last
}

try {
  // ---- fixtures ---------------------------------------------------------------------------------
  for (const [name, type, label] of [
    [DIM, 'Dimmer', 'NH E2E Button Dimmer'],
    [STR, 'String', 'NH E2E Button String']
  ]) {
    await fetch(itemUrl(name), {
      method: 'PUT',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, label })
    })
  }
  // a re-created managed item comes back with whatever persistence kept, so the state is established
  await putState(DIM, '50')
  await putState(STR, 'STOPPED')
  await sleep(400)

  for (const uid of [UID, LEGACY_UID]) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }

  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 2,
        id: 'nh-e2e-button',
        name: 'E2E Button',
        columns: 12,
        rowHeight: 60,
        gap: 8,
        widgets: [
          // the same Dimmer at 50, read two different ways: this pair is the whole point of the merge
          // the same Dimmer read two ways, in the same style, so the look cannot be what decides
          {
            id: 'w-sw',
            type: 'button',
            config: { style: 'switch', item: DIM, label: 'Toggle', command: 'ON', commandAlt: 'OFF', toggle: true, nonZeroIsOn: true },
            layout: { lg: { x: 0, y: 0, w: 3, h: 2 } }
          },
          {
            id: 'w-exact',
            type: 'button',
            config: { style: 'switch', item: DIM, label: 'Exact', command: 'ON', commandAlt: 'OFF', toggle: true },
            layout: { lg: { x: 3, y: 0, w: 3, h: 2 } }
          },
          // and the above-zero rule on a button face, which is the other half of the same point
          {
            id: 'w-tog',
            type: 'button',
            config: { item: DIM, label: 'Matcher', command: 'ON', commandAlt: 'OFF', toggle: true, nonZeroIsOn: true },
            layout: { lg: { x: 6, y: 0, w: 3, h: 2 } }
          },
          {
            id: 'w-plain',
            type: 'button',
            config: { item: DIM, label: 'Scene', command: '70', toggle: false },
            layout: { lg: { x: 9, y: 0, w: 3, h: 2 } }
          },
          // a String item: the above-zero rule can never read this, so only the exact match works
          {
            id: 'w-str',
            type: 'button',
            config: {
              style: 'switch',
              item: STR,
              label: 'Player',
              command: 'PLAYING',
              commandAlt: 'STOPPED',
              toggle: true,
              nonZeroIsOn: true
            },
            layout: { lg: { x: 0, y: 2, w: 3, h: 2 } }
          },
          {
            id: 'w-icon',
            type: 'button',
            config: { style: 'switch', item: DIM, label: 'Lit', icon: 'mdi:lightbulb', iconSize: 32, toggle: true, nonZeroIsOn: true },
            layout: { lg: { x: 3, y: 2, w: 3, h: 2 } }
          },
          {
            id: 'w-nav',
            type: 'button',
            config: { label: 'Away', action: 'navigate', navigateDashboard: 'nh-e2e-button', command: 'ON' },
            layout: { lg: { x: 6, y: 2, w: 3, h: 2 } }
          }
        ]
      }
    })
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-button')
  // guarded: a build without the feature never draws this, and an unguarded wait would abort the run
  await page.waitForSelector('.nh-switch', { timeout: 20000 }).catch(() => {})
  await sleep(1200) // the first item states arrive

  // ---- A. both styles draw what they should ------------------------------------------------------
  const sw = await probe(page, readTile, 'Toggle')
  ok('switch style draws a sliding toggle', sw?.kind === 'switch' && sw?.track === 1 && sw?.thumb === 1, JSON.stringify(sw))
  ok('with the name in a title bar above it', sw?.header === 'Toggle' && sw?.headerRows === 1, 'header=' + sw?.header)
  ok('and announces itself as a switch', sw?.role === 'switch' && sw?.ariaChecked !== null, `${sw?.role} checked=${sw?.ariaChecked}`)

  const plain = await probe(page, readTile, 'Scene')
  ok('button style draws a pressable tile', plain?.kind === 'button' && plain?.track === 0, JSON.stringify(plain))
  ok('with its name on the face and no title bar', plain?.faceLabel === 'Scene' && plain?.headerRows === 0, 'face=' + plain?.faceLabel)

  const lit = await probe(page, readTile, 'Lit')
  ok('a switch style tile still takes an icon', lit?.icons === 1 && lit?.kind === 'switch', JSON.stringify(lit))

  // ---- B. the above-zero setting decides, and the style decides nothing ---------------------------
  // Toggle and Exact are the same item in the same style, differing only by that one checkbox
  const exact = await probe(page, readTile, 'Exact')
  ok('a dimmer part way up counts as on when told to', sw?.on === true && sw?.stateText === 'ON', `on=${sw?.on} text=${sw?.stateText}`)
  ok(
    'and does not when it is not, in the very same style',
    exact?.kind === 'switch' && exact?.on === false && exact?.stateText === 'OFF',
    `kind=${exact?.kind} on=${exact?.on} text=${exact?.stateText}`
  )

  // the same rule the other way round: it works on a button face too
  const tog = await probe(page, readTile, 'Matcher')
  ok('the rule works on a button face as well', tog?.kind === 'button' && tog?.on === true, `kind=${tog?.kind} on=${tog?.on}`)
  ok('a tile that is not toggling never lights up at all', plain?.on === false, 'on=' + plain?.on)

  const str = await probe(page, readTile, 'Player')
  ok('a String item reads off when it does not match the on-command', str?.on === false, `state=STOPPED on=${str?.on}`)
  await putState(STR, 'PLAYING')
  await sleep(1200)
  const strOn = await probe(page, readTile, 'Player')
  ok('and on when it does, which the above-zero rule alone could never manage', strOn?.on === true, `state=PLAYING on=${strOn?.on}`)

  await putState(DIM, '0')
  await sleep(1200)
  const off = await probe(page, readTile, 'Toggle')
  ok('a dimmer at zero reads as off', off?.on === false && off?.stateText === 'OFF', `on=${off?.on} text=${off?.stateText}`)
  const togOff = await probe(page, readTile, 'Matcher')
  ok('and so does the button face', togOff?.on === false, 'on=' + togOff?.on)

  // ---- C. what a press sends ---------------------------------------------------------------------
  sent()
  await pressTile('Toggle')
  await sleep(600)
  ok('pressing a switch that is off sends the on-command', JSON.stringify(sent()) === JSON.stringify(['ON']))
  const backOn = await stateSettles(DIM, '100')
  ok('the item follows', backOn === '100', 'state=' + backOn)
  await sleep(900)

  sent()
  await pressTile('Toggle')
  await sleep(600)
  ok('pressing it again sends the off-command', JSON.stringify(sent()) === JSON.stringify(['OFF']))
  await stateSettles(DIM, '0')
  await sleep(900)

  sent()
  await pressTile('Scene')
  await sleep(400)
  await pressTile('Scene')
  await sleep(400)
  ok('a tile with Toggle unticked sends the same command every time', JSON.stringify(sent()) === JSON.stringify(['70', '70']))
  await stateSettles(DIM, '70')
  await sleep(900)

  // ---- D. the settings panel ---------------------------------------------------------------------
  await page.click('[aria-label="Edit dashboard"]', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.click('.nh-cell:has(.nh-button[aria-label="Scene"]) .nh-cell__grip', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-form', { timeout: 10000 }).catch(() => {})

  const asButton = await probe(page, readPanel)
  ok('the panel offers a Style setting', asButton?.styleOptions?.join(',') === 'button,switch', JSON.stringify(asButton?.styleOptions))
  ok('it starts on the style the widget is drawing', asButton?.styleValue === 'button', String(asButton?.styleValue))
  const behaviour = ['Action', 'Command', 'Alternate command', 'Toggle with state', 'Count any value above 0 as on']
  ok(
    'the panel offers the behaviour settings',
    behaviour.every((l) => asButton?.labels?.includes(l)),
    JSON.stringify(asButton?.labels)
  )
  ok(
    'the Style setting explains itself in one line, with nothing to unfold',
    /sliding toggle/i.test((asButton?.hints ?? []).join(' ')) && asButton?.helpButtons?.length === 0,
    JSON.stringify((asButton?.hints ?? []).filter((h) => /toggle/i.test(h)))
  )

  await page.selectOption('.nh-field:has(.nh-field__label:text-is("Style")) select', 'switch', { timeout: 8000 }).catch(() => {})
  await sleep(400)
  const asSwitch = await probe(page, readPanel)
  const faceOnly = ['Caption', 'Image URL', 'Icon only (hide the name)']
  ok(
    'choosing Switch takes away only the fields the button face draws',
    // the panel has to have been showing them first, or this passes on a build with no panel at all
    faceOnly.every((l) => asButton?.labels?.includes(l)) && faceOnly.every((l) => !asSwitch?.labels?.includes(l)),
    JSON.stringify(asSwitch?.labels)
  )
  ok(
    'and changes nothing about behaviour: every one of those settings is still there',
    behaviour.every((l) => asSwitch?.labels?.includes(l)),
    JSON.stringify(behaviour.filter((l) => !asSwitch?.labels?.includes(l)))
  )
  ok(
    'and offers the name settings a title bar brings with it',
    asSwitch?.labels?.includes('Name alignment') === true && asButton?.labels?.includes('Name alignment') === false,
    `switch=${asSwitch?.labels?.includes('Name alignment')} button=${asButton?.labels?.includes('Name alignment')}`
  )
  const drawnAsSwitch = await probe(page, readTile, 'Scene')
  ok('the tile redraws as a toggle straight away', drawnAsSwitch?.kind === 'switch' && drawnAsSwitch?.track === 1, JSON.stringify(drawnAsSwitch))

  await page.click('button:has-text("Exit")', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-gcell', { timeout: 10000 }).catch(() => {})
  await sleep(400)
  ok('leaving without saving puts the button back', (await probe(page, readTile, 'Scene'))?.kind === 'button')

  // ---- E. the detail sheet follows the style -----------------------------------------------------
  const hold = async (label) => {
    const box = await page
      .locator(`.nh-gcell:has(.nh-switch[aria-label="${label}"]), .nh-gcell:has(.nh-button[aria-label="${label}"])`)
      .first()
      .boundingBox()
      .catch(() => null)
    if (!box) return false
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await sleep(HOLD_MS)
    await page.mouse.up()
    await sleep(500)
    return true
  }
  const closeSheet = async () => {
    await page.keyboard.press('Escape').catch(() => {})
    await sleep(400)
  }

  sent()
  await hold('Toggle')
  const swSheet = await probe(page, readSheet)
  ok('a hold on a switch offers on and off', swSheet?.open === true && swSheet?.buttons?.length === 2, JSON.stringify(swSheet?.buttons))
  ok('and no slider, because a switch commands two things', swSheet?.ranges === 0, String(swSheet?.ranges))
  await closeSheet()

  await hold('Matcher')
  const togSheet = await probe(page, readSheet)
  ok(
    'a hold on a toggling button offers the same pair: the sheet follows what it does, not how it looks',
    togSheet?.open === true && togSheet?.buttons?.length === 2 && JSON.stringify(togSheet?.buttons) === JSON.stringify(swSheet?.buttons),
    `button=${JSON.stringify(togSheet?.buttons)} switch=${JSON.stringify(swSheet?.buttons)}`
  )
  await closeSheet()
  ok('holding commanded nothing', swSheet?.open === true && togSheet?.open === true && sent().length === 0, 'sheets opened first')

  // ---- F. the migration --------------------------------------------------------------------------
  const legacy = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: LEGACY_UID,
      component: 'neohab:dashboard',
      config: {
        // written by a neohab that still had a switch widget: no version field at all, and the switch's
        // own onCommand/offCommand pair
        id: 'nh-e2e-btnlegacy',
        name: 'E2E Legacy',
        columns: 12,
        rowHeight: 60,
        gap: 8,
        widgets: [
          {
            id: 'w-old',
            type: 'switch',
            config: { item: DIM, label: 'Old Named', onCommand: '100', offCommand: '0', icon: 'mdi:lightbulb' },
            layout: { lg: { x: 0, y: 0, w: 3, h: 2 } }
          },
          // no label at all: the button's own default is "Button", which must not leak in
          {
            id: 'w-oldbare',
            type: 'switch',
            config: { item: DIM },
            layout: { lg: { x: 3, y: 0, w: 3, h: 2 } }
          }
        ]
      }
    })
  })
  ok('seed a dashboard from before the merge', legacy.status === 200, 'status=' + legacy.status)

  // a hash-only goto is a same-document navigation, and the app read its component list at boot, so a
  // dashboard seeded since then is invisible without a real reload
  await page.goto(APP + '#/d/nh-e2e-btnlegacy')
  await page.reload()
  await page.waitForSelector('.nh-switch', { timeout: 20000 }).catch(() => {})
  await sleep(1200)

  const migrated = await probe(page, readTile, 'Old Named')
  ok('a stored switch still draws as a sliding toggle', migrated?.kind === 'switch' && migrated?.track === 1, JSON.stringify(migrated))
  ok('keeping its name and its icon', migrated?.header === 'Old Named' && migrated?.icons === 1, JSON.stringify(migrated))

  const bare = await probe(page, readTile, DIM)
  ok('an unnamed one is found by its item, as it always was', bare?.found === true && bare?.kind === 'switch', JSON.stringify(bare))
  ok('and is still unnamed: the button default did not name it', bare?.headerRows === 0 && bare?.header === null, JSON.stringify(bare))

  // an earlier section left the dimmer part way up, which makes this switch ON - so the state it needs
  // is established rather than assumed, or the press would send the other command and be right to
  await putState(DIM, '0')
  await sleep(1400)
  const beforePress = await probe(page, readTile, 'Old Named')
  ok('the migrated switch reads off once the item is off', beforePress?.on === false, 'on=' + beforePress?.on)

  sent()
  await pressTile('Old Named')
  await sleep(700)
  const onSent = sent()
  ok('and it commands what the old onCommand said', JSON.stringify(onSent) === JSON.stringify(['100']), JSON.stringify(onSent))
  const wentUp = await stateSettles(DIM, '100')
  ok('the item follows it', wentUp === '100', 'state=' + wentUp)
  await sleep(1400)

  sent()
  await pressTile('Old Named')
  await sleep(700)
  const offSent = sent()
  ok('and the old offCommand the other way', JSON.stringify(offSent) === JSON.stringify(['0']), JSON.stringify(offSent))
  await stateSettles(DIM, '0')
  await sleep(900)

  // saving it back is what proves the migration reaches the server, not just the screen
  await page.click('[aria-label="Edit dashboard"]', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.click('.nh-cell:has(.nh-switch[aria-label="Old Named"]) .nh-cell__grip', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-form', { timeout: 10000 }).catch(() => {})
  const migPanel = await probe(page, readPanel)
  ok('the panel opens it on switch style', migPanel?.styleValue === 'switch', String(migPanel?.styleValue))
  ok(
    'showing the old commands under their new names',
    migPanel?.labels?.includes('Command') === true && migPanel?.labels?.includes('On command') === false,
    JSON.stringify(migPanel?.labels)
  )
  ok(
    'and the two behaviours the old widget implied, now as settings you can see',
    migPanel?.labels?.includes('Toggle with state') === true && migPanel?.labels?.includes('Count any value above 0 as on') === true,
    JSON.stringify(migPanel?.labels)
  )

  await page.fill('.nh-field:has(.nh-field__label:text-is("Name")) input', 'Renamed', { timeout: 8000 }).catch(() => {})
  await sleep(300)
  await page.click('button:has-text("Save")', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-gcell', { timeout: 15000 }).catch(() => {})
  await sleep(1500)

  const stored = await component(LEGACY_UID)
  const widgets = stored?.config?.widgets ?? []
  const old = widgets.find((w) => w.id === 'w-old')
  const oldBare = widgets.find((w) => w.id === 'w-oldbare')
  ok('saving writes the dashboard back at the current version', Number(stored?.config?.version) === 2, 'version=' + stored?.config?.version)
  ok('the switch is stored as a button in switch style', old?.type === 'button' && old?.config?.style === 'switch', JSON.stringify(old?.type))
  ok(
    'with the behaviours it used to imply written out beside it',
    old?.config?.toggle === true && old?.config?.nonZeroIsOn === true,
    JSON.stringify({ toggle: old?.config?.toggle, nonZeroIsOn: old?.config?.nonZeroIsOn })
  )
  ok(
    'its commands are stored under the button’s own names',
    old?.config?.command === '100' && old?.config?.commandAlt === '0',
    JSON.stringify({ command: old?.config?.command, commandAlt: old?.config?.commandAlt })
  )
  ok(
    'and the old names are gone rather than left to rot beside them',
    old?.config?.onCommand === undefined && old?.config?.offCommand === undefined,
    JSON.stringify(old?.config)
  )
  ok('the rename landed', old?.config?.label === 'Renamed', String(old?.config?.label))
  ok('the unnamed one keeps an empty name, not "Button"', oldBare?.config?.label === '', JSON.stringify(oldBare?.config?.label))
  ok(
    'and everything else about it came across',
    oldBare?.type === 'button' &&
      oldBare?.config?.style === 'switch' &&
      oldBare?.config?.nonZeroIsOn === true &&
      oldBare?.layout?.lg?.x === 3 &&
      oldBare?.config?.item === DIM,
    JSON.stringify({ type: oldBare?.type, layout: oldBare?.layout?.lg })
  )

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  for (const uid of [UID, LEGACY_UID]) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  for (const item of [DIM, STR]) {
    await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => c.uid === UID || c.uid === LEGACY_UID).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboards removed', left.length === 0, left.join(','))
  const items = []
  for (const item of [DIM, STR]) {
    const there = await fetch(itemUrl(item), { headers: AUTH })
      .then((r) => r.status === 200)
      .catch(() => false)
    if (there) items.push(item)
  }
  ok('cleanup: test items removed', items.length === 0, items.join(','))
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(
    '\n' + (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') + '  (' + (results.length - failed.length) + '/' + results.length + ')'
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}
