// Thermostat widget e2e: the room's temperature and the setpoint, buttons and a draggable ring for the
// setpoint, and a row of buttons for the mode.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-thermostat (neohab:config), managed
// items nh_e2e_thcur, nh_e2e_thset, nh_e2e_thmode.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-thermostat'
const CUR = 'nh_e2e_thcur'
const SP = 'nh_e2e_thset'
const MODE = 'nh_e2e_thmode'
const FAN = 'nh_e2e_thfan'
const AUX = 'nh_e2e_thaux'
const STAT = 'nh_e2e_thstat'
const CURC = 'nh_e2e_thcurc'
const SPC = 'nh_e2e_thsetc'
const NULLI = 'nh_e2e_thnull'
const LOW = 'nh_e2e_thlow'
const HIGH = 'nh_e2e_thhigh'
const ITEMS_MADE = [CUR, SP, MODE, FAN, AUX, STAT, CURC, SPC, NULLI, LOW, HIGH]

const HEAT = 'rgb(242, 106, 27)'
const COOL = 'rgb(31, 140, 238)'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
const putState = (n, v) =>
  fetch(itemUrl(n) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const getState = (n) =>
  fetch(itemUrl(n), { headers: AUTH })
    .then((r) => r.json())
    .then((j) => j.state)
    .catch(() => null)
const waitState = async (n, want, ms = 4000) => {
  const until = Date.now() + ms
  let s = null
  while (Date.now() < until) {
    s = await getState(n)
    if (s === want) return s
    await sleep(100)
  }
  return s
}
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name: n, label }),
  })

const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const full = { currentItem: CUR, setpointItem: SP, modeItem: MODE, fanItem: FAN, auxItem: AUX, statusItem: STAT, unit: '°F' }
const thermo = (label, look, config) => ({
  id: 'w-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  type: 'thermostat',
  config: { label, look, ...config },
})
const at = (w, x, y, wd, h) => ({ ...w, layout: { lg: { x, y: y * 3, w: wd, h: h * 3 } } })

const WIDGETS = [
  at(thermo('Arc', 'arc', full), 0, 0, 3, 3),
  at(thermo('Dial', 'dial', { currentItem: CURC, setpointItem: SPC, modeItem: MODE }), 3, 0, 3, 3),
  at(thermo('Disc', 'disc', { currentItem: CURC, setpointItem: SPC, statusItem: STAT }), 6, 0, 3, 3),
  at(thermo('Ring', 'ring', full), 9, 0, 3, 3),
  at(thermo('Bare', 'arc', { currentItem: CUR, setpointItem: SP, unit: '°F' }), 0, 3, 2, 2),
  at(thermo('Unknown', 'arc', { currentItem: CUR, setpointItem: NULLI, unit: '°F' }), 2, 3, 2, 2),
  {
    id: 'w-hostile',
    type: 'thermostat',
    config: { label: 'Hostile', look: 'constructor', currentItem: CUR, setpointItem: SP, min: 'abc', max: -5, step: 0, unit: 42, heatColor: {}, modeItem: 7, heatingStates: [] },
    layout: { lg: { x: 4, y: 9, w: 2, h: 6 } },
  },
  at(thermo('Short', 'arc', { ...full }), 6, 3, 3, 1),
  at(thermo('Narrow', 'dial', { currentItem: CURC, setpointItem: SPC }), 9, 3, 1, 2),
  at(thermo('Colors', 'arc', { ...full, heatColor: '#e0603c' }), 10, 3, 2, 2),
  at(thermo('Own range', 'arc', { currentItem: CUR, setpointItem: SP, min: 60, max: 80, step: 0.5, unit: '°F' }), 0, 5, 2, 2),
  at(thermo('Wide', 'arc', full), 2, 5, 6, 2),
  at(thermo('Ring small', 'ring', { currentItem: CUR, setpointItem: SP, modeItem: MODE, unit: '°F' }), 8, 5, 2, 2),
  at(thermo('Ends disc', 'disc', { currentItem: HIGH, setpointItem: LOW, min: 50, max: 90, step: 1, unit: '°F' }), 0, 7, 3, 3),
  at(thermo('Ends dial', 'dial', { currentItem: HIGH, setpointItem: LOW, min: 50, max: 90, step: 1, unit: '°F' }), 3, 7, 3, 3),
]

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const errs = []
const posts = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const url = m.location?.()?.url
  if (!isAppResource(url)) return
  errs.push(m.text() + (url ? ' <- ' + url : ''))
})
page.on('dialog', (d) => d.accept().catch(() => {}))
await page.route('**/rest/items/**', (r) => {
  const req = r.request()
  if (req.method() === 'POST') posts.push({ item: decodeURIComponent(req.url().split('/rest/items/')[1] ?? ''), body: req.postData() ?? '' })
  return r.continue()
})
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

const postsTo = (item) => posts.filter((p) => p.item === item)
const tile = (label) => page.locator(`.nh-widget:has(.nh-widget__labeltext:text-is("${label}"))`).first()
const reading = (label) =>
  probe(
    page,
    (l) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      if (!w) return null
      const sp = w.querySelector('.nh-thermo__sp')
      const num = sp?.querySelector('.nh-thermo__num')
      const frac = sp?.querySelector('.nh-thermo__frac')
      const on = (sel) => !!w.querySelector(sel + '.nh-thermo__mbtn--on')
      return {
        sp: num ? num.textContent.replace(frac?.textContent ?? '', '') : null,
        frac: frac?.textContent ?? null,
        unit: sp?.querySelector('.nh-thermo__unit')?.textContent ?? '',
        cur: w.querySelector('.nh-thermo__curline span')?.textContent ?? null,
        status: w.querySelector('.nh-thermo__status')?.textContent ?? null,
        upOff: !!w.querySelector('.nh-thermo__btn--up.nh-thermo__btn--off'),
        downOff: !!w.querySelector('.nh-thermo__btn--down.nh-thermo__btn--off'),
        upAria: w.querySelector('.nh-thermo__btn--up')?.getAttribute('aria-disabled') ?? null,
        heat: on('.nh-thermo__mbtn--heat'),
        cool: on('.nh-thermo__mbtn--cool'),
        fanAuto: on('.nh-thermo__mbtn--fan:first-child'),
        fanOn: on('.nh-thermo__mbtn--fan:last-child'),
        aux: on('.nh-thermo__mbtn--aux'),
        tone: [...w.querySelector('.nh-thermo')?.classList ?? []].find((c) => /^nh-thermo--(heat|cool|neutral)$/.test(c)) ?? null,
        error: !!w.closest('.nh-gcell')?.querySelector('.nh-widget--error'),
      }
    },
    label
  )
const waitFor = async (label, pred, ms = 5000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await reading(label)
    if (last && pred(last)) return last
    await sleep(100)
  }
  return last
}
const styleOf = (label, selector, props) =>
  probe(
    page,
    ({ l, selector, props }) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const el = w?.querySelector(selector)
      if (!el) return null
      const cs = getComputedStyle(el)
      const out = {}
      for (const p of props) out[p] = cs.getPropertyValue(p)
      return out
    },
    { l: label, selector, props }
  )
const square = (label) =>
  probe(
    page,
    (l) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const r = w?.querySelector('.nh-thermo__sq')?.getBoundingClientRect()
      return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
    },
    label
  )
const ringPoint = (sq, fraction, radius = 0.42) => {
  const a = ((135 + fraction * 270) * Math.PI) / 180
  return { x: sq.x + sq.w / 2 + sq.w * radius * Math.cos(a), y: sq.y + sq.h / 2 + sq.h * radius * Math.sin(a) }
}

try {
  await makeItem(CUR, 'Number', 'NH E2E Thermostat Room F')
  await makeItem(SP, 'Number', 'NH E2E Thermostat Setpoint F')
  await makeItem(MODE, 'String', 'NH E2E Thermostat Mode')
  await makeItem(FAN, 'String', 'NH E2E Thermostat Fan')
  await makeItem(AUX, 'Switch', 'NH E2E Thermostat Aux')
  await makeItem(STAT, 'String', 'NH E2E Thermostat Status')
  await makeItem(CURC, 'Number', 'NH E2E Thermostat Room C')
  await makeItem(SPC, 'Number', 'NH E2E Thermostat Setpoint C')
  await makeItem(NULLI, 'Number', 'NH E2E Thermostat Unknown')
  await makeItem(LOW, 'Number', 'NH E2E Thermostat Low')
  await makeItem(HIGH, 'Number', 'NH E2E Thermostat High')
  await putState(CUR, '68.3')
  await putState(SP, '72')
  await putState(MODE, 'HEAT')
  await putState(FAN, 'AUTO')
  await putState(AUX, 'OFF')
  await putState(STAT, 'heating')
  await putState(CURC, '19.5')
  await putState(SPC, '21.5')
  await putState(LOW, '50')
  await putState(HIGH, '90')
  await putState(NULLI, 'NULL')
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: 'nh-e2e-thermostat', name: 'E2E Thermostat', columns: 12, rowHeight: 28, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-thermostat')
  await page.waitForSelector('.nh-thermo', { timeout: 20000 }).catch(() => {})
  await sleep(1500)

  const roots = await probe(page, () => [...document.querySelectorAll('.nh-thermo')].map((s) => s.className))
  ok('every thermostat tile renders', Array.isArray(roots) && roots.length === WIDGETS.length, `${roots?.length} of ${WIDGETS.length}`)
  ok(
    'all four looks are on the page',
    ['arc', 'dial', 'disc', 'ring'].every((l) => roots?.some((c) => c.includes('nh-thermo--' + l))),
    (roots ?? []).join(' | ').slice(0, 200)
  )
  const errTiles = await probe(page, () => document.querySelectorAll('.nh-widget--error').length)
  ok('no tile fell back to the error boundary', errTiles === 0, 'error tiles=' + errTiles)

  const arc = await waitFor('Arc', (r) => r.sp === '72')
  ok('the arc reads the setpoint to its step, with its unit', arc?.sp === '72' && arc?.frac === null && arc?.unit === '°F', JSON.stringify(arc))
  ok("the room's temperature reads under it, with the unit", arc?.cur === '68 °F', JSON.stringify(arc))
  ok('the status item says what the system is doing', arc?.status === 'Heating', JSON.stringify(arc))
  ok('the mode, fan and aux buttons show what each item holds', arc?.heat === true && arc?.cool === false && arc?.fanAuto === true && arc?.fanOn === false && arc?.aux === false, JSON.stringify(arc))
  const fill = await styleOf('Arc', '.nh-thermo__fill', ['stroke'])
  ok('a thermostat set to heat draws its arc in the heating colour', arc?.tone === 'nh-thermo--heat' && fill?.stroke === HEAT, JSON.stringify({ tone: arc?.tone, fill }))
  const handle = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Arc')
    const h = w?.querySelector('.nh-thermo__handle')
    const d = w?.querySelector('.nh-thermo__curdot')
    return { cx: h ? Number(h.getAttribute('cx')) : null, cy: h ? Number(h.getAttribute('cy')) : null, dot: !!d }
  })
  ok('the handle sits where the setpoint is on the scale, and the room has its dot', handle && Math.abs(handle.cx - 59.8) < 1 && Math.abs(handle.cy - 9.2) < 1 && handle.dot, JSON.stringify(handle))
  const colored = await styleOf('Colors', '.nh-thermo__fill', ['stroke'])
  ok("a heating colour of the widget's own takes over from the default", colored?.stroke === 'rgb(224, 96, 60)', JSON.stringify(colored))

  const disc = await waitFor('Disc', (r) => r.sp === '21')
  ok('the disc sets the tenths apart as a raised digit', disc?.sp === '21' && disc?.frac === '5', JSON.stringify(disc))
  const marks = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Disc')
    return [...(w?.querySelectorAll('.nh-thermo__mark') ?? [])].map((m) => m.textContent)
  })
  ok("the disc marks both the setpoint and the room's temperature on its rim", JSON.stringify(marks) === JSON.stringify(['215', '195']), JSON.stringify(marks))
  const discFill = await styleOf('Disc', '.nh-thermo__disc', ['fill'])
  ok('a disc with no mode item takes its colour from what the system is doing', disc?.tone === 'nh-thermo--heat' && discFill?.fill === HEAT, JSON.stringify({ tone: disc?.tone, discFill }))
  const ticks = await probe(page, () => {
    const count = (l, sel) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      return w ? w.querySelectorAll(sel).length : -1
    }
    return { dial: count('Dial', '.nh-thermo__tick'), dialLit: count('Dial', '.nh-thermo__tick--lit'), disc: count('Disc', '.nh-thermo__tick--fine') }
  })
  ok('the dial and the disc are ringed with ticks, the dial lighting the ones between the two temperatures', ticks && ticks.dial >= 90 && ticks.dialLit > 0 && ticks.dialLit < ticks.dial && ticks.disc >= 140, JSON.stringify(ticks))
  const dial = await reading('Dial')
  ok('the dial reads the setpoint big with the unit under it', dial?.sp === '21' && dial?.frac === '5', JSON.stringify(dial))

  const ticksOf2 = (label) =>
    probe(
      page,
      (l) => {
        const parse = (s) => {
          const m = /rgba?\(([^)]+)\)/.exec(s)
          if (m) return m[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number)
          const c = /color\(srgb ([^)]+)\)/.exec(s)
          if (c) return c[1].trim().split(/[ /]+/).slice(0, 3).map((v) => Math.round(Number(v) * 255))
          return null
        }
        const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
        const ticks = [...(w?.querySelectorAll('.nh-thermo__tick:not(.nh-thermo__tick--sp):not(.nh-thermo__tick--cur)') ?? [])]
        if (ticks.length < 50) return null
        const at = (i) => parse(getComputedStyle(ticks[i]).stroke)
        return { n: ticks.length, first: at(0), mid: at(Math.floor(ticks.length / 2)), last: at(ticks.length - 1) }
      },
      label
    )
  const ramped = await ticksOf2('Ends disc')
  const solid = await ticksOf2('Disc')
  const cool = (c) => c && c[2] - c[0] > 80
  const warm = (c) => c && c[0] - c[2] > 80
  const apart = (a, b) => a && b && Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) > 40
  ok(
    'a face with no mode colours its ring by temperature, cool at the bottom of the scale and warm at the top',
    ramped && cool(ramped.first) && warm(ramped.last) && apart(ramped.mid, ramped.first) && apart(ramped.mid, ramped.last),
    JSON.stringify(ramped)
  )
  ok(
    'while a face that is heating keeps the white ticks its solid colour is drawn for',
    solid && solid.first && JSON.stringify(solid.first) === JSON.stringify(solid.last) && !cool(solid.first) && !warm(solid.first),
    JSON.stringify(solid)
  )

  const ring = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Ring')
    const amb = w?.querySelector('.nh-thermo__ambient .nh-thermo__num')
    return {
      ambient: amb?.textContent ?? null,
      set: w?.querySelector('.nh-thermo__set .nh-thermo__num')?.textContent ?? null,
      captions: [...(w?.querySelectorAll('.nh-thermo__caption') ?? [])].map((c) => c.textContent + ':' + getComputedStyle(c).textTransform),
      glyph: !!w?.querySelector('.nh-thermo__modecell .nh-thermo__glyph'),
      rim: w ? getComputedStyle(w.querySelector('.nh-thermo__rim')).stroke : null,
    }
  })
  ok(
    "the ring reads the room big under AMBIENT and the setpoint under SET, the mode's glyph beside it",
    ring?.ambient === '68' && ring?.set === '72' && ring?.captions.join(',') === 'Ambient:uppercase,Set:uppercase,Mode:uppercase' && ring?.glyph && ring?.rim === HEAT,
    JSON.stringify(ring)
  )

  const before = postsTo(SP).length
  await tile('Arc').locator('.nh-thermo__btn--up').click({ timeout: 5000 }).catch(() => {})
  await sleep(80)
  const quick = await reading('Arc')
  ok('a press shows its result at once', quick?.sp === '73', JSON.stringify(quick))
  await sleep(900)
  ok('and sends the value once the presses stop', postsTo(SP).length === before + 1 && postsTo(SP).at(-1)?.body === '73', JSON.stringify(postsTo(SP).slice(before)))
  ok('the item took it', (await getState(SP)) === '73', String(await getState(SP)))

  const before3 = postsTo(SP).length
  const down = tile('Arc').locator('.nh-thermo__btn--down')
  await down.click({ timeout: 5000 }).catch(() => {})
  await down.click({ timeout: 5000 }).catch(() => {})
  await down.click({ timeout: 5000 }).catch(() => {})
  await sleep(80)
  const triple = await reading('Arc')
  ok('three quick presses read three steps down', triple?.sp === '70', JSON.stringify(triple))
  await sleep(900)
  const burst = postsTo(SP).slice(before3)
  ok('and cost the item exactly one command, carrying the last value', burst.length === 1 && burst[0].body === '70', JSON.stringify(burst))

  await putState(SP, '90')
  const atMax = await waitFor('Arc', (r) => r.sp === '90', 12000)
  ok('at the maximum the up button is dimmed and marked disabled', atMax?.upOff === true && atMax?.upAria === 'true' && atMax?.downOff === false, JSON.stringify(atMax))
  const beforeMax = postsTo(SP).length
  await tile('Arc').locator('.nh-thermo__btn--up').click({ timeout: 2000, force: true }).catch(() => {})
  await sleep(700)
  ok('and pressing it sends nothing', postsTo(SP).length === beforeMax && (await reading('Arc'))?.sp === '90', 'posts=' + (postsTo(SP).length - beforeMax))

  const sq = await square('Arc')
  const beforeDrag = postsTo(SP).length
  if (sq) {
    const from = ringPoint(sq, 1)
    const to = ringPoint(sq, 0.25)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      const f = 1 - (0.75 * i) / 8
      const p = ringPoint(sq, f)
      await page.mouse.move(p.x, p.y)
      await sleep(30)
    }
    await page.mouse.move(to.x, to.y)
    await sleep(60)
    const during = await reading('Arc')
    ok('while dragging, the reading follows the pointer round the ring', during?.sp === '60', JSON.stringify(during))
    await page.mouse.up()
    await sleep(500)
  }
  const dragPosts = postsTo(SP).slice(beforeDrag)
  ok('releasing sends the value under the pointer, once', dragPosts.length === 1 && dragPosts[0].body === '60' && (await getState(SP)) === '60', JSON.stringify(dragPosts))

  const beforeCentre = postsTo(SP).length
  if (sq) {
    await page.mouse.move(sq.x + sq.w / 2, sq.y + sq.h / 2)
    await page.mouse.down()
    await page.mouse.move(sq.x + sq.w / 2 + 30, sq.y + sq.h / 2 + 10)
    await page.mouse.up()
    await sleep(500)
  }
  ok('a press on the face inside the ring commands nothing', postsTo(SP).length === beforeCentre && (await reading('Arc'))?.sp === '60', 'posts=' + (postsTo(SP).length - beforeCentre))

  await tile('Arc').locator('.nh-thermo__mbtn--cool').click({ timeout: 5000 }).catch(() => {})
  const cooled = await waitFor('Arc', (r) => r.cool === true && r.tone === 'nh-thermo--cool')
  const modePosts = postsTo(MODE)
  ok('pressing Cool commands the mode item with the cool command', modePosts.length === 1 && modePosts[0].body === 'COOL' && (await waitState(MODE, 'COOL')) === 'COOL', JSON.stringify(modePosts))
  await sleep(450)
  const coolFill = await styleOf('Arc', '.nh-thermo__fill', ['stroke'])
  ok('and the arc turns to the cooling colour with Cool lit', cooled?.cool === true && cooled?.heat === false && coolFill?.stroke === COOL, JSON.stringify({ cooled, coolFill }))
  const dialCool = await waitFor('Dial', (r) => r.tone === 'nh-thermo--cool')
  await sleep(450)
  const dialFill = await styleOf('Dial', '.nh-thermo__disc', ['fill'])
  ok('the dial on the same mode item turns blue too', dialCool?.tone === 'nh-thermo--cool' && dialFill?.fill === COOL, JSON.stringify({ tone: dialCool?.tone, dialFill }))

  await tile('Arc').locator('.nh-thermo__mbtn--fan').last().click({ timeout: 5000 }).catch(() => {})
  const fanned = await waitFor('Arc', (r) => r.fanOn === true)
  ok('pressing the fan On commands the fan item', postsTo(FAN).length === 1 && postsTo(FAN)[0].body === 'ON' && fanned?.fanOn === true && fanned?.fanAuto === false && (await waitState(FAN, 'ON')) === 'ON', JSON.stringify(postsTo(FAN)))

  await tile('Arc').locator('.nh-thermo__mbtn--aux').click({ timeout: 5000 }).catch(() => {})
  const auxOn = await waitFor('Arc', (r) => r.aux === true)
  ok('pressing Aux switches auxiliary heat on', postsTo(AUX).length === 1 && postsTo(AUX)[0].body === 'ON' && auxOn?.aux === true && (await waitState(AUX, 'ON')) === 'ON', JSON.stringify(postsTo(AUX)))
  await sleep(300)
  await tile('Arc').locator('.nh-thermo__mbtn--aux').click({ timeout: 5000 }).catch(() => {})
  const auxOff = await waitFor('Arc', (r) => r.aux === false)
  ok('and pressing it again switches it off', postsTo(AUX).length === 2 && postsTo(AUX)[1].body === 'OFF' && auxOff?.aux === false && (await waitState(AUX, 'OFF')) === 'OFF', JSON.stringify(postsTo(AUX)))

  await putState(STAT, 'idle')
  const idle = await waitFor('Arc', (r) => r.status === 'Idle')
  ok('a status of idle reads Idle', idle?.status === 'Idle', JSON.stringify(idle))
  await putState(STAT, 'cooling')
  const cooling = await waitFor('Arc', (r) => r.status === 'Cooling')
  const discCool = await waitFor('Disc', (r) => r.tone === 'nh-thermo--cool')
  ok('a status of cooling reads Cooling and colours a mode-less disc blue', cooling?.status === 'Cooling' && discCool?.tone === 'nh-thermo--cool', JSON.stringify({ status: cooling?.status, disc: discCool?.tone }))
  await putState(STAT, 'heating')

  const unknown = await reading('Unknown')
  ok('a setpoint with no state reads a dash with both buttons live and no handle', unknown?.sp === '-' && !unknown?.upOff && !unknown?.downOff, JSON.stringify(unknown))
  const noHandle = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Unknown')
    return { track: !!w?.querySelector('.nh-thermo__track'), handle: !!w?.querySelector('.nh-thermo__handle'), fill: !!w?.querySelector('.nh-thermo__fill') }
  })
  ok('and draws its track but neither a handle nor a fill for it', noHandle && noHandle.track && !noHandle.handle && !noHandle.fill, JSON.stringify(noHandle))
  await tile('Unknown').locator('.nh-thermo__btn--up').click({ timeout: 5000 }).catch(() => {})
  await sleep(900)
  ok('its first press starts it at the minimum of the Fahrenheit range', (await reading('Unknown'))?.sp === '50' && (await getState(NULLI)) === '50', String(await getState(NULLI)))
  const bare = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Bare')
    return { bar: !!w?.querySelector('.nh-thermo__bar'), status: !!w?.querySelector('.nh-thermo__status'), tone: w?.querySelector('.nh-thermo')?.className }
  })
  ok('a widget with only the two temperatures draws no button row, no status and a neutral face', bare && !bare.bar && !bare.status && /nh-thermo--neutral/.test(bare.tone ?? ''), JSON.stringify(bare))
  const own = await reading('Own range')
  ok('a widget with its own range uses it', own?.sp === '60' && own?.frac === '.0', JSON.stringify(own))

  const hostile = await reading('Hostile')
  ok('a configuration of the wrong shape everywhere still renders on the defaults', hostile && !hostile.error && hostile.sp !== null, JSON.stringify(hostile))
  const hostileLook = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Hostile')
    return w?.querySelector('.nh-thermo')?.className ?? ''
  })
  ok('and as the arc, which is what a new widget starts as', /nh-thermo--arc/.test(hostileLook), hostileLook)

  const sizes = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null)
    const box = (el) => (el ? el.getBoundingClientRect().width : null)
    const arc = find('Arc')
    const ring = find('Ring')
    const short = find('Short')
    const narrow = find('Narrow')
    const wide = find('Wide')
    const textDisplay = (w) => (w?.querySelector('.nh-thermo__mtext') ? getComputedStyle(w.querySelector('.nh-thermo__mtext')).display : null)
    return {
      sp: px(arc?.querySelector('.nh-thermo__sp')),
      status: px(arc?.querySelector('.nh-thermo__status')),
      cur: px(arc?.querySelector('.nh-thermo__curline')),
      btn: box(arc?.querySelector('.nh-thermo__btn--up')),
      mbtnText: textDisplay(arc),
      wideText: textDisplay(wide),
      wideRoot: box(wide?.querySelector('.nh-thermo')),
      arcRoot: box(arc?.querySelector('.nh-thermo')),
      caption: px(ring?.querySelector('.nh-thermo__caption')),
      shortBar: short?.querySelector('.nh-thermo__bar') ? getComputedStyle(short.querySelector('.nh-thermo__bar')).display : null,
      shortSp: short?.querySelector('.nh-thermo__sp') ? getComputedStyle(short.querySelector('.nh-thermo__sp')).display : null,
      narrowMark: narrow?.querySelector('.nh-thermo__mark') ? getComputedStyle(narrow.querySelector('.nh-thermo__mark')).display : null,
      narrowSp: px(narrow?.querySelector('.nh-thermo__sp')),
    }
  })
  ok('in a three-by-three tile the setpoint is big and the buttons finger-sized', sizes && sizes.sp >= 40 && sizes.btn >= 34, JSON.stringify(sizes))
  ok("the status line, the room's temperature and the ring's captions read at the tile's text size or more", sizes && sizes.status >= 15 && sizes.cur >= 15 && sizes.caption >= 15, JSON.stringify(sizes))
  ok(
    'the mode buttons carry their words in a tile with the width for them, and only the glyphs in one without',
    sizes && sizes.wideText !== null && sizes.wideText !== 'none' && sizes.mbtnText === 'none' && sizes.wideRoot > 27 * 16 && sizes.arcRoot < 27 * 16,
    JSON.stringify({ wide: sizes?.wideText, wideRoot: sizes?.wideRoot, arc: sizes?.mbtnText, arcRoot: sizes?.arcRoot })
  )
  ok('a short tile drops the button row and keeps the setpoint', sizes && sizes.shortBar === 'none' && sizes.shortSp !== 'none', JSON.stringify({ bar: sizes?.shortBar, sp: sizes?.shortSp }))
  ok("a one-column dial drops the rim's figures and keeps a readable setpoint", sizes && sizes.narrowMark === 'none' && sizes.narrowSp >= 15, JSON.stringify({ mark: sizes?.narrowMark, sp: sizes?.narrowSp }))

  const spill = await probe(page, () => {
    const out = []
    let scanned = 0
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const cr = cell.getBoundingClientRect()
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      const parts = cell.querySelectorAll('.nh-thermo *')
      if (parts.length) scanned++
      for (const el of parts) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const over = Math.max(cr.left - r.left, r.right - cr.right, cr.top - r.top, r.bottom - cr.bottom)
        if (over > 1) out.push(`${label}: ${el.className?.baseVal ?? el.className} past by ${over.toFixed(1)}px`)
      }
    }
    return { scanned, spills: [...new Set(out)] }
  })
  ok(
    'no look draws past its tile, short and narrow cells included',
    spill && spill.scanned === WIDGETS.length && spill.spills.length === 0,
    `scanned ${spill?.scanned} of ${WIDGETS.length}` + (spill?.spills.length ? ': ' + spill.spills.slice(0, 4).join(' | ') : '')
  )
  const overlap = await probe(page, () => {
    const R = (el) => el.getBoundingClientRect()
    const hits = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
    const defects = []
    let readings = 0
    let others = 0
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      const sp = cell.querySelector('.nh-thermo__sp, .nh-thermo__ambient')
      if (!sp) continue
      readings++
      const r = R(sp)
      for (const b of cell.querySelectorAll('.nh-thermo__btn, .nh-thermo__bar, .nh-thermo__mark')) {
        const q = R(b)
        if (q.width === 0 || q.height === 0) continue
        others++
        if (hits(q, r)) defects.push(`${label}: ${b.className?.baseVal ?? b.className} over the reading`)
      }
    }
    return { readings, others, defects: [...new Set(defects)] }
  })
  ok(
    'no button, bar or rim figure is drawn over the big reading',
    overlap && overlap.readings === WIDGETS.length && overlap.others > 20 && overlap.defects.length === 0,
    `${overlap?.readings} readings, ${overlap?.others} parts` + (overlap?.defects.length ? ': ' + overlap.defects.join(' | ') : '')
  )

  const dials = await probe(page, () => {
    const R = (el) => el.getBoundingClientRect()
    const hits = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const out = []
    let tiles = 0
    let ends = 0
    let parts = 0
    let smallest = Infinity
    let smallestAt = ''
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const root = cell.querySelector('.nh-thermo--dial, .nh-thermo--disc')
      if (!root) continue
      tiles++
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      if (/^Ends/.test(label)) ends++
      const buttons = [...root.querySelectorAll('.nh-thermo__btn')].filter((b) => R(b).width > 2)
      const ringParts = [...root.querySelectorAll('.nh-thermo__tick, .nh-thermo__mark')].filter((p) => {
        const r = R(p)
        return r.width > 0.5 || r.height > 0.5
      })
      parts += ringParts.length
      for (const b of buttons) {
        const w = Math.round(R(b).width)
        if (w < smallest) {
          smallest = w
          smallestAt = `${label}, face ${Math.round(root.querySelector('.nh-thermo__sq')?.getBoundingClientRect().width ?? 0)}px`
        }
        for (const p of ringParts) {
          if (hits(R(b), R(p))) {
            out.push(`${label}: ${p.getAttribute('class')?.split(' ').pop()} under a button`)
            break
          }
        }
      }
    }
    return { tiles, ends, parts, smallest, smallestAt, clashes: [...new Set(out)] }
  })
  ok(
    "a dial's buttons sit clear of its ring, figures at the ends of the scale included",
    dials && dials.ends === 2 && dials.parts > 400 && dials.clashes.length === 0,
    `${dials?.tiles} dials, ${dials?.ends} with a value at each end, ${dials?.parts} ring parts` +
      (dials?.clashes.length ? ': ' + dials.clashes.join(' | ') : '')
  )
  ok('and stay big enough to press', dials && dials.smallest >= 24, `smallest ${dials?.smallest}px (${dials?.smallestAt})`)

  const ringFit = await probe(page, () => {
    const out = []
    let tiles = 0
    let parts = 0
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const root = cell.querySelector('.nh-thermo--ring')
      const sq = root?.querySelector('.nh-thermo__sq')
      if (!sq) continue
      const box = sq.getBoundingClientRect()
      if (box.width < 60) continue
      tiles++
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      const inner = (box.width / 2) * (43.5 / 50)
      for (const el of root.querySelectorAll('.nh-thermo__btn, .nh-thermo__caption, .nh-thermo__temp, .nh-thermo__glyph')) {
        const b = el.getBoundingClientRect()
        if (b.width < 1 || b.height < 1) continue
        parts++
        const round = getComputedStyle(el).borderRadius.startsWith('50%')
        const far = round
          ? Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy) + b.width / 2
          : Math.max(
              ...[
                [b.left, b.top],
                [b.right, b.top],
                [b.left, b.bottom],
                [b.right, b.bottom],
              ].map(([x, y]) => Math.hypot(x - cx, y - cy))
            )
        if (far > inner) out.push(`${label}: ${el.getAttribute('class')?.split(' ').pop()} ${Math.round(far - inner)}px past the rim`)
      }
    }
    return { tiles, parts, out: [...new Set(out)] }
  })
  ok(
    'every part of the ring look sits inside its rim',
    ringFit && ringFit.tiles >= 2 && ringFit.parts >= 12 && ringFit.out.length === 0,
    `${ringFit?.tiles} rings, ${ringFit?.parts} parts` + (ringFit?.out.length ? ': ' + ringFit.out.join(' | ') : '')
  )

  await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Arc"))').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
  const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
  const styleSel = field('Style').locator('select').first()
  const styleN = await styleSel.locator('option').count().catch(() => -1)
  const styleV = await styleSel.inputValue().catch(() => null)
  ok('the panel offers four styles, none blank', styleN === 4 && styleV === 'arc', JSON.stringify({ styleN, styleV }))
  const pickers = await page.locator('.nh-sheet input[role="combobox"]').count().catch(() => -1)
  ok('and an item picker for each of the six items', pickers === 6, 'pickers=' + pickers)
  const heatCmd = await field('Heat command').count()
  const fanCmd = await field('Fan auto command').count()
  const states = await field('States that mean heating').count()
  ok('the command fields follow the items that are set', heatCmd === 1 && fanCmd === 1 && states === 1, JSON.stringify({ heatCmd, fanCmd, states }))
  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Bare"))').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  const heatCmdBare = await field('Heat command').count()
  const styleBare = await field('Style').count()
  ok('and hide where the item is not', heatCmdBare === 0 && styleBare === 1, JSON.stringify({ heatCmdBare, styleBare }))
  const wasEditing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const editing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  ok('leaving the editor without saving', wasEditing === true && editing === false, `was=${wasEditing} now=${editing}`)

  const target = tile('Arc')
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const b = await target.boundingBox().catch(() => null)
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await sleep(750)
    await page.mouse.up()
    await sleep(400)
  }
  const rows = await probe(page, () => [...document.querySelectorAll('.nh-detail__pickrow')].map((r) => r.textContent))
  ok('a hold on the face asks which of the six items', Array.isArray(rows) && rows.length === 6 && rows.includes(SP) && rows.includes(CUR), JSON.stringify(rows))
  await page.locator('.nh-detail__pickrow', { hasText: SP }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const sheet = await probe(page, () => {
    const r = document.querySelector('.nh-detail__panel input[type="range"]')
    return r ? { min: r.min, max: r.max, step: r.step } : null
  })
  ok("the setpoint's control is on the widget's own Fahrenheit scale, not 0-100", sheet && sheet.min === '50' && sheet.max === '90' && sheet.step === '1', JSON.stringify(sheet))
  await page.locator('.nh-detail__head button', { hasText: '‹' }).first().click({ timeout: 5000 }).catch(() => {})
  await sleep(400)
  await page.locator('.nh-detail__pickrow', { hasText: CUR }).first().click({ timeout: 5000 }).catch(() => {})
  let sensor = null
  for (let i = 0; i < 40 && !(sensor && sensor.value); i++) {
    await sleep(150)
    sensor = await probe(
      page,
      (cur) => {
        const panel = document.querySelector('.nh-detail__panel')
        if (!panel) return null
        const text = panel.textContent ?? ''
        const state = panel.querySelector('.nh-detail__facts dd')?.textContent ?? ''
        return { onItem: text.includes(cur), range: !!panel.querySelector('input[type="range"]'), buttons: panel.querySelectorAll('.nh-quickbtns button').length, value: /^68(\.3)?( .*)?$/.test(state), state }
      },
      CUR
    )
  }
  ok("the room's temperature gets its facts and no control at all", sensor && sensor.onItem && !sensor.range && sensor.buttons === 0 && sensor.value === true, JSON.stringify(sensor))
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(300)

  ok(
    'the two items the widget only reads never received a command',
    postsTo(SP).length >= 3 && postsTo(MODE).length > 0 && postsTo(CUR).length === 0 && postsTo(STAT).length === 0 && postsTo(CURC).length === 0,
    JSON.stringify({ sp: postsTo(SP).length, mode: postsTo(MODE).length, cur: postsTo(CUR).length, stat: postsTo(STAT).length })
  )
  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  for (const item of ITEMS_MADE) await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => c.uid === UID).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboard removed', left.length === 0, left.join(','))
  const itemsLeft = []
  for (const item of ITEMS_MADE) {
    const r = await fetch(itemUrl(item), { headers: AUTH }).catch(() => null)
    if (r && r.status === 200) itemsLeft.push(item)
  }
  ok('cleanup: test items removed', itemsLeft.length === 0, itemsLeft.join(','))
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
