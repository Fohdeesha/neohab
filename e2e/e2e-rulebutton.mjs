// Run-a-rule e2e: the Button's "Run a scene, script or rule" action, its rule picker, the status item
// a rule or navigate button reads, the dashboard 3 -> 4 migration that moved a navigate button's item
// there, and runRule() in template and JavaScript widgets.
// SAFE with a live config, never on production: it creates and runs rules of its own. Creates and
// deletes exactly: dashboard:nh-e2e-rulebtn, widgetdef:nh-e2e-rbtpl and widgetdef:nh-e2e-rbjs
// (neohab:config), managed items nh_e2e_rbcount and nh_e2e_rbstatus, and the rules nh-e2e-rb-on, -off,
// -slow, -dis, -late, -scene, -plain and -hidden. Whether JavaScript widgets run is shown to the browser
// at its default and never written.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'
import { skipSuiteOnProduction } from './lib/guard.mjs'
import { pickItem } from './lib/ui.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

skipSuiteOnProduction('it creates and runs rules of its own')

const DASH = 'nh-e2e-rulebtn'
const UID = 'dashboard:' + DASH
const TPL_UID = 'widgetdef:nh-e2e-rbtpl'
const JS_UID = 'widgetdef:nh-e2e-rbjs'
const MADE = [UID, TPL_UID, JS_UID]
const COUNT = 'nh_e2e_rbcount'
const STATUS = 'nh_e2e_rbstatus'
const ITEMS_MADE = [COUNT, STATUS]
const R = {
  on: 'nh-e2e-rb-on',
  off: 'nh-e2e-rb-off',
  slow: 'nh-e2e-rb-slow',
  dis: 'nh-e2e-rb-dis',
  late: 'nh-e2e-rb-late',
  scene: 'nh-e2e-rb-scene',
  plain: 'nh-e2e-rb-plain',
  hidden: 'nh-e2e-rb-hidden'
}
const GONE = 'nh-e2e-rb-gone'
const NAME = {
  on: 'NH E2E RB Lights on',
  off: 'NH E2E RB Lights off',
  slow: 'NH E2E RB Slow',
  dis: 'NH E2E RB Disabled',
  late: 'NH E2E RB Late',
  scene: 'NH E2E RB Scene',
  plain: 'NH E2E RB Plain rule',
  hidden: 'NH E2E RB Hidden'
}

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const JSONH = { ...AUTH, 'Content-Type': 'application/json' }
const TEXTH = { ...AUTH, 'Content-Type': 'text/plain' }
const itemUrl = (n) => BASE + '/rest/items/' + n
const ruleUrl = (u) => BASE + '/rest/rules/' + u
const putState = (n, v) => fetch(itemUrl(n) + '/state', { method: 'PUT', headers: TEXTH, body: String(v) })
const getState = (n) =>
  fetch(itemUrl(n), { headers: AUTH })
    .then((r) => r.json())
    .then((j) => j.state)
    .catch(() => null)
const pollState = async (n, want, ms = 8000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await getState(n)
    if (last === want) return last
    await sleep(150)
  }
  return last
}

// each rule adds its own amount to the counter, so the total says which ran and how often
const bump = (by) => `${COUNT}.postUpdate((${COUNT}.state as Number).intValue + ${by})`
const dsl = (script) => [{ id: '1', type: 'script.ScriptAction', configuration: { type: 'application/vnd.openhab.dsl.rule', script } }]
const RULES = [
  { uid: R.on, name: NAME.on, tags: ['Script'], actions: dsl(bump(1) + `\n${STATUS}.postUpdate(ON)`) },
  { uid: R.off, name: NAME.off, tags: ['Script'], actions: dsl(bump(100) + `\n${STATUS}.postUpdate(OFF)`) },
  { uid: R.slow, name: NAME.slow, tags: ['Script'], actions: dsl('Thread::sleep(2500)\n' + bump(1000)) },
  { uid: R.dis, name: NAME.dis, tags: ['Script'], actions: dsl(bump(10000)) },
  { uid: R.late, name: NAME.late, tags: ['Script'], actions: dsl(bump(100000)) },
  // a floor plan preset carries its status item in a tag, which picking it brings along
  { uid: R.scene, name: NAME.scene, tags: ['Scene', `neohab:status:${STATUS}:ON`], actions: [] },
  { uid: R.plain, name: NAME.plain, tags: [], actions: [] },
  { uid: R.hidden, name: NAME.hidden, tags: ['Script'], visibility: 'HIDDEN', actions: [] }
]

const btn = (id, label, config, x, y, w = 2, h = 2) => ({ id, type: 'button', config: { label, ...config }, layout: { lg: { x, y, w, h } } })
// seeded at version 3, so the navigate button below goes through the migration on load
const WIDGETS = [
  btn('w-on', 'Run on', { action: 'rule', rule: R.on }, 0, 0),
  btn('w-slow', 'Run slow', { action: 'rule', rule: R.slow }, 2, 0),
  btn('w-dis', 'Run disabled', { action: 'rule', rule: R.dis, caption: 'Own caption' }, 4, 0),
  btn('w-late', 'Run late', { action: 'rule', rule: R.late }, 6, 0),
  btn('w-gone', 'Run gone', { action: 'rule', rule: GONE }, 8, 0),
  btn('w-none', 'Run none', { action: 'rule' }, 10, 0),
  btn('w-lights', 'Lights', { action: 'rule', rule: R.on, ruleAlt: R.off, statusItem: STATUS }, 0, 2),
  btn('w-card', 'Card run', { action: 'rule', rule: R.on, style: 'card' }, 2, 2, 3, 2),
  btn('w-nav', 'Nav lit', { action: 'navigate', navigateDashboard: DASH, item: STATUS, command: 'ON', toggle: false }, 5, 2),
  { id: 'w-tpl', type: 'template', config: { label: 'Tpl rules', customwidget: 'nh-e2e-rbtpl' }, layout: { lg: { x: 0, y: 4, w: 4, h: 3 } } },
  { id: 'w-js', type: 'template', config: { label: 'Js rules', customwidget: 'nh-e2e-rbjs' }, layout: { lg: { x: 4, y: 4, w: 4, h: 3 } } }
]

const DEFS = [
  {
    uid: TPL_UID,
    component: 'neohab:widgetdef',
    config: {
      version: 1,
      id: 'nh-e2e-rbtpl',
      name: 'E2E rule template',
      template: [
        `<button id="t-on" x-on:tap="runRule('${R.on}')">on</button>`,
        `<button id="t-slow" ng-click="runRule('${R.slow}')">slow</button>`,
        `<button id="t-dis" x-on:tap="runRule('${R.dis}')">dis</button>`
      ].join('\n'),
      settings: []
    }
  },
  {
    uid: JS_UID,
    component: 'neohab:widgetdef',
    config: {
      version: 1,
      id: 'nh-e2e-rbjs',
      name: 'E2E rule script',
      kind: 'js',
      script: [
        'oh.onReady(function () {',
        "  var out = document.createElement('div'); out.id = 'out'; out.textContent = 'idle'; document.body.appendChild(out)",
        '  function b(id, uid) {',
        "    var el = document.createElement('button'); el.id = id; el.textContent = id",
        "    el.addEventListener('click', function () { out.textContent = id + ':running'; oh.runRule(uid).then(function (v) { out.textContent = id + '=' + v }) })",
        '    document.body.appendChild(el)',
        '  }',
        `  b('j-on', '${R.on}'); b('j-dis', '${R.dis}'); b('j-gone', '${GONE}')`,
        '})'
      ].join('\n'),
      settings: []
    }
  }
]

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

// JavaScript widgets run at the default; this browser sees that whatever the server has
const sb = await sharedSettings({ allowJsWidgets: undefined })
const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
await sb.install(context)
const page = await context.newPage()
const errs = []
const runs = []
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(tag + ' pageerror: ' + e.message))
  p.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location?.()?.url
    if (!isAppResource(url)) return
    // section I runs a rule that is not there on purpose, and the browser logs the 404 it asked for
    if (url && url.includes(`/rest/rules/${GONE}/runnow`)) return
    errs.push(tag + ' ' + m.text() + (url ? ' <- ' + url : ''))
  })
  p.on('request', (req) => {
    const m = /\/rest\/rules\/([^/]+)\/runnow/.exec(req.url())
    if (m && req.method() === 'POST') runs.push({ tag, uid: decodeURIComponent(m[1]) })
  })
}
watch(page, 'admin')
page.on('dialog', (d) => d.accept().catch(() => {}))
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

const runsOf = (uid, tag = 'admin') => runs.filter((r) => r.uid === uid && r.tag === tag).length
const face = (p, label) => p.locator(`.nh-gcell .nh-button[aria-label="${label}"]`).first()
const faceInfo = (p, label) =>
  p
    .evaluate((l) => {
      const b = document.querySelector(`.nh-gcell .nh-button[aria-label="${l}"]`)
      if (!b) return null
      const tick = b.querySelector('.nh-button__tick')
      const br = b.getBoundingClientRect()
      const tr = tick?.getBoundingClientRect()
      return {
        cls: b.className,
        busy: b.getAttribute('aria-busy'),
        caption: b.querySelector('.nh-button__caption')?.textContent ?? null,
        tick: !!tick,
        tickInside: tr ? tr.left >= br.left && tr.right <= br.right && tr.top >= br.top && tr.bottom <= br.bottom && tr.width > 8 : null
      }
    }, label)
    .catch(() => null)
const notice = (label) =>
  page
    .evaluate((l) => {
      const cell = [...document.querySelectorAll('.nh-gcell')].find((c) => c.querySelector('.nh-widget__labeltext')?.textContent === l)
      if (!cell) return null
      return {
        title: cell.querySelector('.nh-widget__errtitle')?.textContent ?? null,
        hint: cell.querySelector('.nh-widget__errhint')?.textContent ?? null,
        unset: cell.querySelector('.nh-widget__unset')?.textContent ?? null
      }
    }, label)
    .catch(() => null)
const toasts = () => page.$$eval('.nh-toast__text', (els) => els.map((e) => e.textContent ?? '')).catch(() => [])
const waitFor = async (fn, test, ms = 5000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await fn()
    if (test(last)) return last
    await sleep(100)
  }
  return last
}
// a control build has no such field, and pickItem's click would wait out its 30s on it
const pick = async (input, name) => ((await input.count().catch(() => 0)) > 0 ? pickItem(page, input, name) : '<no field>')
const enable = (uid, on) => fetch(ruleUrl(uid) + '/enable', { method: 'POST', headers: TEXTH, body: String(on) })
// openHAB remembers a disabled uid after the rule is gone and applies it to the next rule of that name, so
// each one is enabled again before it is deleted
const cleanupRules = async () => {
  for (const uid of Object.values(R)) {
    await enable(uid, true).catch(() => {})
    await fetch(ruleUrl(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
}

try {
  // ---- setup: items, rules, dashboard ---------------------------------------------------------------
  await cleanupRules()
  for (const uid of MADE) await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  for (const def of DEFS) {
    const r = await fetch(NS, { method: 'POST', headers: JSONH, body: JSON.stringify(def) })
    ok(`seed ${def.uid}`, r.status === 200, 'status=' + r.status)
  }
  for (const [n, type] of [
    [COUNT, 'Number'],
    [STATUS, 'Switch']
  ]) {
    const r = await fetch(itemUrl(n), { method: 'PUT', headers: JSONH, body: JSON.stringify({ type, name: n, label: 'NH E2E ' + n }) })
    ok(`item ${n} created`, r.ok, 'status=' + r.status)
  }
  await putState(COUNT, '0')
  await putState(STATUS, 'OFF')
  for (const rule of RULES) {
    const r = await fetch(BASE + '/rest/rules', { method: 'POST', headers: JSONH, body: JSON.stringify({ triggers: [], conditions: [], ...rule }) })
    ok(`rule ${rule.uid} created`, r.status === 201 || r.status === 200, 'status=' + r.status)
  }
  // and a run killed before its cleanup can still have left one remembered as disabled
  for (const rule of RULES) await enable(rule.uid, rule.uid !== R.dis)
  const summary = await fetch(BASE + '/rest/rules?summary=true', { headers: AUTH }).then((r) => r.json())
  const statusOf = (uid) => summary.find((r) => r.uid === uid)?.status?.statusDetail ?? '?'
  ok(
    'only the disabled rule is disabled',
    statusOf(R.dis) === 'DISABLED' && RULES.filter((r) => r.uid !== R.dis).every((r) => statusOf(r.uid) !== 'DISABLED'),
    RULES.map((r) => `${r.uid.replace('nh-e2e-rb-', '')}=${statusOf(r.uid)}`).join(' ')
  )
  const hiddenOnServer = summary.find((r) => r.uid === R.hidden)?.visibility === 'HIDDEN'
  const seed = await fetch(NS, {
    method: 'POST',
    headers: JSONH,
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 3, id: DASH, name: 'E2E Rule button', columns: 12, rowHeight: 60, gap: 8, widgets: WIDGETS }
    })
  })
  ok('seed dashboard (written at version 3)', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-gcell .nh-button[aria-label="Run on"]', { timeout: 20000 }).catch(() => {})

  // ---- A. what the tiles say before anything is pressed -------------------------------------------------
  const gone = await waitFor(() => notice('Run gone'), (n) => !!n?.title, 6000)
  ok(
    'a rule that is not on the server gets the same notice a missing item does',
    gone?.title === GONE && /Not on this openHAB server/.test(gone?.hint ?? ''),
    JSON.stringify(gone)
  )
  const none = await notice('Run none')
  ok('a rule button with no rule yet says so', /No scene, script or rule yet/.test(none?.unset ?? ''), JSON.stringify(none))
  const disInfo = await waitFor(
    () => faceInfo(page, 'Run disabled'),
    (i) => /nh-button--blocked/.test(i?.cls ?? '')
  )
  ok(
    'a disabled rule dims its tile and says so where the caption was',
    /nh-button--blocked/.test(disInfo?.cls ?? '') && disInfo?.caption === 'Disabled in openHAB',
    JSON.stringify(disInfo)
  )
  const lateInfo = await faceInfo(page, 'Run late')
  ok('an enabled rule is not marked', lateInfo !== null && !/nh-button--blocked/.test(lateInfo.cls), JSON.stringify(lateInfo))

  // ---- B. pressing a disabled rule explains instead of sending ------------------------------------------
  await face(page, 'Run disabled').click({ timeout: 5000 }).catch(() => {})
  const disToast = await waitFor(toasts, (t) => t.some((x) => x.includes(NAME.dis) && /is disabled in openHAB/.test(x)), 3000)
  await sleep(500)
  ok(
    'pressing it says the rule is disabled, and sends nothing',
    runsOf(R.dis) === 0 && (disToast ?? []).some((x) => x.includes(NAME.dis) && /is disabled in openHAB/.test(x)),
    `runnow=${runsOf(R.dis)} toasts=${JSON.stringify(disToast)}`
  )
  // only meaningful where the tile was there to press
  ok('and nothing ran on the server', disInfo !== null && (await getState(COUNT)) === '0', `tile=${disInfo !== null} count=${await getState(COUNT)}`)

  // ---- C. a plain run: the rule runs once, then a brief tick ---------------------------------------------
  await face(page, 'Run on').click({ timeout: 5000 }).catch(() => {})
  const onTick = await waitFor(
    () => faceInfo(page, 'Run on'),
    (i) => i?.tick === true,
    5000
  )
  ok('a press runs the rule once', (await pollState(COUNT, '1')) === '1' && runsOf(R.on) === 1, `count=${await getState(COUNT)} runnow=${runsOf(R.on)}`)
  ok('then shows a tick on the face, inside it', onTick?.tick === true && onTick?.tickInside === true, JSON.stringify(onTick))
  const tickGone = await waitFor(
    () => faceInfo(page, 'Run on'),
    (i) => i?.tick === false,
    4000
  )
  ok('and the tick goes away by itself', tickGone?.tick === false, JSON.stringify(tickGone))

  await page.locator('.nh-gcell .nh-button[aria-label="Card run"]').click({ timeout: 5000 }).catch(() => {})
  const cardTick = await waitFor(
    () => faceInfo(page, 'Card run'),
    (i) => i?.tick === true,
    5000
  )
  ok('a card shows the tick inside its face too', cardTick?.tickInside === true, JSON.stringify(cardTick))
  await pollState(COUNT, '2')

  // ---- D. a slow rule: busy for as long as it runs, and a second press is not a second run -----------------
  const slowBefore = runsOf(R.slow)
  await face(page, 'Run slow').click({ timeout: 5000 }).catch(() => {})
  const busy = await waitFor(
    () => faceInfo(page, 'Run slow'),
    (i) => /nh-button--running/.test(i?.cls ?? ''),
    1500
  )
  ok('the face shows it is running', /nh-button--running/.test(busy?.cls ?? '') && busy?.busy === 'true', JSON.stringify(busy))
  await sleep(400)
  await face(page, 'Run slow').click({ timeout: 5000 }).catch(() => {})
  const slowDone = await pollState(COUNT, '1002', 9000)
  const settled = await waitFor(
    () => faceInfo(page, 'Run slow'),
    (i) => i !== null && !/nh-button--running/.test(i.cls),
    4000
  )
  ok('a second press while it runs is dropped', slowDone === '1002' && runsOf(R.slow) - slowBefore === 1, `count=${slowDone} runnow=${runsOf(R.slow) - slowBefore}`)
  ok('and the busy look ends when the rule does', settled !== null && !/nh-button--running/.test(settled.cls) && settled.busy === null, JSON.stringify(settled))

  // ---- E. a status item: lit while on, and the second rule runs while lit ----------------------------------
  // the presses above ran the rule that switches it on
  await putState(STATUS, 'OFF')
  await waitFor(
    () => faceInfo(page, 'Lights'),
    (i) => i !== null && !/nh-button--active/.test(i.cls),
    4000
  )
  const lights0 = await faceInfo(page, 'Lights')
  const nav0 = await faceInfo(page, 'Nav lit')
  ok('with the status item OFF, the tile is not lit', lights0 !== null && !/nh-button--active/.test(lights0.cls), JSON.stringify(lights0))
  await face(page, 'Lights').click({ timeout: 5000 }).catch(() => {})
  const afterOn = await pollState(COUNT, '1003', 6000)
  const lights1 = await waitFor(
    () => faceInfo(page, 'Lights'),
    (i) => /nh-button--active/.test(i?.cls ?? ''),
    5000
  )
  ok('the first press runs the first rule', afterOn === '1003' && (await getState(STATUS)) === 'ON', `count=${afterOn} status=${await getState(STATUS)}`)
  ok('and the tile lights once the status item reads ON, with no tick of its own', /nh-button--active/.test(lights1?.cls ?? '') && lights1?.tick === false, JSON.stringify(lights1))
  const nav1 = await waitFor(
    () => faceInfo(page, 'Nav lit'),
    (i) => /nh-button--active/.test(i?.cls ?? ''),
    4000
  )
  ok(
    'a navigate button migrated from version 3 lights from its old item, though its toggle was off',
    nav0 !== null && !/nh-button--active/.test(nav0.cls) && /nh-button--active/.test(nav1?.cls ?? ''),
    `before=${nav0?.cls} after=${nav1?.cls}`
  )
  await face(page, 'Lights').click({ timeout: 5000 }).catch(() => {})
  const afterOff = await pollState(COUNT, '1103', 6000)
  const lights2 = await waitFor(
    () => faceInfo(page, 'Lights'),
    (i) => i !== null && !/nh-button--active/.test(i.cls),
    5000
  )
  ok('a press while lit runs the second rule instead', afterOff === '1103' && runsOf(R.off) === 1, `count=${afterOff} off-runs=${runsOf(R.off)}`)
  ok('and the tile goes dark with the status item', lights2 !== null && !/nh-button--active/.test(lights2.cls), JSON.stringify(lights2))

  // ---- F. disabled after the page read the list: openHAB answers 200, the re-read tells the truth ----------
  await enable(R.late, false)
  await face(page, 'Run late').click({ timeout: 5000 }).catch(() => {})
  const lateToast = await waitFor(toasts, (t) => t.some((x) => x.includes(NAME.late) && /is disabled in openHAB/.test(x)), 5000)
  const lateAfter = await waitFor(
    () => faceInfo(page, 'Run late'),
    (i) => /nh-button--blocked/.test(i?.cls ?? ''),
    3000
  )
  ok(
    'a rule disabled after the page loaded is caught by the read after the run',
    runsOf(R.late) === 1 && (lateToast ?? []).some((x) => x.includes(NAME.late)) && /nh-button--blocked/.test(lateAfter?.cls ?? ''),
    `runnow=${runsOf(R.late)} toasts=${JSON.stringify(lateToast)} cls=${lateAfter?.cls}`
  )
  ok('with no tick claiming it ran, and nothing ran', lateAfter?.tick === false && (await getState(COUNT)) === '1103', `tick=${lateAfter?.tick} count=${await getState(COUNT)}`)

  // ---- G. a signed-out wall panel runs rules wherever it may send commands --------------------------------
  // read what this server allows first: an anonymous read of an item nobody has is 404 when allowed
  const anonProbe = await fetch(itemUrl('nh_e2e_rb_nobody')).then((r) => r.status).catch(() => 0)
  if (anonProbe === 404) {
    const anonCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
    const anon = await anonCtx.newPage()
    watch(anon, 'anon')
    await anon.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await anon.waitForSelector('.nh-gcell .nh-button[aria-label="Run on"]', { timeout: 20000 }).catch(() => {})
    await face(anon, 'Run on').click({ timeout: 5000 }).catch(() => {})
    const anonCount = await pollState(COUNT, '1104', 6000)
    ok('signed out, a press still runs the rule', anonCount === '1104' && runsOf(R.on, 'anon') === 1, `count=${anonCount} runnow=${runsOf(R.on, 'anon')}`)
    await anonCtx.close()
  } else {
    ok(`SKIP: this server refuses anonymous reads (${anonProbe}), so there is no signed-out panel to test`, true)
  }

  // ---- I. runRule() in a template, and oh.runRule in a JavaScript widget -----------------------------------
  const count = async () => Number(await getState(COUNT))
  const tpl = (sel) => page.locator('.nh-gcell .nh-template__host').first().locator(sel)
  await page.waitForSelector('.nh-gcell .nh-template__host', { timeout: 10000 }).catch(() => {})
  let base = await count()
  let before = runsOf(R.on)
  await tpl('#t-on').click({ timeout: 5000 }).catch(() => {})
  const tOn = await pollState(COUNT, String(base + 1), 6000)
  ok('a template runs a rule with runRule()', tOn === String(base + 1) && runsOf(R.on) - before === 1, `count=${tOn} want=${base + 1} runnow=${runsOf(R.on) - before}`)

  base = await count()
  before = runsOf(R.slow)
  await tpl('#t-slow').click({ timeout: 5000 }).catch(() => {})
  await sleep(300)
  await tpl('#t-slow').click({ timeout: 5000 }).catch(() => {})
  const tSlow = await pollState(COUNT, String(base + 1000), 9000)
  // a second run queued behind the first would land about 2.5s after it
  await sleep(3500)
  const tSlowAfter = await count()
  ok(
    'a second tap while the rule still runs joins that run rather than queueing another',
    tSlow === String(base + 1000) && tSlowAfter === base + 1000 && runsOf(R.slow) - before === 1,
    `count=${tSlowAfter} want=${base + 1000} runnow=${runsOf(R.slow) - before}`
  )

  base = await count()
  await tpl('#t-dis').click({ timeout: 5000 }).catch(() => {})
  const tDisToast = await waitFor(toasts, (t) => t.some((x) => x.includes(NAME.dis) && /is disabled in openHAB/.test(x)), 3000)
  await sleep(500)
  ok(
    'a disabled rule is refused with a reason, from a template too',
    runsOf(R.dis) === 0 && (tDisToast ?? []).some((x) => x.includes(NAME.dis) && /is disabled in openHAB/.test(x)) && (await count()) === base,
    `runnow=${runsOf(R.dis)} toasts=${JSON.stringify(tDisToast)}`
  )

  const js = page.frameLocator('.nh-gcell iframe.nh-template__frame')
  const jsOut = () => js.locator('#out').textContent({ timeout: 3000 }).catch(() => null)
  await js.locator('#j-on').waitFor({ timeout: 10000 }).catch(() => {})
  base = await count()
  before = runsOf(R.on)
  await js.locator('#j-on').click({ timeout: 5000 }).catch(() => {})
  const jOn = await waitFor(jsOut, (t) => t === 'j-on=true', 6000)
  ok(
    'a JavaScript widget runs a rule, and oh.runRule resolves true once it has run',
    jOn === 'j-on=true' && (await count()) === base + 1 && runsOf(R.on) - before === 1,
    `out=${jOn} count=${await count()} want=${base + 1} runnow=${runsOf(R.on) - before}`
  )
  await js.locator('#j-dis').click({ timeout: 5000 }).catch(() => {})
  const jDis = await waitFor(jsOut, (t) => t === 'j-dis=false', 4000)
  ok('and false, with nothing sent, for a disabled rule', jDis === 'j-dis=false' && runsOf(R.dis) === 0, `out=${jDis} runnow=${runsOf(R.dis)}`)
  await js.locator('#j-gone').click({ timeout: 5000 }).catch(() => {})
  const jGone = await waitFor(jsOut, (t) => t === 'j-gone=false', 6000)
  const goneToast = await waitFor(toasts, (t) => t.some((x) => x.includes(GONE) && /is not on this openHAB server anymore/.test(x)), 3000)
  ok(
    'and false, with the reason shown, for a rule openHAB does not have',
    jGone === 'j-gone=false' && (goneToast ?? []).some((x) => x.includes(GONE) && /is not on this openHAB server anymore/.test(x)),
    `out=${jGone} toasts=${JSON.stringify(goneToast)}`
  )

  // ---- H. the editor ------------------------------------------------------------------------------------
  await page.click('[aria-label="Edit dashboard"]', { timeout: 8000 }).catch(() => {})
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 }).catch(() => {})

  // a press can never reach a widget in the editor, so the click goes straight to the element
  const runsBeforeEdit = runs.length
  const editTpl = page.locator('.nh-grid--edit .nh-template__host').first().locator('#t-on')
  const editJs = page.frameLocator('.nh-grid--edit iframe.nh-template__frame')
  await editJs.locator('#j-on').waitFor({ timeout: 10000 }).catch(() => {})
  const editReady = (await editTpl.count().catch(() => 0)) > 0 && (await editJs.locator('#j-on').count().catch(() => 0)) > 0
  await editTpl.dispatchEvent('click', undefined, { timeout: 3000 }).catch(() => {})
  await editJs.locator('#j-on').dispatchEvent('click', undefined, { timeout: 3000 }).catch(() => {})
  const editOut = await waitFor(
    () => editJs.locator('#out').textContent({ timeout: 3000 }).catch(() => null),
    (t) => t === 'j-on=false',
    3000
  )
  await sleep(1000)
  ok(
    'while editing, neither a template nor a JavaScript widget runs a rule',
    editReady && editOut === 'j-on=false' && runs.length === runsBeforeEdit,
    `ready=${editReady} out=${editOut} runnow=${runs.length - runsBeforeEdit}`
  )
  const select = async (id) => {
    await page
      .click(`.nh-cell:has(.nh-button[aria-label="${id}"]) .nh-cell__overlay, .nh-cell:has(.nh-widget__labeltext:text-is("${id}")) .nh-cell__overlay`, { timeout: 5000 })
      .catch(() => {})
    await page.waitForSelector('.nh-sheet--side .nh-form', { timeout: 5000 }).catch(() => {})
    await sleep(300)
  }
  const labels = () => page.$$eval('.nh-sheet--side .nh-field__label', (els) => els.map((e) => e.textContent?.trim() ?? '')).catch(() => [])
  const warns = () => page.$$eval('.nh-sheet--side .nh-field__warn', (els) => els.map((e) => e.textContent ?? '')).catch(() => [])

  await select('Run on')
  const firstLabels = await labels()
  ok('Action is the first thing the panel asks', firstLabels[0] === 'Action', JSON.stringify(firstLabels.slice(0, 4)))
  ok(
    'a rule button offers the rule picker and no command fields',
    firstLabels.includes('Scene, script or rule') && !firstLabels.includes('openHAB Item') && !firstLabels.includes('Command'),
    JSON.stringify(firstLabels)
  )
  const shown = await page.inputValue('#f-w-on-rule').catch(() => null)
  const kind = await page.textContent('.nh-sheet--side .nh-rulepicker__kind').catch(() => null)
  ok('the picker shows the rule by its name, tagged as a script', shown === NAME.on && kind === 'Script', `value=${shown} kind=${kind}`)
  ok(
    '"When on, run instead" waits for a status item',
    firstLabels.includes('Scene, script or rule') && !firstLabels.includes('When on, run instead'),
    JSON.stringify(firstLabels)
  )

  await page.click('.nh-sheet--side .nh-rulepicker .nh-picker__toggle', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-picker__list', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector(`.nh-picker__option[data-uid="${R.on}"]`, { timeout: 8000 }).catch(() => {})
  const list = await page
    .evaluate((R) => {
      const l = document.querySelector('.nh-picker__list')
      if (!l) return null
      const uids = [...l.querySelectorAll('.nh-picker__option[data-uid]')].map((o) => o.getAttribute('data-uid'))
      return {
        heads: [...l.querySelectorAll('.nh-rulepicker__head')].map((h) => h.textContent),
        uids,
        sceneUnder: l.querySelector(`[data-uid="${R.scene}"]`)?.closest('.nh-rulepicker__group')?.querySelector('.nh-rulepicker__head')?.textContent ?? null,
        scriptUnder: l.querySelector(`[data-uid="${R.on}"]`)?.closest('.nh-rulepicker__group')?.querySelector('.nh-rulepicker__head')?.textContent ?? null,
        disFlag: l.querySelector(`[data-uid="${R.dis}"] .nh-rulepicker__flag`)?.textContent ?? null,
        onName: l.querySelector(`[data-uid="${R.on}"] .nh-picker__name`)?.textContent ?? null,
        onMeta: l.querySelector(`[data-uid="${R.on}"] .nh-picker__meta`)?.textContent ?? null,
        more: l.querySelector('.nh-rulepicker__more')?.textContent ?? null
      }
    }, R)
    .catch(() => null)
  ok(
    'the list heads scenes and scripts apart, a scene under Scenes and a script under Scripts',
    list?.sceneUnder === 'Scenes' && list?.scriptUnder === 'Scripts',
    JSON.stringify({ heads: list?.heads, scene: list?.sceneUnder, script: list?.scriptUnder })
  )
  ok('each row is the name, with the uid under it', list?.onName === NAME.on && list?.onMeta === R.on, JSON.stringify({ n: list?.onName, m: list?.onMeta }))
  ok(
    'plain rules are folded behind one row rather than listed',
    !list?.uids?.includes(R.plain) && !list?.heads?.includes('Rules') && /^Show \d+ other rules?$/.test(list?.more ?? ''),
    JSON.stringify({ more: list?.more, heads: list?.heads, plainListed: list?.uids?.includes(R.plain) })
  )
  ok('a disabled rule is flagged in the list', list?.disFlag === 'disabled', String(list?.disFlag))
  if (hiddenOnServer) ok('a rule openHAB hides is not listed', list !== null && !list.uids.includes(R.hidden), JSON.stringify(list?.uids))
  else ok('SKIP: this server did not keep the HIDDEN visibility, so there is no hidden rule to leave out', true)

  await page.click('.nh-rulepicker__more', { timeout: 5000 }).catch(() => {})
  await sleep(300)
  const unfolded = await page
    .evaluate((plain) => {
      const row = document.querySelector(`.nh-picker__list [data-uid="${plain}"]`)
      return { listed: !!row, under: row?.closest('.nh-rulepicker__group')?.querySelector('.nh-rulepicker__head')?.textContent ?? null }
    }, R.plain)
    .catch(() => null)
  ok('"Show other rules" lists them under Rules', unfolded?.listed === true && unfolded?.under === 'Rules', JSON.stringify(unfolded))
  await page.keyboard.press('Escape')

  // a status item brings the second rule; picking one is a typed partial search and a click
  const statusInput = page.locator('#f-w-on-statusItem')
  const boundStatus = await pick(statusInput, STATUS)
  await sleep(300)
  ok('picking a status item from the list binds it', boundStatus === STATUS, 'value=' + boundStatus)
  ok('and then offers "When on, run instead"', (await labels()).includes('When on, run instead'), JSON.stringify(await labels()))
  const altPicked = await pick(page.locator('#f-w-on-ruleAlt'), NAME.off)
  ok('the second rule is picked by its name', altPicked === NAME.off, 'value=' + altPicked)

  await select('Run gone')
  ok('a missing rule is called out under its field', (await warns()).some((w) => /Not on this openHAB server/.test(w)), JSON.stringify(await warns()))
  await select('Run disabled')
  ok('so is a disabled one', (await warns()).some((w) => /Disabled in openHAB/.test(w)), JSON.stringify(await warns()))

  await select('Nav lit')
  const navLabels = await labels()
  const navStatus = await page.inputValue('#f-w-nav-statusItem').catch(() => null)
  ok(
    'the migrated navigate button keeps its item as the Status item, with no command fields',
    navStatus === STATUS && !navLabels.includes('openHAB Item') && !navLabels.includes('Toggle with state'),
    `status=${navStatus} labels=${JSON.stringify(navLabels)}`
  )

  // picking a floor plan preset's scene brings its status item along, and keeps the name already there
  await select('Run none')
  const scenePicked = await pick(page.locator('#f-w-none-rule'), NAME.scene)
  await sleep(300)
  ok('a scene is picked by its name', scenePicked === NAME.scene, 'value=' + scenePicked)
  ok('and its preset status item comes with it', (await page.inputValue('#f-w-none-statusItem').catch(() => null)) === STATUS, String(await page.inputValue('#f-w-none-statusItem').catch(() => null)))
  ok(
    'a name already there is kept',
    scenePicked === NAME.scene && (await page.inputValue('#f-w-none-label').catch(() => null)) === 'Run none',
    `picked=${scenePicked} name=${await page.inputValue('#f-w-none-label').catch(() => null)}`
  )

  // a new button: Action first, and the rule names the tile
  await page.click('[aria-label="Add widget"]', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-palette__card', { timeout: 8000 }).catch(() => {})
  await page.click('.nh-palette__card:has(.nh-palette__name:text-is("Button"))', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet--side .nh-form', { timeout: 8000 }).catch(() => {})
  await sleep(300)
  const newId = await page.$eval('.nh-sheet--side select[id$="-action"]', (el) => el.id.replace(/^f-/, '').replace(/-action$/, '')).catch(() => null)
  await page.selectOption(`#f-${newId}-action`, 'rule').catch(() => {})
  await sleep(300)
  const newPicked = await pick(page.locator(`#f-${newId}-rule`), NAME.slow)
  await sleep(300)
  ok('a new button names itself after the rule picked', newPicked === NAME.slow && (await page.inputValue(`#f-${newId}-label`).catch(() => null)) === NAME.slow, `picked=${newPicked} name=${await page.inputValue(`#f-${newId}-label`).catch(() => null)}`)

  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes(encodeURIComponent(UID)), { timeout: 15000 }).catch(() => null)
  await page.click('button:has-text("Save")', { timeout: 5000 }).catch(() => {})
  await put
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 15000 }).catch(() => {})
  const stored = await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH }).then((r) => r.json()).catch(() => null)
  const sw = Object.fromEntries((stored?.config?.widgets ?? []).map((w) => [w.id, w.config]))
  ok('saved at version 4', Number(stored?.config?.version) === 4, 'version=' + stored?.config?.version)
  ok(
    'the saved rule button holds uids, not names',
    sw['w-on']?.rule === R.on && sw['w-on']?.ruleAlt === R.off && sw['w-on']?.statusItem === STATUS,
    JSON.stringify(sw['w-on'])
  )
  ok('the scene pick saved with its status item', sw['w-none']?.rule === R.scene && sw['w-none']?.statusItem === STATUS, JSON.stringify(sw['w-none']))
  ok(
    'the navigate button saved with statusItem and no item',
    sw['w-nav']?.statusItem === STATUS && !('item' in (sw['w-nav'] ?? {})),
    JSON.stringify(sw['w-nav'])
  )
  ok('the new button saved as a rule button', newId !== null && sw[newId]?.action === 'rule' && sw[newId]?.rule === R.slow, JSON.stringify(sw[newId ?? '']))

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  for (const uid of MADE) await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await cleanupRules()
  for (const item of ITEMS_MADE) await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => MADE.includes(c.uid)).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboard and widget definitions removed', left.length === 0, left.join(','))
  const untouched = await sb.verify().catch((e) => ({ ok: false, detail: String(e) }))
  ok('the shared settings on the server were never written', untouched.ok, untouched.detail)
  const rulesLeft = await fetch(BASE + '/rest/rules?summary=true', { headers: AUTH })
    .then((r) => r.json())
    .then((rs) => rs.filter((r) => r.uid.startsWith('nh-e2e-rb-')).map((r) => r.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: test rules removed', rulesLeft.length === 0, rulesLeft.join(','))
  const itemsLeft = []
  for (const item of ITEMS_MADE) {
    const r = await fetch(itemUrl(item), { headers: AUTH }).catch(() => null)
    if (r && r.status === 200) itemsLeft.push(item)
  }
  ok('cleanup: test items removed', itemsLeft.length === 0, itemsLeft.join(','))
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log('\n' + (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') + '  (' + (results.length - failed.length) + '/' + results.length + ')')
  process.exitCode = failed.length === 0 ? 0 : 1
}
