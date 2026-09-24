// The clock's zone and its time source. Two features, one suite, because they are the two halves of the same
// question - which clock is this tile showing.
// SAFE with a live config. Creates and deletes exactly dashboard:nh-e2e-clocktime.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-clocktime'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return launchChromium({ channel, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

function partsIn(ms, zone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out = {}
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out
}

const hhmmIn = (ms, zone) => {
  const p = partsIn(ms, zone)
  return String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0')
}

const secsOf = (text) => {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text ?? '')
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : null
}

const DEVICE_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const deviceIsTokyo = Math.abs(-new Date().getTimezoneOffset() - 540) < 1
const HQ_ZONE = ['Europe/London', 'America/Sao_Paulo', 'Africa/Nairobi'].find(
  (z) => z !== DEVICE_ZONE && z !== 'UTC' && z !== 'Asia/Tokyo'
)

const W = 3
const H = 2
const clock = (i, config) => ({
  id: 'w-' + i,
  type: 'clock',
  config: { hour12: false, showSeconds: true, tileBackground: true, timeSource: 'device', ...config },
  layout: { lg: { x: (i % 4) * W, y: Math.floor(i / 4) * H, w: W, h: H } },
})

const defaultSourceClock = (i) => {
  const c = clock(i, {})
  delete c.config.timeSource
  return c
}

const WIDGETS = [
    clock(0, { timeZone: 'UTC', zoneLabel: 'offset' }),
    clock(1, { timeZone: 'Asia/Tokyo', zoneLabel: 'offset', showDate: true }),
    clock(2, { timeZone: 'Asia/Tokyo', zoneLabel: 'custom', zoneText: 'HQ' }),
    clock(3, { timeZone: 'Asia/Tokyo', zoneLabel: 'custom' }),
    clock(4, { timeZone: 'America/New_York', zoneLabel: 'short' }),
    clock(5, {}),
    clock(6, { timeZone: 'Pacific/Kiritimati', hideTime: true, showDate: true, dateFormat: 'numeric' }),
    clock(7, { timeZone: 'Pacific/Niue', hideTime: true, showDate: true, dateFormat: 'numeric' }),
    clock(8, { mode: 'analog', timeZone: 'UTC' }),
    clock(9, { mode: 'analog', timeZone: 'Asia/Tokyo' }),
    clock(10, { timeZone: 'Not/AZone', zoneLabel: 'offset' }),
    clock(11, {
    timeZone: 'Asia/Tokyo',
    otherZones: [
      { zone: 'Asia/Tokyo', label: 'itself' }, // the clock's own zone: already on screen
      { zone: HQ_ZONE, label: 'Head office' },
      { zone: 'UTC' },
      { zone: 'Not/AZone' }, // not a zone this browser knows
      null, // not even an object
      { zone: DEVICE_ZONE, label: 'a second row for this device' }, // already listed as the device
    ],
  }),
    clock(12, { timeSource: 'server' }),
    clock(13, { timeSource: 'device' }),
    defaultSourceClock(14),
]

const browser = await launch()
const errs = []

async function openPage(offsetMs) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const at = m.location()?.url ?? ''
    if (offsetMs === 'fail' && /\/rest\/?$/.test(at)) return
    if (isAppResource(at)) errs.push(m.text())
  })
  page.on('dialog', (d) => d.accept())
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
      localStorage.setItem('neohab:themeOverride', 'dark')
      localStorage.removeItem('neohab:serverClock')
    } catch {}
  }, TOKEN)
  const counter = { heads: 0 }
  if (offsetMs !== null) {
    await page.route('**/rest/', async (route) => {
      if (route.request().method() !== 'HEAD') return route.fallback()
      counter.heads += 1
      if (offsetMs === 'fail') return route.abort()
      await route.fulfill({ status: 200, headers: { Date: new Date(Date.now() + offsetMs).toUTCString() } })
    })
  }
  await page.goto(APP + '#/d/nh-e2e-clocktime', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-clock__time', { timeout: 20000 })
  return { page, counter }
}

const readAll = (page) =>
  probe(page, () => ({
    now: Date.now(),
    cells: [...document.querySelectorAll('.nh-gcell, .nh-cell')].map((c) => ({
      time: c.querySelector('.nh-clock__time')?.textContent?.trim() ?? null,
      zone: c.querySelector('.nh-clock__zone')?.textContent?.trim() ?? null,
      date: c.querySelector('.nh-clock__date')?.textContent?.trim() ?? null,
      analog: !!c.querySelector('.nh-clock__face'),
      hour: (() => {
        const h = c.querySelector('.nh-clock__face line:nth-of-type(13)')
        return h ? h.getAttribute('x2') + ',' + h.getAttribute('y2') : null
      })(),
    })),
  }))

const readSheet = (page) =>
  probe(page, () => {
    const el = document.querySelector('.nh-clockdetail')
    if (!el) return { open: false }
    const rows = {}
    for (const r of el.querySelectorAll('.nh-detail__row')) {
      rows[r.querySelector('dt')?.textContent?.trim() ?? '?'] = r.querySelector('dd')?.textContent?.trim() ?? ''
    }
    const inked = (token) => {
      const el2 = document.createElement('span')
      el2.style.color = 'var(' + token + ')'
      document.body.appendChild(el2)
      const c = getComputedStyle(el2).color
      el2.remove()
      return c
    }
    const diff = el.querySelector('.nh-clockdetail__diff')
    const hero = el.querySelector('.nh-clockdetail__hero')
    const time = el.querySelector('.nh-clockdetail__time')
    return {
      open: true,
      time: el.querySelector('.nh-clockdetail__time')?.textContent?.trim() ?? '',
      zoneId: el.querySelector('.nh-clockdetail__zoneid')?.textContent?.trim() ?? '',
      rows,
      look: {
        centred: getComputedStyle(el).textAlign === 'center',
        factsCentred: (() => {
          const dl = el.querySelector('.nh-clockdetail__facts')
          if (!dl) return false
          const st = getComputedStyle(dl)
          return st.display === 'grid' && st.justifyContent === 'center'
        })(),
        heroWash: hero ? getComputedStyle(hero).backgroundImage : 'none',
        heroBox: hero ? Math.round(hero.getBoundingClientRect().width) : 0,
        panelBox: Math.round((el.closest('.nh-detail__panel') ?? el).getBoundingClientRect().width),
        timeColor: time ? getComputedStyle(time).color : '',
        diffClass: diff ? diff.className : '',
        diffColor: diff ? getComputedStyle(diff).color : '',
        accent: inked('--nh-primary'),
        good: inked('--nh-good'),
        bad: inked('--nh-bad'),
        text: inked('--nh-text'),
      },
      others: [...el.querySelectorAll('.nh-clockdetail__zonerow')].map((r) => ({
        name: r.querySelector('.nh-clockdetail__zonename')?.textContent?.trim() ?? '',
        time: r.querySelector('.nh-clockdetail__zonetime')?.textContent?.trim() ?? '',
        off: r.querySelector('.nh-clockdetail__zoneoff')?.textContent?.trim() ?? '',
      })),
    }
  })

async function openSheet(page, index) {
  const cell = page.locator('.nh-gcell').nth(index)
  await cell.scrollIntoViewIfNeeded().catch(() => {})
  const b = await cell.boundingBox().catch(() => null)
  if (!b) return false
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' })
  await sleep(500)
  return true
}
const closeSheet = async (page) => {
  await page.keyboard.press('Escape').catch(() => {})
  await sleep(250)
}

try {
  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: 'nh-e2e-clocktime',
        name: 'nh-e2e-clocktime',
        columns: 12,
        rowHeight: 'match',
        widgets: WIDGETS,
      },
    }),
  })

  const { page } = await openPage(null)
  const all = await readAll(page)
  ok('every seeded clock rendered', (all?.cells ?? []).length === WIDGETS.length, `cells=${all?.cells?.length}`)

  const utc = all.cells[0]
  const tokyo = all.cells[1]
  ok(
    'a clock set to UTC shows the time in UTC',
    Math.abs(secsOf(utc.time) - secsOf(hhmmIn(all.now, 'UTC') + ':00')) <= 60,
    `${utc.time} vs ${hhmmIn(all.now, 'UTC')}`
  )
  ok(
    'and one set to Tokyo shows Tokyo',
    Math.abs(secsOf(tokyo.time) - secsOf(hhmmIn(all.now, 'Asia/Tokyo') + ':00')) <= 60,
    `${tokyo.time} vs ${hhmmIn(all.now, 'Asia/Tokyo')}`
  )
  const gap = ((secsOf(tokyo.time) - secsOf(utc.time)) % 86400 + 86400) % 86400
  ok('exactly nine hours apart', Math.abs(gap - 9 * 3600) <= 60, `gap=${gap}s`)

  ok('a clock with no zone set shows this device', all.cells[5].time !== null && secsOf(all.cells[5].time) !== null, all.cells[5].time)
  const deviceSecs = secsOf(all.cells[5].time)
  if (deviceIsTokyo) {
    ok(`this machine is on Tokyo time (${DEVICE_ZONE}), so two checks below are skipped`, true)
  } else {
    ok('which is not the same as the zoned ones', Math.abs(deviceSecs - secsOf(tokyo.time)) > 60, `device=${all.cells[5].time} tokyo=${tokyo.time}`)
  }

  ok('the offset caption names the zone offset', utc.zone === 'UTC' && tokyo.zone === 'UTC+9', `${utc.zone} / ${tokyo.zone}`)
  ok('your own text is used as written', all.cells[2].zone === 'HQ', String(all.cells[2].zone))
  ok('and left empty falls back to the city', all.cells[3].zone === 'Tokyo', String(all.cells[3].zone))
  ok(
    'the short name is what the language calls the zone',
    ['EDT', 'EST'].includes(all.cells[4].zone),
    String(all.cells[4].zone)
  )
  ok('a clock that was not asked to name its zone does not', all.cells[5].zone === null, String(all.cells[5].zone))

  const east = all.cells[6].date
  const west = all.cells[7].date
  ok('a date-only clock draws its date', !!east && !!west, `${east} / ${west}`)
  ok('and reads it in its own zone, not this machine’s', east !== west, `${east} vs ${west}`)

  ok('both analog faces rendered', all.cells[8].analog && all.cells[9].analog)
  ok(
    'the hands follow the zone too',
    all.cells[8].hour !== null && all.cells[9].hour !== null && all.cells[8].hour !== all.cells[9].hour,
    `${all.cells[8].hour} vs ${all.cells[9].hour}`
  )

  ok(
    'a zone this browser does not know falls back to the device',
    all.cells[10].time !== null &&
      Math.abs(secsOf(all.cells[10].time) - deviceSecs) <= 120 &&
      (deviceIsTokyo || Math.abs(secsOf(all.cells[10].time) - secsOf(tokyo.time)) > 60),
    `${all.cells[10].time} vs device ${all.cells[5].time}`
  )

  await openSheet(page, 11)
  const zsheet = await readSheet(page)
  ok('holding a clock opens its sheet', zsheet.open === true)
  ok('naming the zone the tile is set to', zsheet.zoneId === 'Asia/Tokyo', zsheet.zoneId)
  ok('with the offset of THAT zone, not the browser’s', zsheet.rows?.['Offset from UTC'] === 'UTC+9', zsheet.rows?.['Offset from UTC'])
  const names = (zsheet.others ?? []).map((o) => o.name)
  ok('this device is listed', names.length > 0 && !!names[0], names.join(', '))
  ok('so are the extra zones, under their own labels', names.includes('Head office') && names.includes('UTC'), names.join(', '))
  ok('the clock’s own zone is not listed twice', names.length > 0 && !names.includes('itself'), names.join(', '))
  ok(
    'a zone the browser cannot use is dropped, and so is a second row for one already listed',
    names.length === (deviceIsTokyo ? 2 : 3) && !names.includes('a second row for this device'),
    `${names.length}: ${names.join(', ')}`
  )
  ok(
    'the rows follow the clock’s own 12 or 24-hour choice',
    !/[AP]M/i.test(zsheet.time ?? 'AM') && (zsheet.others ?? []).length > 0 && !(zsheet.others ?? []).some((o) => /[AP]M/i.test(o.time)),
    `${zsheet.time} | ${(zsheet.others ?? []).map((o) => o.time).join(' ')}`
  )
  const london = (zsheet.others ?? []).find((o) => o.name === 'Head office')
  ok('each row carries that zone’s own offset', /^UTC[+-]?\d*/.test(london?.off ?? ''), london?.off)
  ok(
    'and the same instant as read there',
    Math.abs(secsOf(london?.time) - secsOf(hhmmIn(Date.now(), HQ_ZONE) + ':00')) <= 90,
    `${london?.time} vs ${hhmmIn(Date.now(), HQ_ZONE)} (${HQ_ZONE})`
  )
  await closeSheet(page)

  await page.click('[aria-label="Edit dashboard"]', { timeout: 8000 }).catch(() => {})
  await page.waitForSelector('.nh-grid--edit', { timeout: 8000 }).catch(() => {})
  await page.locator('.nh-cell').nth(5).click({ timeout: 8000 }).catch(() => {})
  await page.waitForSelector('.nh-sheet', { timeout: 5000 }).catch(() => {})

  const zoneField = page
    .locator('.nh-field', { has: page.locator('.nh-field__label', { hasText: /^Time zone$/ }) })
    .locator('select.nh-zoneselect')
  ok('the panel offers a time zone', (await zoneField.count()) === 1)
  const zoneShape = await probe(page, () => {
    const sel = document.querySelector('.nh-sheet select.nh-zoneselect')
    if (!sel) return null
    return {
      options: sel.querySelectorAll('option').length,
      groups: sel.querySelectorAll('optgroup').length,
      hasTokyo: !![...sel.querySelectorAll('option')].find((o) => o.value === 'Asia/Tokyo'),
      hasUtc: !![...sel.querySelectorAll('option')].find((o) => o.value === 'UTC'),
      wider: sel.getBoundingClientRect().width > sel.parentElement.getBoundingClientRect().width + 1,
    }
  })
  ok('carrying the whole zone database', (zoneShape?.options ?? 0) > 300, `options=${zoneShape?.options}`)
  ok('grouped by region so it can be navigated', (zoneShape?.groups ?? 0) >= 8, `groups=${zoneShape?.groups}`)
  ok('including plain UTC, which the browser does not list', zoneShape?.hasUtc === true)
  ok('and it does not push the panel sideways', zoneShape?.wider === false)

  const beforePick = (await readAll(page))?.cells?.[5]?.time
  await zoneField.selectOption('Asia/Tokyo', { timeout: 5000 }).catch(() => {})
  await sleep(400)
  const afterPick = (await readAll(page))?.cells?.[5]?.time
  const expectedShift = ((540 - -new Date().getTimezoneOffset()) * 60 + 86400) % 86400
  ok(
    'choosing one moves that clock immediately',
    beforePick &&
      afterPick &&
      Math.abs((((secsOf(afterPick) - secsOf(beforePick)) % 86400) + 86400) % 86400 - expectedShift) <= 120,
    `${beforePick} -> ${afterPick}, expected +${expectedShift}s`
  )

  const labelField = page.locator('.nh-field', { hasText: 'Show the zone' }).locator('select')
  const labelOptions = await labelField.locator('option').count().catch(() => 0)
  ok('the zone caption offers off, short name, offset and your own text', labelOptions === 4, `options=${labelOptions}`)
  ok(
    'the text field is hidden until you ask for your own text',
    (await page.locator('.nh-field', { hasText: 'Zone label' }).count()) === 0
  )
  await labelField.selectOption('custom', { timeout: 5000 }).catch(() => {})
  await sleep(250)
  ok(
    'and appears when you do',
    (await page.locator('.nh-field', { hasText: 'Zone label' }).count()) === 1
  )

  const sourceOptions = await page.locator('.nh-field', { hasText: 'Time source' }).locator('option').count().catch(() => 0)
  ok('the time source offers this device and the server', sourceOptions === 2, `options=${sourceOptions}`)

  const zoneRows = () => page.locator('.nh-sheet .nh-chartcard').count().catch(() => -1)
  const rowsBefore = await zoneRows()
  await page.click('.nh-sheet button:has-text("Add time zone")', { timeout: 5000 }).catch(() => {})
  await sleep(250)
  ok('Add time zone adds a row', (await zoneRows()) === rowsBefore + 1, `${rowsBefore} -> ${await zoneRows()}`)
  await page.click('button:has-text("Exit")', { timeout: 5000 }).catch(() => {})
  await sleep(400)
  await page.close()

  const AHEAD = 185_000
  const srv = await openPage(AHEAD)
  await sleep(900)
  const s1 = await readAll(srv.page)
  const server = s1.cells[12]
  const device = s1.cells[13]
  const diff = ((secsOf(server.time) - secsOf(device.time)) % 86400 + 86400) % 86400
  ok(
    'a clock set to the server shows the server’s time',
    Math.abs(diff - 185) <= 3,
    `server=${server.time} device=${device.time} diff=${diff}s`
  )
  ok(
    'the clock beside it, set to this device, is untouched',
    Math.abs(secsOf(device.time) - secsOf(hhmmIn(s1.now, Intl.DateTimeFormat().resolvedOptions().timeZone) + ':00')) <= 60,
    `${device.time} on ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
  )
  ok('one reading serves every clock on the page', srv.counter.heads === 1, `requests=${srv.counter.heads}`)
  const bare = s1.cells[14]
  ok(
    'a clock storing no source follows the server, which is the default',
    Math.abs(secsOf(bare.time) - secsOf(server.time)) <= 3,
    `${bare.time} vs server ${server.time} / device ${device.time}`
  )

  await openSheet(srv.page, 12)
  const fromServer = await readSheet(srv.page)
  ok('the sheet says which clock it is showing', fromServer.rows?.['Time source'] === 'openHAB server', fromServer.rows?.['Time source'])
  ok(
    'and how far this device is from it',
    fromServer.rows?.['This device'] === '3 minutes behind',
    fromServer.rows?.['This device']
  )
  const look = fromServer.look ?? {}
  ok('the sheet is centred, rows and all', look.centred === true && look.factsCentred === true, JSON.stringify({ c: look.centred, f: look.factsCentred }))
  ok(
    'the reading sits on a panel washed in the theme accent',
    typeof look.heroWash === 'string' && look.heroWash.includes('gradient') && look.heroBox > 0,
    `${String(look.heroWash).slice(0, 40)} w=${look.heroBox}`
  )
  ok('and is inked in it', look.timeColor === look.accent, `${look.timeColor} vs ${look.accent}`)
  ok(
    'a gap is called out in the bad colour',
    /--off/.test(look.diffClass ?? '') && look.diffColor === look.bad && look.bad !== look.text,
    `${look.diffClass} ${look.diffColor} vs bad ${look.bad}`
  )
  await closeSheet(srv.page)

  await openSheet(srv.page, 13)
  const fromDevice = await readSheet(srv.page)
  ok(
    'a device-time clock names this device as the source',
    fromDevice.rows?.['Time source'] === 'This device',
    fromDevice.rows?.['Time source']
  )
  ok(
    'and describes the server from the other side',
    fromDevice.rows?.['openHAB server'] === '3 minutes ahead',
    fromDevice.rows?.['openHAB server']
  )
  await closeSheet(srv.page)
  await srv.page.close()

  const step = await openPage(0)
  await sleep(900)
  await openSheet(step.page, 12)
  const inStep = await readSheet(step.page)
  ok(
    'two clocks agreeing to the second are called identical, not given a number',
    inStep.rows?.['This device'] === 'Identical',
    inStep.rows?.['This device']
  )
  ok(
    'and inked as the good answer',
    /--same/.test(inStep.look?.diffClass ?? '') && inStep.look?.diffColor === inStep.look?.good,
    `${inStep.look?.diffClass} ${inStep.look?.diffColor} vs good ${inStep.look?.good}`
  )
  await step.page.close()

  const dead = await openPage('fail')
  await sleep(1200)
  const d1 = await readAll(dead.page)
  ok(
    'a server-time clock falls back to this device rather than showing nothing',
    Math.abs(secsOf(d1.cells[12].time) - secsOf(d1.cells[13].time)) <= 2,
    `${d1.cells[12].time} vs ${d1.cells[13].time}`
  )
  await openSheet(dead.page, 12)
  const deadSheet = await readSheet(dead.page)
  ok('and the sheet says so instead of pretending', deadSheet.rows?.['This device'] === 'Could not be reached', deadSheet.rows?.['This device'])
  await dead.page.close()

  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('run completed', false, String(err))
} finally {
  await browser.close()
}

await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH })
const left = await (await fetch(NS, { headers: AUTH })).json()
ok(
  `cleanup: ${UID} absent`,
  !(Array.isArray(left) ? left : []).some((c) => c.uid === UID),
  (Array.isArray(left) ? left : []).filter((c) => c.uid === UID).map((c) => c.uid).join(', ')
)

let allPass = true
for (const r of results) if (!r.pass) allPass = false
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED')
process.exitCode = allPass ? 0 : 1
