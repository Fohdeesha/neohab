// The selection widget: the icon and choices in one centred column, with the name in the title bar by default
// or at the top of the column; the panel's name settings; a dropdown that opens neohab's own list rather than
// the system picker; segmented and list styles; finishes; every style and name placement fitting its tile
// across sizes; and a press on any of it never opening the hold sheet by accident. Also that a press starting
// on a native <select> inside a tile never arms that tile's hold.
// SAFE with a live config: creates only dashboard:nh-e2e-selection and -selfit and deletes exactly those.
// Every command the widgets send is answered in the browser and recorded, so nothing reaches a real device.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, ITEMS, isAppResource } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e.message).slice(0, 120) }))

const DASH = 'nh-e2e-selection'
const UID = 'dashboard:' + DASH
const FIT = 'nh-e2e-selfit'
const FIT_UID = 'dashboard:' + FIT
const HOLD = 700
const ITEM = ITEMS.dimmer
const BTN_ITEM = ITEMS.switch
const del = async () => {
  for (const u of [UID, FIT_UID]) await fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH }).catch(() => {})
}
const state = async (n) =>
  fetch(BASE + '/rest/items/' + n, { headers: AUTH })
    .then((r) => r.json())
    .then((j) => j.state)
    .catch(() => null)

// the item's live state is the MIDDLE choice, so neither the first nor the last option can pass for it
const cur = String((await state(ITEM)) ?? '0')
const LOW = cur === '10' ? '11' : '10'
const HIGH = cur === '90' ? '91' : '90'
const CHOICES = `${LOW}=Low\n${cur}=Here now\n${HIGH}=A much longer choice name`
const sel = (id, label, x, y, w, h, extra = {}) => ({
  id,
  type: 'selection',
  config: { item: ITEM, label, choices: CHOICES, ...extra },
  layout: { lg: { x, y, w, h } }
})
const WIDGETS = [
  sel('w-drop', 'E2E Drop', 0, 0, 3, 3, { display: 'dropdown', icon: 'mdi:television', labelMode: 'column' }),
  sel('w-btns', 'E2E Buttons', 3, 0, 3, 3, { display: 'buttons' }),
  sel('w-seg', 'E2E Segmented', 6, 0, 6, 2, { display: 'segmented' }),
  sel('w-list', 'E2E List', 0, 3, 3, 4, { display: 'list' }),
  sel('w-solid', 'E2E Solid', 3, 3, 3, 3, { display: 'dropdown', finish: 'solid', accentColor: '#e0242b' }),
  sel('w-outline', 'E2E Outline', 6, 2, 3, 2, { display: 'buttons', finish: 'outline', accentColor: '#e0242b' }),
  sel('w-small', 'Big TV Input', 9, 2, 1, 1, { display: 'dropdown', textSize: 125 }),
  { id: 'w-btn', type: 'button', config: { item: BTN_ITEM, label: 'E2E Btn', command: 'ON' }, layout: { lg: { x: 9, y: 3, w: 3, h: 3 } } },
  sel('w-head', 'E2E Headed', 0, 7, 3, 3, { display: 'dropdown', icon: 'mdi:television' }),
  sel('w-none', 'E2E Nameless', 3, 7, 3, 3, { display: 'dropdown', labelMode: 'none' })
]
// every style under each name placement, for the fit sweep; the sweep sizes the cells itself
const FIT_WIDGETS = []
for (const display of ['dropdown', 'buttons', 'segmented', 'list']) {
  for (const mode of ['header', 'bottom', 'column', 'none']) {
    const i = FIT_WIDGETS.length
    FIT_WIDGETS.push(
      sel('f-' + display + '-' + mode, 'Fit ' + display + ' ' + mode, (i % 4) * 3, Math.floor(i / 4) * 3, 3, 3, {
        display,
        icon: 'mdi:television',
        ...(mode === 'header' ? {} : mode === 'bottom' ? { labelPosition: 'bottom' } : { labelMode: mode })
      })
    )
  }
}

let browser
try {
  if (!ITEM || !BTN_ITEM) throw new Error('the target names no dimmer or switch item')
  await del()
  const seeded = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 3, id: DASH, name: 'E2E Selection', columns: 12, rowHeight: 'match', gap: 8, widgets: WIDGETS }
    })
  })
  const seededFit = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: FIT_UID,
      component: 'neohab:dashboard',
      config: { version: 3, id: FIT, name: 'E2E Selection fit', columns: 12, rowHeight: 'match', gap: 8, widgets: FIT_WIDGETS }
    })
  })
  ok('seed', seeded.ok && seededFit.ok, `HTTP ${seeded.status}/${seededFit.status}, live state ${cur}`)

  browser = await launchChromium({ channel: 'chrome', headless: true }).catch(() => launchChromium({ headless: true }))
  const errs = []
  const commands = []
  const newPage = async (viewport, touch, dash = DASH) => {
    const ctx = await browser.newContext({ viewport, ...(touch ? { hasTouch: true } : {}) })
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    // a command is recorded and answered here, so it never reaches the item
    await ctx.route(/\/rest\/items\/[^/?]+(\?.*)?$/, (route) => {
      const req = route.request()
      if (req.method() !== 'POST') return route.fallback()
      commands.push({ item: decodeURIComponent(new URL(req.url()).pathname.split('/').pop()), body: req.postData() })
      return route.fulfill({ status: 200, body: '' })
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const at = m.location?.()?.url
      if (isAppResource(at)) errs.push(m.text() + (at ? ' <- ' + at : ''))
    })
    await page.goto(APP + '#/d/' + dash, { waitUntil: 'domcontentloaded' })
    // the tiles, not the new column: a build without it has to fail the checks, not stop here
    await page.waitForSelector('.nh-gcell', { timeout: 20000 })
    await page.waitForSelector('.nh-selection__face', { timeout: 3000 }).catch(() => {})
    await sleep(1200)
    return { ctx, page }
  }
  const tile = (page, name) =>
    page
      .locator('.nh-gcell')
      .filter({ has: page.locator('.nh-selection__name, .nh-widget__labeltext, .nh-button__label', { hasText: new RegExp('^' + name + '$') }) })
      .first()
  const menuOpen = (page) => page.locator('.nh-selection__menu').count()
  const detailOpen = (page) => page.locator('.nh-detail__panel').count()
  const closeDetail = async (page) => {
    if (!(await detailOpen(page))) return
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.nh-detail__panel'), { timeout: 4000 }).catch(() => {})
  }

  // ---- the column -----------------------------------------------------------------------------------
  const { ctx, page } = await newPage({ width: 1400, height: 950 }, false)
  const col = await probe(page, () => {
    const cell = [...document.querySelectorAll('.nh-gcell')].find((c) => c.querySelector('.nh-selection__name')?.textContent === 'E2E Drop')
    const box = (sel) => cell?.querySelector(sel)?.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    const parts = { name: box('.nh-selection__name'), icon: box('.nh-selection__icon'), trigger: box('.nh-selection__select') }
    const mid = (r) => (r ? r.left + r.width / 2 : null)
    return {
      order: !!(parts.name && parts.icon && parts.trigger && parts.name.bottom <= parts.icon.top + 0.5 && parts.icon.bottom <= parts.trigger.top + 0.5),
      offCentre: Object.fromEntries(Object.entries(parts).map(([k, r]) => [k, r ? Math.round(Math.abs(mid(r) - (c.left + c.width / 2))) : null])),
      nativeSelects: cell.querySelectorAll('select').length,
      popup: cell.querySelector('.nh-selection__select')?.getAttribute('aria-haspopup'),
      expanded: cell.querySelector('.nh-selection__select')?.getAttribute('aria-expanded'),
      shown: cell.querySelector('.nh-selection__current')?.textContent,
      valueWidth: cell.querySelector('.nh-selection__value')?.getBoundingClientRect().width,
      widest: Math.max(...[...cell.querySelectorAll('.nh-selection__sizer')].map((s) => s.scrollWidth)),
      titleBar: cell.querySelectorAll('.nh-widget__label').length
    }
  })
  ok('a dropdown stacks its name, then its icon, then the picker', col.order === true, JSON.stringify(col))
  ok(
    'all three centred in the tile',
    Object.keys(col.offCentre ?? {}).length === 3 && Object.values(col.offCentre).every((d) => d !== null && d <= 2),
    JSON.stringify(col.offCentre)
  )
  ok('the name is part of the column, not a title bar', col.titleBar === 0, `title bars=${col.titleBar}`)
  ok("it draws neohab's own picker, not the browser's", col.nativeSelects === 0 && col.popup === 'listbox' && col.expanded === 'false', JSON.stringify(col))
  ok('the picker shows the choice the item is on', col.shown === 'Here now', String(col.shown))
  ok('and is wide enough for its longest choice', col.valueWidth >= col.widest - 1, `value ${col.valueWidth} widest ${col.widest}`)

  // ---- the list it opens, by mouse --------------------------------------------------------------
  const trigger = tile(page, 'E2E Drop').locator('.nh-selection__select')
  await trigger.click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-selection__menu', { timeout: 4000 }).catch(() => {})
  const menu = await probe(page, () => {
    const m = document.querySelector('.nh-selection__menu')
    if (!m) return null
    const r = m.getBoundingClientRect()
    const opts = [...m.querySelectorAll('[role="option"]')]
    return {
      inTile: !!m.closest('.nh-gcell'),
      role: m.getAttribute('role'),
      labels: opts.map((o) => o.textContent),
      selected: opts.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent),
      focused: document.activeElement?.textContent,
      inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      font: parseFloat(getComputedStyle(m).fontSize),
      expanded: document.querySelector('.nh-selection__select[aria-expanded="true"]') !== null
    }
  })
  ok('a click opens the list', menu !== null)
  ok('drawn over the page, outside the tile', menu?.inTile === false && menu?.role === 'listbox', JSON.stringify(menu))
  ok('with every choice, the current one marked and focused', JSON.stringify(menu?.selected) === '["Here now"]' && menu?.focused === 'Here now' && menu?.labels?.length === 3, JSON.stringify(menu))
  ok('inside the window, at a readable size', menu?.inside === true && menu?.font >= 16, JSON.stringify({ inside: menu?.inside, font: menu?.font }))
  await sleep(900)
  ok('and the click does not also open the hold sheet', (await detailOpen(page)) === 0 && (await menuOpen(page)) === 1)

  commands.length = 0
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await sleep(300)
  const afterKey = await probe(page, () => ({
    shown: document.activeElement?.closest('.nh-gcell')?.querySelector('.nh-selection__current')?.textContent,
    focus: document.activeElement?.className
  }))
  ok('the arrow keys and Enter choose from the list', JSON.stringify(commands) === JSON.stringify([{ item: ITEM, body: HIGH }]), JSON.stringify(commands))
  ok('which closes it and puts focus back on the picker', (await menuOpen(page)) === 0 && /nh-selection__select/.test(afterKey.focus ?? ''), JSON.stringify(afterKey))
  ok('the picker shows the new choice straight away', afterKey.shown === 'A much longer choice name', String(afterKey.shown))

  await trigger.click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-selection__menu', { timeout: 4000 }).catch(() => {})
  const openForEscape = await menuOpen(page)
  await page.keyboard.press('Escape')
  await sleep(200)
  ok('Escape closes it', openForEscape === 1 && (await menuOpen(page)) === 0, `open before=${openForEscape}`)

  // the tap that closes the list must not also press the tile under it
  commands.length = 0
  await trigger.click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-selection__menu', { timeout: 4000 }).catch(() => {})
  const openForOutside = await menuOpen(page)
  const btnBox = await tile(page, 'E2E Btn').boundingBox()
  await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2)
  await sleep(400)
  ok('a click outside closes the list', openForOutside === 1 && (await menuOpen(page)) === 0, `open before=${openForOutside}`)
  ok('and presses nothing underneath', commands.length === 0, JSON.stringify(commands))

  // a hold is still a hold: it opens the sheet instead of the list
  const tb = await trigger.boundingBox()
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
  await page.mouse.down()
  await sleep(HOLD)
  await page.mouse.up()
  await sleep(400)
  ok('holding the picker opens the hold sheet', (await detailOpen(page)) === 1)
  ok('and not the list as well', (await menuOpen(page)) === 0)
  await closeDetail(page)

  // ---- the other styles -------------------------------------------------------------------------
  commands.length = 0
  await tile(page, 'E2E Buttons').locator('.nh-selection__btn', { hasText: 'Low' }).click({ timeout: 5000 }).catch(() => {})
  await sleep(300)
  ok('a button sends its command', JSON.stringify(commands) === JSON.stringify([{ item: ITEM, body: LOW }]), JSON.stringify(commands))
  const styles = await probe(page, () => {
    const cellOf = (n) =>
      [...document.querySelectorAll('.nh-gcell')].find((c) => (c.querySelector('.nh-selection__name') ?? c.querySelector('.nh-widget__labeltext'))?.textContent === n)
    const rects = (n) => [...cellOf(n).querySelectorAll('.nh-selection__btn')].map((b) => b.getBoundingClientRect())
    const seg = rects('E2E Segmented')
    const list = rects('E2E List')
    const listBox = cellOf('E2E List').querySelector('.nh-selection').getBoundingClientRect()
    const activeList = cellOf('E2E List').querySelector('.nh-selection__btn--active')
    return {
      segOneRow: seg.every((r) => Math.abs(r.top - seg[0].top) < 1),
      segJoined: seg.slice(1).every((r, i) => r.left - seg[i].right <= 0.5),
      segActive: cellOf('E2E Segmented').querySelector('.nh-selection__btn--active')?.textContent,
      listStacked: list.slice(1).every((r, i) => r.top >= list[i].bottom - 0.5),
      listFull: list.every((r) => r.width >= listBox.width - 2),
      listTick: activeList ? getComputedStyle(activeList, '::after').visibility : null,
      listActive: activeList?.textContent
    }
  })
  ok('a segmented bar is one joined row', styles.segOneRow && styles.segJoined, JSON.stringify(styles))
  ok('with the current choice marked', styles.segActive === 'Here now', String(styles.segActive))
  ok('a list is one full-width row per choice', styles.listStacked && styles.listFull, JSON.stringify(styles))
  ok('with a tick on the current one', styles.listActive === 'Here now' && styles.listTick === 'visible', JSON.stringify(styles))

  const finishes = await probe(page, () => {
    const cellOf = (n) =>
      [...document.querySelectorAll('.nh-gcell')].find((c) => (c.querySelector('.nh-selection__name') ?? c.querySelector('.nh-widget__labeltext'))?.textContent === n)
    const accent = (cell) => {
      const p = document.createElement('div')
      p.style.background = 'var(--sl-accent)'
      cell.querySelector('.nh-selection__face').appendChild(p)
      const v = getComputedStyle(p).backgroundColor
      p.remove()
      return v
    }
    const solid = cellOf('E2E Solid')
    const outline = cellOf('E2E Outline')
    const outActive = outline.querySelector('.nh-selection__btn--active')
    const outIdle = outline.querySelector('.nh-selection__btn:not(.nh-selection__btn--active)')
    return {
      accent: accent(solid),
      solidBg: getComputedStyle(solid.querySelector('.nh-selection__select')).backgroundColor,
      outAccent: accent(outline),
      outActiveBorder: outActive ? getComputedStyle(outActive).borderTopColor : null,
      outIdleBg: outIdle ? getComputedStyle(outIdle).backgroundColor : null
    }
  })
  ok('a solid dropdown is filled with the tile accent', finishes.accent === 'rgb(224, 36, 43)' && finishes.solidBg === finishes.accent, JSON.stringify(finishes))
  ok(
    'an outline finish rings the current choice in the accent and leaves the rest open',
    finishes.outActiveBorder === finishes.outAccent && finishes.outIdleBg === 'rgba(0, 0, 0, 0)',
    JSON.stringify(finishes)
  )

  const small = await probe(page, () => {
    const cell = [...document.querySelectorAll('.nh-gcell')].find((c) => c.querySelector('.nh-selection__current') && c.textContent.includes('Big TV'))
    const c = cell.getBoundingClientRect()
    const inside = (el) => {
      if (!el || getComputedStyle(el).display === 'none') return null
      const r = el.getBoundingClientRect()
      return r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5
    }
    return {
      cell: Math.round(c.width) + 'x' + Math.round(c.height),
      font: getComputedStyle(cell).fontSize,
      name: inside(cell.querySelector('.nh-widget__label')),
      trigger: inside(cell.querySelector('.nh-selection__select'))
    }
  })
  ok('a one-cell dropdown at 125% text keeps its name and picker inside the tile', small.name === true && small.trigger === true, JSON.stringify(small))

  // ---- the name: a title bar by default, the column on request, nowhere when asked -------------------
  const named = await probe(page, () => {
    const cellOf = (n) => [...document.querySelectorAll('.nh-gcell')].find((c) => c.querySelector('.nh-widget__labeltext')?.textContent === n)
    const head = cellOf('E2E Headed')
    const nameless = [...document.querySelectorAll('.nh-gcell')].find((c) => c.querySelector('.nh-selection__face') && !c.querySelector('.nh-widget__label, .nh-selection__name') && c.textContent.includes('Here now'))
    if (!head) return { head: null }
    const c = head.getBoundingClientRect()
    const r = (sel) => head.querySelector(sel)?.getBoundingClientRect()
    const bar = r('.nh-widget__label')
    const icon = r('.nh-selection__icon')
    const trigger = r('.nh-selection__select')
    const mid = (b) => (b ? Math.round(Math.abs(b.left + b.width / 2 - (c.left + c.width / 2))) : null)
    return {
      head: true,
      inColumn: head.querySelectorAll('.nh-selection__name').length,
      order: !!(bar && icon && trigger && bar.bottom <= icon.top + 0.5 && icon.bottom <= trigger.top + 0.5),
      offCentre: { icon: mid(icon), trigger: mid(trigger) },
      nameless: !!nameless,
      namelessBar: nameless ? nameless.querySelectorAll('.nh-widget__label').length : null
    }
  })
  ok('by default the name sits in a title bar, not in the column', named.head === true && named.inColumn === 0, JSON.stringify(named))
  ok('with the icon, then the picker, centred below it', named.order === true && named.offCentre?.icon <= 2 && named.offCentre?.trigger <= 2, JSON.stringify(named))
  ok('and "Not at all" draws no name anywhere', named.nameless === true && named.namelessBar === 0, JSON.stringify(named))

  // the panel offers the same name settings as every other widget with a title bar
  await page.click('[aria-label="Edit dashboard"]', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-grid--edit .nh-cell', { timeout: 15000 }).catch(() => {})
  await page
    .locator('.nh-cell')
    .filter({ has: page.locator('.nh-widget__labeltext', { hasText: /^E2E Headed$/ }) })
    .first()
    .locator('.nh-cell__overlay')
    .click({ timeout: 5000 })
    .catch(() => {})
  await page.waitForSelector('#f-w-head-labelMode', { timeout: 5000 }).catch(() => {})
  const panel = await probe(page, () => ({
    modes: [...(document.querySelector('#f-w-head-labelMode')?.options ?? [])].map((o) => o.value),
    align: !!document.querySelector('#f-w-head-labelAlign'),
    position: !!document.querySelector('#f-w-head-labelPosition')
  }))
  ok(
    'its settings offer Show the name, with the title bar, the column and not at all',
    JSON.stringify(panel.modes) === JSON.stringify(['header', 'column', 'none']),
    JSON.stringify(panel)
  )
  ok('and Name alignment and Name position', panel.align === true && panel.position === true, JSON.stringify(panel))
  await page.click('button:has-text("Exit")', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 10000 }).catch(() => {})

  await ctx.close()

  // ---- touch --------------------------------------------------------------------------------------
  const t = await newPage({ width: 1000, height: 900 }, true)
  const cdp = await t.ctx.newCDPSession(t.page)
  const tt = await tile(t.page, 'E2E Drop').locator('.nh-selection__select').boundingBox()
  const tx = tt.x + tt.width / 2
  const ty = tt.y + tt.height / 2
  await t.page.touchscreen.tap(tx, ty)
  await t.page.waitForSelector('.nh-selection__menu', { timeout: 4000 }).catch(() => {})
  await sleep(900)
  ok('a tap on the picker opens the list', (await menuOpen(t.page)) === 1)
  ok('and not the hold sheet', (await detailOpen(t.page)) === 0)
  commands.length = 0
  const ob = await t.page.locator('.nh-selection__opt', { hasText: 'Low' }).boundingBox({ timeout: 3000 }).catch(() => null)
  if (ob) await t.page.touchscreen.tap(ob.x + ob.width / 2, ob.y + ob.height / 2)
  await sleep(400)
  ok('a tap on a choice sends it and closes the list', JSON.stringify(commands) === JSON.stringify([{ item: ITEM, body: LOW }]) && (await menuOpen(t.page)) === 0, JSON.stringify(commands))

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] })
  await sleep(HOLD)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500)
  ok('a touch hold on the picker opens the hold sheet', (await detailOpen(t.page)) === 1)
  ok('and the list stays shut', (await menuOpen(t.page)) === 0)
  await closeDetail(t.page)

  // a touch on an option held past the hold time is still a choice, not the tile's hold
  await t.page.touchscreen.tap(tx, ty)
  await t.page.waitForSelector('.nh-selection__menu', { timeout: 4000 }).catch(() => {})
  commands.length = 0
  const ob2 = await t.page.locator('.nh-selection__opt', { hasText: 'Here now' }).boundingBox({ timeout: 3000 }).catch(() => null)
  if (ob2) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ob2.x + 20, y: ob2.y + ob2.height / 2 }] })
    await sleep(HOLD)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(400)
  }
  ok('holding a choice in the list never opens the hold sheet', ob2 !== null && (await detailOpen(t.page)) === 0, JSON.stringify(commands))
  await t.page.keyboard.press('Escape').catch(() => {})
  await closeDetail(t.page)

  // ---- a native <select> inside a tile never arms its hold --------------------------------------
  // On a device the browser's own picker takes the release, so the hold fired under it on every press.
  // Held here without letting go, which is what the page sees while a picker is open; a mouse press in
  // headless Chromium leaves the element as the popup opens, which ends the press, so it cannot show this.
  await probe(t.page, () => {
    const cell = [...document.querySelectorAll('.nh-gcell')].find((c) => c.textContent.includes('E2E Btn'))
    const s = document.createElement('select')
    s.id = 'nh-e2e-native'
    s.innerHTML = '<option>a</option><option>b</option>'
    // in the tile's own flow: an absolutely placed one lands wherever its containing block is, which can be
    // under the header bar, and then the press never reaches the tile at all
    s.style.cssText = 'position:relative;z-index:5;width:80px;height:32px;flex-shrink:0'
    cell.querySelector('.nh-widget').prepend(s)
  })
  const nb = await t.page.locator('#nh-e2e-native').boundingBox({ timeout: 3000 }).catch(() => null)
  const at = nb ? { x: nb.x + 20, y: nb.y + 16 } : null
  const hit = at ? await probe(t.page, (p) => document.elementFromPoint(p.x, p.y)?.id ?? null, at) : null
  ok('the press lands on the select itself', hit === 'nh-e2e-native', String(hit))
  let heldOnSelect = null
  if (at) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
    await sleep(HOLD)
    heldOnSelect = await detailOpen(t.page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(300)
  }
  ok('a touch held on a native select inside a tile opens no hold sheet', heldOnSelect === 0, `sheets=${heldOnSelect}`)
  await closeDetail(t.page)
  let mouseOnSelect = null
  if (at) {
    await t.page.mouse.move(at.x, at.y)
    await t.page.mouse.down()
    await sleep(HOLD)
    mouseOnSelect = await detailOpen(t.page)
    await t.page.mouse.up()
    await sleep(300)
  }
  ok('nor does a mouse press on one', mouseOnSelect === 0, `sheets=${mouseOnSelect}`)
  await closeDetail(t.page)
  await t.page.keyboard.press('Escape').catch(() => {})
  const bb = await tile(t.page, 'E2E Btn').boundingBox()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + bb.width / 2, y: bb.y + bb.height - 12 }] })
  await sleep(HOLD)
  const heldElsewhere = await detailOpen(t.page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(300)
  ok('while a hold anywhere else on that tile still opens it', heldElsewhere === 1, `sheets=${heldElsewhere}`)
  await closeDetail(t.page)
  await t.ctx.close()

  // ---- a phone ------------------------------------------------------------------------------------
  const p = await newPage({ width: 393, height: 850 }, true)
  const pt = tile(p.page, 'E2E Drop').locator('.nh-selection__select')
  await pt.scrollIntoViewIfNeeded()
  const pb = await pt.boundingBox()
  await p.page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2)
  await p.page.waitForSelector('.nh-selection__menu', { timeout: 4000 }).catch(() => {})
  const pm = await probe(p.page, () => {
    const r = document.querySelector('.nh-selection__menu')?.getBoundingClientRect()
    return r ? { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: window.innerWidth, h: window.innerHeight } : null
  })
  ok('on a phone the list stays inside the screen', pm && pm.left >= 0 && pm.right <= pm.w && pm.top >= 0 && pm.bottom <= pm.h, JSON.stringify(pm))
  await p.ctx.close()

  // ---- every style and name placement fits its tile, and nothing comes back as a tile grows -----------
  // Each tile is sized by hand across heights, widths and text sizes. A part that is drawn has to be inside
  // the tile, and one that was drawn at some height must still be drawn at every taller one.
  const f = await newPage({ width: 1400, height: 950 }, false, FIT)
  const fit = await probe(f.page, () => {
    const cells = [...document.querySelectorAll('.nh-gcell')].filter((c) => c.querySelector('.nh-selection__face'))
    const base = parseFloat(getComputedStyle(cells[0]).fontSize)
    const shown = (el) => {
      if (!el) return null
      const st = getComputedStyle(el)
      if (st.display === 'none' || st.visibility === 'hidden') return null
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r : null
    }
    const PARTS = { bar: '.nh-widget__label', name: '.nh-selection__name', icon: '.nh-selection__icon > .nh-icon', control: '.nh-selection__select, .nh-selection' }
    const spills = []
    const vanish = []
    const slivers = []
    let measured = 0
    const kinds = new Set()
    for (const cell of cells) {
      const face = cell.querySelector('.nh-selection__face')
      const kind = [...face.classList].find((k) => /--(dropdown|buttons|segmented|list)$/.test(k)).split('--')[1] + (cell.querySelector('.nh-widget__label') ? (cell.classList.contains('nh-labelbottom') ? ' bar below' : ' bar') : face.classList.contains('nh-selection__face--named') ? ' column' : ' none')
      kinds.add(kind)
      for (const px of [13, 16, 20, 24, 32]) {
        cell.style.setProperty('--nh-widgetscale', String(px / base))
        for (const w of [150, 330, 680]) {
          cell.style.width = w + 'px'
          const seen = {}
          for (let h = 40; h <= 240; h += 2) {
            cell.style.height = h + 'px'
            measured++
            const c = cell.getBoundingClientRect()
            for (const [part, sel] of Object.entries(PARTS)) {
              const r = shown(cell.querySelector(sel))
              if (r && (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5 || r.left < c.left - 0.5 || r.right > c.right + 0.5)) {
                if (spills.length < 8) spills.push(`${kind} ${part} f${px} ${w}x${h}`)
                else spills.push(null)
              }
              // its width is never capped, so it is the icon's own size
              if (r && part === 'icon' && r.height < Math.min(r.width, 1.2 * px) - 0.5 && slivers.length < 8) slivers.push(`${kind} f${px} ${w}x${h}: ${r.height.toFixed(1)}px`)
              if (r) seen[part] = h
              else if (seen[part] !== undefined) {
                if (vanish.length < 8) vanish.push(`${kind} ${part} f${px} w${w}: drawn at ${seen[part]}, gone at ${h}`)
                else vanish.push(null)
                delete seen[part]
              }
            }
          }
        }
      }
      cell.style.removeProperty('--nh-widgetscale')
      cell.style.width = ''
      cell.style.height = ''
    }
    return { measured, kinds: [...kinds].sort(), spills: spills.length, firstSpills: spills.filter(Boolean), vanish: vanish.length, firstVanish: vanish.filter(Boolean), slivers }
  })
  ok('the fit sweep covered every style under every name placement', fit.kinds?.length === 16 && fit.measured > 20000, JSON.stringify({ kinds: fit.kinds, measured: fit.measured }))
  ok('no part is drawn outside its tile', fit.spills === 0, JSON.stringify({ spills: fit.spills, first: fit.firstSpills }))
  ok('and nothing drawn in a smaller tile is gone in a taller one', fit.vanish === 0, JSON.stringify({ vanish: fit.vanish, first: fit.firstVanish }))
  ok('an icon is drawn readable or not at all, never squeezed to a sliver', fit.slivers?.length === 0, JSON.stringify(fit.slivers))
  await f.ctx.close()

  ok('console clean', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err?.stack ?? err).slice(0, 300))
} finally {
  await del()
  const left = ((await (await fetch(NS, { headers: AUTH })).json()) ?? []).map((c) => c.uid).filter((u) => u === UID || u === FIT_UID)
  ok('cleanup: no leftovers', left.length === 0, left.join(','))
  await browser?.close().catch(() => {})
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
