// Operations theme + stat widget + tick-ring gauge + panel groups.
// SAFE with a live config: creates only dashboard:nh-e2e-ops and deletes exactly it, and the theme is
// applied through the per-device override so the `settings` component.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const ID = 'nh-e2e-ops'
const UID = 'dashboard:' + ID
const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => `${BASE}/rest/items/${n}`

async function itemState(name) {
  const r = await (await fetch(itemUrl(name), { headers: AUTH })).json()
  return r.state
}
async function sendItem(name, value) {
  await fetch(itemUrl(name), { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(value) })
}

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const rgb = (s) => {
  let m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s ?? '')
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(s ?? '')
  if (m) return [0, 1, 2].map((i) => Math.round(Number(m[i + 1]) * 255))
  m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((s ?? '').trim())
  if (m) return [1, 2, 3].map((i) => parseInt(m[i], 16))
  return null
}
const near = (a, b, tol = 8) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= tol)

const browser = await launch()
const errs = []
const initialDimmer = await itemState(ITEMS.dimmer)

const refValue = Number(await itemState(ITEMS.temperature))
const dimmerTarget = Number.isFinite(refValue) && refValue < 50 ? 90 : 5
const expectUp = dimmerTarget > refValue

async function newPage(theme = 'ops', viewport = { width: 1400, height: 1000 }) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('dialog', (d) => d.accept())
  await page.addInitScript(
    ({ t, th }) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
        if (th) localStorage.setItem('neohab:themeOverride', th)
        else localStorage.removeItem('neohab:themeOverride')
      } catch {}
    },
    { t: TOKEN, th: theme }
  )
  return page
}

const w = (id, type, x, y, ww, h, config) => ({ id, type, config, layout: { lg: { x, y, w: ww, h } } })

const probe = async (page, fn) => {
  try {
    return (await page.evaluate(fn)) ?? {}
  } catch (e) {
    errs.length && 0
    return { probeError: String(e && e.message).slice(0, 80) }
  }
}

try {
  await sendItem(ITEMS.dimmer, dimmerTarget)
  await sleep(900)

  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: ID,
        name: 'E2E Ops',
        columns: 16,
        rowHeight: 'match',
        gap: 0,
        widgets: [
          w('s-full', 'value', 0, 0, 4, 3, {
            style: 'stat',
            item: ITEMS.dimmer,
            label: 'Full',
            unit: '%',
            caption: 'Target',
            badge: 'DO',
            badgeColor: '#d0202a',
            trend: 'item',
            trendItem: ITEMS.temperature,
            goodDirection: expectUp ? 'up' : 'down',
            subItem: ITEMS.temperature,
            subCaption: 'Accounts',
            severity: [{ value: 200, color: '#a3ce4a' }],
            group: 'panel',
          }),
          w('s-bad', 'value', 4, 0, 4, 3, {
            style: 'stat',
            item: ITEMS.dimmer,
            label: 'Bad',
            trend: 'item',
            trendItem: ITEMS.temperature,
            goodDirection: expectUp ? 'down' : 'up',
            align: 'center',
            group: 'panel',
          }),
          w('s-flat', 'value', 8, 0, 4, 3, {
            style: 'stat',
            item: ITEMS.dimmer,
            label: 'Flat',
            trend: 'item',
            trendItem: ITEMS.dimmer,
            goodDirection: 'up',
            subText: 'fixed text',
            subCaption: 'Static',
          }),
          w('s-solo', 'value', 12, 0, 4, 3, {
            style: 'stat',
            item: ITEMS.dimmer,
            label: 'Solo',
            group: 'other',
            accentColor: '#ff00ff',
          }),

          w('g-ticks', 'dial', 0, 3, 5, 5, {
            item: ITEMS.dimmer,
            label: 'Response',
            style: 'ticks',
            centerLabel: true,
            readOnly: true,
            unit: '%',
            arcStart: 210,
            arcSweep: 300,
            ledCount: 40,
            color: '#a3ce4a',
            history: true,
            historyStyle: 'line',
            historyPeriod: '24h',
            accent: 'outlined',
          }),
          w('g-plain', 'dial', 5, 3, 5, 5, { item: ITEMS.dimmer, label: 'Plain', style: 'ticks', readOnly: true }),

          w('l-pill', 'label', 10, 3, 3, 1, { text: 'Pill', shape: 'pill', fill: '#e0242b', fontSize: 13 }),
          w('l-box', 'label', 13, 3, 3, 1, { text: 'Box', shape: 'box', fontSize: 13 }),
          w('l-left', 'label', 10, 4, 3, 1, { text: 'Left', align: 'left', fontSize: 13 }),
          w('l-right', 'label', 13, 4, 3, 1, { text: 'Right', align: 'right', fontSize: 13 }),

          w('sel-drop', 'selection', 10, 5, 6, 1, {
            item: ITEMS.switch,
            display: 'dropdown',
            choices: 'ON=Running\nOFF=Stopped',
          }),
          w('clk', 'clock', 10, 6, 6, 2, { mode: 'digital', hideTime: true, showDate: true, dateFormat: 'monthYear' }),
          w('btn', 'button', 0, 8, 4, 1, { label: 'Productivity', action: 'navigate', navigateDashboard: ID }),
        ],
      },
    }),
  })
  ok('seed: dashboard created', seed.status < 300, 'status=' + seed.status)

  const page = await newPage('ops')
  await page.goto(APP + '#/d/' + ID, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.nh-stat', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const theme = await probe(page, () => {
    const cs = getComputedStyle(document.documentElement)
    return {
      bg: cs.getPropertyValue('--nh-bg').trim(),
      primary: cs.getPropertyValue('--nh-primary').trim(),
      good: cs.getPropertyValue('--nh-good').trim(),
      bad: cs.getPropertyValue('--nh-bad').trim(),
      chart1: cs.getPropertyValue('--nh-chart-1').trim(),
      sheet: !!document.getElementById('nh-theme-css'),
      body: getComputedStyle(document.body).fontFamily,
      scheme: cs.colorScheme,
    }
  })
  ok('theme: tokens applied (near-black void, blue accent)', theme.bg === '#04070d' && theme.primary === '#3f7fe0',
    `bg=${theme.bg} primary=${theme.primary}`)
  ok('theme: stylesheet injected', theme.sheet)
  ok('theme: body set in Montserrat', /Montserrat/.test(theme.body), theme.body)
  ok('theme: good/bad inks defined as tokens', theme.good === '#a3ce4a' && theme.bad === '#ef2b34',
    `good=${theme.good} bad=${theme.bad}`)
  ok('theme: chart palette leads with the board green', theme.chart1 === '#a3ce4a', theme.chart1)

  const font = await probe(page, async () => {
    const faces = [...document.fonts].filter((f) => f.family.includes('Montserrat'))
    const res = await fetch('fonts/montserrat.woff2')
    return { faces: faces.map((f) => f.status), served: res.status, type: res.headers.get('content-type') }
  })
  ok('theme: the bundled Montserrat face actually loaded', (font.faces ?? []).includes('loaded'), JSON.stringify(font.faces ?? []))
  ok('theme: the font is served from the add-on', font.served === 200, 'status=' + font.served)

  const chrome = await probe(page, () => {
    const cell = (id) => [...document.querySelectorAll('.nh-gcell')].find((c) => c.textContent.includes(id))
    const wdg = document.querySelector('.nh-widget')
    const lbl = document.querySelector('.nh-widget__label')
    const btn = document.querySelector('.nh-button')
    const title = document.querySelector('.nh-dash__title')
    const grp = document.querySelector('.nh-group')
    const bare = cell('Left')?.querySelector('.nh-widget')
    const solo = cell('Solo')?.querySelector('.nh-widget')
    return {
      border: getComputedStyle(wdg).borderTopWidth,
      borderImage: getComputedStyle(wdg).borderImageSource,
      bg: getComputedStyle(wdg).backgroundColor,
      bodyImage: getComputedStyle(document.body).backgroundImage,
      tileImage: getComputedStyle(wdg).backgroundImage,
      soloBezel: solo ? getComputedStyle(solo).borderImageSource : null,
      bareBg: bare ? getComputedStyle(bare).backgroundColor : null,
      bareImage: bare ? getComputedStyle(bare).backgroundImage : null,
      bareBezel: bare ? getComputedStyle(bare).borderImageSource : null,
      groupShadow: grp ? getComputedStyle(grp).boxShadow : '',
      labelTransform: getComputedStyle(lbl).textTransform,
      labelSpacing: getComputedStyle(lbl).letterSpacing,
      titleTransform: title ? getComputedStyle(title).textTransform : 'n/a',
      btnBg: btn ? getComputedStyle(btn).backgroundColor : 'n/a',
      btnBorder: btn ? getComputedStyle(btn).borderTopWidth : 'n/a',
      btnColor: btn ? getComputedStyle(btn).color : 'n/a',
    }
  })
  const alpha = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*(0?\.\d+)\)/.exec(chrome.bg ?? '')
  ok('theme: a widget is a lit translucent panel, not a void or a flat card',
    !!alpha && Number(alpha[1]) > 0 && Number(alpha[1]) < 1, `bg=${chrome.bg}`)
  ok('theme: light falls across the panel (radial + linear gradient layers)',
    /radial-gradient/.test(chrome.tileImage ?? '') && /linear-gradient/.test(chrome.tileImage ?? ''),
    (chrome.tileImage ?? '').slice(0, 60))
  ok('theme: the bezel is a border gradient, not a flat hairline',
    /gradient/.test(chrome.borderImage ?? '') && chrome.border === '1px',
    `image=${(chrome.borderImage ?? '').slice(0, 40)} width=${chrome.border}`)
  ok('theme: the bezel follows the tile accent color', /gradient/.test(chrome.soloBezel ?? '') &&
    chrome.soloBezel !== chrome.borderImage, (chrome.soloBezel ?? '').slice(0, 60))
  ok('theme: a bare label stays bare', chrome.bareBg === 'rgba(0, 0, 0, 0)' &&
    chrome.bareImage === 'none' && chrome.bareBezel === 'none',
    `bg=${chrome.bareBg} image=${chrome.bareImage} bezel=${chrome.bareBezel}`)
  ok('theme: the page is lit, not a flat fill', /gradient/.test(chrome.bodyImage ?? ''),
    (chrome.bodyImage ?? '').slice(0, 60))
  ok('theme: a framed region is washed inward from its rule', /inset/.test(chrome.groupShadow ?? ''),
    (chrome.groupShadow ?? '').slice(0, 60))

  await page.goto(APP + '#/')
  await page.waitForSelector('.nh-tile', { timeout: 15000 }).catch(() => {})
  const home = await probe(page, () => {
    const tile = document.querySelector('.nh-tile:not(.nh-tile--new)')
    const plus = document.querySelector('.nh-tile--new')
    return {
      bezel: tile ? getComputedStyle(tile).borderImageSource : null,
      image: tile ? getComputedStyle(tile).backgroundImage : null,
      plusBezel: plus ? getComputedStyle(plus).borderImageSource : null,
      plusStyle: plus ? getComputedStyle(plus).borderTopStyle : null,
    }
  })
  ok('theme: home tiles are lit panels with the bezel', /gradient/.test(home.bezel ?? '') &&
    /radial-gradient/.test(home.image ?? ''), `bezel=${(home.bezel ?? '').slice(0, 40)}`)
  ok('theme: the new-dashboard tile keeps its dashed border', home.plusBezel === 'none' &&
    home.plusStyle === 'dashed', `bezel=${home.plusBezel} style=${home.plusStyle}`)
  await page.goto(APP + '#/d/' + ID)
  await page.waitForSelector('.nh-stat', { timeout: 15000 }).catch(() => {})
  ok('theme: micro-labels are spaced uppercase', chrome.labelTransform === 'uppercase' &&
    parseFloat(chrome.labelSpacing) > 1, `${chrome.labelTransform} ${chrome.labelSpacing}`)
  ok('theme: the masthead title is spaced uppercase', chrome.titleTransform === 'uppercase', chrome.titleTransform)
  ok('theme: buttons read as links, not plates', chrome.btnBg === 'rgba(0, 0, 0, 0)' && chrome.btnBorder === '0px' &&
    near(rgb(chrome.btnColor), [63, 127, 224]), `${chrome.btnBg} ${chrome.btnBorder} ${chrome.btnColor}`)

  const stat = await probe(page, () => {
    const cell = (id) => [...document.querySelectorAll('.nh-gcell')].find((c) => c.textContent.includes(id))
    const full = cell('Full')
    const q = (root, sel) => root?.querySelector(sel)
    const arrowOf = (name) => {
      const c = cell(name)
      const a = q(c, '.nh-stat__arrow')
      return a ? { cls: a.getAttribute('class'), fill: getComputedStyle(a).fill, label: a.getAttribute('data-direction') } : null
    }
    const token = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
    return {
      value: q(full, '.nh-stat__value')?.textContent,
      unit: q(full, '.nh-stat__unit')?.textContent,
      unitAlign: getComputedStyle(q(full, '.nh-stat__unit')).alignSelf,
      caption: q(full, '.nh-stat__caption')?.textContent,
      sub: q(full, '.nh-stat__subvalue')?.textContent,
      subCaption: q(full, '.nh-stat__subcaption')?.textContent,
      badge: q(full, '.nh-stat__badge')?.textContent,
      badgeBg: getComputedStyle(q(full, '.nh-stat__badge')).backgroundColor,
      mainColor: getComputedStyle(q(full, '.nh-stat__main')).color,
      valueFont: parseFloat(getComputedStyle(q(full, '.nh-stat__value')).fontSize),
      ghost: q(full, '.nh-stat__value')?.getAttribute('data-ghost'),
      good: arrowOf('Full'),
      bad: arrowOf('Bad'),
      flat: arrowOf('Flat'),
      flatSub: q(cell('Flat'), '.nh-stat__subvalue')?.textContent,
      goodToken: token('--nh-good'),
      badToken: token('--nh-bad'),
      centered: getComputedStyle(q(cell('Bad'), '.nh-stat')).alignItems,
      leftAligned: getComputedStyle(q(cell('Full'), '.nh-stat')).alignItems,
    }
  })
  ok('stat: the reading renders', stat.value === String(dimmerTarget), `got=${stat.value}`)
  ok('stat: the unit is set apart and raised', stat.unit === '%' && stat.unitAlign === 'flex-start',
    `${stat.unit} ${stat.unitAlign}`)
  ok('stat: caption renders', stat.caption === 'Target', stat.caption)
  ok('stat: the second reading and its caption render', stat.sub !== undefined && stat.subCaption === 'Accounts',
    `${stat.sub} / ${stat.subCaption}`)
  ok('stat: fixed text works as the second reading', stat.flatSub === 'fixed text', stat.flatSub)
  ok('stat: the badge renders in its own color', stat.badge === 'DO' && near(rgb(stat.badgeBg), [208, 32, 42]),
    `${stat.badge} ${stat.badgeBg}`)
  ok('stat: a matching color stop inks the reading', near(rgb(stat.mainColor), [163, 206, 74]), stat.mainColor)
  ok('stat: readings size with the cell, not a fixed em', stat.valueFont > 30, stat.valueFont + 'px')
  ok('stat: digits carry the segment-display metadata', /^8+$/.test(stat.ghost ?? ''), String(stat.ghost))
  ok('stat: a move the good way is drawn in the theme’s good ink',
    stat.good && /--good/.test(stat.good.cls) && near(rgb(stat.good.fill), rgb(stat.goodToken)),
    `${stat.good?.fill} vs ${stat.goodToken}`)
  ok('stat: the same move judged the other way is drawn in its bad ink',
    stat.bad && /--bad/.test(stat.bad.cls) && near(rgb(stat.bad.fill), rgb(stat.badToken)),
    `${stat.bad?.fill} vs ${stat.badToken}`)
  ok('stat: the arrow points the way the reading moved',
    stat.good?.label === (expectUp ? 'up' : 'down') && stat.bad?.label === (expectUp ? 'up' : 'down'),
    `${stat.good?.label}/${stat.bad?.label} expectUp=${expectUp}`)
  ok('stat: no movement is neither good nor bad', stat.flat && /--neutral/.test(stat.flat.cls) &&
    stat.flat.label === 'flat', JSON.stringify(stat.flat))
  ok('stat: alignment is per widget', stat.centered === 'center' && stat.leftAligned !== 'center',
    `${stat.centered} vs ${stat.leftAligned}`)

  await page.waitForSelector('.nh-dial--ticks .nh-gauge__spark', { timeout: 15000 }).catch(() => {})
  const ring = await probe(page, () => {
    const cell = (t) => [...document.querySelectorAll('.nh-gcell')].find((c) => c.textContent.includes(t))
    const svg = document.querySelector('.nh-dial--ticks')
    const ticked = cell('Response')
    const plain = document.querySelectorAll('.nh-dial--ticks')[1]
    const lit = [...svg.querySelectorAll('.nh-gauge__tklit')]
    const unlit = [...svg.querySelectorAll('.nh-gauge__tkmark')]
    const name = svg.querySelector('.nh-gauge__name')
    const value = svg.querySelector('.nh-gauge__value')
    const unit = svg.querySelector('.nh-gauge__unit--raised')
    const spark = svg.querySelector('.nh-gauge__spark')
    return {
      styled: !!svg,
      lit: lit.length,
      unlit: unlit.length,
      litStroke: lit.length ? lit[0].getAttribute('stroke') : null,
      litRule: lit.length ? getComputedStyle(lit[0]).stroke : null,
      unlitRule: unlit.length ? getComputedStyle(unlit[0]).stroke : null,
      rims: svg.querySelectorAll('.nh-gauge__rim').length,
      rimPaint: svg.querySelector('.nh-gauge__rim') ? getComputedStyle(svg.querySelector('.nh-gauge__rim')).stroke : '',
      facePaint: svg.querySelector('.nh-gauge__face2') ? getComputedStyle(svg.querySelector('.nh-gauge__face2')).fill : '',
      disc: svg.querySelectorAll('.nh-gauge__center').length,
      name: name?.textContent,
      nameY: name ? Number(name.getAttribute('y')) : null,
      valueY: value ? Number(value.getAttribute('y')) : null,
      valueFill: value ? getComputedStyle(value).fill : null,
      unit: unit?.textContent,
      unitRaised: unit ? Number(unit.getAttribute('dy')) : null,
      spark: !!spark,
      sparkPath: spark?.getAttribute('d')?.slice(0, 1),
      sparkStroke: spark ? getComputedStyle(spark).stroke : null,
      headerSuppressed: !ticked.querySelector('.nh-widget__labeltext'),
      plainHasHeader: !!plain.closest('.nh-gcell').querySelector('.nh-widget__labeltext'),
      plainHasName: !!plain.querySelector('.nh-gauge__name'),
      plainHasSpark: !!plain.querySelector('.nh-gauge__spark'),
      plainDisc: plain.querySelectorAll('.nh-gauge__center').length,
    }
  })
  ok('gauge: the tick ring renders', ring.styled === true)
  ok('gauge: it is a ring of radial marks', (ring.lit ?? 0) + (ring.unlit ?? 0) === 40, `lit=${ring.lit} unlit=${ring.unlit}`)
  ok('gauge: lit marks take the value color', ring.litStroke === '#a3ce4a' && near(rgb(ring.litRule), [163, 206, 74]),
    `attr=${ring.litStroke} computed=${ring.litRule}`)
  ok('gauge: unlit marks do not', (ring.unlit ?? 0) > 0 && !near(rgb(ring.unlitRule), [163, 206, 74]),
    `unlit=${ring.unlit} ${ring.unlitRule}`)
  ok('gauge: hairline rims bracket the marks', ring.rims === 2, 'rims=' + ring.rims)
  ok('gauge: the rim is shaded, not a flat stroke', /url\(/.test(ring.rimPaint ?? ''), ring.rimPaint)
  ok('gauge: the face carries its own light', /url\(/.test(ring.facePaint ?? ''), ring.facePaint)
  ok('gauge: the face is open - no center disc', ring.disc === 0 && ring.plainDisc === 0)
  ok('gauge: the name is drawn inside the face, above the reading', ring.name === 'Response' &&
    ring.nameY < ring.valueY, `${ring.name} nameY=${ring.nameY} valueY=${ring.valueY}`)
  ok('gauge: naming the face takes the name out of the tile header', ring.headerSuppressed && ring.plainHasHeader,
    `inside=${ring.headerSuppressed} header=${ring.plainHasHeader}`)
  ok('gauge: the unit rides raised beside the reading', ring.unit === '%' && ring.unitRaised < 0,
    `${ring.unit} dy=${ring.unitRaised}`)
  ok('gauge: the reading is inked like the ring', near(rgb(ring.valueFill), [163, 206, 74]), ring.valueFill)
  ok('gauge: the sparkline draws a path', ring.spark && ring.sparkPath === 'M', String(ring.sparkPath))
  ok('gauge: the theme inks the trace as chrome', near(rgb(ring.sparkStroke), [255, 255, 255]), ring.sparkStroke)
  ok('gauge: without the options, no name in the face and no trace',
    ring.plainHasHeader === true && !ring.plainHasName && !ring.plainHasSpark,
    `header=${ring.plainHasHeader} name=${ring.plainHasName} spark=${ring.plainHasSpark}`)

  const groups = await probe(page, () => {
    const frames = [...document.querySelectorAll('.nh-group')].map((g) => {
      const cs = getComputedStyle(g)
      return {
        col: (cs.gridColumnStart + ' / ' + cs.gridColumnEnd).replace(/\s+/g, ' '),
        row: (cs.gridRowStart + ' / ' + cs.gridRowEnd).replace(/\s+/g, ' '),
        border: cs.borderTopWidth,
        color: cs.borderTopColor,
        pointer: cs.pointerEvents,
        rect: g.getBoundingClientRect(),
      }
    })
    const solo = [...document.querySelectorAll('.nh-gcell')].find((c) => c.textContent.includes('Solo'))
    const kids = [...(document.querySelector('.nh-grid')?.children ?? [])]
    const lastCell = kids.map((k) => k.classList.contains('nh-gcell')).lastIndexOf(true)
    const firstFrame = kids.map((k) => k.classList.contains('nh-group')).indexOf(true)
    return { frames, soloRect: solo?.getBoundingClientRect(), paintedOver: firstFrame > lastCell && firstFrame >= 0 }
  })
  ok('groups: one frame per named group', (groups.frames ?? []).length === 2, 'frames=' + (groups.frames ?? []).length)
  ok('groups: the frame encloses every member of its group',
    (groups.frames ?? [])[0]?.col === '1 / span 8' && (groups.frames ?? [])[0]?.row === '1 / span 3', JSON.stringify((groups.frames ?? [])[0]?.col))
  ok('groups: a lone member is framed on its own',
    (groups.frames ?? [])[1]?.col === '13 / span 4', String((groups.frames ?? [])[1]?.col))
  ok('groups: the rule is drawn in the accent color', near(rgb((groups.frames ?? [])[0]?.color), [63, 127, 224]) &&
    near(rgb((groups.frames ?? [])[1]?.color), [255, 0, 255]), `${(groups.frames ?? [])[0]?.color} / ${(groups.frames ?? [])[1]?.color}`)
  ok('groups: the rule is painted over the tiles it encloses', groups.paintedOver === true,
    String(groups.paintedOver))
  ok('groups: the frame never intercepts the pointer',
    (groups.frames ?? []).length > 0 && groups.frames.every((f) => f.pointer === 'none'))
  ok('groups: an ungrouped widget is in no frame',
    (groups.frames ?? []).length > 0 && !!groups.soloRect &&
      groups.frames.every((f) => Math.abs(f.rect.width - groups.soloRect.width) < 400 ||
        f.rect.left > groups.soloRect.left + 5 || f.rect.right < groups.soloRect.right - 5))

  const bits = await probe(page, () => {
    const cell = (t) => [...document.querySelectorAll('.nh-gcell')].find((c) => c.textContent.includes(t))
    const chip = (t) => cell(t)?.querySelector('.nh-label')
    const outlined = document.querySelector('.nh-acc-outlined .nh-widget')
    const sel = document.querySelector('.nh-selection__select')
    const clock = document.querySelector('.nh-clock')
    return {
      outlinedBorder: outlined ? getComputedStyle(outlined).borderTopColor : null,
      pillRadius: getComputedStyle(chip('Pill')).borderRadius,
      pillBg: getComputedStyle(chip('Pill')).backgroundColor,
      boxRadius: getComputedStyle(chip('Box')).borderRadius,
      boxBg: getComputedStyle(chip('Box')).backgroundColor,
      leftAlign: getComputedStyle(chip('Left')).alignSelf,
      rightAlign: getComputedStyle(chip('Right')).alignSelf,
      selTag: sel?.tagName,
      selOptions: sel ? [...sel.options].map((o) => o.text) : [],
      selValue: sel?.value,
      selBorderBottom: sel ? getComputedStyle(sel).borderBottomWidth : null,
      selBorderTop: sel ? getComputedStyle(sel).borderTopWidth : null,
      clockTime: !!clock?.querySelector('.nh-clock__time'),
      clockDate: clock?.querySelector('.nh-clock__date')?.textContent,
      clockDateOnly: !!clock?.querySelector('.nh-clock__date--only'),
    }
  })
  ok('accent: outlined draws the rule in the accent color', near(rgb(bits.outlinedBorder), [63, 127, 224]),
    bits.outlinedBorder)
  ok('label: a pill is fully rounded and takes its own fill', bits.pillRadius === '999px' &&
    near(rgb(bits.pillBg), [224, 36, 43]), `${bits.pillRadius} ${bits.pillBg}`)
  ok('label: a box follows the theme radius and the theme accent', bits.boxRadius === '0px' &&
    near(rgb(bits.boxBg), [63, 127, 224]), `${bits.boxRadius} ${bits.boxBg}`)
  ok('label: alignment moves the text within its tile', bits.leftAlign === 'flex-start' && bits.rightAlign === 'flex-end',
    `${bits.leftAlign}/${bits.rightAlign}`)
  ok('selection: the dropdown renders as a select with its choices', bits.selTag === 'SELECT' &&
    (bits.selOptions ?? []).includes('Running') && (bits.selOptions ?? []).includes('Stopped'), JSON.stringify(bits.selOptions))
  ok('selection: it shows the live state as the current choice', bits.selValue === (await itemState(ITEMS.switch)),
    bits.selValue)
  ok('selection: the theme sets it as an underlined field', bits.selBorderTop === '0px' &&
    bits.selBorderBottom === '1px', `top=${bits.selBorderTop} bottom=${bits.selBorderBottom}`)
  ok('clock: date-only hides the time', !bits.clockTime && bits.clockDateOnly)
  ok('clock: the month-and-year format writes both', /\d{4}/.test(bits.clockDate ?? '') &&
    /[A-Za-z]{3,}/.test(bits.clockDate ?? ''), bits.clockDate)

  const dark = await newPage('dark')
  await dark.goto(APP + '#/d/' + ID, { waitUntil: 'load', timeout: 60000 })
  await dark.waitForSelector('.nh-stat', { timeout: 20000 }).catch(() => {})
  await dark.waitForTimeout(1200)
  const darkBits = await probe(dark, () => {
    const v = document.querySelector('.nh-stat__value')
    const wdg = document.querySelector('.nh-widget')
    return {
      ghostDrawn: getComputedStyle(v, '::before').content,
      font: parseFloat(getComputedStyle(v).fontSize),
      border: getComputedStyle(wdg).borderTopWidth,
      groups: document.querySelectorAll('.nh-group').length,
    }
  })
  ok('dark: the segment ghost is drawn by no other theme', darkBits.ghostDrawn === 'none', darkBits.ghostDrawn)
  ok('dark: the stat keeps a plain em-sized reading', darkBits.font > 10 && darkBits.font < 40, darkBits.font + 'px')
  ok('dark: tiles keep their box', darkBits.border === '1px', darkBits.border)
  ok('dark: panel groups are not theme-specific', darkBits.groups === 2, 'frames=' + darkBits.groups)
  await dark.close()

  try {
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForSelector('.nh-grid--edit .nh-cell', { timeout: 15000 })
    await page.locator('.nh-cell').first().locator('.nh-cell__grip').click()
    await page.waitForSelector('.nh-sheet .nh-form', { timeout: 10000 })
  } catch {
    // a build without the editor affordances fails the three checks below,
  }
  const form = await probe(page, () => {
    const labels = [...document.querySelectorAll('.nh-sheet .nh-field__label')].map((l) => l.textContent)
    const accent = [...document.querySelectorAll('.nh-sheet select')].map((s) => [...s.options].map((o) => o.text))
    return { labels, accent: accent.flat() }
  })
  ok('editor: the stat widget brings its own settings', (form.labels ?? []).includes('Trend arrow'),
    (form.labels ?? []).join(',').slice(0, 100))
  ok('editor: every widget offers the panel group', (form.labels ?? []).includes('Panel group'))
  ok('editor: the tile accent offers Outlined', (form.accent ?? []).includes('Outlined'))
  await page.click('button:has-text("Exit")').catch(() => {})
  await page.waitForTimeout(600)

  ok('console: clean', errs.length === 0, errs.slice(0, 3).join(' | '))
  await page.close()
} catch (e) {
  ok('suite ran to completion', false, String(e && e.message).slice(0, 200))
} finally {
  const del = await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH })
  const list = await (await fetch(NS, { headers: AUTH })).json()
  const mine = list.filter((c) => c.uid === UID).map((c) => c.uid)
  ok('cleanup: ' + UID + ' deleted', mine.length === 0, `del=${del.status} left=${mine.join(',')}`)

  await sendItem(ITEMS.dimmer, initialDimmer)
  await sleep(800)
  const restored = await itemState(ITEMS.dimmer)
  ok('dimmer restored to recorded initial', String(restored) === String(initialDimmer),
    `got=${restored} want=${initialDimmer}`)
  await browser.close()
}

const fails = results.filter((r) => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
process.exitCode = fails.length === 0 ? 0 : 1
