/**
 * Floor plan + lighting presets e2e: the plan image styling pipeline, live glows, marker
 * popups (color/dimmer controls), the preset bar (save/capture, activate, highlight), the
 * openHAB-scene storage (tags, actions, values), the status-item link and the wall-switch
 * bridge rule end to end, anonymous access (list + activate + status highlight, no editing),
 * the light-placement editor sheet, backup export carrying scenes, the refusal of a backup whose
 * "presets" would overwrite arbitrary rules, that a switch between presets holds steady while
 * the lights fade, and unselecting a preset to switch its own lights off.
 *
 * SAFE with a live config. Creates and deletes exactly:
 *   - dashboard:nh-e2e-fplan, -fplan2, -fplan3   (neohab:config)
 *   - one background:<id>, from the upload in section H (its uid is found by diffing)
 *   - rules nh-scene-nh-e2e-evening, nh-bridge-nh-scene-nh-e2e-evening,
 *     nh-scene-nh-e2e-settle-a and -settle-b
 *   - managed test items nh_e2e_proxy and nh_e2e_glow  (never file-provided items)
 * The dimmer and color items are commanded (recorded and restored); rule uids are diffed
 * against a pre-run listing so a stray cannot survive unnoticed. Section H saves through the
 * app, so it DOES mint version-history restore points - clear them if the server is a live one.
 */
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-fplan'
const UID2 = 'dashboard:nh-e2e-fplan2'
const UID3 = 'dashboard:nh-e2e-fplan3'
const SCENE_UID = 'nh-scene-nh-e2e-evening'
const BRIDGE_UID = 'nh-bridge-' + SCENE_UID
const SETTLE_A = 'nh-scene-nh-e2e-settle-a'
const SETTLE_B = 'nh-scene-nh-e2e-settle-b'
const PROXY_ITEM = 'nh_e2e_proxy'
/** Unbound, so section I can replay a device's fade without a device. */
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
/** A state UPDATE, the way a binding reports one - no command, so no device is driven. */
async function putState(name, value) {
  await fetch(itemUrl(name) + '/state', {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'text/plain' },
    body: String(value),
  })
}
/** Poll until the item's state starts with `want` (device echoes may append decimals). */
async function pollItem(name, want, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const s = await itemState(name)
    if (s === want || s.startsWith(want + '.') || s.startsWith(want + ',')) return s
    await sleep(300)
  }
  return itemState(name)
}
/** Color devices quantize and settle slowly - resend until the state numerically agrees. */
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
    try { return chromium.launch({ channel, headless: true }) } catch {}
  }
  return chromium.launch({ headless: true })
}

// A recognizable plan: white ground, dark room lines, 800x500 (aspect 1.6).
const PLAN_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>` +
  `<rect width='800' height='500' fill='#ffffff'/>` +
  `<g stroke='#22252a' stroke-width='6' fill='none'>` +
  `<rect x='40' y='40' width='720' height='420'/>` +
  `<line x1='400' y1='40' x2='400' y2='300'/><line x1='40' y1='300' x2='620' y2='300'/>` +
  `</g></svg>`
const PLAN_URI = 'data:image/svg+xml;base64,' + Buffer.from(PLAN_SVG).toString('base64')

// A tiny real raster, for the upload path (the field re-encodes it through a canvas).
const UPLOAD_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAGUlEQVQIW2P8z8Dwn4EIwDiqkL4KAWKgAxHi3jj1AAAAAElFTkSuQmCC',
  'base64'
)
/** The uploaded plan's component uid, discovered by diffing the namespace; deleted in cleanup. */
let bgUid = null

/** Read the page through a shape that cannot throw, so a missing feature fails its own
 * checks instead of aborting everything after it (the wait-that-never-resolves class). */
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => ({}))

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // Record WHICH resource failed - "Failed to load resource" alone is a failure nobody can act
  // on - and ignore the ones belonging to the user's own configuration: a real server carries
  // custom widgets pointing at iconsets and hosts that no longer answer.
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
  /* ---------------- seed ---------------- */
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

  // a second, unrelated dashboard - section H saves it to prove the background collector looks
  // at every dashboard's widgets, not only the one being written
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

  // deterministic light states for the glow checks
  await sendItem(ITEMS.color, '0,100,100') // pure red, full brightness
  await sendItem(ITEMS.dimmer, '60')
  await pollItem(ITEMS.color, '0')
  await pollItem(ITEMS.dimmer, '60')

  await page.goto(APP + '#/d/nh-e2e-fplan')
  await page.waitForSelector('.nh-fplan', { timeout: 15000 }).catch(() => {})
  await sleep(1500) // SSE settle

  /* ---------------- A. rendering ---------------- */
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

  // a light going dark loses its glow but keeps its marker
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

  /* ---------------- B. the tap popup ---------------- */
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

  // keyboard-step the hue: the steps must coalesce into ONE command
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

  /* ---------------- C. save a preset from current state ---------------- */
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
  // the capture normalizes the LIVE state; devices quantize, so compare numerically
  const near = (got, want, tol) =>
    typeof got === 'string' &&
    got.split(',').length === want.split(',').length &&
    got.split(',').every((v, i) => Math.abs(Number(v) - Number(want.split(',')[i])) <= tol)
  ok('captured values are the normalized current states',
    near(actionsByItem[ITEMS.color], '120,50,80', 3) && near(actionsByItem[ITEMS.dimmer], '42', 1),
    JSON.stringify(actionsByItem))

  const chip = await probe(page, () => {
    const chips = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')]
    const c = chips.find((x) => x.textContent === 'NH E2E Evening')
    return { present: !!c, active: c ? c.classList.contains('nh-chip--on') : false }
  })
  ok('preset chip appears in the bar', chip.present === true)
  ok('value-matched highlight while states hold (admin)', chip.active === true)

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

  /* ---------------- D. anonymous panel ---------------- */
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

  /* ---------------- E. status item + wall-switch bridge ---------------- */
  const mkItem = await fetch(itemUrl(PROXY_ITEM), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Switch', name: PROXY_ITEM, label: 'NH E2E Proxy' }),
  })
  ok('managed proxy item created', mkItem.status === 200 || mkItem.status === 201, 'status ' + mkItem.status)
  await sendItem(PROXY_ITEM, 'OFF')

  // real reload: the item catalog is loaded once per page load, and the proxy item must be in it
  await page.goto(APP + '#/settings')
  await page.reload()
  // wait for the MANAGEABLE row (name as an input): the summaries render first and the
  // admin full-load follows, so any-row is too early to drive the manager
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('.nh-presetrow__name')].some((el) => el.tagName === 'INPUT'),
      undefined,
      { timeout: 15000 }
    )
    .catch(() => {})

  // find our row by the name input's live value (attribute selectors see only defaultValue)
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
    // TYPE a partial search, never fill: page.fill delivers the value in one event and an
    // exact name auto-binds as typed, which together masked the pick-click being broken
    await page.click('.nh-presetrow__bridge input[role="combobox"]')
    await page.keyboard.type(PROXY_ITEM.slice(0, 8), { delay: 40 })
    await sleep(600)
    await page.click(`.nh-picker__option:has-text("${PROXY_ITEM}")`, { timeout: 5000 }).catch(() => {})
    const bridgePicked = await probe(page, () => ({
      value: document.querySelector('.nh-presetrow__bridge input[role="combobox"]')?.value ?? '',
    }))
    ok('bridge picker: a typed partial search still picks by click', bridgePicked.value === PROXY_ITEM,
      'value=' + JSON.stringify(bridgePicked.value))
    // short-timeout + catch: with a dead pick the checkbox stays disabled, and the REAL
    // failures should be the assertions below, not a 30s abort here
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

  // THE wall-switch proof: command the proxy item, the lights follow
  await sendItem(ITEMS.dimmer, '15')
  await sleep(600)
  await sendItem(PROXY_ITEM, 'ON')
  const bridged = await pollItem(ITEMS.dimmer, '42')
  ok('commanding the status item runs the preset (wall-switch path)', bridged === '42' || bridged.startsWith('42.'),
    'dimmer=' + bridged)

  // anonymous highlight now follows the status item over SSE. Polled, never single-sampled:
  // the tracker needs a connect + tracked-set roundtrip before the first state arrives.
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
  // meaningful only because the previous check required active=true first
  ok('…and drops live when it turns OFF', await chipActive(false))

  /* ---------------- F. backup carries the presets; hostile files refused ---------------- */
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
    notice: document.querySelector('.nh-settings__notice')?.textContent ?? '',
    confirmOpen: !!document.querySelector('.nh-settings__importchoice'),
  }))
  ok('hostile preset uid refused before any choice is offered',
    refusal.confirmOpen === false && /invalid presets/i.test(refusal.notice),
    refusal.notice.slice(0, 60))

  /* ---------------- G. the light-placement sheet (edit mode, draft only) ---------------- */
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

  // TYPE a lowercase partial search, then click the option - the way a person actually adds a
  // light. page.fill masked a real bug twice over: it skips per-keystroke behaviour (the
  // documented trap) AND an exact typed name auto-binds, hiding a dead pick-click entirely.
  await page.click('.nh-planedit__add input[role="combobox"]')
  await page.keyboard.type(ITEMS.switch.slice(0, 6).toLowerCase(), { delay: 40 })
  await sleep(600)
  await page.click(`.nh-picker__option:has-text("${ITEMS.switch}")`, { timeout: 5000 }).catch(() => {})
  const picked = await probe(page, () => ({
    value: document.querySelector('.nh-planedit__add input[role="combobox"]')?.value ?? '',
    // direct child: the picker's own clear/toggle buttons sit deeper and are never disabled
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
  // the sheet edits the DRAFT: exiting without saving must leave the server untouched
  await page.click('button:has-text("Exit")')
  await sleep(1000)
  const serverCfg = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  const serverLights = serverCfg?.config?.widgets?.[0]?.config?.lights ?? []
  ok('sheet edits stay in the draft until Save', serverLights.length === 2, 'server lights=' + serverLights.length)

  /* ---------------- H. the sheet fits, and an uploaded plan survives a save ---------------- */
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
  // An <input> has no min-content narrower than its default width, so a picker beside a button
  // pushes the button off the panel unless the picker's floor is released.
  ok('the Add button is not pushed off the panel',
    fits.overhang !== undefined && fits.overhang <= 0 && fits.sideOverflow <= 1 && fits.btnW > 0,
    `overhang=${fits.overhang}px panelOverflow=${fits.sideOverflow}px`)
  await page.click('.nh-planedit__bar .nh-btn--primary')
  await sleep(300)

  // Upload a plan onto the widget that has none, then SAVE. The uploaded image is referenced
  // only from inside the widget's config, which is exactly the reference the background
  // collector used to miss - it deleted the image the moment the dashboard was saved.
  const bgBefore = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  await page.click('.nh-grid--edit .nh-cell >> nth=2 >> .nh-cell__grip')
  await sleep(500)
  // This widget stores no planStyle, so the select is showing whatever the defaults resolve to.
  // A select with nothing selected renders blank, which reads as broken beside a plan that is
  // plainly styled - the widget's default has to agree with the one the renderer applies.
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
      // measured WITH an image set: that is when the row also carries a thumbnail and a clear
      // button, which is the state that crushed the box to a few characters in the 340px panel
      urlW: url ? Math.round(url.getBoundingClientRect().width) : 0,
      thumb: !!document.querySelector('.nh-sheet .nh-bgfield__thumb'),
    }
  })
  const afterUpload = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
  // ids are random: find the new component by diffing the namespace, never by guessing
  bgUid = afterUpload.find((u) => u.startsWith('background:') && !bgBefore.includes(u)) ?? null
  ok('uploading a plan image shows it and stores the upload', uploaded.imgs === 3 && !!bgUid, `imgs=${uploaded.imgs} uid=${bgUid}`)
  // The background field is also used in the 720px Settings form; in the 340px widget panel
  // everything on one line left the URL box a few characters wide.
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

  // ...and saving a DIFFERENT dashboard must not collect it either: the collector has to know
  // about every dashboard's widgets, not just the one being written.
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

  /* ---------------- I. switching presets holds steady while the lights fade ---------------- */
  // A light does not step to a commanded value: openHAB predicts it at once, the binding then
  // echoes the channel's PRE-FADE readback, and the real value lands when the fade ends. The
  // sequence below is the one a DMX strip actually produced on this server, replayed on an
  // UNBOUND managed item so no device is involved and the timing is ours.
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
  // start held at B, so tapping A is a real switch between two presets
  await putState(GLOW_ITEM, '330,81,70')
  // A goto that only changes the hash is a same-document navigation: the app would keep the
  // dashboard list and the scene list it loaded before this section created either of them.
  await page.goto(APP + '#/d/nh-e2e-fplan3')
  await page.reload()
  await page.waitForSelector('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 20000 }).catch(() => {})
  await sleep(2500)

  // Scoped to this section's own two chips: the bar lists every scene on the server, and on a
  // live one somebody else's preset may legitimately be held at the same moment.
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

  // Arm an in-page sampler BEFORE the click: polling over the wire costs a round trip a sample
  // and would miss the whole window.
  await page.evaluate(() => {
    window.__tl = []
    const read = () => {
      const chips = [...document.querySelectorAll('.nh-fplan__bar .nh-chip')]
      // Named in full, never by position or by a trailing character: the bar lists every scene
      // on the server, and somebody else's may be held or released while this runs.
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
  // Never let a missing chip abort the section: the checks below must be what fails.
  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 10000 }).catch(() => {})
  // the measured echo: the value being faded AWAY from, a mid-fade value, then the real one
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
  // tl[0] is the state before the tap; everything after it should be one steady state.
  const aOn = tl.map((s) => s.startsWith('A+'))
  const bOn = tl.map((s) => s.includes('B+'))
  const changes = aOn.filter((v, i) => i > 0 && v !== aOn[i - 1]).length
  ok('the tapped preset lights up once and stays lit through the fade',
    changes === 1 && aOn[0] === false && aOn[aOn.length - 1] === true,
    `highlight changes=${changes} states=${tl.length} | ${tl.join(' > ')}`)
  ok('the preset being left goes dark and does not come back',
    bOn[0] === true && bOn.slice(1).every((v) => v === false),
    `B lit in ${bOn.filter(Boolean).length} of ${tl.length} states`)
  // No colour is hardcoded: whatever the device reports mid-fade, the room must reach the new
  // scene's colour once and hold it, rather than flashing back through the one being left.
  const glows = tl.map((s) => s.split('|')[1] ?? '')
  const afterTap = [...new Set(glows.slice(1))]
  ok('the glow changes to the new scene once and never flashes back',
    afterTap.length === 1 && afterTap[0] !== glows[0] && afterTap[0] !== '',
    `before=${glows[0]} after=[${afterTap.join(' > ')}]`)
  const settled = await chipState(page)
  ok('the plan ends on the preset that was tapped', settled.a === true && settled.b === false,
    `A=${settled.a} B=${settled.b}`)

  /* ---------------- J. unselecting a preset turns its lights off ---------------- */
  // The chips are the primary control on a wall panel, reached from across a room.
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

  // Default: tapping the held preset runs it again, exactly as before the setting existed.
  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 10000 }).catch(() => {})
  await sleep(1500)
  ok('with the setting off, tapping the held preset leaves the lights on', (await brightness()) > 0,
    'brightness=' + (await brightness()))

  // Now turn it on for this plan.
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
  // OFF on a Color item zeroes the brightness and keeps the hue, so the colour survives being
  // switched back on - which is why the off command is OFF and not "0,0,0".
  const offState = await itemState(GLOW_ITEM)
  ok('tapping the held preset switches its lights off', Number(offState.split(',')[2]) === 0, 'state=' + offState)
  // The exact value, so this cannot pass on a build where nothing was switched off at all.
  ok('the light keeps its colour so it comes back the same', offState === '288,55,0', 'state=' + offState)

  // ...and tapping it again brings the preset back, so the chip really toggles. Asserting it
  // was off first, or this passes for free on a build that never switched it off.
  const wasOff = await brightness()
  await page.click('.nh-fplan__bar .nh-chip:text-is("NH E2E Settle A")', { timeout: 10000 }).catch(() => {})
  await sleep(1800)
  const backOn = await chipState(page)
  ok('tapping it again runs the preset back on', wasOff === 0 && backOn.a === true && (await brightness()) > 0,
    `wasOff=${wasOff} A=${backOn.a} brightness=${await brightness()}`)

  ok('no page errors (main)', errs.length === 0, errs.slice(0, 3).join(' | '))
  ok('no page errors (anonymous)', anonErrs.length === 0, anonErrs.slice(0, 3).join(' | '))
} finally {
  /* ---------------- cleanup ---------------- */
  await anonCtx?.close().catch(() => {})
  await browser.close().catch(() => {})
  for (const uid of [UID, UID2, UID3, bgUid].filter(Boolean)) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  for (const uid of [BRIDGE_UID, SCENE_UID, SETTLE_A, SETTLE_B]) {
    await fetch(`${BASE}/rest/rules/${uid}`, { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  for (const item of [PROXY_ITEM, GLOW_ITEM]) {
    await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  await sendItem(ITEMS.dimmer, initialDimmer).catch(() => {})
  await restoreColor(ITEMS.color, initialColor).catch(() => {})

  // verify: nothing survived (rule diff against the pre-run listing, config, the item)
  const postRuleUids = await listRuleUids()
  const stray = postRuleUids.filter((u) => !preRunRuleUids.includes(u))
  ok('no stray rules left behind', stray.length === 0, stray.join(','))
  const cfgLeft = await (await fetch(NS, { headers: AUTH })).json()
  const mine = [UID, UID2, UID3, bgUid].filter(Boolean)
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
