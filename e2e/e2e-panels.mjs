/**
 * Every widget's settings panel, checked as a class rather than one widget at a time.
 *
 * The panel is a fixed 391px column on a desktop, and a control that does not fit is not a
 * cosmetic problem: it is a control the user cannot reach. Both of these shipped in the floor
 * plan and both were reported rather than caught -
 *
 *   - the placement sheet's "Add" button was pushed off the panel's right edge, because the item
 *     picker wraps an <input>, whose min-content size is its default width, and a flex item is
 *     floored at that;
 *   - the plan image field was crushed to a few characters, because the row that is comfortable
 *     in the 720px Settings form has no room for everything on one line here.
 *
 * A select with nothing selected renders BLANK (SettingsPanel adds an empty placeholder row when
 * no option matches), which reads as broken; the schema half of that rule is a unit check, and
 * this is the rendered half - it also covers the universal fields the panel appends itself.
 *
 * The widget list comes from the palette, so a widget added later is covered without touching
 * this file.
 *
 * The last section asks the same question about what a widget DRAWS: one of every type in a
 * short tile, and nothing may be painted outside it. That is the registry form of a report about
 * two widgets ("terribly cropped instead of shrank" in a landscape phone's row), and asking it
 * across the palette found a third - the media player's transport, three fixed circles wanting
 * 192px in a row that gives them 135.
 *
 * SAFE with a live config: creates and deletes exactly dashboard:nh-e2e-panels and
 * dashboard:nh-e2e-panelfit, saves NOTHING through the app (so no restore point is minted), and
 * commands nothing - the palette widgets are added unconfigured, and the short-tile ones are
 * bound so they render a control but are never clicked, with commands intercepted besides.
 */
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-panels'
const PANEL_MIN_CONTROL = 110 // px: narrower than this is a box you cannot read or type into

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => ({}))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

/**
 * Runs IN THE PAGE. Reports every control in the settings panel that is outside the panel's
 * content box, too narrow to use, or - for a select - showing an empty row because nothing it
 * offers matches the value in effect.
 */
const measurePanel = (min) => {
  const panel = document.querySelector('.nh-sheet')
  if (!panel) return null
  const pr = panel.getBoundingClientRect()
  const cs = getComputedStyle(panel)
  const inner = { left: pr.left + (parseFloat(cs.paddingLeft) || 0), right: pr.right - (parseFloat(cs.paddingRight) || 0) }
  const label = (el) => {
    const field = el.closest('.nh-field, .nh-chartcard__cell, label')
    return field?.querySelector('.nh-field__label')?.textContent?.trim() || el.id || el.tagName.toLowerCase()
  }
  const clipped = []
  const crushed = []
  const blank = []
  const controls = [...panel.querySelectorAll('input, select, textarea, button')]
  for (const el of controls) {
    if (el.type === 'hidden' || el.type === 'file' || el.hidden) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue // not rendered
    if (r.right > inner.right + 1 || r.left < inner.left - 1) {
      clipped.push(`${label(el)} (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(inner.left)}..${Math.round(inner.right)})`)
    }
    // a box you type into has to be wide enough to read; checkboxes, colour swatches and icon
    // buttons are meant to be small
    const typed =
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      (el.tagName === 'INPUT' && ['text', 'number', 'search', 'url', ''].includes(el.type))
    if (typed && r.width < min) crushed.push(`${label(el)} ${Math.round(r.width)}px`)
    if (el.tagName === 'SELECT' && el.selectedOptions[0] && el.selectedOptions[0].textContent.trim() === '') {
      blank.push(label(el))
    }
  }
  return { controls: controls.length, overflow: panel.scrollWidth - panel.clientWidth, clipped, crushed, blank }
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // Name the resource - "Failed to load resource" alone is a failure nobody can act on - and
  // ignore the ones that belong to the user's own configuration. The palette lists their custom
  // widgets, whose icons legitimately point at iconsets and hosts this server does not have.
  const at = m.location?.()?.url
  if (!isAppResource(at)) return
  errs.push(m.text() + (at ? ' <- ' + at : ''))
})
page.on('dialog', (d) => d.accept())
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark') // assert against the default theme's metrics
  } catch {}
}, TOKEN)

try {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: 'nh-e2e-panels', name: 'E2E Panels', columns: 12, rowHeight: 'match', widgets: [] },
    }),
  })
  ok('seed dashboard created', seed.status === 200 || seed.status === 201, 'status ' + seed.status)

  await page.goto(APP + '#/d/nh-e2e-panels')
  await page.waitForSelector('.nh-dash', { timeout: 20000 })
  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-editbar, .nh-dash__bar', { timeout: 15000 }).catch(() => {})
  await sleep(600)

  // the palette IS the registry's own list, so this covers widgets added later too
  await page.click('[aria-label="Add widget"], button:has-text("+") >> nth=0')
  await page.waitForSelector('.nh-palette__card', { timeout: 10000 })
  const names = await page.$$eval('.nh-palette .nh-palette__card .nh-palette__name', (els) => els.map((e) => e.textContent.trim()))
  ok('the palette offers the built-in widgets', names.length >= 15, names.length + ' cards')
  await page.keyboard.press('Escape').catch(() => {})
  await page.click('.nh-dash__surface', { position: { x: 5, y: 5 } }).catch(() => {})
  await sleep(300)

  const offenders = { clipped: [], crushed: [], blank: [], overflow: [] }
  let inspected = 0
  const record = (name, m) => {
    if (m.clipped.length) offenders.clipped.push(`${name}: ${m.clipped.join('; ')}`)
    if (m.crushed.length) offenders.crushed.push(`${name}: ${m.crushed.join('; ')}`)
    if (m.blank.length) offenders.blank.push(`${name}: ${m.blank.join('; ')}`)
    if (m.overflow > 1) offenders.overflow.push(`${name}: ${m.overflow}px`)
  }

  for (const name of names) {
    // add this widget, then open its panel by clicking the new cell's handle
    await page.click('[aria-label="Add widget"], button:has-text("+") >> nth=0').catch(() => {})
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 }).catch(() => {})
    await page.click(`.nh-palette__card:has(.nh-palette__name:text-is(${JSON.stringify(name)}))`, { timeout: 8000 }).catch(() => {})
    await sleep(500)
    const cells = await page.locator('.nh-grid--edit .nh-cell').count()
    if (cells === 0) continue
    await page.click(`.nh-grid--edit .nh-cell >> nth=${cells - 1} >> .nh-cell__grip`).catch(() => {})
    await sleep(450)

    const m = await probe(page, measurePanel, PANEL_MIN_CONTROL)
    if (!m || !m.controls) continue
    inspected++
    record(name, m)

    // A field's chrome can GROW with its value: the background field adds a thumbnail and a
    // clear button once an image is set, and that is the state in which it was crushed to a few
    // characters. An empty panel would have looked fine, so fill it and measure again.
    const bg = page.locator('.nh-sheet .nh-bgfield input[type="text"]')
    if (await bg.count()) {
      await bg.first().fill('https://example.invalid/plan.png')
      await sleep(350)
      const m2 = await probe(page, measurePanel, PANEL_MIN_CONTROL)
      if (m2 && m2.controls) record(name + ' (image set)', m2)
    }
  }

  /*
   * A widget's number field, typed into a digit at a time.
   *
   * It committed on every keystroke, so typing 150 into the min-50 Text size field applied 1,
   * then 15, then 150 - and since every reader clamps, the widget visibly jumped to HALF SIZE
   * on the first digit and back. Clicking away halfway left that 1 in the draft, where every
   * later reader has to keep guarding it. `page.fill()` cannot see any of this: it delivers the
   * whole value in one event, which is the one case that always worked.
   *
   * The field is found by its range rather than its label, so the check does not depend on the
   * language the browser asks for.
   */
  {
    await page.click('[aria-label="Add widget"], button:has-text("+") >> nth=0').catch(() => {})
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 }).catch(() => {})
    await page.click('.nh-palette__card:has(.nh-palette__name:text-is("Label"))', { timeout: 8000 }).catch(() => {})
    await sleep(500)
    const cells = await page.locator('.nh-grid--edit .nh-cell').count()
    await page.click(`.nh-grid--edit .nh-cell >> nth=${cells - 1} >> .nh-cell__grip`).catch(() => {})
    await sleep(450)

    const size = page.locator('.nh-sheet input[type="number"][min="50"][max="300"]').first()
    const scaleOf = () =>
      page.evaluate((n) => {
        const cell = document.querySelectorAll('.nh-grid--edit .nh-cell')[n - 1]
        return cell ? (getComputedStyle(cell).getPropertyValue('--nh-widgetscale').trim() || 'unset') : 'no-cell'
      }, cells)

    if (await size.count()) {
      await size.click()
      await size.press('Control+a')
      await size.press('Backspace')
      await sleep(200)
      const seen = []
      const scales = []
      for (const digit of ['1', '5', '0']) {
        await size.type(digit, { delay: 80 })
        await sleep(250)
        seen.push(await size.inputValue())
        scales.push(await scaleOf())
      }
      ok('a number field can be typed into a digit at a time', seen.join(',') === '1,15,150', seen.join(','))
      // "1" and "15" are below the field's own minimum of 50. Committing them made the widget
      // render at the clamped floor of 0.5 while the user was still typing.
      ok(
        'a half-typed value below the minimum is not applied',
        scales[0] !== '0.5' && scales[1] !== '0.5',
        'after 1/15/150: ' + scales.join(' -> ')
      )
      ok('the finished value is applied', scales[2] === '1.5', 'after 1/15/150: ' + scales.join(' -> '))
    }
  }

  ok('every widget was inspected', inspected >= names.length - 1, `${inspected} of ${names.length}`)
  ok('no control is pushed outside the settings panel', offenders.clipped.length === 0, offenders.clipped.slice(0, 4).join(' | '))
  ok(`no editable box is narrower than ${PANEL_MIN_CONTROL}px`, offenders.crushed.length === 0, offenders.crushed.slice(0, 4).join(' | '))
  ok('no select renders blank', offenders.blank.length === 0, offenders.blank.slice(0, 4).join(' | '))
  ok('the settings panel never scrolls sideways', offenders.overflow.length === 0, offenders.overflow.slice(0, 4).join(' | '))

  // the draft is thrown away: this suite must not write a dashboard full of unconfigured widgets
  await page.click('button:has-text("Exit")').catch(() => {})
  await sleep(800)
  const stored = await (await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })).json()
  ok('nothing was saved to the server', (stored?.config?.widgets ?? []).length === 0, 'widgets=' + (stored?.config?.widgets ?? []).length)

  // ---- and the rendered half of the same question: does any widget draw outside its tile? ----
  // A weather panel and a clock were reported "terribly cropped instead of shrank" in a landscape
  // phone's short row. Which raises the registry question rather than the widget one, and asking
  // it found a fifth: the media player's transport is three fixed circles wanting 192px, and that
  // row gives them 135. Seeded at the reported geometry - 11 columns, gap 4, square cells, so a
  // 2x1 tile is about 153x75 - with one of every type that has something to draw.
  const FIT_UID = 'dashboard:nh-e2e-panelfit'
  const FIT_TYPES = [
    ['switch', { item: ITEMS.switch, label: 'Switch' }],
    ['button', { item: ITEMS.dimmer, command: '50', label: 'Button' }],
    ['slider', { item: ITEMS.dimmer, label: 'Slider' }],
    ['dial', { item: ITEMS.dimmer, label: 'Dial' }],
    ['dial', { item: ITEMS.dimmer, style: 'led', label: 'LED' }],
    ['color', { item: ITEMS.color, label: 'Color' }],
    ['selection', { item: ITEMS.dimmer, choices: '10=Low\n50=Half\n100=Full', label: 'Pick' }],
    ['rollershutter', { item: ITEMS.dimmer, label: 'Roller' }],
    ['player', { item: ITEMS.player, label: 'Player' }],
    ['value', { item: ITEMS.temperature, label: 'Value' }],
    ['stat', { item: ITEMS.temperature, label: 'Stat', caption: 'Caption', badge: 'NEW' }],
    ['compass', { item: ITEMS.dimmer, label: 'Compass' }],
    ['thermostat', { currentItem: ITEMS.temperature, setpointItem: ITEMS.dimmer, modeItem: ITEMS.switch, label: 'Thermostat' }],
    ['thermostat', { currentItem: ITEMS.temperature, setpointItem: ITEMS.dimmer, look: 'ring', label: 'Ring' }],
    ['label', { text: 'A label widget' }],
    ['clock', { showSeconds: true, showDate: true, dateFormat: 'full' }],
  ]
  await fetch(NS + '/' + encodeURIComponent(FIT_UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const fitSeed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: FIT_UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-panelfit',
        name: 'E2E Panel Fit',
        columns: 11,
        rowHeight: 'match',
        gap: 4,
        widgets: FIT_TYPES.map(([type, config], i) => ({
          id: 'f-' + i,
          type,
          config,
          layout: { lg: { x: (i % 5) * 2, y: Math.floor(i / 5), w: 2, h: 1 } },
        })),
      },
    }),
  })
  ok('short-tile dashboard created', fitSeed.ok, String(fitSeed.status))

  const fitPage = await browser.newPage({ viewport: { width: 885, height: 600 } })
  // Nothing here may reach a device: every widget is bound to an item so it renders its control,
  // and none of them is clicked, but the interception is what makes that a guarantee.
  await fitPage.route('**/rest/items/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()))
  await fitPage.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
      localStorage.setItem('neohab:themeOverride', 'dark')
    } catch {}
  }, TOKEN)
  await fitPage.goto(APP + '#/d/nh-e2e-panelfit', { waitUntil: 'domcontentloaded' })
  await fitPage.waitForSelector('.nh-gcell', { timeout: 25000 }).catch(() => {})
  await sleep(3000)

  const tiles = await probe(fitPage, () =>
    [...document.querySelectorAll('.nh-gcell')].map((cell) => {
      const body = cell.querySelector('.nh-widget__body')
      const cr = cell.getBoundingClientRect()
      // Per element, not the body's scrollHeight: a shed element is still in the DOM at zero size
      // and a scrolling list legitimately extends past its own box, so only something with a real
      // size, painted past the body's edge, is a widget drawing outside its tile.
      // Inside a scrolling box, content past the edge is what scrolling is FOR: the selection's
      // grid and the weather's strips both hold more than they show on purpose. Asked of the
      // computed style rather than a list of class names, so a scroller added later is covered.
      const scrolls = (el) => {
        for (let p = el.parentElement; p && p !== body.parentElement; p = p.parentElement) {
          const o = getComputedStyle(p)
          if (/auto|scroll/.test(o.overflowX + ' ' + o.overflowY)) return true
        }
        return false
      }
      const past = !body
        ? 0
        : Math.round(
            Math.max(
              0,
              ...[...body.querySelectorAll('*')]
                .map((e) => {
                  const q = e.getBoundingClientRect()
                  // A shed element is still in the DOM at zero size; it is not being drawn.
                  if (q.width < 2 || q.height < 2) return 0
                  if (scrolls(e)) return 0
                  const br = body.getBoundingClientRect()
                  return Math.max(q.bottom - br.bottom, br.top - q.top, q.right - br.right, br.left - q.left)
                })
                .filter((v) => Number.isFinite(v))
            )
          )
      return { type: cell.querySelector('.nh-widget')?.getAttribute('data-type') ?? '', w: Math.round(cr.width), h: Math.round(cr.height), past }
    })
  )
  const list = Array.isArray(tiles) ? tiles : []
  ok('every short tile rendered', list.length === FIT_TYPES.length, `${list.length} of ${FIT_TYPES.length}`)
  // The precondition: these really are the short tiles the report was about.
  ok(
    'and they really are the reported geometry',
    list.length > 0 && list.every((t) => t.h < 90 && t.w < 200),
    list.length ? `${list[0].w}x${list[0].h}` : '(none)'
  )
  const spilling = list.map((t, i) => ({ ...t, kind: FIT_TYPES[i]?.[0] })).filter((t) => t.past > 1)
  ok(
    'no widget draws outside its tile in a short cell',
    list.length === FIT_TYPES.length && spilling.length === 0,
    spilling.length ? spilling.map((t) => `${t.kind} past by ${t.past}`).join(', ') : `${list.length} widgets, none past its edge`
  )
  await fitPage.close()
  await fetch(NS + '/' + encodeURIComponent(FIT_UID), { method: 'DELETE', headers: AUTH }).catch(() => {})

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} finally {
  await browser.close().catch(() => {})
  for (const uid of [UID, 'dashboard:nh-e2e-panelfit']) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const mine = [UID, 'dashboard:nh-e2e-panelfit']
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => mine.includes(c.uid))
  ok('cleanup: dashboards removed', left.length === 0, left.map((c) => c.uid).join(', '))

  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}
