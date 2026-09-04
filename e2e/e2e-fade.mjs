/**
 * Fading-device e2e: what a control shows while something ELSE is changing its item.
 *
 * A light does not step to a new value. openHAB applies its own prediction at once, the binding
 * echoes the channel's pre-fade readback, and the real value lands when the fade ends - so one
 * press of a button that runs an openHAB rule made every colour fader on a dashboard jump to the
 * new colour, collapse to near-black and climb back, over about a second. The sequences replayed
 * below are the ones a DMX strip actually produced for one such press.
 *
 * Replayed as state UPDATES on items this suite creates itself, so no device is driven and the
 * timing is ours. Nothing is clicked: commands are intercepted anyway, and counted, because a
 * display rule that sends anything at all would be a much worse bug than the one it fixes.
 *
 * SAFE with a live config. Creates and deletes exactly:
 *   - dashboard:nh-e2e-fade                         (neohab:config)
 *   - managed items nh_e2e_fadecol, nh_e2e_fadedim  (never file-provided items)
 * Commands nothing and touches no other item.
 */
import { chromium } from 'playwright-core'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-fade'
const COLOR_ITEM = 'nh_e2e_fadecol'
const DIM_ITEM = 'nh_e2e_fadedim'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (n, v) =>
  fetch(itemUrl(n) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name: n, label }),
  })

/** Read the page through a shape that cannot throw, so a missing feature fails its own checks. */
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return chromium.launch({ channel, headless: true })
    } catch {}
  }
  return chromium.launch({ headless: true })
}

/**
 * Record every DISTINCT position a control comes to rest at, in order, starting with the one it
 * is already at - so `moves()` below is what the fader DID, not where it began. The sampler runs
 * in the page: polling over the wire costs a round trip per sample and would miss the window.
 */
const armSampler = (page, selector) =>
  page.evaluate((sel) => {
    window.__tl = []
    window.__iv = setInterval(() => {
      const v = [...document.querySelectorAll(sel)].map((i) => i.value).join(',')
      if (v !== '' && window.__tl[window.__tl.length - 1] !== v) window.__tl.push(v)
    }, 8)
  }, selector)
const readSampler = (page) =>
  probe(page, () => {
    clearInterval(window.__iv)
    return window.__tl
  })
/** Everything after the position the fader started at. */
const moves = (tl) => (Array.isArray(tl) ? tl.slice(1) : [])

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
const errs = []
let commands = 0
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
// Nothing here should command anything; if the display rule ever did, it dies here and is counted.
await page.route('**/rest/items/**', (r) => {
  if (r.request().method() !== 'POST') return r.continue()
  commands++
  return r.fulfill({ status: 200, body: '' })
})
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

try {
  /* ---------------- seed ---------------- */
  await makeItem(COLOR_ITEM, 'Color', 'NH E2E Fade Colour')
  await makeItem(DIM_ITEM, 'Dimmer', 'NH E2E Fade Dimmer')
  await putState(COLOR_ITEM, '0,0,0')
  await putState(DIM_ITEM, '0')
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-fade',
        name: 'E2E Fade',
        columns: 12,
        rowHeight: 'match',
        widgets: [
          {
            id: 'w-col',
            type: 'color',
            config: { item: COLOR_ITEM, label: 'Fader' },
            layout: { lg: { x: 0, y: 0, w: 4, h: 5 } },
          },
          {
            id: 'w-dim',
            type: 'slider',
            config: { item: DIM_ITEM, label: 'Level', min: 0, max: 100, step: 1 },
            layout: { lg: { x: 4, y: 0, w: 5, h: 2 } },
          },
        ],
      },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-fade')
  await page.waitForSelector('.nh-color input[type=range]', { timeout: 20000 })
  await sleep(1500) // let the first states arrive and settle

  /* ---------------- A. a single change is shown at once ---------------- */
  // The guard on the whole fix: calming a burst must not put a delay in front of an ordinary
  // change. Sampled tightly, so a value held for a window could not pass this.
  await armSampler(page, '.nh-color input[type=range]')
  await sleep(100)
  await putState(COLOR_ITEM, '200,80,60')
  await sleep(500)
  const quick = moves(await readSampler(page))
  ok(
    'an ordinary change reaches the fader straight away',
    quick.length === 1 && quick[0] === '200,80,60',
    'after 500ms: ' + quick.join(' > ')
  )
  await sleep(2000) // let the window that change opened close again

  /* ---------------- B. a fade moves the fader once ---------------- */
  // Measured on a DMX strip commanded 21,87,100 by an openHAB rule: the prediction, three
  // pre-fade echoes ~50ms later, and the real value ~1.03s on.
  await armSampler(page, '.nh-color input[type=range]')
  await sleep(100)
  await putState(COLOR_ITEM, '21,87,100')
  await sleep(50)
  await putState(COLOR_ITEM, '0.000,100,4.7059')
  await putState(COLOR_ITEM, '60.000,100,4.7059')
  await putState(COLOR_ITEM, '0,0,4.7059')
  await sleep(1025)
  await putState(COLOR_ITEM, '0.000,95.29400,100')
  await putState(COLOR_ITEM, '24.198,95.29400,100')
  await putState(COLOR_ITEM, '20.810,87.05900,100')
  await sleep(2500)
  const fade = moves(await readSampler(page))
  // The strip's prediction and the value it settles at round to the same slider positions, so
  // one move is the whole of what a person should see.
  ok('the fader moves once for a whole fade', fade.length === 1, fade.length + ' moves: ' + fade.join(' > '))
  ok(
    'and never through the near-black the strip reports mid-fade',
    !fade.some((v) => /^[0-9]+,[0-9]+,[0-5]$/.test(v)),
    fade.join(' > ')
  )
  ok('ending where the device settled', fade[fade.length - 1] === '21,87,100', String(fade[fade.length - 1]))

  /* ---------------- C. a fade that ends somewhere else still gets there ---------------- */
  // Without this, "moves once" would also pass on a display that froze on the first value.
  await armSampler(page, '.nh-color input[type=range]')
  await sleep(100)
  await putState(COLOR_ITEM, '120,100,50')
  await sleep(60)
  await putState(COLOR_ITEM, '0,0,4')
  await sleep(60)
  await putState(COLOR_ITEM, '300,20,90')
  await sleep(1000)
  await putState(COLOR_ITEM, '240,90,60')
  await sleep(2500)
  const land = moves(await readSampler(page))
  ok('a fader follows a fade to wherever it settles', land[land.length - 1] === '240,90,60', land.join(' > '))
  // Two moves by design: the value the change starts with, then the one it settles at. The
  // churn between them is what must never be drawn.
  ok(
    'without drawing the churn on the way',
    land.length === 2 && !land.includes('0,0,4') && !land.includes('300,20,90'),
    land.length + ' moves: ' + land.join(' > ')
  )

  /* ---------------- D. the same for a numeric slider ---------------- */
  // Same hook, so the same rule: a dimmer fading through its range must not drag the thumb
  // back and forth. 40 is what the rule asked for and where it lands; 0 and 97 are the fade.
  await armSampler(page, '.nh-fader__input')
  await sleep(100)
  await putState(DIM_ITEM, '40')
  await sleep(60)
  await putState(DIM_ITEM, '0')
  await sleep(400)
  await putState(DIM_ITEM, '97')
  await sleep(500)
  await putState(DIM_ITEM, '40')
  await sleep(2500)
  const dim = moves(await readSampler(page))
  ok('a slider does not chase a dimmer through its fade', dim.length === 1 && dim[0] === '40', dim.join(' > '))

  /* ---------------- E. nothing was commanded ---------------- */
  ok('a display rule commands nothing', commands === 0, 'POSTs=' + commands)
  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  /* ---------------- cleanup ---------------- */
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  for (const item of [COLOR_ITEM, DIM_ITEM]) {
    await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => c.uid === UID).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboard removed', left.length === 0, left.join(','))
  const items = []
  for (const item of [COLOR_ITEM, DIM_ITEM]) {
    const r = await fetch(itemUrl(item), { headers: AUTH }).catch(() => null)
    if (r && r.status === 200) items.push(item)
  }
  ok('cleanup: test items removed', items.length === 0, items.join(','))
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(
    '\n' +
      (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') +
      '  (' +
      (results.length - failed.length) +
      '/' +
      results.length +
      ')'
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}
