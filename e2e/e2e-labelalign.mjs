// Name alignment/position + custom-widget-editor placement e2e.
// SAFE with a live config: creates only dashboard:nh-e2e-lblalign plus widgetdef:nh-e2e-defa /
// widgetdef:nh-e2e-defb, deletes exactly those in cleanup.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-lblalign'
const DEF_A = 'widgetdef:nh-e2e-defa'
const DEF_B = 'widgetdef:nh-e2e-defb'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {}
}, TOKEN)

const labelGeo = (pg, scope, text) =>
  pg.evaluate(({ scope, text }) => {
    const cells = [...document.querySelectorAll(scope)]
    const cell = cells.find((c) => c.textContent.includes(text))
    if (!cell) return { found: false }
    const pick = (sel) => {
      const el = cell.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height,
               display: cs.display, padding: cs.padding }
    }
    return {
      found: true,
      row: pick('.nh-widget__label'),
      main: pick('.nh-widget__labelmain'),
      txt: pick('.nh-widget__labeltext'),
      aside: pick('.nh-widget__aside'),
      body: pick('.nh-widget__body'),
      widget: pick('.nh-widget'),
    }
  }, { scope, text })

const near = (a, b, tol = 2.5) => Math.abs(a - b) <= tol

try {
  const widgets = [
    { id: 'w-left', type: 'slider', config: { item: ITEMS.dimmer, label: 'Studio Trim' }, layout: { lg: { x: 0, y: 0, w: 4, h: 3 } } },
    { id: 'w-center', type: 'slider', config: { item: ITEMS.dimmer, label: 'Centered', labelAlign: 'center' }, layout: { lg: { x: 4, y: 0, w: 4, h: 3 } } },
    { id: 'w-right', type: 'slider', config: { item: ITEMS.dimmer, label: 'Righty', labelAlign: 'right' }, layout: { lg: { x: 8, y: 0, w: 4, h: 3 } } },
    { id: 'w-bottom', type: 'value', config: { item: ITEMS.dimmer, label: 'Bottom Name', labelPosition: 'bottom' }, layout: { lg: { x: 0, y: 3, w: 3, h: 3 } } },
    { id: 'w-cb', type: 'slider', config: { item: ITEMS.dimmer, label: 'CenterBottom', labelAlign: 'center', labelPosition: 'bottom' }, layout: { lg: { x: 3, y: 3, w: 3, h: 3 } } },
    { id: 'w-garb', type: 'slider', config: { item: ITEMS.dimmer, label: 'Garbage', labelAlign: 'diagonal' }, layout: { lg: { x: 6, y: 3, w: 3, h: 3 } } },
    { id: 'w-plain', type: 'label', config: { text: 'Plain text' }, layout: { lg: { x: 9, y: 3, w: 3, h: 3 } } },
    { id: 'w-chart', type: 'chart', config: { label: 'Chips Chart', labelAlign: 'center', series: [{ item: ITEMS.temperature }], period: '24h' }, layout: { lg: { x: 0, y: 6, w: 9, h: 4 } } },
    { id: 'w-tpl', type: 'template', config: { label: 'Tpl Name', labelAlign: 'right', template: '<div>hi</div>' }, layout: { lg: { x: 9, y: 6, w: 3, h: 4 } } },
    { id: 'w-shed', type: 'slider', config: { item: ITEMS.dimmer, label: 'Shed Top' }, layout: { lg: { x: 0, y: 10, w: 4, h: 2 } } },
    { id: 'w-shedb', type: 'slider', config: { item: ITEMS.dimmer, label: 'Shed Bottom', labelPosition: 'bottom' }, layout: { lg: { x: 4, y: 10, w: 4, h: 2 } } },
    { id: 'w-tiny', type: 'slider', config: { item: ITEMS.dimmer, label: 'TinyTop' }, layout: { lg: { x: 0, y: 12, w: 4, h: 1 } } },
    { id: 'w-tinyb', type: 'slider', config: { item: ITEMS.dimmer, label: 'TinyBottom', labelPosition: 'bottom' }, layout: { lg: { x: 4, y: 12, w: 4, h: 1 } } },
  ]
  // a killed earlier run's copies would refuse these POSTs and be tested in their place
  for (const uid of [UID, DEF_A, DEF_B]) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: 'nh-e2e-lblalign', name: 'E2E LabelAlign', columns: 12, rowHeight: 48, gap: 4, widgets },
    }),
  })
  ok('seed dashboard created', seed.ok, String(seed.status))
  for (const [uid, name] of [[DEF_A, 'E2E Def A'], [DEF_B, 'E2E Def B']]) {
    const r = await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        component: 'neohab:widgetdef',
        config: { version: 1, id: uid.slice('widgetdef:'.length), name, kind: 'template', template: '<div>x</div>', settings: [] },
      }),
    })
    ok('seed ' + uid, r.ok, String(r.status))
  }

  await page.goto(APP + '#/d/nh-e2e-lblalign', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-gcell', { timeout: 20000 })
  await page.waitForSelector('.nh-chart__chips', { timeout: 20000 })

  let g = await labelGeo(page, '.nh-gcell', 'Studio Trim')
  ok('default: name sits at the left edge', g.found && near(g.txt.l, g.main.l), JSON.stringify({ t: g.txt?.l, m: g.main?.l }))

  g = await labelGeo(page, '.nh-gcell', 'Centered')
  ok('center: name centered in the row', g.found && near((g.txt.l + g.txt.r) / 2, (g.main.l + g.main.r) / 2),
    `txtC=${g.found ? (g.txt.l + g.txt.r) / 2 : '-'} mainC=${g.found ? (g.main.l + g.main.r) / 2 : '-'}`)

  g = await labelGeo(page, '.nh-gcell', 'Righty')
  ok('right: name flush right', g.found && near(g.txt.r, g.main.r), JSON.stringify({ t: g.txt?.r, m: g.main?.r }))

  g = await labelGeo(page, '.nh-gcell', 'Garbage')
  ok('garbage labelAlign falls back to left', g.found && near(g.txt.l, g.main.l))

  g = await labelGeo(page, '.nh-gcell', 'Bottom Name')
  ok('bottom: label row renders under the body', g.found && g.row.t > g.body.t && near(g.row.b, g.widget.b, 3),
    JSON.stringify({ rowT: g.row?.t, bodyT: g.body?.t, rowB: g.row?.b, wB: g.widget?.b }))

  g = await labelGeo(page, '.nh-gcell', 'CenterBottom')
  ok('center+bottom compose', g.found && g.row.t > g.body.t && near((g.txt.l + g.txt.r) / 2, (g.main.l + g.main.r) / 2))

  g = await labelGeo(page, '.nh-gcell', 'Chips Chart')
  ok('chart aside (chips) still at the right end', g.found && !!g.aside && near(g.aside.r, g.row.r, 14), JSON.stringify({ a: g.aside?.r, row: g.row?.r }))
  ok('chart name centered before the aside, no overlap',
    g.found && g.main.r <= g.aside.l + 1 && near((g.txt.l + g.txt.r) / 2, (g.main.l + g.main.r) / 2, 3))

  g = await labelGeo(page, '.nh-gcell', 'Tpl Name')
  ok('template widget honors right alignment', g.found && near(g.txt.r, g.main.r))

  g = await labelGeo(page, '.nh-gcell', 'Shed Top')
  ok('short cell keeps top-label shed padding', g.found && g.row.padding === '4px 8px 0px', g.row?.padding)
  g = await labelGeo(page, '.nh-gcell', 'Shed Bottom')
  ok('short cell bottom-label pads the bottom instead', g.found && g.row.padding === '0px 8px 4px', g.row?.padding)
  ok('short-cell bottom label still under the body', g.found && g.row.t > g.body.t)

  g = await labelGeo(page, '.nh-gcell', 'TinyTop')
  ok('too-short cell hides a top label', g.found && g.row.display === 'none', g.row?.display)
  g = await labelGeo(page, '.nh-gcell', 'TinyBottom')
  ok('too-short cell hides a bottom label too', g.found && g.row.display === 'none', g.row?.display)

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit')
  await page.waitForFunction(() => document.querySelectorAll('.nh-cell').length > 0)
  await page.locator('.nh-cell:has-text("Studio Trim") .nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side')

  const alignSel = page.locator('#f-w-left-labelAlign')
  const posSel = page.locator('#f-w-left-labelPosition')
  ok('Name alignment select offered', (await alignSel.count()) === 1)
  ok('alignment defaults to "Theme default", never blank',
    (await alignSel.inputValue()) === '' && (await alignSel.locator('option').count()) === 4,
    JSON.stringify(await alignSel.inputValue()))
  ok('the theme-default option is named, not an empty row',
    ((await alignSel.locator('option').first().textContent()) || '').trim() === 'Theme default',
    await alignSel.locator('option').first().textContent())
  ok('Name position defaults to "Theme default"',
    (await posSel.inputValue()) === '' && (await posSel.locator('option').count()) === 3)

  const modeSel = page.locator('#f-w-left-labelMode')
  const hasMode = (await modeSel.count()) === 1
  ok('"Show the name" is offered on a widget with a header row', hasMode)
  const modeValue = hasMode ? await modeSel.inputValue() : null
  const modeOpts = hasMode ? await modeSel.locator('option').allTextContents() : []
  ok('it defaults to the title bar, never blank',
    modeValue === 'header' && modeOpts.length === 2,
    `${modeValue} / ${modeOpts.length}`)
  ok('the two choices read In the title bar / Not at all',
    JSON.stringify(modeOpts.map((o) => o.trim())) === JSON.stringify(['In the title bar', 'Not at all']),
    JSON.stringify(modeOpts))

  const named = () => page.locator('.nh-cell .nh-widget__labeltext:text-is("Studio Trim")').count()
  ok('the name is drawn to begin with', (await named()) === 1)
  if (hasMode) await modeSel.selectOption('none')
  await sleep(300)
  ok('"Not at all" removes the title bar, live', hasMode && (await named()) === 0)
  await page.keyboard.press('Control+z')
  await sleep(300)
  ok('undo brings the name back in one step', hasMode && (await modeSel.inputValue()) === 'header' && (await named()) === 1)

  const nameField = page.locator('#f-w-left-label')
  const typed = await nameField.inputValue()
  await nameField.fill('')
  await sleep(350)
  ok('with no name there is no "Show the name" choice', (await page.locator('#f-w-left-labelMode').count()) === 0)
  await nameField.fill(typed)
  await sleep(350)
  ok('typing a name brings the choice back', hasMode && (await page.locator('#f-w-left-labelMode').count()) === 1)
  await nameField.blur()
  await sleep(150)

  await alignSel.selectOption('center')
  await sleep(300)
  g = await labelGeo(page, '.nh-cell', 'Studio Trim')
  ok('live preview: center applies in edit mode', g.found && near((g.txt.l + g.txt.r) / 2, (g.main.l + g.main.r) / 2))

  await page.keyboard.press('Control+z')
  await sleep(300)
  g = await labelGeo(page, '.nh-cell', 'Studio Trim')
  ok('undo restores left in one step', g.found && near(g.txt.l, g.main.l))
  ok('undo reflected in the select', (await alignSel.inputValue()) === '')

  await alignSel.selectOption('right')
  await sleep(250)
  const rightGeo = await labelGeo(page, '.nh-cell', 'Studio Trim')
  await alignSel.selectOption('')
  await sleep(250)
  const backGeo = await labelGeo(page, '.nh-cell', 'Studio Trim')
  ok('the theme default can be chosen again, and applies',
    (await alignSel.inputValue()) === '' && rightGeo.found && backGeo.found &&
      !near(rightGeo.txt.l, backGeo.txt.l) && near(backGeo.txt.l, backGeo.main.l),
    JSON.stringify({ right: rightGeo.txt.l, back: backGeo.txt.l, main: backGeo.main.l }))

  await alignSel.selectOption('center')
  await posSel.selectOption('bottom')
  await sleep(300)
  g = await labelGeo(page, '.nh-cell', 'Studio Trim')
  ok('live preview: bottom applies in edit mode', g.found && g.row.t > g.body.t)

  await page.locator('.nh-cell:has-text("Plain text") .nh-cell__overlay').click()
  await page.waitForSelector('.nh-sheet--side:has-text("Label settings")')
  ok('label widget: no Name alignment/position fields',
    (await page.locator('.nh-sheet--side label:has-text("Name alignment")').count()) === 0 &&
    (await page.locator('.nh-sheet--side label:has-text("Name position")').count()) === 0)
  ok('label widget: no "Show the name" either', (await page.locator('.nh-sheet--side label:has-text("Show the name")').count()) === 0)
  ok('label widget: still offers Text size', (await page.locator('.nh-sheet--side label:has-text("Text size (%)")').count()) === 1)

  await page.click('button:has-text("Save")')
  await page.waitForSelector('.nh-grid--edit', { state: 'detached', timeout: 10000 })
  const comp = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  const saved = comp?.config?.widgets?.find?.((w) => w.id === 'w-left')
  ok('labelAlign/labelPosition persisted', saved?.config?.labelAlign === 'center' && saved?.config?.labelPosition === 'bottom',
    JSON.stringify({ a: saved?.config?.labelAlign, p: saved?.config?.labelPosition }))
  await page.waitForSelector('.nh-gcell')
  g = await labelGeo(page, '.nh-gcell', 'Studio Trim')
  ok('run mode shows the saved center+bottom', g.found && g.row.t > g.body.t && near((g.txt.l + g.txt.r) / 2, (g.main.l + g.main.r) / 2))

  const phone = await browser.newPage({ viewport: { width: 393, height: 851 } })
  phone.on('pageerror', (e) => errs.push(String(e.message)))
  phone.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  phone.on('dialog', (d) => d.accept())
  await phone.addInitScript((t) => {
    try { localStorage.setItem('neohab:apiToken', t); localStorage.setItem('neohab:themeOverride', 'dark') } catch {}
  }, TOKEN)
  await phone.goto(APP + '#/d/nh-e2e-lblalign', { waitUntil: 'domcontentloaded' })
  await phone.waitForSelector('.nh-grid--stacked .nh-gcell', { timeout: 20000 })
  g = await labelGeo(phone, '.nh-grid--stacked .nh-gcell', 'Centered')
  ok('stacked: center alignment applies', g.found && near((g.txt.l + g.txt.r) / 2, (g.main.l + g.main.r) / 2))
  g = await labelGeo(phone, '.nh-grid--stacked .nh-gcell', 'Righty')
  ok('stacked: right alignment applies', g.found && near(g.txt.r, g.main.r))
  g = await labelGeo(phone, '.nh-grid--stacked .nh-gcell', 'Bottom Name')
  ok('stacked: bottom position applies', g.found && g.row.t > g.body.t)

  await phone.click('[aria-label="Edit dashboard"]')
  await phone.waitForSelector('.nh-grid--stackedit', { timeout: 10000 })
  g = await labelGeo(phone, '.nh-grid--stackedit .nh-cell', 'Centered')
  ok('stacked edit surface: center applies', g.found && near((g.txt.l + g.txt.r) / 2, (g.main.l + g.main.r) / 2))
  g = await labelGeo(phone, '.nh-grid--stackedit .nh-cell', 'Bottom Name')
  ok('stacked edit surface: bottom applies', g.found && g.row.t > g.body.t)
  await phone.click('button:has-text("Exit")')
  await phone.close()

  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-deflist__row', { timeout: 15000 })

  const rowA = page.locator('.nh-deflist__row:has-text("E2E Def A")')
  const rowB = page.locator('.nh-deflist__row:has-text("E2E Def B")')
  ok('seeded def rows listed', (await rowA.count()) === 1 && (await rowB.count()) === 1)

  await rowA.locator('button:has-text("Edit")').click()
  await page.waitForSelector('.nh-defeditor')
  let place = await page.evaluate(() => {
    const ed = document.querySelector('.nh-defeditor')
    const rows = [...document.querySelectorAll('.nh-deflist__row')]
    const rowA = rows.find((r) => r.textContent.includes('E2E Def A'))
    const newBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('New template widget'))
    return {
      inList: !!ed.closest('.nh-deflist'),
      afterRowA: rowA?.nextElementSibling === ed,
      gap: ed.getBoundingClientRect().top - rowA.getBoundingClientRect().bottom,
      aboveNewBtns: ed.getBoundingClientRect().bottom <= newBtn.getBoundingClientRect().top + 1,
      name: ed.querySelector('#def-name')?.value,
    }
  })
  ok('editor renders directly under row A', place.inList && place.afterRowA, JSON.stringify(place))
  ok('editor visually adjacent to its row (above the New buttons)', place.gap >= 0 && place.gap < 20 && place.aboveNewBtns, 'gap=' + place.gap)
  ok('editor holds the clicked def', place.name === 'E2E Def A', place.name)

  await rowB.locator('button:has-text("Edit")').click()
  await sleep(200)
  place = await page.evaluate(() => {
    const eds = [...document.querySelectorAll('.nh-defeditor')]
    const rows = [...document.querySelectorAll('.nh-deflist__row')]
    const rowB = rows.find((r) => r.textContent.includes('E2E Def B'))
    return { count: eds.length, afterRowB: rowB?.nextElementSibling === eds[0], name: eds[0]?.querySelector('#def-name')?.value }
  })
  ok('Edit on another row moves the one editor under it', place.count === 1 && place.afterRowB && place.name === 'E2E Def B', JSON.stringify(place))

  await page.locator('.nh-defeditor button:has-text("Close")').click()
  ok('Close removes the editor', (await page.locator('.nh-defeditor').count()) === 0)

  await page.click('button:has-text("New template widget")')
  await page.waitForSelector('.nh-defeditor')
  place = await page.evaluate(() => {
    const ed = document.querySelector('.nh-defeditor')
    const newBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('New template widget'))
    return { inList: !!ed.closest('.nh-deflist'), belowNewBtns: ed.getBoundingClientRect().top >= newBtn.getBoundingClientRect().bottom - 1 }
  })
  ok('new-widget editor stays below the New buttons', !place.inList && place.belowNewBtns, JSON.stringify(place))
  await page.locator('.nh-defeditor button:has-text("Close")').click()
  ok('new-widget editor closes without saving', (await page.locator('.nh-defeditor').count()) === 0)

  ok('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
  for (const uid of [UID, DEF_A, DEF_B]) {
    const del = await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })
    const gone = (await fetch(NS + '/' + encodeURIComponent(uid), { headers: AUTH })).status === 404
    ok('cleanup: ' + uid + ' deleted', gone, 'del=' + del.status)
  }
}

const fails = results.filter((r) => !r.pass)
console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
process.exitCode = fails.length === 0 ? 0 : 1
