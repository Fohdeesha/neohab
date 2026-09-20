// Log widget e2e: openhab.log and events.log on a tile, filtered, following the newest line, and the
// full-screen viewer a hold opens.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-log (neohab:config), managed item
// nh_e2e_logdim (a Dimmer bound to nothing) Writes a few WARN.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-log'
const DASH = 'nh-e2e-log'
const DIM = 'nh_e2e_logdim'
const RUN = Math.random().toString(36).slice(2, 8)
const MARKER = 'NH-E2E-LOG-MARK-' + RUN
const MARKER2 = 'NH-E2E-LOG-PAUSE-' + RUN

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const itemUrl = (n) => BASE + '/rest/items/' + n
let stateValue = null
const putState = (v) => {
  stateValue = String(v)
  return fetch(itemUrl(DIM) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
}
const changeTo = (v) => `changed from ${stateValue} to ${v}`
const command = (v) => fetch(itemUrl(DIM), { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name: n, label }) })
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

const version = await fetch(BASE + '/rest/')
  .then((r) => r.json())
  .then((j) => String(j.runtimeInfo?.version ?? ''))
  .catch(() => '')
const major = Number((/^\s*(\d+)/.exec(version) ?? [])[1])
const protocol = major && major < 5 ? 'list' : 'object'
const WS_BASE = BASE.replace(/^http/, 'ws') + '/ws/logs'

function warnLine(text) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_BASE + '?accessToken=' + encodeURIComponent(TOKEN))
    let done = false
    const finish = () => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {}
      resolve()
    }
    ws.onopen = () => {
      ws.send(text)
      setTimeout(finish, 400)
    }
    ws.onerror = finish
    setTimeout(finish, 4000)
  })
}

function anonymousAllowed() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_BASE)
    let opened = false
    let settled = false
    const settle = (v) => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {}
      resolve(v)
    }
    ws.onopen = () => {
      opened = true
      ws.send(protocol === 'list' ? '[]' : '{}')
      setTimeout(() => settle(true), 500)
    }
    ws.onerror = () => settle(opened)
    ws.onclose = () => settle(opened)
    setTimeout(() => settle(opened), 5000)
  })
}

const log = (id, label, config) => ({ id: 'w-' + id, type: 'log', config: { label, ...config } })
const at = (w, x, y, wd, h) => ({ ...w, layout: { lg: { x, y: y * 3, w: wd, h: h * 3 } } })

const WIDGETS = [
  at(log('events', 'Events', { source: 'events' }), 0, 0, 6, 3),
  at(log('server', 'Server', { source: 'openhab' }), 6, 0, 6, 3),
  at(log('warnings', 'Warnings', { source: 'both', minLevel: 'warn' }), 0, 3, 6, 2),
  at(log('filtered', 'Filtered', { source: 'both', contains: DIM }), 6, 3, 3, 2),
  at(log('logger', 'Logger', { source: 'both', loggers: 'openhab.event.ItemStateChangedEvent' }), 9, 3, 3, 2),
  at(log('wrap', 'Wrap', { source: 'events', wrap: true }), 0, 5, 3, 2),
  at(log('narrow', 'Narrow', { source: 'events' }), 3, 5, 2, 2),
  at(log('few', 'Few', { source: 'events', keep: 50 }), 5, 5, 4, 2),
  at(log('tiny', 'Tiny', { source: 'events' }), 0, 7, 1, 2),
  {
    id: 'w-hostile',
    type: 'log',
    config: { label: 'Hostile', source: 'constructor', minLevel: 42, loggers: ['x'], contains: {}, keep: 'lots', wrap: 'yes' },
    layout: { lg: { x: 9, y: 15, w: 3, h: 6 } },
  },
  // something with an item picker, so the picker can be typed into while the log tiles follow their newest line.
  // Bound to nothing on purpose: a pick has to land a name where there was none for the check to mean anything
  {
    id: 'w-reading',
    type: 'value',
    config: { item: '', label: 'Reading' },
    layout: { lg: { x: 3, y: 21, w: 3, h: 6 } },
  },
]
const LOG_TILES = WIDGETS.filter((w) => w.type === 'log').length

const browser = await launchChromium({ channel: 'chrome', headless: true }).catch(() =>
  launchChromium({ channel: 'chrome', headless: true }).catch(() => launchChromium({ headless: true }))
)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const errs = []
let expectRefusal = false
const attach = (p) => {
  p.on('pageerror', (e) => errs.push(String(e.message)))
  p.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location?.()?.url
    if (!isAppResource(url)) return
    if (expectRefusal && /ws\/logs.*failed/.test(m.text())) return
    errs.push(m.text() + (url ? ' <- ' + url : ''))
  })
  p.on('dialog', (d) => d.accept().catch(() => {}))
}
await ctx.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)
const page = await ctx.newPage()
attach(page)

const tile = (label) =>
  probe(
    page,
    (l) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      if (!w) return null
      const root = w.querySelector('.nh-log')
      const lines = [...w.querySelectorAll('.nh-log__line')].map((ln) => ({
        level: ln.querySelector('.nh-log__level')?.textContent ?? '',
        time: ln.querySelector('.nh-log__time')?.textContent ?? '',
        logger: ln.querySelector('.nh-log__logger')?.textContent ?? '',
        loggerFull: ln.querySelector('.nh-log__logger')?.getAttribute('title') ?? '',
        msg: ln.querySelector('.nh-log__msg')?.textContent ?? '',
        cls: ln.className,
      }))
      const scroll = w.querySelector('.nh-log__scroll')
      const pause = w.querySelector('.nh-log__pause')
      const word = w.querySelector('.nh-log__pausetext')
      return {
        status: root?.getAttribute('data-status') ?? null,
        lines,
        empty: w.querySelector('.nh-log__empty')?.textContent ?? null,
        notice: w.querySelector('.nh-log__notice')?.textContent ?? null,
        pause: !!pause,
        paused: pause?.getAttribute('aria-pressed') ?? null,
        pauseLabel: pause?.getAttribute('aria-label') ?? null,
        pausePlate: pause ? getComputedStyle(pause).backgroundColor : null,
        pauseWord: word ? getComputedStyle(word).display : 'absent',
        jump: !!w.querySelector('.nh-log__jump'),
        following: scroll?.getAttribute('data-following') ?? null,
        scrollTop: scroll?.scrollTop ?? null,
        scrollHeight: scroll?.scrollHeight ?? null,
        clientHeight: scroll?.clientHeight ?? null,
        error: !!w.closest('.nh-gcell')?.querySelector('.nh-widget--error'),
      }
    },
    label
  )
const waitTile = async (label, pred, ms = 8000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await tile(label)
    if (last && pred(last)) return last
    await sleep(120)
  }
  return last
}
const has = (t, text) => (t?.lines ?? []).some((ln) => ln.msg.includes(text))
const count = (t, text) => (t?.lines ?? []).filter((ln) => ln.msg.includes(text)).length

try {
  await makeItem(DIM, 'Dimmer', 'NH E2E Log Dimmer')
  await putState('0')
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 1, id: DASH, name: 'E2E Log', columns: 12, rowHeight: 28, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)
  console.log(`target openHAB ${version || '?'}: ${protocol} protocol`)

  await page.goto(APP + '#/d/' + DASH)
  await page.waitForSelector('.nh-log', { timeout: 20000 }).catch(() => {})

  const roots = await probe(page, () => document.querySelectorAll('.nh-log').length)
  ok('every log tile renders', roots === LOG_TILES, `${roots} of ${LOG_TILES}`)
  const errTiles = await probe(page, () => document.querySelectorAll('.nh-widget--error').length)
  ok('no tile fell back to the error boundary', errTiles === 0, 'error tiles=' + errTiles)
  const live = await waitTile('Events', (t) => t.status === 'live', 15000)
  ok('the log socket opens and the tiles report live', live?.status === 'live', 'status=' + live?.status)
  await sleep(800)
  const before = await tile('Server')
  const beforeEv = await tile('Events')
  const history = (before?.lines.length ?? 0) + (beforeEv?.lines.length ?? 0)
  ok(
    protocol === 'object' ? 'history arrives on connect (openHAB 5)' : 'no history on connect, as openHAB 4.3 has none to send',
    protocol === 'object' ? history > 0 : true,
    `${history} lines before anything was written`
  )

  for (const v of [10, 20, 30]) {
    await putState(v)
    await sleep(150)
  }
  const events = await waitTile('Events', (t) => has(t, `'${DIM}' changed from 20 to 30`))
  ok('a state change reaches the events tile as its events.log line', has(events, `'${DIM}' changed from 20 to 30`), (events?.lines.at(-1)?.msg ?? '(none)').slice(0, 90))
  const order = (t) => ['from 0 to 10', 'from 10 to 20', 'from 20 to 30'].map((s) => (t?.lines ?? []).findIndex((ln) => ln.msg.includes(s)))
  const seq = order(events)
  const times = (events?.lines ?? []).map((ln) => ln.time)
  const crossesMidnight = times.some((x) => x.startsWith('00:')) && times.some((x) => x.startsWith('23:'))
  const monotone = crossesMidnight || times.every((x, i) => i === 0 || x >= times[i - 1])
  ok('newest at the bottom', seq.every((i) => i >= 0) && seq[0] < seq[1] && seq[1] < seq[2] && monotone, `positions ${seq.join(' < ')} of ${events?.lines.length}, times in order: ${monotone}`)
  const server = await tile('Server')
  ok('the openhab.log tile shows none of them', has(events, DIM) && !has(server, DIM), `server tile has ${count(server, DIM)} item lines`)
  const both = await waitTile('Filtered', (t) => has(t, 'from 20 to 30'))
  ok('a tile set to both shows them too', has(both, 'from 20 to 30'), `${both?.lines.length} lines`)

  await warnLine(MARKER)
  const warned = await waitTile('Server', (t) => has(t, MARKER))
  const warnLn = warned?.lines.find((ln) => ln.msg.includes(MARKER))
  ok('a warning the server logs reaches the openhab.log tile', !!warnLn, (warnLn?.msg ?? '(none)').slice(0, 100))
  ok('tagged WARN, from the logger that wrote it', warnLn?.level === 'WARN' && warnLn?.logger === 'LogWebSocket' && /LogWebSocket$/.test(warnLn?.loggerFull ?? ''), JSON.stringify({ level: warnLn?.level, logger: warnLn?.logger, full: warnLn?.loggerFull }))
  ok('and marked as a warning line', /nh-log__line--warn/.test(warnLn?.cls ?? ''), warnLn?.cls ?? '')
  const warnings = await waitTile('Warnings', (t) => has(t, MARKER))
  ok('a tile set to warnings and errors shows the warning and not the info events', has(warnings, MARKER) && !has(warnings, DIM), `${warnings?.lines.length} lines, ${count(warnings, DIM)} of them item events`)
  const colours = await probe(
    page,
    ({ marker, dim }) => {
      const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const lineWith = (w, text) => [...(w?.querySelectorAll('.nh-log__line') ?? [])].find((ln) => ln.querySelector('.nh-log__msg')?.textContent.includes(text))
      const warn = lineWith(find('Server'), marker)
      const info = lineWith(find('Events'), dim)
      if (!warn || !info) return null
      return {
        warnLevel: getComputedStyle(warn.querySelector('.nh-log__level')).color,
        infoLevel: getComputedStyle(info.querySelector('.nh-log__level')).color,
        warnBar: getComputedStyle(warn).borderLeftColor,
        infoBar: getComputedStyle(info).borderLeftColor,
      }
    },
    { marker: MARKER, dim: DIM }
  )
  ok(
    'a warning is coloured apart from an info line, on its tag and its edge',
    colours && colours.warnLevel !== colours.infoLevel && colours.warnBar !== colours.infoBar && colours.infoBar === 'rgba(0, 0, 0, 0)',
    JSON.stringify(colours)
  )

  await command(40)
  const cmd = await waitTile('Events', (t) => has(t, `received command 40`))
  ok('a command reaches the events tile as its ItemCommandEvent line', has(cmd, 'received command 40'), (cmd?.lines.at(-1)?.msg ?? '').slice(0, 80))
  const loggerTile = await waitTile('Logger', (t) => has(t, 'from 30 to 40'))
  ok('a logger filter keeps the state changes and drops the command', has(loggerTile, 'from 30 to 40') && !has(loggerTile, 'received command') && !has(loggerTile, MARKER), `${loggerTile?.lines.length} lines`)
  const filtered = await tile('Filtered')
  ok('a text filter keeps the item’s lines and drops the warning', has(filtered, DIM) && !has(filtered, MARKER), `${filtered?.lines.length} lines`)

  const line = events?.lines.find((ln) => ln.msg.includes('from 20 to 30'))
  ok('a line carries the time, the level, the logger’s last segment and the message', !!line && /^\d{2}:\d{2}:\d{2}$/.test(line.time) && line.level === 'INFO' && line.logger === 'ItemStateChangedEvent', JSON.stringify(line))
  ok('with the whole logger name on hover', line?.loggerFull === 'openhab.event.ItemStateChangedEvent', line?.loggerFull ?? '')

  const wrapTile = await waitTile('Wrap', (t) => has(t, 'from 20 to 30'))
  const geometry = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const rows = (el) => {
      if (!el) return -1
      const r = document.createRange()
      r.selectNodeContents(el)
      const boxes = [...r.getClientRects()].filter((b) => b.width > 0)
      const tops = [...new Set(boxes.map((b) => Math.round(b.top)))]
      return tops.length
    }
    const lastMsg = (l) => [...(find(l)?.querySelectorAll('.nh-log__msg') ?? [])].at(-1)
    const wrapMsg = lastMsg('Wrap')
    const plainMsg = lastMsg('Events')
    const show = (l, sel) => {
      const el = find(l)?.querySelector(sel)
      return el ? getComputedStyle(el).display : null
    }
    return {
      wrapRows: rows(wrapMsg),
      plainRows: rows(plainMsg),
      plainOverflow: plainMsg ? getComputedStyle(plainMsg).textOverflow : null,
      wideLogger: show('Events', '.nh-log__logger'),
      filteredLogger: show('Filtered', '.nh-log__logger'),
      filteredTime: show('Filtered', '.nh-log__time'),
      narrowLogger: show('Narrow', '.nh-log__logger'),
      narrowTime: show('Narrow', '.nh-log__time'),
      narrowLevel: show('Narrow', '.nh-log__level'),
    }
  })
  ok('a wrapped tile lets a long message take more than one row', wrapTile && geometry && geometry.wrapRows >= 2, `rows=${geometry?.wrapRows}`)
  ok('an unwrapped one keeps a line on one row, cut with an ellipsis', geometry && geometry.plainRows === 1 && geometry.plainOverflow === 'ellipsis', JSON.stringify({ rows: geometry?.plainRows, overflow: geometry?.plainOverflow }))
  ok(
    'a wide tile keeps the logger, a three-column tile drops it, and a two-column tile drops the time too, keeping the level',
    geometry && geometry.wideLogger !== 'none' && geometry.filteredLogger === 'none' && geometry.filteredTime !== 'none' && geometry.narrowLogger === 'none' && geometry.narrowTime === 'none' && geometry.narrowLevel !== 'none',
    JSON.stringify(geometry)
  )

  // Counted, and waited for on the tile the claim is about: openHAB 5 hands the tile a hundred lines
  // of history on connect, so on a re-run 'to 100' is already there and waiting for it returns before
  // the burst has arrived - which read as the tile losing 53 of 60 lines under a battery's load.
  const burstBefore = count(await tile('Events'), DIM)
  for (let v = 41; v <= 100; v++) await putState(v)
  const allTile = await waitTile('Events', (t) => count(t, DIM) >= burstBefore + 60, 15000)
  const fewTile = await tile('Few')
  const arrived = count(allTile, DIM) - burstBefore
  // the 60 of that burst land in a handful of flushes, so this is also what says a flush loses none of them
  ok(
    'a tile keeps no more than its setting says, and a burst loses no lines',
    fewTile && fewTile.lines.length <= 50 && arrived >= 60,
    `few=${fewTile?.lines.length} events=${arrived} of 60 (${burstBefore} before)`
  )
  const followed = await tile('Events')
  const atBottom = (t) => t && t.scrollHeight - t.scrollTop - t.clientHeight <= 12
  ok('the list follows the newest line', atBottom(followed) && followed.following === 'true' && !followed.jump && followed.scrollHeight > followed.clientHeight, JSON.stringify({ top: followed?.scrollTop, height: followed?.scrollHeight, client: followed?.clientHeight }))
  // A scroll nobody made must not stop it following. Opening a settings panel moves this box for a
  // frame, and measuring then left the tile stranded, walking further from the newest line with every
  // trimmed one. Poking scrollTop is the same kind of scroll and needs no timing to reproduce.
  await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Events')
    const s = w?.querySelector('.nh-log__scroll')
    if (s) s.scrollTop = 0
  })
  const shoveLine = changeTo(7)
  // counted rather than looked for: openHAB 5 hands the tile a hundred lines of history on connect,
  // which on a re-run already holds this very line
  const shoveBefore = count(followed, shoveLine)
  await putState(7)
  const shoved = await waitTile('Events', (t) => count(t, shoveLine) > shoveBefore && t.following === 'true')
  const shoveArrived = count(shoved, shoveLine) > shoveBefore
  ok(
    'a scroll nobody made does not stop it following',
    shoved && shoved.following === 'true' && !shoved.jump && atBottom(shoved) && shoveArrived,
    JSON.stringify({ following: shoved?.following, jump: shoved?.jump, top: shoved?.scrollTop, height: shoved?.scrollHeight, arrived: shoveArrived })
  )

  // the reader's own wheel is what stops it, so drive the wheel rather than the property
  const eventsBox = await page
    .locator('.nh-widget:has(.nh-widget__labeltext:text-is("Events")) .nh-log__scroll')
    .first()
    .boundingBox()
    .catch(() => null)
  if (eventsBox) {
    await page.mouse.move(eventsBox.x + eventsBox.width / 2, eventsBox.y + eventsBox.height / 2)
    await page.mouse.wheel(0, -600)
  }
  const up = await waitTile('Events', (t) => t.following === 'false', 4000)
  ok(
    'the reader scrolling up pauses following and offers a way back',
    up && up.following === 'false' && up.jump && !atBottom(up),
    JSON.stringify({ following: up?.following, jump: up?.jump, top: up?.scrollTop, wasAt: shoved?.scrollTop })
  )
  const nudgedTo = up?.scrollTop ?? 0
  const dragLine = changeTo(8)
  const dragBefore = count(up, dragLine)
  await putState(8)
  const still = await waitTile('Events', (t) => count(t, dragLine) > dragBefore)
  const dragArrived = count(still, dragLine) > dragBefore
  // the trim walks the held view up the list so the reader keeps the lines they were reading, which is
  // why this asks that it did not jump to the bottom rather than that the position never moved
  ok(
    'a new line does not drag the reader back down',
    still && !atBottom(still) && still.scrollTop <= nudgedTo && dragArrived,
    `top=${still?.scrollTop} of ${nudgedTo} arrived=${dragArrived}`
  )
  await page.locator('.nh-widget:has(.nh-widget__labeltext:text-is("Events")) .nh-log__jump').first().click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  const jumped = await tile('Events')
  ok('and the pill takes them back to the newest', atBottom(jumped) && !jumped.jump, JSON.stringify({ top: jumped?.scrollTop, height: jumped?.scrollHeight, jump: jumped?.jump }))

  const pauseBtn = (label) => page.locator(`.nh-widget:has(.nh-widget__labeltext:text-is("${label}")) .nh-log__pause`).first()
  const wordShown = (t) => t?.pauseWord !== 'none' && t?.pauseWord !== 'absent'
  const running = await tile('Events')
  ok('a tile carries a pause button', running?.pause === true && running?.paused === 'false', JSON.stringify({ present: running?.pause, pressed: running?.paused, label: running?.pauseLabel }))
  const geom = await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Events')
    const btn = w?.querySelector('.nh-log__pause')
    const row = w?.querySelector('.nh-widget__label')
    const name = w?.querySelector('.nh-widget__labeltext')
    const list = w?.querySelector('.nh-log__scroll')
    const cell = w?.closest('.nh-gcell')
    if (!btn || !row || !name || !list || !cell) return null
    const b = btn.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    const n = name.getBoundingClientRect()
    const l = list.getBoundingClientRect()
    const c = cell.getBoundingClientRect()
    const pr = parseFloat(getComputedStyle(row).paddingRight) || 0
    const hit = document.elementFromPoint((b.left + b.right) / 2, b.top - 6)
    return {
      fromRight: Math.round(r.right - pr - b.right),
      afterName: Math.round(b.left - n.right),
      aboveList: Math.round(l.top - b.bottom),
      inside: b.left >= c.left - 1 && b.right <= c.right + 1 && b.top >= c.top - 1,
      height: Math.round(b.height),
      hitAbove: !!(hit && hit.closest && hit.closest('.nh-log__pause')),
    }
  })
  ok(
    'at the top right of the tile: after the name, at the row’s right end, above the console and inside the cell',
    geom && geom.fromRight >= -1 && geom.fromRight <= 2 && geom.afterName >= 0 && geom.aboveList >= 0 && geom.inside,
    JSON.stringify(geom)
  )
  ok('and big enough to press, with a target past what it draws', geom && geom.height >= 20 && geom.hitAbove, JSON.stringify({ height: geom?.height, aboveHits: geom?.hitAbove }))
  await pauseBtn('Events').click({ timeout: 4000 }).catch(() => {})
  await sleep(250)
  const held = await tile('Events')
  ok('pressing it says so, in a word and in its colour', held?.paused === 'true' && wordShown(held) && held.pausePlate !== running?.pausePlate && held.pauseLabel !== running?.pauseLabel, JSON.stringify({ pressed: held?.paused, word: held?.pauseWord, plate: held?.pausePlate, was: running?.pausePlate, label: held?.pauseLabel }))
  const frozenAt = held?.lines.length ?? 0
  // What the tile was showing when it was paused. Compared rather than searching for the new line's
  // text: a state change reads the same whenever the item last made it, and the server's buffer is
  // shared with everything else that has run against it.
  const frozenLast = held?.lines.at(-1)?.msg ?? ''
  await putState(3)
  const whilePausedLine = changeTo(4)
  await putState(4)
  const moved = await waitTile('Filtered', (t) => has(t, whilePausedLine), 10000)
  const stillHeld = await tile('Events')
  ok(
    'a line that arrives while it is paused is not shown, and the tile beside it shows it',
    has(moved, whilePausedLine) && stillHeld?.lines.length === frozenAt && (stillHeld?.lines.at(-1)?.msg ?? '') === frozenLast,
    JSON.stringify({ other: has(moved, whilePausedLine), lines: `${frozenAt} -> ${stillHeld?.lines.length}`, sameLast: (stillHeld?.lines.at(-1)?.msg ?? '') === frozenLast })
  )
  await pauseBtn('Events').click({ timeout: 4000 }).catch(() => {})
  const caught = await waitTile('Events', (t) => has(t, whilePausedLine), 8000)
  ok(
    'resuming catches up rather than losing what happened',
    has(caught, whilePausedLine) && caught?.paused === 'false' && caught.pauseWord === 'absent',
    JSON.stringify({ arrived: has(caught, whilePausedLine), pressed: caught?.paused, word: caught?.pauseWord, lines: caught?.lines.length })
  )
  await pauseBtn('Tiny').click({ timeout: 4000 }).catch(() => {})
  await pauseBtn('Filtered').click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  const tinyHeld = await tile('Tiny')
  const wideHeld = await tile('Filtered')
  ok(
    'a one-column tile keeps the button and sheds the word, a wider one keeps both',
    tinyHeld?.paused === 'true' && tinyHeld.pauseWord === 'none' && wideHeld?.paused === 'true' && wordShown(wideHeld),
    JSON.stringify({ tiny: tinyHeld?.pauseWord, wide: wideHeld?.pauseWord })
  )
  await pauseBtn('Tiny').click({ timeout: 4000 }).catch(() => {})
  await pauseBtn('Filtered').click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  const backToLive = await Promise.all([tile('Tiny'), tile('Filtered'), tile('Events')])
  ok('and every tile is running again', backToLive.every((t) => t?.paused === 'false'), backToLive.map((t) => t?.paused).join(' '))

  const hostile = await tile('Hostile')
  ok('a configuration of the wrong shape everywhere still renders on the defaults', hostile && !hostile.error && hostile.status === 'live', JSON.stringify({ error: hostile?.error, status: hostile?.status, lines: hostile?.lines.length }))
  const spill = await probe(page, () => {
    const out = []
    let scanned = 0
    let lines = 0
    for (const cell of document.querySelectorAll('.nh-gcell')) {
      const cr = cell.getBoundingClientRect()
      const label = cell.querySelector('.nh-widget__labeltext')?.textContent || '?'
      const boxes = cell.querySelectorAll('.nh-log, .nh-log__scroll, .nh-log__jump, .nh-log__pause, .nh-log__empty, .nh-log__status')
      if (boxes.length) scanned++
      for (const el of boxes) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const over = Math.max(cr.left - r.left, r.right - cr.right, cr.top - r.top, r.bottom - cr.bottom)
        if (over > 1) out.push(`${label}: ${el.className} past by ${over.toFixed(1)}px`)
      }
      for (const ln of cell.querySelectorAll('.nh-log__line')) {
        const r = ln.getBoundingClientRect()
        if (r.width === 0) continue
        lines++
        const over = Math.max(cr.left - r.left, r.right - cr.right)
        if (over > 1) out.push(`${label}: a line past the side by ${over.toFixed(1)}px`)
      }
    }
    return { scanned, lines, spills: [...new Set(out)] }
  })
  ok(
    'no tile draws past its cell, and no line reaches past its side',
    spill && spill.scanned === LOG_TILES && spill.lines > 50 && spill.spills.length === 0,
    `scanned ${spill?.scanned} of ${LOG_TILES}, ${spill?.lines} lines` + (spill?.spills.length ? ': ' + spill.spills.slice(0, 4).join(' | ') : '')
  )

  const target = page.locator('.nh-widget:has(.nh-widget__labeltext:text-is("Events"))').first()
  await target.scrollIntoViewIfNeeded().catch(() => {})
  const b = await target.boundingBox().catch(() => null)
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await sleep(750)
    await page.mouse.up()
  }
  await page.waitForSelector('.nh-logview', { timeout: 6000 }).catch(() => {})
  const opened = await probe(page, () => ({
    hash: location.hash,
    title: document.querySelector('.nh-logview .nh-dash__title')?.textContent ?? null,
    lines: document.querySelectorAll('.nh-logview .nh-log__line').length,
    state: document.querySelector('.nh-logview__state')?.textContent ?? null,
    count: document.querySelector('.nh-logview__count')?.textContent ?? null,
    width: document.querySelector('.nh-logview')?.getBoundingClientRect().width ?? 0,
  }))
  ok('a hold on the tile opens the log full screen, on its own route', opened && opened.hash === `#/log/${DASH}/w-events` && opened.width >= 1200, JSON.stringify({ hash: opened?.hash, width: opened?.width }))
  ok('titled as the widget, live, with the lines and a count', opened && opened.title === 'Events' && opened.state === 'Live' && opened.lines > 50 && /\d+ of \d+/.test(opened.count ?? ''), JSON.stringify(opened))
  const pageLine = await probe(page, () => {
    const ln = [...document.querySelectorAll('.nh-logview .nh-log__line')].at(-1)
    const scroll = document.querySelector('.nh-logview .nh-log__scroll')
    return ln
      ? {
          time: ln.querySelector('.nh-log__time')?.textContent,
          logger: ln.querySelector('.nh-log__logger')?.textContent,
          atBottom: scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 12 : null,
          listScrolls: scroll ? scroll.scrollHeight > scroll.clientHeight : null,
          windowScrolls: document.documentElement.scrollHeight > window.innerHeight + 2,
        }
      : null
  })
  // the whole name, dots and all, where the tile shows only the last segment. Not pinned to one
  // event class: a live server has its own writers, so the newest line is not always ours.
  ok('the page shows milliseconds and the whole logger name', pageLine && /^\d{2}:\d{2}:\d{2}[.,]\d{3}$/.test(pageLine.time ?? '') && /^openhab\.event\.\w+$/.test(pageLine.logger ?? ''), JSON.stringify(pageLine))
  ok('and opens on the newest line, scrolling the list rather than the window', pageLine && pageLine.atBottom === true && pageLine.listScrolls === true && pageLine.windowScrolls === false, JSON.stringify({ atBottom: pageLine?.atBottom, list: pageLine?.listScrolls, window: pageLine?.windowScrolls }))

  const chip = (text) => page.locator('.nh-logview__chips .nh-chip', { hasText: text }).first()
  const pageHas = (text) => probe(page, (t) => [...document.querySelectorAll('.nh-logview .nh-log__msg')].some((m) => m.textContent.includes(t)), text)
  const beforeBoth = await pageHas(MARKER)
  await chip('Both').click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  const afterBoth = await pageHas(MARKER)
  ok('the source chips start where the widget is set, and switching to Both brings the warning in', beforeBoth === false && afterBoth === true, `before=${beforeBoth} after=${afterBoth}`)
  await chip('Warnings and errors').click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  const onlyWarn = await probe(page, () => {
    const lines = [...document.querySelectorAll('.nh-logview .nh-log__line')]
    const of = (level) => lines.filter((l) => l.className.includes('--' + level)).length
    return { n: lines.length, info: of('info'), debug: of('debug') + of('trace'), warn: of('warn'), error: of('error') }
  })
  ok('the level chips filter what is shown', onlyWarn && onlyWarn.n > 0 && onlyWarn.info === 0 && onlyWarn.debug === 0 && onlyWarn.warn > 0 && onlyWarn.warn + onlyWarn.error === onlyWarn.n, JSON.stringify(onlyWarn))
  await chip('Everything').click({ timeout: 4000 }).catch(() => {})
  await sleep(200)

  await page.locator('.nh-logview__search').fill(MARKER).catch(() => {})
  await sleep(300)
  const searched = await probe(page, () => ({
    lines: document.querySelectorAll('.nh-logview .nh-log__line').length,
    count: document.querySelector('.nh-logview__count')?.textContent ?? null,
  }))
  ok('the search box narrows the list to the matching line and the count says how many were hidden', searched && searched.lines === 1 && /^Showing 1 of \d+$/.test(searched.count ?? '') && Number(searched.count.split(' of ')[1]) > 1, JSON.stringify(searched))
  await page.locator('.nh-logview__search').fill('').catch(() => {})
  await sleep(200)

  await page.locator('.nh-logview .nh-dash__bar button', { hasText: 'Pause' }).first().click({ timeout: 4000 }).catch(() => {})
  await sleep(200)
  await warnLine(MARKER2)
  await sleep(1500)
  const whilePaused = await probe(page, (t) => ({ has: [...document.querySelectorAll('.nh-logview .nh-log__msg')].some((m) => m.textContent.includes(t)), state: document.querySelector('.nh-logview__state')?.textContent }), MARKER2)
  ok('paused, a new line is held back and the state says so', whilePaused && !whilePaused.has && whilePaused.state === 'Paused', JSON.stringify(whilePaused))
  await page.locator('.nh-logview .nh-dash__bar button', { hasText: 'Resume' }).first().click({ timeout: 4000 }).catch(() => {})
  let resumed = false
  for (let i = 0; i < 30 && !resumed; i++) {
    await sleep(150)
    resumed = (await pageHas(MARKER2)) === true
  }
  ok('resuming shows what arrived meanwhile', resumed)

  // Which of the two the app uses is the browser's decision, not ours: navigator.clipboard exists
  // only in a secure context, so this passes over http by the selection and over TLS by the write.
  // The write is watched rather than read back, because reading needs a permission this has not got.
  const copied = await probe(page, async (t) => {
    let written = ''
    if (navigator.clipboard) {
      const real = navigator.clipboard.writeText?.bind(navigator.clipboard)
      navigator.clipboard.writeText = (s) => {
        written = String(s)
        return real ? real(s).catch(() => {}) : Promise.resolve()
      }
    }
    const btn = [...document.querySelectorAll('.nh-logview .nh-dash__bar button')].find((b) => b.textContent === 'Copy')
    btn?.click()
    await new Promise((r) => setTimeout(r, 300))
    const selected = window.getSelection()?.toString() ?? ''
    return { via: written ? 'clipboard' : 'selection', has: written.includes(t) || selected.includes(t) }
  }, DIM)
  ok('copy puts the lines on the clipboard, or selects them where the page has no clipboard', copied && copied.has === true, JSON.stringify(copied))

  const beforeClear = await pageHas(MARKER2)
  await page.locator('.nh-logview .nh-dash__bar button', { hasText: 'Clear' }).first().click({ timeout: 4000 }).catch(() => {})
  await sleep(200)
  const cleared = await probe(page, (t) => ({ lines: document.querySelectorAll('.nh-logview .nh-log__line').length, marker: [...document.querySelectorAll('.nh-logview .nh-log__msg')].some((m) => m.textContent.includes(t)) }), MARKER2)
  const nextLine = changeTo(5)
  await putState(5)
  let after = false
  for (let i = 0; i < 30 && !after; i++) {
    await sleep(150)
    after = (await pageHas(nextLine)) === true
  }
  // a busy server writes lines between the clear and this read, so what the clear is for is that the
  // lines that were there are gone and the ones after it arrive, never a count at an instant
  ok('clear empties the list, and the next line starts it again', beforeClear === true && cleared && cleared.marker === false && after, JSON.stringify({ beforeClear, cleared, after }))

  const fromHash = await probe(page, () => location.hash)
  await page.locator('.nh-logview .nh-dash__bar .nh-iconbtn').first().click({ timeout: 4000 }).catch(() => {})
  await page.waitForSelector('.nh-gcell', { timeout: 6000 }).catch(() => {})
  const backHash = await probe(page, () => location.hash)
  ok('back returns to the dashboard', fromHash === `#/log/${DASH}/w-events` && backHash === '#/d/' + DASH, `${fromHash} -> ${backHash}`)
  const afterClear = await tile('Server')
  ok('the tiles share the buffer the page cleared', afterClear && !has(afterClear, MARKER) && !has(afterClear, MARKER2) && afterClear.lines.length < 60, `${afterClear?.lines.length} lines, marker=${has(afterClear, MARKER)}`)

  const server2 = page.locator('.nh-widget:has(.nh-widget__labeltext:text-is("Server"))').first()
  await server2.click({ button: 'right', timeout: 4000 }).catch(() => {})
  await page.waitForSelector('.nh-logview', { timeout: 6000 }).catch(() => {})
  const rightHash = await probe(page, () => location.hash)
  ok('a right-click opens the viewer too', rightHash === `#/log/${DASH}/w-server`, rightHash ?? '')
  await page.goto(APP + '#/log/' + DASH + '/no-such-widget')
  await sleep(600)
  const gone = await probe(page, () => document.querySelector('.nh-dash__empty')?.textContent ?? null)
  ok('a route to a widget that is not there says so', gone === 'That log widget is no longer on this dashboard.', gone ?? '(none)')
  await page.goto(APP + '#/d/' + DASH)
  await page.waitForSelector('.nh-log', { timeout: 10000 }).catch(() => {})

  const allowed = await anonymousAllowed()
  const anon = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await anon.addInitScript(() => {
    try {
      localStorage.setItem('neohab:themeOverride', 'dark')
    } catch {}
  })
  const anonPage = await anon.newPage()
  expectRefusal = !allowed
  attach(anonPage)
  await anonPage.goto(APP + '#/d/' + DASH)
  await anonPage.waitForSelector('.nh-log', { timeout: 20000 }).catch(() => {})
  const anonRead = async () => {
    const until = Date.now() + 15000
    let last = null
    while (Date.now() < until) {
      last = await probe(anonPage, () => {
        const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Events')
        return w
          ? {
              status: w.querySelector('.nh-log')?.getAttribute('data-status') ?? null,
              lines: w.querySelectorAll('.nh-log__line').length,
              notice: w.querySelector('.nh-log__notice')?.textContent ?? null,
              button: !!w.querySelector('.nh-log__notice button'),
              pause: !!w.querySelector('.nh-log__pause'),
            }
          : null
      })
      if (last && (last.lines > 0 || last.notice)) return last
      await sleep(200)
    }
    return last
  }
  if (allowed) {
    await putState(6)
  }
  const anonTile = await anonRead()
  ok(
    allowed
      ? 'this server hands the log to an anonymous socket, and the tile shows it signed out'
      : 'this server refuses an anonymous socket, and the tile says to sign in as an administrator',
    allowed ? anonTile && anonTile.lines > 0 && !anonTile.notice : anonTile && anonTile.notice === 'Sign in as an administrator to see the log.Sign in' && anonTile.button && anonTile.lines === 0,
    JSON.stringify(anonTile)
  )
  ok(
    allowed ? 'and it can be paused, since there is a log to pause' : 'and no pause button, since there is nothing to pause',
    anonTile && anonTile.pause === allowed,
    JSON.stringify({ allowed, pause: anonTile?.pause })
  )
  if (!allowed) {
    await anonPage.locator('.nh-log__notice button').first().click({ timeout: 4000 }).catch(() => {})
    await anonPage.waitForSelector('.nh-sheet', { timeout: 4000 }).catch(() => {})
    const sheet = await probe(anonPage, () => document.querySelector('.nh-sheet .nh-sheet__title')?.textContent ?? null)
    ok('and its button opens the sign-in sheet', sheet === 'Sign in to openHAB', sheet ?? '(none)')
  }
  await anon.close()
  expectRefusal = false

  await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Events"))').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
  const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
  const srcSel = field('Source').locator('select').first()
  const srcN = await srcSel.locator('option').count().catch(() => -1)
  const srcV = await srcSel.inputValue({ timeout: 3000 }).catch(() => null)
  const lvlN = await field('Minimum level').locator('select option').count().catch(() => -1)
  const lvlV = await field('Minimum level').locator('select').first().inputValue({ timeout: 3000 }).catch(() => null)
  ok('the panel offers the three sources and four levels, none blank', srcN === 3 && srcV === 'events' && lvlN === 4 && lvlV === 'all', JSON.stringify({ srcN, srcV, lvlN, lvlV }))
  const loggers = await field('Logger filter (one per line)').locator('textarea').count().catch(() => -1)
  const contains = await field('Message contains').locator('input').count().catch(() => -1)
  const keepInput = field('Lines to keep').locator('input').first()
  const keepV = await keepInput.inputValue({ timeout: 3000 }).catch(() => null)
  const wrap = await field('Wrap lines').locator('input[type="checkbox"]').count().catch(() => -1)
  const showName = await field('Show the name').count().catch(() => -1)
  ok('with the logger patterns, the text, the line count and the wrap toggle', loggers === 1 && contains === 1 && keepV === '500' && wrap === 1 && showName === 1, JSON.stringify({ loggers, contains, keepV, wrap, showName }))
  // a log tile follows its newest line about once a second, and a scroll anywhere in the document used to close
  // the item picker beside it and put the stored name back under whoever was typing
  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Reading"))').first().click({ timeout: 5000 }).catch(() => {})
  const picker = page.locator('.nh-sheet input[role="combobox"]').first()
  await picker.waitFor({ timeout: 8000 }).catch(() => {})
  await page.evaluate(() => {
    window.__logScrolls = 0
    document.addEventListener(
      'scroll',
      (e) => {
        if (e.target instanceof Element && e.target.closest('.nh-log')) window.__logScrolls++
      },
      true
    )
  })
  await picker.click({ timeout: 5000 }).catch(() => {})
  await page.keyboard.type('e2e_logd', { delay: 60 })
  for (const v of [7, 8, 9]) {
    await putState(v)
    await sleep(700)
  }
  const typed = await probe(page, () => ({
    value: document.querySelector('.nh-sheet input[role="combobox"]')?.value ?? null,
    list: !!document.querySelector('.nh-picker__list'),
    options: [...document.querySelectorAll('.nh-picker__option .nh-picker__name')].map((n) => n.textContent),
    scrolls: window.__logScrolls,
  }))
  ok(
    'a log tile following its newest line leaves the item picker beside it alone',
    typed && typed.scrolls > 0 && typed.value === 'e2e_logd' && typed.list === true && typed.options.includes(DIM),
    JSON.stringify(typed)
  )
  await page
    .locator(`.nh-picker__option:has(.nh-picker__name:text-is("${DIM}"))`)
    .first()
    .click({ timeout: 5000 })
    .catch(() => {})
  await sleep(300)
  const picked = await probe(page, () => document.querySelector('.nh-sheet input[role="combobox"]')?.value ?? null)
  ok('and the item under the pointer can still be picked', picked === DIM, String(picked))

  const wasEditing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const editing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  ok('leaving the editor without saving', wasEditing === true && editing === false, `was=${wasEditing} now=${editing}`)

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.stack))
} finally {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(itemUrl(DIM), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const left = await fetch(NS, { headers: AUTH })
    .then((r) => r.json())
    .then((cs) => cs.filter((c) => c.uid === UID).map((c) => c.uid))
    .catch(() => ['<unreadable>'])
  ok('cleanup: dashboard removed', left.length === 0, left.join(','))
  const itemLeft = await fetch(itemUrl(DIM), { headers: AUTH })
    .then((r) => r.status)
    .catch(() => 0)
  ok('cleanup: test item removed', itemLeft === 404, 'status=' + itemLeft)
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log('\n' + (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') + '  (' + (results.length - failed.length) + '/' + results.length + ')')
  process.exitCode = failed.length === 0 ? 0 : 1
}
