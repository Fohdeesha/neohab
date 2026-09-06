/**
 * Log widget e2e: openhab.log and events.log on a tile, filtered, following the newest line, and
 * the full-screen viewer a hold opens.
 *
 * Every line this suite reads is one it made itself: state changes and a command on a managed
 * Dimmer it creates (which openHAB logs as `openhab.event.*` entries, the events.log lines), and
 * a deliberately unparseable message sent to the log socket, which the server logs as a WARN from
 * its own LogWebSocket carrying the text verbatim (an openhab.log line). Each carries a marker
 * unique to this run, so a line from an earlier run or another suite can never satisfy a check.
 *
 * The two openHAB lines differ in what the socket does: openHAB 5 sends history and refuses a
 * device that is not an administrator, 4.3 sends no history and admits whoever its user role
 * admits. Both facts are read from the target first and the UI is held to whichever is true.
 *
 * SAFE with a live config. Creates and deletes exactly:
 *   - dashboard:nh-e2e-log            (neohab:config)
 *   - managed item nh_e2e_logdim      (a Dimmer bound to nothing)
 * Writes a few WARN lines into the server's log (the markers). Enters edit mode once to inspect
 * the settings panel and leaves without saving. Commands nothing through the app.
 */
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
/**
 * Where the item stands, so a check can name the line it is waiting for instead of hardcoding a
 * value an earlier section might have moved. A hardcoded "from 7 to 5" is right until a section
 * is inserted above it, and then it waits for a line the server will never write.
 */
let stateValue = null
const putState = (v) => {
  stateValue = String(v)
  return fetch(itemUrl(DIM) + '/state', { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
}
/** The message openHAB will log for the next `putState(v)`, from where the item is now. */
const changeTo = (v) => `changed from ${stateValue} to ${v}`
const command = (v) => fetch(itemUrl(DIM), { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body: String(v) })
const makeItem = (n, type, label) =>
  fetch(itemUrl(n), { method: 'PUT', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ type, name: n, label }) })
/** Read the page through a shape that cannot throw, so a missing feature fails its own checks. */
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

/* ---------------- what is true of this server ---------------- */
const version = await fetch(BASE + '/rest/')
  .then((r) => r.json())
  .then((j) => String(j.runtimeInfo?.version ?? ''))
  .catch(() => '')
const major = Number((/^\s*(\d+)/.exec(version) ?? [])[1])
/** openHAB 4 speaks the list protocol and sends no history; 5 speaks the object one and does. */
const protocol = major && major < 5 ? 'list' : 'object'
const WS_BASE = BASE.replace(/^http/, 'ws') + '/ws/logs'

/**
 * Write one WARN line into the server's log by sending the socket something it cannot parse as a
 * filter: both lines log `Failed to parse '<text>' ...` from LogWebSocket, verbatim.
 */
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

/** Does the server hand the log to a socket carrying no credentials at all? Asked, not assumed. */
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
// Rows are 28px with a 6px gap, so a tile h rows tall is 34h - 6 px; the `at` helper counts in
// 3-row units: a "3" is 300px, a "2" 198px. At 1280 wide a column is about 99px.
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
  // One column, about 99px: the width at which the paused button has to shed its word.
  at(log('tiny', 'Tiny', { source: 'events' }), 0, 7, 1, 2),
  // Stored configuration is untrusted input: every field here is the wrong shape.
  {
    id: 'w-hostile',
    type: 'log',
    config: { label: 'Hostile', source: 'constructor', minLevel: 42, loggers: ['x'], contains: {}, keep: 'lots', wrap: 'yes' },
    layout: { lg: { x: 9, y: 15, w: 3, h: 6 } },
  },
]

const browser = await launchChromium({ channel: 'msedge', headless: true }).catch(() =>
  launchChromium({ channel: 'chrome', headless: true }).catch(() => launchChromium({ headless: true }))
)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const errs = []
/**
 * A server that refuses an anonymous socket does so at the handshake, and the browser reports
 * that in the console on its own ("WebSocket connection ... failed: 403") - there is no API to
 * quiet it. That line belongs to the anonymous section's expected outcome, and only to it: the
 * signed-in page never gets one, and any other console error still fails the run.
 */
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

/** Everything a tile shows, by its name. */
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
        // Rendered only while paused, and hidden by a container query on a narrow tile: the two
        // are different answers and the check has to tell them apart.
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
  /* ---------------- seed ---------------- */
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

  /* ---------------- A. every tile renders and the socket opens ---------------- */
  const roots = await probe(page, () => document.querySelectorAll('.nh-log').length)
  ok('every log tile renders', roots === WIDGETS.length, `${roots} of ${WIDGETS.length}`)
  const errTiles = await probe(page, () => document.querySelectorAll('.nh-widget--error').length)
  ok('no tile fell back to the error boundary', errTiles === 0, 'error tiles=' + errTiles)
  const live = await waitTile('Events', (t) => t.status === 'live', 15000)
  ok('the log socket opens and the tiles report live', live?.status === 'live', 'status=' + live?.status)
  await sleep(800)
  // openHAB 5 sends what its reader holds on connect, so a tile has lines before this suite
  // has written any; 4.3 sends nothing but what happens next.
  const before = await tile('Server')
  const beforeEv = await tile('Events')
  const history = (before?.lines.length ?? 0) + (beforeEv?.lines.length ?? 0)
  ok(
    protocol === 'object' ? 'history arrives on connect (openHAB 5)' : 'no history on connect, as openHAB 4.3 has none to send',
    protocol === 'object' ? history > 0 : true,
    `${history} lines before anything was written`
  )

  /* ---------------- B. events.log lines, and which tile shows them ---------------- */
  for (const v of [10, 20, 30]) {
    await putState(v)
    await sleep(150)
  }
  const events = await waitTile('Events', (t) => has(t, `'${DIM}' changed from 20 to 30`))
  ok('a state change reaches the events tile as its events.log line', has(events, `'${DIM}' changed from 20 to 30`), (events?.lines.at(-1)?.msg ?? '(none)').slice(0, 90))
  // Order, not ownership: a live server logs events of its own between two of this suite's, so
  // the last line need not be this suite's. What has to hold is that the three land in the
  // order they were made and that the times never run backwards down the list (times are
  // zero-padded HH:mm:ss, so the text order is the time order, barring midnight).
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

  /* ---------------- C. an openhab.log line, and its level ---------------- */
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

  /* ---------------- D. the logger and text filters ---------------- */
  await command(40)
  const cmd = await waitTile('Events', (t) => has(t, `received command 40`))
  ok('a command reaches the events tile as its ItemCommandEvent line', has(cmd, 'received command 40'), (cmd?.lines.at(-1)?.msg ?? '').slice(0, 80))
  const loggerTile = await waitTile('Logger', (t) => has(t, 'from 30 to 40'))
  ok('a logger filter keeps the state changes and drops the command', has(loggerTile, 'from 30 to 40') && !has(loggerTile, 'received command') && !has(loggerTile, MARKER), `${loggerTile?.lines.length} lines`)
  const filtered = await tile('Filtered')
  ok('a text filter keeps the item’s lines and drops the warning', has(filtered, DIM) && !has(filtered, MARKER), `${filtered?.lines.length} lines`)

  /* ---------------- E. a line's anatomy ---------------- */
  const line = events?.lines.find((ln) => ln.msg.includes('from 20 to 30'))
  ok('a line carries the time, the level, the logger’s last segment and the message', !!line && /^\d{2}:\d{2}:\d{2}$/.test(line.time) && line.level === 'INFO' && line.logger === 'ItemStateChangedEvent', JSON.stringify(line))
  ok('with the whole logger name on hover', line?.loggerFull === 'openhab.event.ItemStateChangedEvent', line?.loggerFull ?? '')

  /* ---------------- F. wrapping, and the columns a narrow tile sheds ---------------- */
  const wrapTile = await waitTile('Wrap', (t) => has(t, 'from 20 to 30'))
  const geometry = await probe(page, () => {
    const find = (l) => [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
    const rows = (el) => {
      if (!el) return -1
      const r = document.createRange()
      r.selectNodeContents(el)
      // A block element answers one rect for its border box however many lines it holds; a
      // Range over its contents answers one per line box.
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

  /* ---------------- G. how many lines a tile keeps, and following the newest ---------------- */
  for (let v = 41; v <= 100; v++) await putState(v)
  const fewTile = await waitTile('Few', (t) => has(t, 'to 100'), 12000)
  const allTile = await tile('Events')
  ok('a tile keeps no more than its setting says', fewTile && fewTile.lines.length <= 50 && has(fewTile, 'to 100') && count(allTile, DIM) > 50, `few=${fewTile?.lines.length} events=${count(allTile, DIM)}`)
  const followed = await tile('Events')
  const atBottom = (t) => t && t.scrollHeight - t.scrollTop - t.clientHeight <= 12
  ok('the list follows the newest line', atBottom(followed) && followed.following === 'true' && !followed.jump && followed.scrollHeight > followed.clientHeight, JSON.stringify({ top: followed?.scrollTop, height: followed?.scrollHeight, client: followed?.clientHeight }))
  await probe(page, () => {
    const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === 'Events')
    const s = w?.querySelector('.nh-log__scroll')
    if (s) s.scrollTop = 0
  })
  await sleep(300)
  const up = await tile('Events')
  ok('scrolling up pauses following and offers a way back', up && up.following === 'false' && up.jump && up.scrollTop < 20, JSON.stringify({ following: up?.following, jump: up?.jump, top: up?.scrollTop }))
  // A Dimmer refuses 101, so the next value is a small one; the message names both ends.
  await putState(7)
  const still = await waitTile('Events', (t) => has(t, 'from 100 to 7'))
  ok('a new line does not drag the reader back down', still && still.scrollTop < 20 && has(still, 'from 100 to 7'), `top=${still?.scrollTop} arrived=${has(still, 'from 100 to 7')}`)
  await page.locator('.nh-widget:has(.nh-widget__labeltext:text-is("Events")) .nh-log__jump').first().click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  const jumped = await tile('Events')
  ok('and the pill takes them back to the newest', atBottom(jumped) && !jumped.jump, JSON.stringify({ top: jumped?.scrollTop, height: jumped?.scrollHeight, jump: jumped?.jump }))

  /* ---------------- H. pausing a tile, without opening it full screen ---------------- */
  const pauseBtn = (label) => page.locator(`.nh-widget:has(.nh-widget__labeltext:text-is("${label}")) .nh-log__pause`).first()
  // Three different answers, and the check has to tell them apart: 'absent' is not paused, 'none'
  // is paused on a tile too narrow for the word, anything else is the word on screen (a flex item
  // blockifies, so it is 'block' and not the 'inline' a span would compute to on its own).
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
    // Against the row's CONTENT edge: the padding varies by theme (Swiss Sheet has none), so a
    // check against the border edge would be asserting one theme's insets.
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
  // A name row has no room to draw a 44px button, so the target is grown past what is drawn: a
  // press in the row's padding above it is a press on the button.
  ok('and big enough to press, with a target past what it draws', geom && geom.height >= 20 && geom.hitAbove, JSON.stringify({ height: geom?.height, aboveHits: geom?.hitAbove }))
  // Two tiles, one paused and one not, over the same state change: the pair is what proves the
  // pause is the tile's own and not the socket stopping.
  await pauseBtn('Events').click({ timeout: 4000 }).catch(() => {})
  await sleep(250)
  const held = await tile('Events')
  ok('pressing it says so, in a word and in its colour', held?.paused === 'true' && wordShown(held) && held.pausePlate !== running?.pausePlate && held.pauseLabel !== running?.pauseLabel, JSON.stringify({ pressed: held?.paused, word: held?.pauseWord, plate: held?.pausePlate, was: running?.pausePlate, label: held?.pauseLabel }))
  const frozenAt = held?.lines.length ?? 0
  await putState(3)
  const whilePausedLine = changeTo(4)
  await putState(4)
  const moved = await waitTile('Filtered', (t) => has(t, whilePausedLine), 10000)
  const stillHeld = await tile('Events')
  ok(
    'a line that arrives while it is paused is not shown, and the tile beside it shows it',
    has(moved, whilePausedLine) && !has(stillHeld, whilePausedLine) && stillHeld?.lines.length === frozenAt,
    JSON.stringify({ other: has(moved, whilePausedLine), paused: has(stillHeld, whilePausedLine), lines: `${frozenAt} -> ${stillHeld?.lines.length}` })
  )
  await pauseBtn('Events').click({ timeout: 4000 }).catch(() => {})
  const caught = await waitTile('Events', (t) => has(t, whilePausedLine), 8000)
  ok(
    'resuming catches up rather than losing what happened',
    has(caught, whilePausedLine) && caught?.paused === 'false' && caught.pauseWord === 'absent',
    JSON.stringify({ arrived: has(caught, whilePausedLine), pressed: caught?.paused, word: caught?.pauseWord, lines: caught?.lines.length })
  )
  // The word is what a one-column tile has no room for; the plate still says it on its own.
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

  /* ---------------- J. hostile configuration, and nothing drawn outside its tile ---------------- */
  const hostile = await tile('Hostile')
  ok('a configuration of the wrong shape everywhere still renders on the defaults', hostile && !hostile.error && hostile.status === 'live', JSON.stringify({ error: hostile?.error, status: hostile?.status, lines: hostile?.lines.length }))
  // The list scrolls, so a line above or below the scroll box is where it belongs; what must
  // not happen is a line reaching past the cell SIDEWAYS (the ellipsis is for that), or the
  // console, the pill or the empty text leaving the cell at all.
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
    spill && spill.scanned === WIDGETS.length && spill.lines > 50 && spill.spills.length === 0,
    `scanned ${spill?.scanned} of ${WIDGETS.length}, ${spill?.lines} lines` + (spill?.spills.length ? ': ' + spill.spills.slice(0, 4).join(' | ') : '')
  )

  /* ---------------- K. a hold opens the full-screen viewer ---------------- */
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
          // The LIST scrolls, not the window: the page is capped to the viewport so the newest
          // line is where the reader opens. Both measured, since the first cut had the window
          // scrolling and the page opening on the oldest line.
          atBottom: scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 12 : null,
          listScrolls: scroll ? scroll.scrollHeight > scroll.clientHeight : null,
          windowScrolls: document.documentElement.scrollHeight > window.innerHeight + 2,
        }
      : null
  })
  ok('the page shows milliseconds and the whole logger name', pageLine && /^\d{2}:\d{2}:\d{2}[.,]\d{3}$/.test(pageLine.time ?? '') && pageLine.logger === 'openhab.event.ItemStateChangedEvent', JSON.stringify(pageLine))
  ok('and opens on the newest line, scrolling the list rather than the window', pageLine && pageLine.atBottom === true && pageLine.listScrolls === true && pageLine.windowScrolls === false, JSON.stringify({ atBottom: pageLine?.atBottom, list: pageLine?.listScrolls, window: pageLine?.windowScrolls }))

  // The chips start from the widget's source; switching to Both brings the warning in.
  const chip = (text) => page.locator('.nh-logview__chips .nh-chip', { hasText: text }).first()
  const pageHas = (text) => probe(page, (t) => [...document.querySelectorAll('.nh-logview .nh-log__msg')].some((m) => m.textContent.includes(t)), text)
  const beforeBoth = await pageHas(MARKER)
  await chip('Both').click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  const afterBoth = await pageHas(MARKER)
  ok('the source chips start where the widget is set, and switching to Both brings the warning in', beforeBoth === false && afterBoth === true, `before=${beforeBoth} after=${afterBoth}`)
  await chip('Warnings and errors').click({ timeout: 4000 }).catch(() => {})
  await sleep(300)
  // A live server may hold real errors of its own beside this suite's warnings.
  const onlyWarn = await probe(page, () => {
    const lines = [...document.querySelectorAll('.nh-logview .nh-log__line')]
    const of = (level) => lines.filter((l) => l.className.includes('--' + level)).length
    return { n: lines.length, info: of('info'), debug: of('debug') + of('trace'), warn: of('warn'), error: of('error') }
  })
  ok('the level chips filter what is shown', onlyWarn && onlyWarn.n > 0 && onlyWarn.info === 0 && onlyWarn.debug === 0 && onlyWarn.warn > 0 && onlyWarn.warn + onlyWarn.error === onlyWarn.n, JSON.stringify(onlyWarn))
  await chip('Everything').click({ timeout: 4000 }).catch(() => {})
  await sleep(200)

  // Search narrows what is shown and the count says so.
  await page.locator('.nh-logview__search').fill(MARKER).catch(() => {})
  await sleep(300)
  const searched = await probe(page, () => ({
    lines: document.querySelectorAll('.nh-logview .nh-log__line').length,
    count: document.querySelector('.nh-logview__count')?.textContent ?? null,
  }))
  ok('the search box narrows the list to the matching line and the count says how many were hidden', searched && searched.lines === 1 && /^Showing 1 of \d+$/.test(searched.count ?? '') && Number(searched.count.split(' of ')[1]) > 1, JSON.stringify(searched))
  await page.locator('.nh-logview__search').fill('').catch(() => {})
  await sleep(200)

  // Pause freezes what is on screen; resume shows what happened meanwhile.
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

  // Copy: the clipboard where the page has one, a selection where it does not.
  const copied = await probe(page, async (t) => {
    const btn = [...document.querySelectorAll('.nh-logview .nh-dash__bar button')].find((b) => b.textContent === 'Copy')
    btn?.click()
    await new Promise((r) => setTimeout(r, 300))
    if (navigator.clipboard?.readText) {
      try {
        return { via: 'clipboard', has: (await navigator.clipboard.readText()).includes(t) }
      } catch {
        /* fall through to the selection */
      }
    }
    return { via: 'selection', has: (window.getSelection()?.toString() ?? '').includes(t) }
  }, DIM)
  ok('copy puts the lines on the clipboard, or selects them where the page has no clipboard', copied && copied.has === true, JSON.stringify(copied))

  // Clear empties the list, and the next line starts it again. A busy server writes lines of its
  // own in the moment between the click and the read, so what is asserted is that everything
  // from before the clear is gone and what comes after it arrives - not that the list is empty
  // at the instant it is read.
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
  ok('clear empties the list, and the next line starts it again', beforeClear === true && cleared && cleared.marker === false && cleared.lines < 10 && after, JSON.stringify({ beforeClear, cleared, after }))

  const fromHash = await probe(page, () => location.hash)
  await page.locator('.nh-logview .nh-dash__bar .nh-iconbtn').first().click({ timeout: 4000 }).catch(() => {})
  await page.waitForSelector('.nh-gcell', { timeout: 6000 }).catch(() => {})
  const backHash = await probe(page, () => location.hash)
  // The page has to have been open for "back" to mean anything: on a build with no viewer the
  // address never left the dashboard, and this passed for nothing.
  ok('back returns to the dashboard', fromHash === `#/log/${DASH}/w-events` && backHash === '#/d/' + DASH, `${fromHash} -> ${backHash}`)
  // The clear was the page's; the tiles share the buffer, so the warning the server tile had
  // shown before is gone from it too, and only what has arrived since is there.
  const afterClear = await tile('Server')
  ok('the tiles share the buffer the page cleared', afterClear && !has(afterClear, MARKER) && !has(afterClear, MARKER2) && afterClear.lines.length < 60, `${afterClear?.lines.length} lines, marker=${has(afterClear, MARKER)}`)

  // Right-click is the other way in.
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

  /* ---------------- L. a device that is not signed in ---------------- */
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

  /* ---------------- M. the settings panel ---------------- */
  await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
  await page.locator('.nh-cell:has(.nh-widget__labeltext:text-is("Events"))').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
  const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
  // Bounded reads: `inputValue` waits its default 30s for a field that a build without the
  // widget never draws, and a control run has three of them.
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
  const wasEditing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
  await sleep(600)
  const editing = await probe(page, () => !!document.querySelector('.nh-grid--edit'))
  ok('leaving the editor without saving', wasEditing === true && editing === false, `was=${wasEditing} now=${editing}`)

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.stack))
} finally {
  /* ---------------- cleanup ---------------- */
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
