// Floor plan + lighting presets e2e: the plan image styling pipeline, live glows, marker popups
// (color/dimmer controls), the preset bar (save/capture, activate.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-fplan, -fplan2, -fplan3,
// -fplan-ink (neohab:config), one background:<id>, from the upload in section H (its.
import { launchChromium } from './lib/browser.mjs'
import { readFile } from 'node:fs/promises'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-fplan'
const UID2 = 'dashboard:nh-e2e-fplan2'
const UID3 = 'dashboard:nh-e2e-fplan3'
const UID4 = 'dashboard:nh-e2e-fplan-ink'
const SCENE_UID = 'nh-scene-nh-e2e-evening'
const BRIDGE_UID = 'nh-bridge-' + SCENE_UID
const SETTLE_A = 'nh-scene-nh-e2e-settle-a'
const SETTLE_B = 'nh-scene-nh-e2e-settle-b'
const MGR_UID = 'nh-scene-nh-e2e-managed'
const DOOMED_UID = 'nh-scene-nh-e2e-doomed'
const PROXY_ITEM = 'nh_e2e_proxy'
const GLOW_ITEM = 'nh_e2e_glow'
const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => `${BASE}/rest/items/${n}`

async function itemState(name) {
  const r = await (await fetch(itemUrl(name), { headers: AUTH })).json()
  return String(r.state)
}
async function sendItem(name, value) {
  await fetch(itemUrl(name), { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(value) })
}
async function putState(name, value) {
  await fetch(itemUrl(name) + '/state', {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'text/plain' },
    body: String(value),
  })
}
async function pollItem(name, want, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const s = await itemState(name)
    if (s === want || s.startsWith(want + '.') || s.startsWith(want + ',')) return s
    await sleep(300)
  }
  return itemState(name)
}
async function restoreColor(name, want) {
  const near = (a, b) => a.split(',').every((v, i) => Math.abs(Number(v) - Number(b.split(',')[i] ?? NaN)) <= 2)
  for (let i = 0; i < 4; i++) {
    await sendItem(name, want)
    await sleep(1200)
    if (near(await itemState(name), want)) return
  }
}
async function listRuleUids() {
  const r = await (await fetch(`${BASE}/rest/rules?summary=true`, { headers: AUTH })).json()
  return r.map((x) => x.uid).sort()
}
async function getRule(uid) {
  const res = await fetch(`${BASE}/rest/rules/${encodeURIComponent(uid)}`, { headers: AUTH })
  return res.status === 200 ? res.json() : null
}

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const PLAN_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>` +
  `<rect width='800' height='500' fill='#ffffff'/>` +
  `<g stroke='#22252a' stroke-width='6' fill='none'>` +
  `<rect x='40' y='40' width='720' height='420'/>` +
  `<line x1='400' y1='40' x2='400' y2='300'/><line x1='40' y1='300' x2='620' y2='300'/>` +
  `</g></svg>`
const PLAN_URI = 'data:image/svg+xml;base64,' + Buffer.from(PLAN_SVG).toString('base64')

const UPLOAD_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAGUlEQVQIW2P8z8Dwn4EIwDiqkL4KAWKgAxHi3jj1AAAAAElFTkSuQmCC',
  'base64'
)
let bgUid = null

const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => ({}))

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

const initialDimmer = await itemState(ITEMS.dimmer)
const initialColor = await itemState(ITEMS.color)
const preRunRuleUids = await listRuleUids()
let anonCtx = null

try {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-fplan',
        name: 'E2E Floorplan',
        columns: 12,
        rowHeight: 'match',
        gap: 6,
        widgets: [
          {
            id: 'w-plan',
            type: 'floorplan',
            config: {
              label: 'House',
              image: PLAN_URI,
              planStyle: 'blueprint',
              markers: true,
              presetBar: true,
              lights: [
                { id: 'l-dim', item: ITEMS.dimmer, x: 25, y: 30, label: 'Main' },
                { id: 'l-col', item: ITEMS.color, x: 70, y: 60, label: 'Bulb' },
              ],
            },
            layout: { lg: { x: 0, y: 0, w: 8, h: 5 } },
          },
          {
            id: 'w-bare',
            type: 'floorplan',
            config: { image: PLAN_URI, planStyle: 'plain', markers: false, presetBar: false, lights: [] },
            layout: { lg: { x: 8, y: 0, w: 4, h: 3 } },
          },
          {
            id: 'w-empty',
            type: 'floorplan',
            config: { markers: true, presetBar: false },
            layout: { lg: { x: 8, y: 3, w: 4, h: 2 } },
          },
        ],
      },
    }),
  })
  ok('seed dashboard created', seed.status === 200 || seed.status === 201, 'status ' + seed.status)

  await fetch(NS + '/' + encodeURIComponent(UID2), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID2,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-fplan2',
        name: 'E2E Floorplan 2',
        columns: 12,
        rowHeight: 'match',
        widgets: [{ id: 'w-clock', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } }],
      },
    }),
  })

  await sendItem(ITEMS.color, '0,100,100') // pure red, full brightness
  await sendItem(ITEMS.dimmer, '60')
  await pollItem(ITEMS.color, '0')
  await pollItem(ITEMS.dimmer, '60')

  await page.goto(APP + '#/d/nh-e2e-fplan')
  await page.waitForSelector('.nh-fplan', { timeout: 15000 }).catch(() => {})
  await sleep(1500) // SSE settle

  const render = await probe(page, () => {
    const plans = document.querySelectorAll('.nh-fplan')
    const img = document.querySelector('.nh-fplan__img')
    const layer = document.querySelector('.nh-fplan__layer')
    const st = img ? getComputedStyle(img) : null
    const lr = layer ? layer.getBoundingClientRect() : null
    return {
      plans: plans.length,
      imgFilter: st ? st.filter : '',
      imgOpacity: st ? st.opacity : '',
      layerAspect: lr && lr.height > 0 ? lr.width / lr.height : 0,
      markers: document.querySelectorAll('.nh-fplan__marker').length,
      glows: document.querySelectorAll('.nh-fplan__glow').length,
      empty: document.querySelector('.nh-fplan__empty')?.textContent ?? '',
      bars: document.querySelectorAll('.nh-fplan__bar').length,
    }
  })
  ok('three floor plans render', render.plans === 3, 'plans=' + render.plans)
  ok('blueprint style filters the image', /grayscale|invert/.test(render.imgFilter) && Number(render.imgOpacity) < 1,
    `filter=${String(render.imgFilter).slice(0, 40)} opacity=${render.imgOpacity}`)
  ok('glow layer matches the plan aspect (contain math)', Math.abs(render.layerAspect - 1.6) < 0.02,
    'aspect=' + render.layerAspect.toFixed(3))
  ok('markers only where asked', render.markers === 2, 'markers=' + render.markers)
  ok('both lit lights glow', render.glows === 2, 'glows=' + render.glows)
  ok('imageless plan explains itself', render.empty.length > 10, render.empty.slice(0, 40))
  ok('preset bar only where asked', render.bars === 1, 'bars=' + render.bars)

  const glowColor = await probe(page, () => ({
    images: [...document.querySelectorAll('.nh-fplan__glow')].map((g) => g.style.backgroundImage),
  }))
  ok('color light glows in its color (red)',
    Array.isArray(glowColor.images) && glowColor.images.some((s) => /rgba\(255,\s*0,\s*0/.test(s)),
    (glowColor.images ?? []).map((s) => String(s).slice(0, 42)).join(' | '))

  const markerPos = await probe(page, () => {
    const layer = document.querySelector('.nh-fplan__layer')
    const m = document.querySelector('.nh-fplan__marker[aria-label="Main"]')
    if (!layer || !m) return {}
    const lr = layer.getBoundingClientRect()
    const r0 = m.getBoundingClientRect()
    return { xPct: ((r0.left + r0.width / 2 - lr.left) / lr.width) * 100 }
  })
  ok('marker sits at its stored position', Math.abs((markerPos.xPct ?? 0) - 25) < 2, 'x=' + (markerPos.xPct ?? 'n/a'))

  await sendItem(ITEMS.dimmer, '0')
  await sleep(1500)
  const dark = await probe(page, () => ({
    glows: document.querySelectorAll('.nh-fplan__glow').length,
    markers: document.querySelectorAll('.nh-fplan__marker').length,
  }))
  ok('a dark light stops glowing but keeps its marker', dark.glows === 1 && dark.markers === 2,
    `glows=${dark.glows} markers=${dark.markers}`)
  await sendItem(ITEMS.dimmer, '60')
  await sleep(800)

  const colorPosts = []
  await page.route(`**/rest/items/${ITEMS.color}`, async (route) => {
    if (route.request().method() === 'POST') colorPosts.push(route.request().postData())
    await route.continue()
  })

  await page.click('.nh-fplan__marker[aria-label="Bulb"]')
  const popup = await probe(page, () => ({
    open: !!document.querySelector('.nh-fplan__popup'),
    name: document.querySelector('.nh-fplan__popupname')?.textContent ?? '',
    tracks: document.querySelectorAll('.nh-fplan__popup .nh-color__track').length,
  }))
  ok('tapping the color light opens its picker popup', popup.open && popup.tracks === 3,
    `name="${popup.name}" tracks=${popup.tracks}`)

  await page.focus('.nh-fplan__popup .nh-color__h')
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await sleep(900) // past the keyboard-commit debounce
  ok('popup picker sends one coalesced command', colorPosts.length === 1 && colorPosts[0] === '5,100,100',
    JSON.stringify(colorPosts))
  await page.unroute(`**/rest/items/${ITEMS.color}`)

  await page.click('.nh-fplan__scrim', { position: { x: 5, y: 5 } })
  const closed = await probe(page, () => ({ open: !!document.querySelector('.nh-fplan__popup') }))
  ok('scrim click closes the popup', closed.open === false)

  await page.click('.nh-fplan__marker[aria-label="Main"]')
  const dimPopup = await probe(page, () => ({
    slider: !!document.querySelector('.nh-fplan__popup .nh-slider__input'),
  }))
  ok('a dimmer light gets a slider popup', dimPopup.slider === true)
  await page.click('.nh-fplan__scrim', { position: { x: 5, y: 5 } })

  await sendItem(ITEMS.color, '120,50,80')
  await sendItem(ITEMS.dimmer, '42')
  await pollItem(ITEMS.color, '120')
  await pollItem(ITEMS.dimmer, '42')
  await sleep(1500) // SSE settle so the capture reads the new states

  await page.click('.nh-fplan__bar .nh-chip--action')
  const dialog = await probe(page, () => ({
    open: !!document.querySelector('.nh-fplan__popup--save'),
    rows: document.querySelectorAll('.nh-fplan__savelight').length,
    dots: document.querySelectorAll('.nh-fplan__savedot').length,
  }))
  ok('save dialog lists the plan lights', dialog.open && dialog.rows === 2, 'rows=' + dialog.rows)
  ok('a color light previews its captured color', dialog.dots === 1, 'dots=' + dialog.dots)

  await page.fill('.nh-fplan__popup--save input[type="text"]', 'NH E2E Evening')
  await page.click('.nh-fplan__popup--save .nh-btn--primary')
  await sleep(1500)

  const scene = await getRule(SCENE_UID)
  ok('scene rule created under the nh-scene uid', !!scene, scene ? scene.uid : 'absent')
  ok('scene tagged Scene + neohab', !!scene && scene.tags.includes('Scene') && scene.tags.includes('neohab'),
    scene ? scene.tags.join(',') : '')
  const actionsByItem = Object.fromEntries(
    (scene?.actions ?? []).map((a) => [a.configuration?.itemName, String(a.configuration?.command)])
  )
  const near = (got, want, tol) =>
    typeof got === 'string' &&
    got.split(',').length === want.split(',').length &&
    got.split(',').every((v, i) => Math.abs(Number(v) - Number(want.split(',')[i])) <= tol)
  ok('captured values are the normalized current states',
    near(actionsByItem[ITEMS.color], '120,50,80', 3) && near(actionsByItem[ITEMS.dimmer], '42', 1),
    JSON.stringify(actionsByItem))

  // the highlight is drawn from what the SETTLING layer is showing, and these are real lights: a
  // bulb that echoes its pre-fade value holds the display back for the steady window while the
  // capture has already read the settled state over REST. Waiting for it costs nothing when it is
  // already there, and a preset that never lights up still fails.
  let chip = { present: false, active: false }
  for (let i = 0; i < 14; i++) {
    chip = await probe(page, () => {
      const chips = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')]
      const c = chips.find((x) => x.textContent === 'NH E2E Evening')
      return { present: !!c, active: c ? c.classList.contains('nh-chip--on') : false }
    })
    if (chip.active) break
    await sleep(500)
  }
  ok('preset chip appears in the bar', chip.present === true)
  // the highlight is a comparison between what the scene commands and what the items are doing
  // RIGHT NOW, so when it goes red both sides have to be in the detail - a bare true/false says
  // nothing about which of them moved
  const live = { [ITEMS.dimmer]: await itemState(ITEMS.dimmer), [ITEMS.color]: await itemState(ITEMS.color) }
  ok('value-matched highlight while states hold (admin)', chip.active === true,
    `scene ${JSON.stringify(actionsByItem)} against live ${JSON.stringify(live)}`)

  await sendItem(ITEMS.dimmer, '80')
  await sleep(1800)
  const chipOff = await probe(page, () => {
    const c = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')].find((x) => x.textContent === 'NH E2E Evening')
    return { active: c ? c.classList.contains('nh-chip--on') : null }
  })
  ok('highlight drops when a light diverges', chipOff.active === false, 'active=' + chipOff.active)

  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Evening")')
  const backTo = await pollItem(ITEMS.dimmer, '42')
  ok('activating the preset restores the lights', backTo === '42' || backTo.startsWith('42.'), 'dimmer=' + backTo)

  anonCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const anon = await anonCtx.newPage()
  const anonErrs = []
  anon.on('pageerror', (e) => anonErrs.push(String(e.message)))
  await anon.addInitScript(() => {
    try { localStorage.setItem('neohab:themeOverride', 'dark') } catch {}
  })
  await anon.goto(APP + '#/d/nh-e2e-fplan')
  await anon.waitForSelector('.nh-fplan__bar .nh-chip', { timeout: 15000 }).catch(() => {})
  const anonBar = await probe(anon, () => {
    const chips = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')]
    const mine = chips.find((x) => x.textContent === 'NH E2E Evening')
    return {
      mine: !!mine,
      active: mine ? mine.classList.contains('nh-chip--on') : null,
      saveChip: !!document.querySelector('.nh-fplan__bar .nh-chip--action'),
    }
  })
  ok('anonymous panel lists the preset', anonBar.mine === true)
  ok('no save affordance for anonymous', anonBar.saveChip === false)
  ok('no value-matched highlight without admin or status item', anonBar.active === false, 'active=' + anonBar.active)

  await sendItem(ITEMS.dimmer, '77')
  await sleep(600)
  await anon.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Evening")')
  const anonAct = await pollItem(ITEMS.dimmer, '42')
  ok('anonymous activation works (runnow is USER role)', anonAct === '42' || anonAct.startsWith('42.'),
    'dimmer=' + anonAct)

  const mkItem = await fetch(itemUrl(PROXY_ITEM), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Switch', name: PROXY_ITEM, label: 'NH E2E Proxy' }),
  })
  ok('managed proxy item created', mkItem.status === 200 || mkItem.status === 201, 'status ' + mkItem.status)
  await sendItem(PROXY_ITEM, 'OFF')

  await page.goto(APP + '#/settings')
  await page.reload()
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('.nh-presetrow__name')].some((el) => el.tagName === 'INPUT'),
      undefined,
      { timeout: 15000 }
    )
    .catch(() => {})

  const rowByName = async (name) => {
    const rows = page.locator('.nh-presetrow')
    const n = await rows.count()
    for (let i = 0; i < n; i++) {
      const input = rows.nth(i).locator('.nh-presetrow__name')
      if ((await input.count()) > 0) {
        const v = await input.inputValue().catch(() => null)
        if (v === name) return rows.nth(i)
      }
    }
    return null
  }

  const managed = await rowByName('NH E2E Evening')
  const meta = managed ? await managed.locator('.nh-presetrow__meta').textContent() : ''
  ok('manager lists the preset with its light count', !!managed && /2/.test(meta), meta ?? 'row absent')

  if (managed) {
    await managed.locator('.nh-presetrow__name').fill('NH E2E Evening 2')
    await managed.locator('.nh-presetrow__name').press('Enter')
    await sleep(1500)
  }
  const renamed = await getRule(SCENE_UID)
  ok('rename lands on the scene rule', renamed?.name === 'NH E2E Evening 2', renamed?.name ?? 'absent')

  const row2 = await rowByName('NH E2E Evening 2')
  ok('renamed row still manageable', !!row2)
  if (row2) {
    await row2.locator('button:has-text("Wall switch")').click()
    await page.click('.nh-presetrow__bridge input[role="combobox"]')
    await page.keyboard.type(PROXY_ITEM.slice(0, 8), { delay: 40 })
    await sleep(600)
    await page.click(`.nh-picker__option:has-text("${PROXY_ITEM}")`, { timeout: 5000 }).catch(() => {})
    const bridgePicked = await probe(page, () => ({
      value: document.querySelector('.nh-presetrow__bridge input[role="combobox"]')?.value ?? '',
    }))
    ok('bridge picker: a typed partial search still picks by click', bridgePicked.value === PROXY_ITEM,
      'value=' + JSON.stringify(bridgePicked.value))
    await page.click('.nh-presetrow__bridge input[type="checkbox"]', { timeout: 5000 }).catch(() => {})
    await page.click('.nh-presetrow__bridge .nh-btn--primary', { timeout: 5000 }).catch(() => {})
    await sleep(1500)
  }

  const linked = await getRule(SCENE_UID)
  ok('status item stored in the scene configuration',
    linked?.configuration?.statusItem === PROXY_ITEM && linked?.configuration?.statusState === 'ON',
    JSON.stringify(linked?.configuration ?? {}))
  const bridge = await getRule(BRIDGE_UID)
  ok('bridge rule exists: item trigger -> run scene',
    bridge?.triggers?.[0]?.configuration?.itemName === PROXY_ITEM &&
      bridge?.actions?.[0]?.type === 'core.RunRuleAction' &&
      (bridge?.actions?.[0]?.configuration?.ruleUIDs ?? []).includes(SCENE_UID),
    bridge ? 'ok' : 'absent')
  ok('bridge not tagged as a Scene', !!bridge && !(bridge.tags ?? []).includes('Scene'), (bridge?.tags ?? []).join(','))

  await sendItem(ITEMS.dimmer, '15')
  await sleep(600)
  await sendItem(PROXY_ITEM, 'ON')
  const bridged = await pollItem(ITEMS.dimmer, '42')
  ok('commanding the status item runs the preset (wall-switch path)', bridged === '42' || bridged.startsWith('42.'),
    'dimmer=' + bridged)

  await anon.reload()
  await anon.waitForSelector('.nh-fplan__bar .nh-chip', { timeout: 15000 }).catch(() => {})
  const chipActive = (want) =>
    anon
      .waitForFunction(
        (w) => {
          const c = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')].find(
            (x) => x.textContent === 'NH E2E Evening 2'
          )
          return !!c && c.classList.contains('nh-chip--on') === w
        },
        want,
        { timeout: 12000 }
      )
      .then(() => true)
      .catch(() => false)
  ok('anonymous highlight follows the status item', await chipActive(true))
  await sendItem(PROXY_ITEM, 'OFF')
  ok('…and drops live when it turns OFF', await chipActive(false))

  const dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
  await page.click('section:has(h2:text-is("Backup")) button:has-text("Export configuration")')
  const download = await dlPromise
  let exported = null
  if (download) exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  ok('export bundle carries the scene and its bridge',
    !!exported &&
      Array.isArray(exported.scenes) &&
      exported.scenes.some((r) => r.uid === SCENE_UID) &&
      exported.scenes.some((r) => r.uid === BRIDGE_UID),
    exported ? `scenes=${(exported.scenes ?? []).length}` : 'no download')

  const hostile = {
    manifest: { app: 'neohab', formatVersion: 1, exportedAt: new Date().toISOString() },
    components: [],
    scenes: [{ uid: 'toggles-1', name: 'evil', tags: ['Scene', 'neohab'], triggers: [], conditions: [], actions: [] }],
  }
  await page
    .locator('section:has(h2:text-is("Backup")) input[type="file"]')
    .setInputFiles({ name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hostile)) })
  await sleep(1000)
  const refusal = await probe(page, () => ({
    notice: document.querySelector('.nh-toast__text')?.textContent ?? '',
    confirmOpen: !!document.querySelector('.nh-settings__importchoice'),
  }))
  ok('hostile preset uid refused before any choice is offered',
    refusal.confirmOpen === false && /invalid presets/i.test(refusal.notice),
    refusal.notice.slice(0, 60))

  await page.goto(APP + '#/d/nh-e2e-fplan')
  await page.waitForSelector('.nh-fplan', { timeout: 15000 }).catch(() => {})
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, undefined, { timeout: 15000 }).catch(() => {})
  await page.click('.nh-grid--edit .nh-cell >> nth=0 >> .nh-cell__grip')
  await sleep(500)
  const lightsBtn = await probe(page, () => {
    const b = [...document.querySelectorAll('.nh-sheet button')].find((x) => /Edit lights/.test(x.textContent))
    return { text: b ? b.textContent : '' }
  })
  ok('settings panel offers the lights editor with the count', /2/.test(lightsBtn.text), lightsBtn.text)

  await page.click('.nh-sheet button:has-text("Edit lights")')
  await page.waitForSelector('.nh-planedit', { timeout: 10000 }).catch(() => {})
  const sheet = await probe(page, () => ({
    open: !!document.querySelector('.nh-planedit'),
    rows: document.querySelectorAll('.nh-planedit__row').length,
    editMarkers: document.querySelectorAll('.nh-fplan__marker--edit').length,
  }))
  ok('placement sheet opens with the plan and both lights', sheet.open && sheet.rows === 2 && sheet.editMarkers === 2,
    `rows=${sheet.rows} markers=${sheet.editMarkers}`)

  await page.click('.nh-planedit__add input[role="combobox"]')
  await page.keyboard.type(ITEMS.switch.slice(0, 6).toLowerCase(), { delay: 40 })
  await sleep(600)
  await page.click(`.nh-picker__option:has-text("${ITEMS.switch}")`, { timeout: 5000 }).catch(() => {})
  const picked = await probe(page, () => ({
    value: document.querySelector('.nh-planedit__add input[role="combobox"]')?.value ?? '',
    addEnabled: !document.querySelector('.nh-planedit__add > button')?.disabled,
  }))
  ok('a typed partial search still picks by click (the blur-race regression)',
    picked.value === ITEMS.switch && picked.addEnabled === true,
    `value=${JSON.stringify(picked.value)} addEnabled=${picked.addEnabled}`)
  await page.click('.nh-planedit__add button:has-text("Add")', { timeout: 5000 }).catch(() => {})
  await sleep(500)
  const added = await probe(page, () => ({
    rows: document.querySelectorAll('.nh-planedit__row').length,
    markers: document.querySelectorAll('.nh-fplan__marker--edit').length,
    selLeft: document.querySelector('.nh-fplan__marker--sel')?.style.left ?? '',
  }))
  ok('adding a light appends a marker and a row', added.rows === 3 && added.markers === 3,
    `rows=${added.rows} markers=${added.markers} sel=${added.selLeft}`)

  const dragTo = await page.evaluate(() => {
    const layer = document.querySelector('.nh-planedit .nh-fplan__layer')
    const r = layer.getBoundingClientRect()
    return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.2 }
  })
  await page.locator('.nh-fplan__marker--sel').hover()
  await page.mouse.down()
  await page.mouse.move(dragTo.x, dragTo.y, { steps: 8 })
  await page.mouse.up()
  await sleep(400)
  const afterDrag = await probe(page, () => ({
    left: document.querySelector('.nh-fplan__marker--sel')?.style.left ?? '',
  }))
  ok('dragging a marker moves the light', /^(7[5-9]|8[0-5])(\.\d+)?%$/.test(afterDrag.left), 'left=' + afterDrag.left)

  await page.click('.nh-planedit__bar .nh-btn--primary') // Done
  await sleep(300)
  await page.click('button:has-text("Exit")')
  await sleep(1000)
  const serverCfg = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  const serverLights = serverCfg?.config?.widgets?.[0]?.config?.lights ?? []
  ok('sheet edits stay in the draft until Save', serverLights.length === 2, 'server lights=' + serverLights.length)

  await page.goto(APP + '#/d/nh-e2e-fplan')
  await page.waitForSelector('.nh-fplan', { timeout: 15000 }).catch(() => {})
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, undefined, { timeout: 15000 }).catch(() => {})
  await page.click('.nh-grid--edit .nh-cell >> nth=0 >> .nh-cell__grip')
  await sleep(500)
  await page.click('.nh-sheet button:has-text("lights")')
  await page.waitForSelector('.nh-planedit', { timeout: 10000 }).catch(() => {})
  const fits = await probe(page, () => {
    const side = document.querySelector('.nh-planedit__side')
    const add = document.querySelector('.nh-planedit__add')
    const btn = add?.querySelector(':scope > button')
    if (!side || !btn) return {}
    const s = side.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    return {
      overhang: Math.round(b.right - s.right),
      sideOverflow: side.scrollWidth - side.clientWidth,
      btnW: Math.round(b.width),
    }
  })
  ok('the Add button is not pushed off the panel',
    fits.overhang !== undefined && fits.overhang <= 0 && fits.sideOverflow <= 1 && fits.btnW > 0,
    `overhang=${fits.overhang}px panelOverflow=${fits.sideOverflow}px`)
  await page.click('.nh-planedit__bar .nh-btn--primary')
  await sleep(300)

  const bgBefore = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  await page.click('.nh-grid--edit .nh-cell >> nth=2 >> .nh-cell__grip')
  await sleep(500)
  const panel = await probe(page, () => {
    const field = [...document.querySelectorAll('.nh-sheet .nh-field')].find(
      (f) => f.querySelector('.nh-field__label')?.textContent === 'Plan style'
    )
    const sel = field?.querySelector('select')
    return { style: sel?.value ?? '', styleText: sel?.selectedOptions?.[0]?.textContent ?? '' }
  })
  ok('the plan style select shows the style actually in use', panel.style === 'blueprint' && !!panel.styleText,
    `value=${JSON.stringify(panel.style)} text=${JSON.stringify(panel.styleText)}`)

  await page
    .locator('.nh-sheet .nh-bgfield input[type="file"]')
    .setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: UPLOAD_PNG })
  await sleep(3000)
  const uploaded = await probe(page, () => {
    const url = document.querySelector('.nh-sheet .nh-bgfield input[type="text"]')
    return {
      imgs: document.querySelectorAll('.nh-fplan__img').length,
      urlW: url ? Math.round(url.getBoundingClientRect().width) : 0,
      thumb: !!document.querySelector('.nh-sheet .nh-bgfield__thumb'),
    }
  })
  const afterUpload = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  bgUid = afterUpload.find((u) => u.startsWith('background:') && !bgBefore.includes(u)) ?? null
  ok('uploading a plan image shows it and stores the upload', uploaded.imgs === 3 && !!bgUid, `imgs=${uploaded.imgs} uid=${bgUid}`)
  ok('the plan image field stays usable in the narrow settings panel',
    uploaded.thumb === true && uploaded.urlW >= 120, `thumb=${uploaded.thumb} url box ${uploaded.urlW}px`)

  await page.click('button:has-text("Save")')
  await sleep(3000)
  const savedCfg = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  const savedRef = savedCfg?.config?.widgets?.[2]?.config?.image ?? ''
  const bgStillThere = (await fetch(NS + '/' + encodeURIComponent(bgUid ?? 'background:none'), { headers: AUTH })).status
  const shown = await probe(page, () => ({
    imgs: document.querySelectorAll('.nh-fplan__img').length,
    empties: document.querySelectorAll('.nh-fplan__empty').length,
  }))
  ok('the uploaded plan survives saving the dashboard',
    bgStillThere === 200 && savedRef === bgUid?.replace('background:', 'bg:') && shown.imgs === 3 && shown.empties === 0,
    `component=${bgStillThere} ref=${savedRef} imgs=${shown.imgs} empty=${shown.empties}`)

  await page.goto(APP + '#/d/nh-e2e-fplan2')
  await page.waitForSelector('.nh-dash', { timeout: 15000 }).catch(() => {})
  await page.click('[aria-label="Edit dashboard"]')
  await sleep(800)
  await page.click('[aria-label="Dashboard settings"]')
  await sleep(500)
  await page.fill('#nh-dash-name', 'E2E Floorplan Two')
  await sleep(300)
  await page.click('button:has-text("Save")')
  await sleep(2500)
  const bgAfterOther = (await fetch(NS + '/' + encodeURIComponent(bgUid ?? 'background:none'), { headers: AUTH })).status
  ok("saving another dashboard leaves the floor plan's image alone", bgAfterOther === 200, 'status ' + bgAfterOther)

  await fetch(itemUrl(GLOW_ITEM), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Color', name: GLOW_ITEM, label: 'NH E2E Glow' }),
  })
  for (const [uid, name, command] of [
    [SETTLE_A, 'NH E2E Settle A', '288,55,40'],
    [SETTLE_B, 'NH E2E Settle B', '330,81,70'],
  ]) {
    await fetch(`${BASE}/rest/rules`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        name,
        tags: ['Scene', 'neohab'],
        configuration: {},
        triggers: [],
        conditions: [],
        actions: [{ id: '1', type: 'core.ItemCommandAction', configuration: { itemName: GLOW_ITEM, command } }],
      }),
    })
  }
  await fetch(NS + '/' + encodeURIComponent(UID3), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID3,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-fplan3',
        name: 'E2E Floorplan Settle',
        columns: 12,
        rowHeight: 'match',
        widgets: [
          {
            id: 'w-plan',
            type: 'floorplan',
            config: {
              label: 'Settle',
              image: PLAN_URI,
              lights: [{ id: 'l-glow', item: GLOW_ITEM, x: 50, y: 50, label: 'Glow' }],
            },
            layout: { lg: { x: 0, y: 0, w: 9, h: 6 } },
          },
        ],
      },
    }),
  })
  await putState(GLOW_ITEM, '330,81,70')
  await page.goto(APP + '#/d/nh-e2e-fplan3')
  await page.reload()
  await page.waitForSelector('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 20000 }).catch(() => {})
  await sleep(2500)

  const chipState = (p) =>
    probe(p, () => {
      const chips = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')]
      const on = (n) => {
        const c = chips.find((x) => x.textContent.trim() === n)
        return c ? c.classList.contains('nh-chip--on') : null
      }
      return { a: on('NH E2E Settle A'), b: on('NH E2E Settle B') }
    })
  const before = await chipState(page)
  ok('the preset currently held is the one highlighted', before.b === true && before.a === false,
    `A=${before.a} B=${before.b}`)

  await page.evaluate(() => {
    window.__tl = []
    const read = () => {
      const chips = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')]
      const flag = (n) => {
        const c = chips.find((x) => x.textContent.trim() === n)
        return c && c.classList.contains('nh-chip--on') ? '+' : '-'
      }
      const glow = [...document.querySelectorAll('.nh-fplan__glow')]
        .map((g) => (/rgba?\(([^)]*?),\s*[\d.]+\)/.exec(g.style.backgroundImage) || [, '?'])[1])
        .join('')
      return `A${flag('NH E2E Settle A')} B${flag('NH E2E Settle B')}|${glow}`
    }
    let last = null
    window.__iv = setInterval(() => {
      const s = read()
      if (s !== last) {
        window.__tl.push(s)
        last = s
      }
    }, 8)
  })
  await sleep(120) // let the sampler record the state before the tap
  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 10000 }).catch(() => {})
  await sleep(400)
  await putState(GLOW_ITEM, '332.481,74.71900,69.804')
  await sleep(400)
  await putState(GLOW_ITEM, '323.617,67.62600,54.510')
  await sleep(700)
  await putState(GLOW_ITEM, '287.368,55.88300,40')
  await sleep(1200)
  const timeline = await page.evaluate(() => {
    clearInterval(window.__iv)
    return window.__tl
  })

  const tl = Array.isArray(timeline) ? timeline : []
  const aOn = tl.map((s) => s.startsWith('A+'))
  const bOn = tl.map((s) => s.includes('B+'))
  const changes = aOn.filter((v, i) => i > 0 && v !== aOn[i - 1]).length
  ok('the tapped preset lights up once and stays lit through the fade',
    changes === 1 && aOn[0] === false && aOn[aOn.length - 1] === true,
    `highlight changes=${changes} states=${tl.length} | ${tl.join(' > ')}`)
  ok('the preset being left goes dark and does not come back',
    bOn[0] === true && bOn.slice(1).every((v) => v === false),
    `B lit in ${bOn.filter(Boolean).length} of ${tl.length} states`)
  const glows = tl.map((s) => s.split('|')[1] ?? '')
  const afterTap = [...new Set(glows.slice(1))]
  ok('the glow changes to the new scene once and never flashes back',
    afterTap.length === 1 && afterTap[0] !== glows[0] && afterTap[0] !== '',
    `before=${glows[0]} after=[${afterTap.join(' > ')}]`)
  const settled = await chipState(page)
  ok('the plan ends on the preset that was tapped', settled.a === true && settled.b === false,
    `A=${settled.a} B=${settled.b}`)

  await putState(GLOW_ITEM, '288,55,40')
  await sleep(2200)
  await page.evaluate(() => {
    window.__g = []
    window.__gi = setInterval(() => {
      const g = [...document.querySelectorAll('.nh-fplan__glow')]
        .map((x) => (/rgba?\([^)]*\)/.exec(x.style.backgroundImage) || ['none'])[0])
        .join('|')
      if (window.__g[window.__g.length - 1] !== g) window.__g.push(g)
    }, 8)
  })
  await sleep(150)
  await putState(GLOW_ITEM, '120,90,60')
  await sleep(60)
  await putState(GLOW_ITEM, '320,20,90')
  await sleep(60)
  await putState(GLOW_ITEM, '0,0,4.7059')
  await sleep(1000)
  await putState(GLOW_ITEM, '119.2,89.4,59.6')
  await sleep(2500)
  const glowTl = (await probe(page, () => {
    clearInterval(window.__gi)
    return window.__g
  })) ?? []
  const glowMoves = Array.isArray(glowTl) ? glowTl.slice(1) : []
  const rgbaOf = (g) => (/rgba?\(([^)]*)\)/.exec(g) || [, ''])[1].split(',').map(Number)
  const sameGlow = (a, b) =>
    a.length === 4 && b.length === 4 && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 30) && Math.abs(a[3] - b[3]) <= 0.15
  const destination = rgbaOf(glowTl[glowTl.length - 1] ?? '')
  ok('a glow goes straight to the new colour, with nothing on the way',
    glowMoves.length > 0 && glowMoves.every((g) => sameGlow(rgbaOf(g), destination)),
    `${glowMoves.length} changes: ${glowTl.join(' > ')}`)
  const alphaOf = (g) => Number((/,\s*([\d.]+)\)/.exec(g) || [, '1'])[1])
  const restingAlpha = alphaOf(glowTl[glowTl.length - 1] ?? '')
  ok('and never lets the light go out on the way',
    glowMoves.every((g) => alphaOf(g) > restingAlpha * 0.5),
    `resting ${restingAlpha}: ` + glowMoves.map((g) => alphaOf(g)).join(' > '))

  const chipSize = await probe(page, () => {
    const c = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')].find(
      (x) => x.textContent.trim() === 'NH E2E Settle A'
    )
    if (!c) return {}
    const s = getComputedStyle(c)
    return { h: c.getBoundingClientRect().height, font: parseFloat(s.fontSize) }
  })
  ok('preset chips are sized for a wall panel', (chipSize.h ?? 0) >= 46 && (chipSize.font ?? 0) >= 17,
    `height=${chipSize.h} font=${chipSize.font}px`)

  const brightness = async () => Number((await itemState(GLOW_ITEM)).split(',')[2])
  ok('section I left the tapped preset holding its lights on', (await brightness()) > 0,
    'brightness=' + (await brightness()))

  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 10000 }).catch(() => {})
  await sleep(1500)
  ok('with the setting off, tapping the held preset leaves the lights on', (await brightness()) > 0,
    'brightness=' + (await brightness()))

  const planCfg = await (await fetch(NS + '/' + encodeURIComponent(UID3), { headers: AUTH })).json()
  planCfg.config.widgets[0].config.presetToggleOff = true
  await fetch(NS + '/' + encodeURIComponent(UID3), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(planCfg),
  })
  await page.reload()
  await page.waitForSelector('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 20000 }).catch(() => {})
  await sleep(2000)

  const heldBefore = await chipState(page)
  ok('the preset is still shown as held before the toggle', heldBefore.a === true, `A=${heldBefore.a}`)
  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 10000 }).catch(() => {})
  await sleep(300)
  const rightAfter = await chipState(page)
  ok('the highlight clears the moment it is tapped off', rightAfter.a === false, `A=${rightAfter.a}`)
  await sleep(1500)
  const offState = await itemState(GLOW_ITEM)
  ok('tapping the held preset switches its lights off', Number(offState.split(',')[2]) === 0, 'state=' + offState)
  ok('the light keeps its colour so it comes back the same', offState === '288,55,0', 'state=' + offState)

  const wasOff = await brightness()
  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 10000 }).catch(() => {})
  await sleep(1800)
  const backOn = await chipState(page)
  ok('tapping it again runs the preset back on', wasOff === 0 && backOn.a === true && (await brightness()) > 0,
    `wasOff=${wasOff} A=${backOn.a} brightness=${await brightness()}`)

  const tap = (p, sel) => p.click(sel, { timeout: 8000 }).catch(() => {})
  const type = (p, sel, v) => p.fill(sel, v, { timeout: 8000 }).catch(() => {})
  const pick = (p, sel, v) => p.selectOption(sel, v, { timeout: 8000 }).catch(() => {})

  const glowBox = async () =>
    probe(page, () => {
      const layer = document.querySelector('.nh-fplan__layer')
      const g = document.querySelector('.nh-fplan__glow')
      if (!layer || !g) return {}
      const l = layer.getBoundingClientRect()
      const r = g.getBoundingClientRect()
      return {
        lampX: l.left + l.width * 0.5,
        lampY: l.top + l.height * 0.5,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        w: r.width,
        h: r.height,
        image: g.style.backgroundImage,
      }
    })

  const setGlowDir = async (dir) => {
    const cfg = await (await fetch(NS + '/' + encodeURIComponent(UID3), { headers: AUTH })).json()
    cfg.config.widgets[0].config.lights[0].glowDir = dir
    await fetch(NS + '/' + encodeURIComponent(UID3), {
      method: 'PUT',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
    await page.goto(APP + '#/d/nh-e2e-fplan3')
    await page.reload()
    await page.waitForSelector('.nh-fplan__glow', { timeout: 20000 }).catch(() => {})
    await sleep(1200)
  }

  await setGlowDir(undefined)
  const omni = await glowBox()
  const approx = (a, b, tol = 2) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol
  ok('an ordinary light still glows evenly around itself',
    approx(omni.w, omni.h) && approx(omni.left + omni.w / 2, omni.lampX) && approx(omni.top + omni.h / 2, omni.lampY),
    `box ${Math.round(omni.w)}x${Math.round(omni.h)} centre ${Math.round(omni.left + omni.w / 2)},${Math.round(omni.top + omni.h / 2)} lamp ${Math.round(omni.lampX)},${Math.round(omni.lampY)}`)

  await setGlowDir('up')
  const up = await glowBox()
  ok('throwing a glow up puts the whole spill above the lamp',
    approx(up.bottom, up.lampY) && approx(up.h, up.w / 2) && approx(up.left + up.w / 2, up.lampX),
    `bottom=${Math.round(up.bottom)} lamp=${Math.round(up.lampY)} box ${Math.round(up.w)}x${Math.round(up.h)}`)
  ok('it reaches exactly as far as it did in every direction', approx(up.w, omni.w) && approx(up.h, omni.h / 2),
    `up ${Math.round(up.w)}x${Math.round(up.h)} vs all ${Math.round(omni.w)}x${Math.round(omni.h)}`)
  ok('the gradient radiates from the edge the lamp sits on', /farthest-side/.test(up.image ?? ''), up.image ?? '')

  await setGlowDir('left')
  const left = await glowBox()
  ok('throwing a glow left puts the spill to the left of the lamp',
    approx(left.right, left.lampX) && approx(left.w, left.h / 2) && approx(left.top + left.h / 2, left.lampY),
    `right=${Math.round(left.right)} lamp=${Math.round(left.lampX)} box ${Math.round(left.w)}x${Math.round(left.h)}`)

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, undefined, { timeout: 15000 }).catch(() => {})
  await page.click('.nh-grid--edit .nh-cell >> nth=0 >> .nh-cell__grip')
  await sleep(500)
  await tap(page, '.nh-sheet button:has-text("lights")')
  await page.waitForSelector('.nh-planedit', { timeout: 10000 }).catch(() => {})
  const dirField = await probe(page, () => {
    const sel = document.querySelector('.nh-planedit__row select')
    if (!sel) return {}
    const label = document.querySelector('.nh-planedit__label')
    return {
      value: sel.value,
      options: [...sel.options].map((o) => o.value),
      blank: [...sel.options].some((o) => o.textContent.trim() === ''),
      labelW: label ? Math.round(label.getBoundingClientRect().width) : 0,
      overflow: document.querySelector('.nh-planedit__side').scrollWidth - document.querySelector('.nh-planedit__side').clientWidth,
    }
  })
  ok('the light editor offers every direction, and shows the one in use',
    dirField.value === 'left' && dirField.options?.join(',') === 'all,up,down,left,right' && dirField.blank === false,
    `value=${dirField.value} options=${dirField.options?.join(',')}`)
  ok('the label box still fits beside it', (dirField.labelW ?? 0) >= 90 && (dirField.overflow ?? 9) <= 1,
    `label=${dirField.labelW}px panelOverflow=${dirField.overflow}px`)

  await pick(page, '.nh-planedit__row select', 'down')
  await sleep(500)
  const previewed = await probe(page, () => {
    const layer = document.querySelector('.nh-planedit .nh-fplan__layer')
    const g = document.querySelector('.nh-planedit .nh-fplan__glow')
    if (!layer || !g) return {}
    const l = layer.getBoundingClientRect()
    const r = g.getBoundingClientRect()
    return { top: r.top, lampY: l.top + l.height * 0.5, h: r.height, w: r.width }
  })
  ok('picking a direction shows it on the plan at once',
    approx(previewed.top, previewed.lampY) && approx(previewed.h, previewed.w / 2),
    `top=${Math.round(previewed.top ?? -1)} lamp=${Math.round(previewed.lampY ?? -1)}`)
  await page.click('.nh-planedit__bar .nh-btn--primary') // Done
  await sleep(300)
  await page.click('button:has-text("Exit")')
  await sleep(1000)

  for (const [uid, name, actions] of [
    [MGR_UID, 'NH E2E Managed', [
      { id: '1', type: 'core.ItemCommandAction', configuration: { itemName: ITEMS.dimmer, command: '30' } },
      { id: '2', type: 'core.ItemCommandAction', configuration: { itemName: ITEMS.color, command: '200,80,60' } },
    ]],
    [DOOMED_UID, 'NH E2E Doomed', [
      { id: '1', type: 'core.ItemCommandAction', configuration: { itemName: ITEMS.dimmer, command: '10' } },
    ]],
  ]) {
    await fetch(`${BASE}/rest/rules`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, name, tags: ['Scene', 'neohab'], configuration: {}, triggers: [], conditions: [], actions }),
    })
  }

  await page.goto(APP + '#/d/nh-e2e-fplan')
  await page.reload()
  await page.waitForSelector('.nh-fplan__bar .nh-chip', { timeout: 20000 }).catch(() => {})
  await sleep(1500)

  const manageChip = '.nh-fplan__bar .nh-chip:has-text("Manage presets")'
  ok('the plan offers preset management to an administrator', (await page.locator(manageChip).count()) === 1)

  await anon.reload()
  await anon.waitForSelector('.nh-fplan__bar .nh-chip', { timeout: 20000 }).catch(() => {})
  await sleep(800)
  const anonBar2 = await probe(anon, () => ({
    chips: [...document.querySelectorAll('.nh-fplan__bar .nh-chip')].map((c) => c.textContent.trim()),
  }))
  ok('a signed-out panel activates presets but is offered none of the management',
    anonBar2.chips?.includes('NH E2E Managed') === true && (await anon.locator(manageChip).count()) === 0,
    (anonBar2.chips ?? []).join(' | '))

  await tap(page, manageChip)
  await page.waitForSelector('.nh-pmgr', { timeout: 10000 }).catch(() => {})
  const list = await probe(page, () => {
    const rows = [...document.querySelectorAll('.nh-pmgr__row')]
    const mine = rows.find((r) => r.querySelector('.nh-pmgr__name')?.textContent === 'NH E2E Managed')
    const sheet = document.querySelector('.nh-pmgr')?.getBoundingClientRect()
    return {
      rows: rows.length,
      meta: mine?.querySelector('.nh-pmgr__meta')?.textContent ?? '',
      dots: mine?.querySelectorAll('.nh-fplan__savedot').length ?? 0,
      buttons: [...(mine?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()),
      sheetW: sheet ? Math.round(sheet.width) : 0,
      sheetH: sheet ? Math.round(sheet.height) : 0,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    }
  })
  ok('the manager gets the screen, not the widget it was opened from',
    list.sheetW === list.viewW && list.sheetH === list.viewH,
    `sheet ${list.sheetW}x${list.sheetH} viewport ${list.viewW}x${list.viewH}`)
  ok('the manager lists the presets with what each one covers', list.rows >= 2 && /2/.test(list.meta),
    `rows=${list.rows} meta=${JSON.stringify(list.meta)}`)
  ok('a preset previews the colours it sets', list.dots === 1, 'dots=' + list.dots)
  ok('each preset offers editing and deleting', list.buttons?.join(',') === 'Edit,Delete', list.buttons?.join(','))

  const dimmerBeforeEdit = await itemState(ITEMS.dimmer)
  await tap(page, '.nh-pmgr__row:has(.nh-pmgr__name:text-is("NH E2E Managed")) button:has-text("Edit")')
  await page.waitForSelector('.nh-pmgr__edit', { timeout: 10000 }).catch(() => {})
  const editor = await probe(page, () => {
    const cards = [...document.querySelectorAll('.nh-pmgr__light')]
    const nameOf = (c) => c.querySelector('.nh-pmgr__lightname')?.textContent ?? ''
    return {
      cards: cards.length,
      names: cards.map(nameOf),
      colorPickers: document.querySelectorAll('.nh-pmgr__light .nh-color').length,
      sliders: document.querySelectorAll('.nh-pmgr__light .nh-slider__input').length,
      name: document.querySelector('.nh-pmgr__edit input[type="text"]')?.value ?? '',
      statusPicker: !!document.querySelector('.nh-pmgr__edit input[role="combobox"]'),
    }
  })
  ok('editing a preset shows what it sets each light to', editor.cards === 2 && editor.name === 'NH E2E Managed',
    `cards=${editor.cards} name=${JSON.stringify(editor.name)}`)
  ok('each light gets the control its stored value needs', editor.colorPickers === 1 && editor.sliders === 1,
    `colour=${editor.colorPickers} slider=${editor.sliders}`)
  ok('the labels come from the plan, not the item names', editor.names?.includes('Main') && editor.names?.includes('Bulb'),
    (editor.names ?? []).join(','))
  ok('the wall-switch link is editable here too', editor.statusPicker === true)

  await type(page, '.nh-pmgr__light:has(.nh-pmgr__lightname:text-is("Main")) .nh-slider__input', '55')
  await type(page, '.nh-pmgr__edit input[type="text"]', 'NH E2E Managed 2')
  await tap(page, '.nh-pmgr__light:has(.nh-pmgr__lightname:text-is("Bulb")) .nh-iconbtn')
  await sleep(300)
  const staged = await probe(page, () => ({
    cards: document.querySelectorAll('.nh-pmgr__light').length,
    shown: document.querySelector('.nh-pmgr__light .nh-slider__value')?.textContent ?? '',
  }))
  ok('the editor stages the change before anything is written', staged.cards === 1 && staged.shown === '55',
    `cards=${staged.cards} value=${JSON.stringify(staged.shown)}`)
  const duringEdit = await getRule(MGR_UID)
  ok('nothing is written until Save',
    staged.cards === 1 && duringEdit?.name === 'NH E2E Managed' && duringEdit?.actions?.length === 2,
    `staged=${staged.cards} name=${duringEdit?.name} actions=${duringEdit?.actions?.length}`)

  await tap(page, '.nh-pmgr__edit .nh-btn--primary')
  await sleep(2000)
  const saved = await getRule(MGR_UID)
  const savedActions = (saved?.actions ?? []).map((a) => `${a.configuration?.itemName}=${a.configuration?.command}`)
  ok('saving writes the new name and value to the scene',
    saved?.name === 'NH E2E Managed 2' && savedActions.join(',') === `${ITEMS.dimmer}=55`,
    `name=${saved?.name} actions=${savedActions.join(',')}`)
  ok('the scene is still a neohab scene after being rewritten',
    saved?.name === 'NH E2E Managed 2' && saved?.tags?.includes('Scene') && saved?.tags?.includes('neohab'),
    `name=${saved?.name} tags=${(saved?.tags ?? []).join(',')}`)
  const dimmerAfterEdit = await itemState(ITEMS.dimmer)
  ok('editing a preset writes the value and commands no lights',
    saved?.name === 'NH E2E Managed 2' && dimmerAfterEdit === dimmerBeforeEdit,
    `saved=${saved?.name} dimmer ${dimmerBeforeEdit} -> ${dimmerAfterEdit}`)

  await tap(page, '.nh-pmgr__row:has(.nh-pmgr__name:text-is("NH E2E Managed 2")) button:has-text("Edit")')
  await page.waitForSelector('.nh-pmgr__edit', { timeout: 10000 }).catch(() => {})
  const addable = await probe(page, () => ({
    options: [...(document.querySelector('.nh-pmgr__add select')?.options ?? [])].map((o) => o.value).filter(Boolean),
  }))
  ok('a light on the plan can be added to the preset', addable.options?.includes(ITEMS.color) === true,
    (addable.options ?? []).join(','))
  const colorNow = await itemState(ITEMS.color)
  await pick(page, '.nh-pmgr__add select', ITEMS.color)
  await tap(page, '.nh-pmgr__add button:has-text("Add")')
  await sleep(300)

  await tap(page, '.nh-pmgr__edit input[role="combobox"]')
  await page.keyboard.type(ITEMS.switch.slice(0, 6).toLowerCase(), { delay: 40 }).catch(() => {})
  await sleep(600)
  await tap(page, `.nh-picker__option:has-text("${ITEMS.switch}")`)
  const pickedStatus = await probe(page, () => ({
    value: document.querySelector('.nh-pmgr__edit input[role="combobox"]')?.value ?? '',
  }))
  ok('the status item can be picked in the preset editor', pickedStatus.value === ITEMS.switch,
    `value=${JSON.stringify(pickedStatus.value)}`)

  await tap(page, '.nh-pmgr__edit .nh-btn--primary')
  await sleep(2000)
  const readded = await getRule(MGR_UID)
  const readdedColor = (readded?.actions ?? []).find((a) => a.configuration?.itemName === ITEMS.color)
  ok('the wall-switch link the editor collected is written to the scene',
    readded?.configuration?.statusItem === ITEMS.switch &&
      (readded?.tags ?? []).includes(`neohab:status:${ITEMS.switch}:ON`),
    `configuration=${readded?.configuration?.statusItem} tags=${(readded?.tags ?? []).join(',')}`)
  ok('linking an item does not build the bridge rule on its own',
    readded?.configuration?.statusItem === ITEMS.switch && (await getRule('nh-bridge-' + MGR_UID)) === null)
  ok('the added light is stored at the value it is set to right now',
    (readded?.actions ?? []).length === 2 && !!readdedColor && near(String(readdedColor.configuration.command), colorNow, 3),
    `stored=${readdedColor?.configuration?.command} live=${colorNow}`)

  await tap(page, '.nh-pmgr__row:has(.nh-pmgr__name:text-is("NH E2E Doomed")) button:has-text("Delete")')
  await sleep(200)
  const confirmShown = await page.locator('.nh-pmgr__row:has(.nh-pmgr__name:text-is("NH E2E Doomed")) button:has-text("Really delete")').count()
  ok('deleting asks first, and has not deleted anything yet',
    confirmShown === 1 && (await getRule(DOOMED_UID)) !== null, 'confirm buttons=' + confirmShown)
  await tap(page, '.nh-pmgr__row:has(.nh-pmgr__name:text-is("NH E2E Doomed")) button:has-text("Really delete")')
  await sleep(2500)
  const gone = await getRule(DOOMED_UID)
  const stillListed = await probe(page, () => ({
    rows: [...document.querySelectorAll('.nh-pmgr__name')].map((n) => n.textContent),
  }))
  ok('confirming deletes the scene from the server', gone === null)
  ok('and it leaves the manager list, which still holds the others',
    (stillListed.rows ?? []).length > 0 && stillListed.rows.includes('NH E2E Doomed') === false,
    (stillListed.rows ?? []).join(','))

  await tap(page, '.nh-pmgr__bar .nh-iconbtn')
  await sleep(800)

  // --- a light ground. Screen blending is how light behaves on a dark plan and does exactly
  // nothing on a white one, so an ink plan drew the house and none of its lighting.
  await fetch(NS + '/' + encodeURIComponent(UID4), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID4,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-fplan-ink',
        name: 'E2E Floorplan Ink',
        columns: 12,
        rowHeight: 'match',
        widgets: [
          {
            id: 'w-ink',
            type: 'floorplan',
            config: {
              image: PLAN_URI,
              planStyle: 'ink',
              markers: false,
              presetBar: false,
              lights: [{ id: 'l-glow', item: GLOW_ITEM, x: 15, y: 85, label: 'Glow' }],
            },
            layout: { lg: { x: 0, y: 0, w: 10, h: 6 } },
          },
          // a square tile, where the shape a stacked plan keeps is taller than its floor, beside a
          // widget authored at the same rect whose height still comes from the row count
          {
            id: 'w-square',
            type: 'floorplan',
            config: { label: 'Square', image: PLAN_URI, planStyle: 'ink', markers: false, presetBar: false, lights: [] },
            layout: { lg: { x: 0, y: 6, w: 6, h: 6 } },
          },
          {
            id: 'w-ruler',
            type: 'label',
            config: { text: 'ruler' },
            layout: { lg: { x: 6, y: 6, w: 6, h: 6 } },
          },
        ],
      },
    }),
  })
  const ink = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await ink.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
      localStorage.setItem('neohab:themeOverride', 'light')
    } catch {}
  }, TOKEN)
  await putState(GLOW_ITEM, '0,0,0')
  await ink.goto(APP + '#/d/nh-e2e-fplan-ink')
  await ink.waitForSelector('.nh-fplan__img', { timeout: 20000 }).catch(() => {})
  await sleep(2500)

  // the clip is worked out from the plan rather than from the glow, because an unlit light draws
  // no element at all
  const inkGeom = await probe(ink, () => {
    const layer = document.querySelector('.nh-fplan__layer')?.getBoundingClientRect()
    return layer ? { x: layer.left + layer.width * 0.15 - 20, y: layer.top + layer.height * 0.85 - 20 } : {}
  })
  const clip = { x: Math.round(inkGeom.x ?? 0), y: Math.round(inkGeom.y ?? 0), width: 40, height: 40 }
  ok('the ink plan is on screen to be measured', (inkGeom.x ?? 0) > 0 && (inkGeom.y ?? 0) > 0, JSON.stringify(clip))

  const darkBlend = await probe(page, () => {
    const g = document.querySelector('.nh-fplan__glow')
    return { blend: g ? getComputedStyle(g).mixBlendMode : null, count: document.querySelectorAll('.nh-fplan__glow').length }
  })
  ok('a blueprint plan still screens its glows onto the dark ground',
    darkBlend.blend === 'screen' && (darkBlend.count ?? 0) > 0, `${darkBlend.blend} over ${darkBlend.count} glows`)

  const offA = await ink.screenshot({ clip })
  const offB = await ink.screenshot({ clip })
  ok('the same unlit plan shoots identically twice, so a difference means the glow',
    Buffer.compare(offA, offB) === 0, `${offA.length}B vs ${offB.length}B`)

  await putState(GLOW_ITEM, '30,80,90')
  await ink.waitForSelector('.nh-fplan__glow', { timeout: 15000 }).catch(() => {})
  await sleep(2500) // past the steady window, or the display is still holding the old value
  const litBlend = await probe(ink, () => {
    const g = document.querySelector('.nh-fplan__glow')
    return { blend: g ? getComputedStyle(g).mixBlendMode : null, count: document.querySelectorAll('.nh-fplan__glow').length }
  })
  ok('an ink plan multiplies its glows instead', litBlend.blend === 'multiply' && (litBlend.count ?? 0) === 1,
    `${litBlend.blend} over ${litBlend.count} glows`)

  const lit = await ink.screenshot({ clip })
  ok('and the light actually marks the paper', Buffer.compare(offA, lit) !== 0,
    `unlit ${offA.length}B, lit ${lit.length}B`)

  // the drawing is placed by object-fit and the lights by containRect: they have to agree, or
  // every glow lands off the room it is in
  const agree = (p) =>
    probe(p, () => {
      const el = document.querySelector('.nh-fplan__img')
      const layer = document.querySelector('.nh-fplan__layer')
      if (!el || !layer || !el.naturalWidth) return {}
      const box = el.getBoundingClientRect()
      const l = layer.getBoundingClientRect()
      const s = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight)
      const w = el.naturalWidth * s
      const h = el.naturalHeight * s
      return {
        dx: Math.round(Math.abs(box.left + (box.width - w) / 2 - l.left)),
        dy: Math.round(Math.abs(box.top + (box.height - h) / 2 - l.top)),
        dw: Math.round(Math.abs(w - l.width)),
        dh: Math.round(Math.abs(h - l.height)),
      }
    })
  const inkAgree = await agree(ink)
  ok('the glow layer sits exactly where the drawing is',
    inkAgree.dx <= 1 && inkAgree.dy <= 1 && inkAgree.dw <= 1 && inkAgree.dh <= 1,
    JSON.stringify(inkAgree))

  // stacked, a plan keeps the proportion it was authored at while everything else keeps its rows:
  // both of these were given the same 6x6 rect
  await ink.setViewportSize({ width: 393, height: 850 })
  await ink.reload()
  await ink.waitForSelector('.nh-grid--stacked .nh-fplan__img', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const cards = await probe(ink, () => {
    const cells = [...document.querySelectorAll('.nh-gcell')]
    const height = (cell) => (cell ? Math.round(cell.getBoundingClientRect().height) : null)
    // the SQUARE plan, not whichever floor plan comes first: on a wide tile the answer comes from
    // the minimum height instead and the check would pass without the shape rule doing anything
    const square = cells.find((c) => c.querySelector('.nh-widget__label')?.textContent?.trim() === 'Square')
    return { plan: height(square), label: height(cells.find((c) => c.querySelector('.nh-label'))), cells: cells.length }
  })
  ok('a stacked plan keeps its shape where anything else keeps its rows',
    (cards.label ?? 0) > 0 && (cards.plan ?? 0) > 0 && cards.plan < cards.label * 0.75,
    `square plan card ${cards.plan}px, label card ${cards.label}px at the same 6x6, over ${cards.cells} cells`)
  await ink.close().catch(() => {})

  const phone = await anonCtx.newPage()
  await phone.setViewportSize({ width: 393, height: 850 })
  await phone.goto(APP + '#/d/nh-e2e-fplan')
  await phone.waitForSelector('.nh-fplan__bar .nh-chip', { timeout: 20000 }).catch(() => {})
  await sleep(1500)
  const stacked = await probe(phone, () => {
    const barEl = document.querySelector('.nh-fplan__bar')
    const bar = barEl?.getBoundingClientRect()
    const img = document.querySelector('.nh-fplan__layer')?.getBoundingClientRect()
    const box = document.querySelector('.nh-fplan')?.getBoundingClientRect()
    const cell = document.querySelector('.nh-gcell')?.getBoundingClientRect()
    const chips = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')]
    const rows = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size
    return bar && img && box && cell
      ? {
          rows,
          chips: chips.length,
          overflows: barEl.scrollWidth > barEl.clientWidth + 1,
          // `safe center` has to fall back to the start when they overflow, or the first chip is
          // centred off the left edge with no way to scroll back to it
          firstClipped: Math.round((chips[0]?.getBoundingClientRect().left ?? 0) - bar.left) < -1,
          barTop: Math.round(bar.top),
          barBottom: Math.round(bar.bottom),
          barH: Math.round(bar.height),
          chipH: Math.round(chips[0]?.getBoundingClientRect().height ?? 0),
          planH: Math.round(img.height),
          planBottom: Math.round(img.bottom),
          boxBottom: Math.round(box.bottom),
          cellH: Math.round(cell.height),
          room: Math.round(box.bottom - img.bottom),
        }
      : {}
  })
  // a stacked card's height was derived rather than drawn, so the plan gives the chips their room
  // instead of being covered by them
  ok('the chip bar sits under the plan on a stacked card, never over it',
    stacked.barTop >= stacked.planBottom - 4 && stacked.barBottom <= stacked.boxBottom + 1,
    `${stacked.chips} chips (${stacked.barH}px) with ${stacked.room}px under the plan; ` +
      `bar ${stacked.barTop}-${stacked.barBottom}, plan ends ${stacked.planBottom}, widget ends ${stacked.boxBottom}`)
  // more chips than the width holds used to wrap, and every row past the first covered the plan
  ok('too many chips for the width scroll sideways rather than wrapping over the plan',
    (stacked.chips ?? 0) >= 4 &&
      stacked.overflows === true &&
      stacked.rows === 1 &&
      stacked.barH <= stacked.chipH + 4 &&
      stacked.firstClipped === false,
    `${stacked.chips} chips on ${stacked.rows} row(s), bar ${stacked.barH}px vs chip ${stacked.chipH}px, ` +
      `overflows=${stacked.overflows}, first chip clipped=${stacked.firstClipped}`)
  // the card used to take its height from the desktop row count, so a plan needing 214px sat in
  // 708px of card with the chips floating in the middle of the dead space. Measured against ONE
  // chip row rather than the bar's own height, or a bar that wrapped into five rows would fill the
  // card and count as no waste at all
  const dead = (stacked.cellH ?? 0) - (stacked.planH ?? 0) - (stacked.chipH ?? 0)
  ok('the stacked card is sized for the plan, not for its desktop row count',
    (stacked.cellH ?? 0) > 0 && dead <= 80,
    `card ${stacked.cellH}px holds a ${stacked.planH}px plan and a ${stacked.chipH}px chip row, ${dead}px spare`)
  const phoneAgree = await agree(phone)
  ok('the glow layer sits where the drawing is on a phone too',
    phoneAgree.dx <= 1 && phoneAgree.dy <= 1 && phoneAgree.dw <= 1 && phoneAgree.dh <= 1,
    JSON.stringify(phoneAgree))
  await phone.close().catch(() => {})

  // the other regime: a tile somebody drew keeps the plan at the size they chose, and the chips lie
  // over it where there is no room, which is what the desktop has always done
  const drawn = await probe(page, () => {
    const el = document.querySelector('.nh-fplan__img')
    const box = document.querySelector('.nh-fplan')?.getBoundingClientRect()
    const layer = document.querySelector('.nh-fplan__layer')?.getBoundingClientRect()
    if (!el?.naturalWidth || !box || !layer) return {}
    const s = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight)
    return { full: Math.round(el.naturalHeight * s), drawn: Math.round(layer.height), box: Math.round(box.height) }
  })
  ok('a tile drawn by hand never shrinks its plan to make room for the chips',
    (drawn.full ?? 0) > 0 && Math.abs(drawn.full - drawn.drawn) <= 1,
    `plan drawn ${drawn.drawn}px where the whole box gives ${drawn.full}px, box ${drawn.box}px`)
  const barAfter = await probe(page, () => ({
    chips: [...document.querySelectorAll('.nh-fplan__bar .nh-chip')].map((c) => c.textContent.trim()),
  }))
  ok('closing returns to the plan, with the chips in step',
    barAfter.chips?.includes('NH E2E Managed 2') === true && barAfter.chips?.includes('NH E2E Doomed') === false,
    (barAfter.chips ?? []).join(' | '))

  ok('no page errors (main)', errs.length === 0, errs.slice(0, 3).join(' | '))
  ok('no page errors (anonymous)', anonErrs.length === 0, anonErrs.slice(0, 3).join(' | '))
} finally {
  await anonCtx?.close().catch(() => {})
  await browser.close().catch(() => {})
  for (const uid of [UID, UID2, UID3, UID4, bgUid].filter(Boolean)) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  for (const uid of [BRIDGE_UID, SCENE_UID, SETTLE_A, SETTLE_B, MGR_UID, DOOMED_UID]) {
    await fetch(`${BASE}/rest/rules/${uid}`, { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  for (const item of [PROXY_ITEM, GLOW_ITEM]) {
    await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  await sendItem(ITEMS.dimmer, initialDimmer).catch(() => {})
  await restoreColor(ITEMS.color, initialColor).catch(() => {})

  const postRuleUids = await listRuleUids()
  const stray = postRuleUids.filter((u) => !preRunRuleUids.includes(u))
  ok('no stray rules left behind', stray.length === 0, stray.join(','))
  const cfgLeft = await (await fetch(NS, { headers: AUTH })).json()
  const mine = [UID, UID2, UID3, UID4, bgUid].filter(Boolean)
  const leftovers = cfgLeft.filter((c) => mine.includes(c.uid)).map((c) => c.uid)
  ok('dashboards and the uploaded plan removed', leftovers.length === 0, leftovers.join(','))
  const itemsLeft = []
  for (const item of [PROXY_ITEM, GLOW_ITEM]) {
    if ((await fetch(itemUrl(item), { headers: AUTH })).status !== 404) itemsLeft.push(item)
  }
  ok('test items removed', itemsLeft.length === 0, itemsLeft.join(','))
  const dimmerNow = await itemState(ITEMS.dimmer)
  ok('dimmer restored', dimmerNow === initialDimmer || dimmerNow.startsWith(initialDimmer + '.'),
    `${dimmerNow} (want ${initialDimmer})`)

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
