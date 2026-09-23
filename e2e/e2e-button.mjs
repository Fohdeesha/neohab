// The button widget in both its styles, and the migration that folded the old switch widget into it.
// The two styles differ in more than looks: a switch reads on from the item, a button matches its command
// exactly, so every state check here is written to tell those two rules apart.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-button,
// dashboard:nh-e2e-btnlegacy, dashboard:nh-e2e-btnface and dashboard:nh-e2e-noauto (neohab:config),
// managed items nh_e2e_btn, nh_e2e_btnstr, nh_e2e_noauto and nh_e2e_noautodim - the last two carrying
// autoupdate metadata of their own, which is deleted with the item.
// It SAVES through the app once, on purpose - the migration has to be proved to write back - so it mints
// one version-history restore point, like any real edit.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-button'
const LEGACY_UID = 'dashboard:nh-e2e-btnlegacy'
const FACE_UID = 'dashboard:nh-e2e-btnface'
const FINISHES = ['plain', 'solid', 'glass', 'glow', 'edge', 'outline', 'sheen', 'bare']
const ACCENT = '#e0459a'
const DIM = 'nh_e2e_btn'
const STR = 'nh_e2e_btnstr'
const NOAUTO = 'nh_e2e_noauto'
const NOAUTO_DIM = 'nh_e2e_noautodim'
const NOAUTO_UID = 'dashboard:nh-e2e-noauto'
const HOLD_MS = 800 // comfortably past the 500ms threshold
// The legacy dashboard below carries no version field at all, which reads as 1, and a save has to
// land it on today's. Named so the next schema bump is a visible one-line edit rather than a check
// that quietly starts asserting the wrong number - SCHEMA_VERSIONS.dashboard in
// web/src/model/schema.ts is the source of truth.
const LEGACY_SCHEMA = 1
const CURRENT_SCHEMA = 3

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
  for (const channel of ['chrome', 'msedge']) {
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

// what a finish actually painted, and where the card put its parts. Everything here is read from the
// browser rather than from the class name, so a class that resolves to no rule fails.
const readFace = (label) => {
  const round = (n) => Math.round(n)
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height), right: round(r.right), bottom: round(r.bottom) }
  }
  const cells = [...document.querySelectorAll('.nh-gcell, .nh-cell')]
  const host = cells.find((c) => c.querySelector('.nh-button')?.getAttribute('aria-label') === label)
  if (!host) return { found: false }
  const btn = host.querySelector('.nh-button')
  const tile = host.querySelector('.nh-widget')
  const body = host.querySelector('.nh-widget__body')
  const cs = getComputedStyle(btn)
  const face = box(btn)
  const outer = box(tile)
  const spill = [...host.querySelectorAll('.nh-button, .nh-button *')]
    .map((el) => box(el))
    .filter((b) => b && b.w > 0 && b.h > 0)
    .reduce((worst, b) => Math.max(worst, outer.x - b.x, b.right - outer.right, outer.y - b.y, b.bottom - outer.bottom), 0)
  return {
    found: true,
    classes: btn.className,
    on: btn.classList.contains('nh-button--active'),
    surface: [cs.backgroundColor, cs.backgroundImage, cs.borderTopWidth, cs.borderTopColor, cs.boxShadow].join(' | '),
    bg: cs.backgroundColor,
    bgImage: cs.backgroundImage,
    shadow: cs.boxShadow,
    radius: cs.borderTopLeftRadius,
    color: cs.color,
    bodyPad: getComputedStyle(body).paddingTop,
    glyph: getComputedStyle(host.querySelector('.nh-icon--mdi') ?? btn).backgroundColor,
    inset: round(face.x - outer.x),
    fillsWidth: outer.w - face.w <= 2,
    chip: box(host.querySelector('.nh-button__chip')),
    pip: box(host.querySelector('.nh-button__pip')),
    text: box(host.querySelector('.nh-button__text')),
    faceLabel: host.querySelector('.nh-button__label')?.textContent?.trim() ?? null,
    caption: host.querySelector('.nh-button__caption')?.textContent?.trim() ?? null,
    captionColor: (() => {
      const c = host.querySelector('.nh-button__caption')
      return c ? getComputedStyle(c).color : null
    })(),
    headerRows: host.querySelectorAll('.nh-widget__label').length,
    face,
    outer,
    spill
  }
}

// Chromium serialises a color-mix as color(srgb r g b / a) with 0..1 channels and everything else as
// rgb()/rgba(), so both have to be read before anything can be composited
const parseColor = (s) => {
  if (!s) return null
  const srgb = s.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/)
  if (srgb) return [+srgb[1] * 255, +srgb[2] * 255, +srgb[3] * 255, srgb[4] === undefined ? 1 : +srgb[4]]
  const rgb = s.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/)
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4]]
  return null
}
const contrast = (fg, bg) => {
  const f = parseColor(fg)
  const b = parseColor(bg)
  if (!f || !b) return 0
  const over = f.slice(0, 3).map((c, i) => c * f[3] + b[i] * (1 - f[3]))
  const lum = (c) => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(over), lum(b.slice(0, 3))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
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

  // one tile per finish, all reading the same dimmer, so a single state change flips every one of them
  const faceWidgets = FINISHES.map((finish, i) => ({
    id: 'w-' + finish,
    type: 'button',
    config: {
      item: DIM,
      label: 'F ' + finish,
      command: 'ON',
      commandAlt: 'OFF',
      toggle: true,
      nonZeroIsOn: true,
      finish,
      icon: 'mdi:lightbulb',
      iconSize: 28
    },
    layout: { lg: { x: (i % 4) * 3, y: Math.floor(i / 4) * 2, w: 3, h: 2 } }
  }))
  const card = (id, label, extra, x) => ({
    id,
    type: 'button',
    config: {
      style: 'card',
      item: DIM,
      label,
      caption: 'Ground floor',
      command: 'ON',
      commandAlt: 'OFF',
      toggle: true,
      nonZeroIsOn: true,
      icon: 'mdi:lightbulb',
      iconSize: 28,
      ...extra
    },
    layout: { lg: { x, y: 4, w: 3, h: 2 } }
  })
  const faceSeed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: FACE_UID,
      component: 'neohab:dashboard',
      config: {
        version: 2,
        id: 'nh-e2e-btnface',
        name: 'E2E Button Faces',
        columns: 12,
        rowHeight: 84,
        gap: 8,
        widgets: [
          ...faceWidgets,
          card('w-cardplain', 'Card plain', { finish: 'plain' }, 0),
          card('w-cardsolid', 'Card solid', { finish: 'solid' }, 3),
          card('w-cardaccent', 'Card accent', { finish: 'solid', accentColor: ACCENT }, 6),
          // the same finish with a tile accent, which is the one setting that recolours it
          {
            id: 'w-accent',
            type: 'button',
            config: {
              item: DIM,
              label: 'F accent',
              command: 'ON',
              commandAlt: 'OFF',
              toggle: true,
              nonZeroIsOn: true,
              finish: 'solid',
              accentColor: ACCENT,
              icon: 'mdi:lightbulb',
              iconSize: 28
            },
            layout: { lg: { x: 9, y: 4, w: 3, h: 2 } }
          },
          // a one-row cell, where a card has to fit its chip, name and caption into 84px
          { ...card('w-tinycard', 'Tiny card', { finish: 'edge' }, 0), layout: { lg: { x: 0, y: 6, w: 2, h: 1 } } },
          {
            id: 'w-tinysolid',
            type: 'button',
            config: { item: DIM, label: 'Tiny solid', command: 'ON', toggle: true, nonZeroIsOn: true, finish: 'solid', iconSize: 28 },
            layout: { lg: { x: 2, y: 6, w: 2, h: 1 } }
          }
        ]
      }
    })
  })
  ok('seed face dashboard', faceSeed.status === 200, 'status=' + faceSeed.status)

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
  ok(
    'the panel offers a Style setting',
    asButton?.styleOptions?.join(',') === 'button,card,switch',
    JSON.stringify(asButton?.styleOptions)
  )
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
  const faceOnly = ['Finish', 'Caption', 'Image URL', 'Icon only (hide the name)']
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
  ok(
    'saving writes the dashboard back at the current version',
    Number(stored?.config?.version) === CURRENT_SCHEMA && CURRENT_SCHEMA > LEGACY_SCHEMA,
    `version=${stored?.config?.version}, seeded at ${LEGACY_SCHEMA}, current is ${CURRENT_SCHEMA}`
  )
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

  // ---- G. the look and the finish ----------------------------------------------------------------
  await page.goto(APP + '#/d/nh-e2e-btnface')
  await page.waitForSelector('.nh-button', { timeout: 20000 }).catch(() => {})
  await putState(DIM, '60')
  await sleep(1800)

  const on = {}
  for (const f of FINISHES) on[f] = await probe(page, readFace, 'F ' + f)
  ok('every finish draws a face', FINISHES.every((f) => on[f]?.found), FINISHES.filter((f) => !on[f]?.found).join(',') || 'all 8')
  ok(
    'and carries the class its own rules are written against',
    FINISHES.every((f) => on[f]?.classes?.includes('nh-button--' + f)),
    FINISHES.filter((f) => !on[f]?.classes?.includes('nh-button--' + f)).join(',') || 'all 8'
  )
  ok('with all of them reading on, which is the state the rest of this section measures', FINISHES.every((f) => on[f]?.on === true))

  const picked = FINISHES.filter((f) => f !== 'plain')
  ok(
    'a finish someone picked fills the tile',
    picked.every((f) => on[f]?.fillsWidth === true && on[f]?.bodyPad === '0px'),
    picked.map((f) => `${f}:${on[f]?.bodyPad}/${on[f]?.fillsWidth}`).join(' ')
  )
  ok(
    'and plain keeps the box inside the tile it always drew',
    on.plain?.fillsWidth === false && on.plain?.bodyPad === '12px' && on.plain?.inset === 13,
    `pad=${on.plain?.bodyPad} inset=${on.plain?.inset}`
  )
  ok(
    'a filled face takes the tile corner, so the two cannot disagree',
    picked.every((f) => on[f]?.radius === '11px'),
    picked.map((f) => `${f}:${on[f]?.radius}`).join(' ')
  )

  const surfaces = new Set(FINISHES.map((f) => on[f]?.surface))
  ok('each finish paints something of its own', surfaces.size === FINISHES.length, `distinct=${surfaces.size} of ${FINISHES.length}`)
  ok(
    'the icon on a flooded face takes the readable ink, where a quiet one takes the accent',
    on.solid?.glyph !== on.outline?.glyph && on.solid?.glyph !== on.solid?.bg && on.outline?.glyph === on.solid?.bg,
    `flooded=${on.solid?.glyph} quiet=${on.outline?.glyph} accent=${on.solid?.bg}`
  )

  const accent = await probe(page, readFace, 'F accent')
  ok(
    'the tile Accent color is what sets the colour a face goes when it is on',
    /224, 69, 154/.test(accent?.bg ?? '') && accent?.bg !== on.solid?.bg,
    `accent=${accent?.bg} default=${on.solid?.bg}`
  )

  const cardOn = await probe(page, readFace, 'Card plain')
  const cardSolid = await probe(page, readFace, 'Card solid')
  const cardAccent = await probe(page, readFace, 'Card accent')
  ok(
    'a card puts the icon in a chip at the top left',
    !!cardOn?.chip && !!cardOn?.text && cardOn.chip.y < cardOn.text.y && cardOn.chip.x < cardOn.face.x + cardOn.face.w / 2,
    JSON.stringify({ chip: cardOn?.chip, text: cardOn?.text })
  )
  ok(
    'a state pip at the top right',
    !!cardOn?.pip && !!cardOn?.chip && cardOn.pip.x > cardOn.chip.right && cardOn.face.right - cardOn.pip.right < 20,
    JSON.stringify({ pip: cardOn?.pip, faceRight: cardOn?.face?.right })
  )
  ok(
    'and the name over its caption along the bottom, with no title bar of its own',
    cardOn?.faceLabel === 'Card plain' &&
      cardOn?.caption === 'Ground floor' &&
      cardOn?.headerRows === 0 &&
      !!cardOn?.text &&
      !!cardOn?.chip &&
      cardOn.text.bottom > cardOn.chip.bottom,
    `name=${cardOn?.faceLabel} caption=${cardOn?.caption} headers=${cardOn?.headerRows}`
  )
  const captionOn = (t) => contrast(t?.captionColor, t?.bg)
  ok(
    'a caption stays readable on a face the accent has flooded',
    captionOn(cardSolid) >= 4.5 && captionOn(cardAccent) >= 4.5,
    `solid=${captionOn(cardSolid).toFixed(1)}:1 accent=${captionOn(cardAccent).toFixed(1)}:1`
  )
  ok(
    'a card takes a finish and an accent like any other face',
    cardSolid?.bg === on.solid?.bg && /224, 69, 154/.test(cardAccent?.bg ?? ''),
    `solid=${cardSolid?.bg} accent=${cardAccent?.bg}`
  )

  await putState(DIM, '0')
  await sleep(1800)
  const dark = {}
  for (const f of FINISHES) dark[f] = await probe(page, readFace, 'F ' + f)
  ok('every finish reads off when the item does', FINISHES.every((f) => dark[f]?.on === false), FINISHES.filter((f) => dark[f]?.on).join(','))
  ok(
    'and every one of them looks different off from on, including the one that paints nothing',
    FINISHES.every((f) => dark[f]?.surface !== on[f]?.surface || dark[f]?.color !== on[f]?.color),
    FINISHES.filter((f) => dark[f]?.surface === on[f]?.surface && dark[f]?.color === on[f]?.color).join(',') || 'all 8 changed'
  )
  const offSurfaces = new Set(FINISHES.map((f) => dark[f]?.surface))
  ok('each of them is still its own thing when it is off', offSurfaces.size === FINISHES.length, `distinct=${offSurfaces.size}`)

  const labels = [...FINISHES.map((f) => 'F ' + f), 'F accent', 'Card plain', 'Card solid', 'Card accent', 'Tiny card', 'Tiny solid']
  const spilled = []
  for (const l of labels) {
    const t = await probe(page, readFace, l)
    if (!t?.found) spilled.push(l + ': missing')
    else if (t.spill > 1) spilled.push(`${l} past by ${t.spill}px`)
  }
  ok('nothing a face draws leaves its tile, at any of the seeded sizes', spilled.length === 0 && labels.length === 14, spilled.join(' | '))

  await page.click('[aria-label="Edit dashboard"]', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.click('.nh-cell:has(.nh-button[aria-label="F plain"]) .nh-cell__grip', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-form', { timeout: 10000 }).catch(() => {})
  const facePanel = await probe(page, readPanel)
  ok(
    'the panel offers Finish beside Style, and Card as a style',
    facePanel?.labels?.includes('Finish') === true && facePanel?.styleOptions?.join(',') === 'button,card,switch',
    JSON.stringify({ finish: facePanel?.labels?.includes('Finish'), styles: facePanel?.styleOptions })
  )
  await page.selectOption('.nh-field:has(.nh-field__label:text-is("Finish")) select', 'edge', { timeout: 8000 }).catch(() => {})
  await sleep(500)
  const previewed = await probe(page, readFace, 'F plain')
  ok(
    'picking one redraws the tile straight away',
    previewed?.classes?.includes('nh-button--edge') === true && previewed?.bodyPad === '0px',
    `classes=${previewed?.classes} pad=${previewed?.bodyPad}`
  )
  await page.click('button:has-text("Exit")', { timeout: 10000 }).catch(() => {})
  await page.waitForSelector('.nh-gcell', { timeout: 10000 }).catch(() => {})
  await sleep(400)
  const restored = await probe(page, readFace, 'F plain')
  ok(
    'and leaving without saving puts it back',
    previewed?.classes?.includes('nh-button--edge') === true && restored?.bodyPad === '12px' && !restored?.classes?.includes('--edge'),
    `previewed=${previewed?.classes} restored=${restored?.classes}`
  )

  // a theme restyles the plain button and leaves a picked finish alone, which is the whole reason the
  // built-in stylesheets are scoped to .nh-button--plain
  const swissCtx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const swissPage = await swissCtx.newPage()
  await swissPage.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
      localStorage.setItem('neohab:themeOverride', 'swiss')
      localStorage.setItem('neohab:language', 'en')
    } catch {}
  }, TOKEN)
  await swissPage.goto(APP + '#/d/nh-e2e-btnface')
  await swissPage.waitForSelector('.nh-button', { timeout: 20000 }).catch(() => {})
  await sleep(1200)
  const swPlain = await probe(swissPage, readFace, 'F plain')
  const swSolid = await probe(swissPage, readFace, 'F solid')
  ok(
    'a theme still restyles the plain button, all the way to no fill at all',
    swPlain?.bg === 'rgba(0, 0, 0, 0)' && dark.plain?.bg !== 'rgba(0, 0, 0, 0)',
    `swiss=${swPlain?.bg} dark=${dark.plain?.bg}`
  )
  ok(
    'and a finish someone picked keeps its own surface under that theme',
    swSolid?.bg !== 'rgba(0, 0, 0, 0)' && swSolid?.bg !== swPlain?.bg,
    `solid=${swSolid?.bg} plain=${swPlain?.bg}`
  )
  await swissCtx.close()


  // ---- an item openHAB has promised not to update --------------------------------------------
  //
  // `autoupdate=false` means core's AutoUpdateManager takes the DONT branch: the command goes to the
  // binding and openHAB posts no state for it. The device's own answer is the only thing that moves
  // the item, and a device can answer by confirming the state the item already had - an update that
  // is not a change, which the states tracker never carries. These items have no binding at all, so
  // a PUT to /state plays the device: it is the same ItemStateEvent a binding posts.
  {
    const vetoed = []
    for (const [name, type, label, rest] of [
      [NOAUTO, 'Switch', 'NH E2E No Autoupdate', 'ON'],
      [NOAUTO_DIM, 'Dimmer', 'NH E2E No Autoupdate Dim', '40']
    ]) {
      await fetch(itemUrl(name), {
        method: 'PUT',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, label })
      })
      const meta = await fetch(itemUrl(name) + '/metadata/autoupdate', {
        method: 'PUT',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'false' })
      })
      vetoed.push(meta.status)
      await sleep(300)
      await putState(name, rest)
    }
    ok('seed: two items that veto autoupdate', vetoed.every((s) => s === 200 || s === 201), 'metadata ' + vetoed.join(','))
    await sleep(400)

    await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: NOAUTO_UID,
        component: 'neohab:dashboard',
        config: {
          version: CURRENT_SCHEMA,
          id: 'nh-e2e-noauto',
          name: 'E2E No Autoupdate',
          columns: 12,
          rowHeight: 'match',
          widgets: [
            {
              id: 'w-na',
              type: 'button',
              config: { item: NOAUTO, label: 'Veto', command: 'ON', commandAlt: 'OFF', toggle: true, style: 'switch' },
              layout: { lg: { x: 0, y: 0, w: 3, h: 2 } }
            },
            {
              id: 'w-nad',
              type: 'slider',
              config: { item: NOAUTO_DIM, label: 'Veto dim', style: 'plain', min: 0, max: 100, step: 1 },
              layout: { lg: { x: 3, y: 0, w: 4, h: 2 } }
            }
          ]
        }
      })
    })

    const sent = []
    const sentDim = []
    const na = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await na.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    // the command must reach the server, because the point is that the server answers with nothing
    await na.route('**/rest/items/' + NOAUTO, (r) => {
      if (r.request().method() === 'POST') sent.push(r.request().postData())
      return r.continue()
    })
    await na.route('**/rest/items/' + NOAUTO_DIM, (r) => {
      if (r.request().method() === 'POST') sentDim.push(r.request().postData())
      return r.continue()
    })
    await na.goto(APP + '#/d/nh-e2e-noauto', { waitUntil: 'domcontentloaded' })
    await na.waitForSelector('.nh-switch', { timeout: 20000 })
    await sleep(1200)

    const read = () =>
      na
        .evaluate(() => {
          const s = document.querySelector('.nh-switch')
          return s
            ? { on: s.classList.contains('nh-switch--on'), asking: s.classList.contains('nh-switch--asking'), text: s.querySelector('.nh-switch__state')?.textContent ?? '' }
            : null
        })
        .catch(() => null)

    // every notice as it appears, so one that has already faded is still counted
    await na.evaluate(() => {
      window.__nhToasts = []
      new MutationObserver(() => {
        for (const t of document.querySelectorAll('.nh-toast__text')) {
          if (!window.__nhToasts.includes(t.textContent)) window.__nhToasts.push(t.textContent)
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true })
    })
    const toasts = () => na.evaluate(() => window.__nhToasts ?? []).catch(() => [])
    const lastSent = () => sent.filter(Boolean).slice(-1)[0]

    const start = await read()
    ok('it starts on the state the server reports', start?.on === true && start.asking === false, JSON.stringify(start))

    await na.click('.nh-switch')
    await sleep(700)
    const afterOff = await read()
    ok('pressing it sends the alternate command', lastSent() === 'OFF', JSON.stringify(sent))
    ok('the server posts no state for it at all', (await readState(NOAUTO)) === 'ON', await readState(NOAUTO))
    ok('but the tile shows what was asked for', afterOff?.on === false, JSON.stringify(afterOff))
    ok('and says it is unconfirmed rather than claiming it', afterOff?.asking === true, JSON.stringify(afterOff))

    // a device that never answers: past SETTLE_MS, and past the time an answer is given to settle
    await sleep(5000)
    const held = await read()
    ok('with no answer at all it still shows what was asked for, because nothing can arrive to settle to', held?.on === false && held.asking === true, JSON.stringify(held))

    await na.click('.nh-switch')
    await sleep(700)
    ok('so pressing again sends the other command instead of repeating', lastSent() === 'ON', JSON.stringify(sent.filter(Boolean).slice(-3)))

    // told ON, the device reports the ON the item already had: no change, so only an update says so
    await putState(NOAUTO, 'ON')
    await sleep(1200)
    const agreed = await read()
    ok('an answer that changes nothing still ends the wait', agreed?.on === true && agreed.asking === false, JSON.stringify(agreed))

    // what CHATAIGNE did before its link was fixed: told OFF, it reported ON
    await na.click('.nh-switch')
    await sleep(700)
    ok('pressing it again sends OFF', lastSent() === 'OFF', JSON.stringify(sent.filter(Boolean).slice(-3)))
    await putState(NOAUTO, 'ON')
    await sleep(1200)
    const refused = await read()
    ok('when the device answers the opposite, the tile shows the answer, not the request', refused?.on === true && refused.asking === false, JSON.stringify(refused))
    const refusal = `Sent OFF to ${NOAUTO}, but it reported ON`
    let seen = false
    for (let i = 0; i < 40 && !seen; i++) {
      seen = (await toasts()).includes(refusal)
      if (!seen) await sleep(250)
    }
    ok('and a notice says the device answered the opposite', seen, JSON.stringify(await toasts()))

    // a real change still wins, and an answer that agrees is not reported
    await na.click('.nh-switch')
    await sleep(700)
    ok('from ON, a press sends OFF', lastSent() === 'OFF', JSON.stringify(sent.filter(Boolean).slice(-3)))
    await putState(NOAUTO, 'OFF')
    await sleep(1500)
    const confirmed = await read()
    ok('a state the server does post wins and clears the mark', confirmed?.on === false && confirmed.asking === false, JSON.stringify(confirmed))
    await sleep(4500)
    const told = (await toasts()).filter((t) => t.includes(NOAUTO))
    ok('only the answer that contradicted its command was reported', told.length === 1 && told[0] === refusal, JSON.stringify(told))

    // a slider on a vetoed item used to hold what it sent for good, even over a change made elsewhere
    const dim = na.locator('.nh-widget:has(.nh-widget__labeltext:text-is("Veto dim")) input[type="range"]')
    const before = Number(await dim.inputValue().catch(() => NaN))
    await dim.focus().catch(() => {})
    await na.keyboard.press('ArrowUp')
    await sleep(1200)
    const heldDim = Number(await dim.inputValue().catch(() => NaN))
    ok('a slider on a vetoed item sends its value', sentDim.filter(Boolean).slice(-1)[0] === String(before + 1), `${before} ${JSON.stringify(sentDim)}`)
    ok('and shows it while nothing has answered', heldDim === before + 1, `${before} -> ${heldDim}`)
    await putState(NOAUTO_DIM, '20')
    await sleep(5000)
    const movedDim = Number(await dim.inputValue().catch(() => NaN))
    ok('a change made elsewhere still moves it', movedDim === 20, `${before} -> ${heldDim} -> ${movedDim}`)
    await na.close().catch(() => {})
  }

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  for (const uid of [UID, LEGACY_UID, FACE_UID, NOAUTO_UID]) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  for (const item of [DIM, STR, NOAUTO, NOAUTO_DIM]) {
    await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => [UID, LEGACY_UID, FACE_UID, NOAUTO_UID].includes(c.uid)).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboards removed', left.length === 0, left.join(','))
  const items = []
  for (const item of [DIM, STR, NOAUTO, NOAUTO_DIM]) {
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
