// Image widget e2e: a picture from an address, from a String item holding one, and from an Image item holding
// the picture itself, with refresh, cache busting, scaling, background and every state it cannot show.
// SAFE with a live config. Creates and deletes exactly: dashboard:nh-e2e-image (neohab:config), and on a
// non-production target the managed items nh_e2e_img, nh_e2e_imgref, nh_e2e_imgurl, nh_e2e_imgnull,
// nh_e2e_imgbad, nh_e2e_imgpdf, nh_e2e_imgmix, nh_e2e_imgnum. Commands nothing: every state is set over REST.
// On production it reads one Image item of the server's own, if it has one, and creates no item.
import { deflateSync } from 'node:zlib'
import { launchBrowser } from './lib/browser.mjs'
import { APP, AUTH, BASE, HTTPS, NS, PLAIN_HTTP, PRODUCTION, TOKEN, isAppResource } from './lib/target.mjs'
import { skipOnProduction } from './lib/guard.mjs'
import { pickItem } from './lib/ui.mjs'

const UID = 'dashboard:nh-e2e-image'
const DASH = 'nh-e2e-image'
const IMG = 'nh_e2e_img'
const IMGB = 'nh_e2e_imgref'
const STR = 'nh_e2e_imgurl'
const NUL = 'nh_e2e_imgnull'
const BAD = 'nh_e2e_imgbad'
const PDF = 'nh_e2e_imgpdf'
const MIX = 'nh_e2e_imgmix'
const NUM = 'nh_e2e_imgnum'
const ITEMS_MADE = [IMG, IMGB, STR, NUL, BAD, PDF, MIX, NUM]
const TILE = BASE + '/neohab/tile.png'

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
const probe = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null)

// a solid 2x2 PNG, stored rather than compressed, so every colour is exactly the same number of bytes: the
// state stream then sends two different pictures as the same text, which is the case worth proving
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const x of buf) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
const png = ([r, g, b]) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.from([0, r, g, b, r, g, b])
  const data = deflateSync(Buffer.concat([row, row]), { level: 0 })
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', data), chunk('IEND', Buffer.alloc(0))])
  return 'data:image/png;base64,' + bytes.toString('base64')
}
const RED = [220, 20, 20]
const BLUE = [20, 40, 220]
const GREEN = [20, 200, 60]
const YELLOW = [230, 200, 20]
const URI = { red: png(RED), blue: png(BLUE), green: png(GREEN), yellow: png(YELLOW) }
const PDF_URI = 'data:application/pdf;base64,JVBERi0xLjQK'

// one Image item of the server's own, read and never written
async function realImageItem() {
  const list = await fetch(BASE + '/rest/items?fields=name,type', { headers: AUTH })
    .then((r) => r.json())
    .catch(() => [])
  const found = Array.isArray(list) ? list.find((i) => i.type === 'Image' && !String(i.name).startsWith('nh_e2e_')) : undefined
  if (!found) return null
  const state = await fetch(itemUrl(found.name) + '/state', { headers: { ...AUTH, Accept: 'text/plain' } })
    .then((r) => r.text())
    .catch(() => '')
  return /^data:image\//.test(state) ? found.name : null
}

const img = (label, config, x, y, w = 3, h = 4) => ({ id: 'w-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), type: 'image', config: { label, ...config }, layout: { lg: { x, y, w, h } } })

const REAL = await realImageItem()
const WIDGETS = [
  img('Static', { source: 'url', url: TILE }, 0, 0),
  img('Busted', { source: 'url', url: TILE + '?x=1', refresh: 1 }, 3, 0),
  // an address of its own, so no other tile's fetches can count for or against it
  img('NoSuffix', { source: 'url', url: TILE + '?ns=1', refresh: 1, cacheBust: false }, 6, 0),
  img('DataStatic', { source: 'url', url: URI.green, refresh: 1 }, 9, 0),
  // stored before the widget had a source, a fit or a cache switch
  { id: 'w-legacy', type: 'image', config: { url: TILE, label: 'Legacy', refresh: 0 }, layout: { lg: { x: 0, y: 4, w: 3, h: 4 } } },
  img('Hostile cfg', { source: 'constructor', url: 42, item: {}, fit: 7, cacheBust: 'no', background: {}, refresh: 'abc' }, 3, 4),
  img('Unset', { source: 'item' }, 6, 4),
]
if (!PRODUCTION) {
  WIDGETS.push(
    img('Held', { source: 'item', item: IMG, fit: 'contain', background: '#ff00ff' }, 9, 4),
    img('Address', { source: 'item', item: STR }, 0, 8),
    img('Empty', { source: 'item', item: NUL }, 3, 8),
    img('Missing', { source: 'item', item: 'nh_e2e_img_nonesuch' }, 6, 8),
    img('Hostile addr', { source: 'item', item: BAD }, 9, 8),
    img('Pdf', { source: 'item', item: PDF }, 0, 12),
    img('HeldRefresh', { source: 'item', item: IMGB, refresh: 1 }, 3, 12),
    img('Mixed', { source: 'item', item: MIX }, 6, 12),
    img('AddressRefresh', { source: 'item', item: STR, refresh: 1 }, 0, 16)
  )
}
if (REAL) WIDGETS.push(img('Real', { source: 'item', item: REAL }, 9, 12))

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
const errs = []
const posts = []
const reads = new Map()
const tileHits = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const url = m.location?.()?.url
  if (!isAppResource(url)) return
  // the one tile pointed at an item the server does not have, on purpose
  if (/nh_e2e_img_nonesuch/.test(m.text() + (url ?? ''))) return
  // the reads the suite refuses on purpose, and only those
  if (url === itemUrl(IMG) + '/state' && /status of 500/.test(m.text())) return
  errs.push(m.text() + (url ? ' <- ' + url : ''))
})
page.on('dialog', (d) => d.accept().catch(() => {}))
page.on('request', (r) => {
  const u = r.url()
  const m = /\/rest\/items\/([A-Za-z0-9_]+)\/state$/.exec(u)
  if (m && r.method() === 'GET') {
    reads.set(m[1], (reads.get(m[1]) ?? 0) + 1)
    if (r.headers()['accept'] !== 'text/plain') errs.push('state read without Accept: text/plain: ' + u)
  }
  if (u.startsWith(TILE)) tileHits.push(u)
})
await page.route('**/rest/items/**', (r) => {
  if (r.request().method() === 'POST') posts.push(r.request().url())
  return r.continue()
})
await page.addInitScript((t) => {
  try {
    localStorage.setItem('neohab:apiToken', t)
    localStorage.setItem('neohab:themeOverride', 'dark')
  } catch {}
}, TOKEN)

const look = (label) =>
  probe(
    page,
    (l) => {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      if (!w) return null
      const el = w.querySelector('img.nh-image')
      let pixel = null
      if (el && el.complete && el.naturalWidth > 0) {
        try {
          const c = document.createElement('canvas')
          c.width = el.naturalWidth
          c.height = el.naturalHeight
          const g = c.getContext('2d')
          g.drawImage(el, 0, 0)
          const d = g.getImageData(0, 0, 1, 1).data
          pixel = [d[0], d[1], d[2]]
        } catch {
          pixel = 'tainted'
        }
      }
      const cs = el ? getComputedStyle(el) : null
      return {
        src: el?.getAttribute('src') ?? null,
        natural: el ? el.naturalWidth : null,
        pixel,
        fit: cs?.objectFit ?? null,
        bg: cs?.backgroundColor ?? null,
        cls: el?.className ?? null,
        mark: el?.dataset.mark ?? null,
        text: (w.querySelector('.nh-image__placeholder, .nh-widget__unset, .nh-widget__errtitle')?.textContent ?? '').trim(),
        error: !!w.closest('.nh-gcell')?.querySelector('.nh-widget--error'),
      }
    },
    label
  )
const near = (px, want) => Array.isArray(px) && px.every((v, i) => Math.abs(v - want[i]) <= 6)
const waitLook = async (label, want, ms = 8000) => {
  const until = Date.now() + ms
  let last = null
  while (Date.now() < until) {
    last = await look(label)
    if (last && want(last)) return last
    await sleep(150)
  }
  return last
}
// openHAB keeps a component's JSON, but not necessarily the order of its keys
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
      : JSON.stringify(v)
const brief = (l) => (l ? JSON.stringify({ ...l, src: l.src && l.src.length > 60 ? l.src.slice(0, 60) + '…(' + l.src.length + ')' : l.src }) : 'null')

try {
  if (!PRODUCTION) {
    for (const n of ITEMS_MADE) await fetch(itemUrl(n), { method: 'DELETE', headers: AUTH }).catch(() => {})
    await makeItem(IMG, 'Image', 'NH E2E Image')
    await makeItem(IMGB, 'Image', 'NH E2E Image Refreshed')
    await makeItem(STR, 'String', 'NH E2E Image Address')
    await makeItem(NUL, 'Image', 'NH E2E Image Empty')
    await makeItem(BAD, 'String', 'NH E2E Image Hostile')
    await makeItem(PDF, 'Image', 'NH E2E Image Pdf')
    await makeItem(MIX, 'String', 'NH E2E Image Mixed')
    await makeItem(NUM, 'Number', 'NH E2E Image Number')
    await putState(IMG, URI.red)
    await putState(IMGB, URI.green)
    await putState(STR, TILE)
    await putState(NUL, 'NULL')
    await putState(BAD, 'javascript:alert(1)')
    await putState(PDF, PDF_URI)
    await putState(MIX, PLAIN_HTTP + '/neohab/tile.png')
    await putState(NUM, '5')
    ok('the two test pictures are the same size, so the stream cannot tell them apart', URI.red.length === URI.blue.length && URI.red !== URI.blue, `${URI.red.length} / ${URI.blue.length}`)
  }

  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seed = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: { version: 2, id: DASH, name: 'E2E Image', columns: 12, rowHeight: 40, gap: 6, widgets: WIDGETS },
    }),
  })
  ok('seed dashboard', seed.status === 200, 'status=' + seed.status)
  const seeded = canonical(WIDGETS)

  await page.goto(APP + '#/d/' + DASH)
  await page.waitForSelector('.nh-widget', { timeout: 20000 }).catch(() => {})
  await waitLook('Static', (l) => l.natural > 0)

  const crashed = await probe(page, () =>
    [...document.querySelectorAll('.nh-widget--error')].filter((w) => !w.textContent.includes('nh_e2e_img_nonesuch')).length
  )
  ok('no tile fell back to the error boundary', crashed === 0, 'error tiles=' + crashed)

  // ---- addresses: everything here needs no item, so it runs on every target
  const stat = await look('Static')
  ok('an address shows its picture exactly as written, filling the tile', stat && stat.src === TILE && stat.natural > 0 && stat.fit === 'cover' && !/--contain/.test(stat.cls), brief(stat))
  const legacy = await look('Legacy')
  ok('a widget stored before sources existed still shows its address, the way it always did', legacy && legacy.src === TILE && legacy.natural > 0 && legacy.fit === 'cover', brief(legacy))
  const hostile = await look('Hostile cfg')
  ok('a configuration of the wrong shape everywhere says there is no address instead of breaking', hostile && hostile.src === null && hostile.text === 'No image URL' && !hostile.error, brief(hostile))
  const unset = await look('Unset')
  ok('an item source with no item yet says to pick one', unset && unset.src === null && /No item yet/.test(unset.text), brief(unset))

  const hitsBefore = tileHits.filter((u) => u.includes('x=1&_=')).length
  await page.evaluate(() => {
    for (const l of ['NoSuffix']) {
      const w = [...document.querySelectorAll('.nh-widget')].find((x) => x.querySelector('.nh-widget__labeltext')?.textContent === l)
      const el = w?.querySelector('img.nh-image')
      if (el) el.dataset.mark = 'first'
    }
  })
  await sleep(3500)
  const busted = await look('Busted')
  const hitsAfter = tileHits.filter((u) => u.includes('x=1&_=')).length
  ok(
    'a refresh adds a fresh timestamp after the address’s own parameters, and fetches again',
    busted && /\/neohab\/tile\.png\?x=1&_=\d+$/.test(busted.src) && busted.natural > 0 && hitsAfter - hitsBefore >= 2,
    `${busted?.src} fetches=${hitsAfter - hitsBefore}`
  )
  const nosuffix = await look('NoSuffix')
  ok(
    'with the timestamp off the address is never changed, and each refresh hands the browser a new element',
    nosuffix &&
      nosuffix.src === TILE + '?ns=1' &&
      nosuffix.natural > 0 &&
      nosuffix.mark === null &&
      tileHits.some((u) => u.includes('ns=1')) &&
      !tileHits.some((u) => u.includes('ns=1') && /[?&]_=/.test(u)),
    brief(nosuffix)
  )
  const data = await look('DataStatic')
  ok('a data: address is the picture itself, so a refresh never puts a timestamp on it', data && data.src === URI.green && data.natural === 2 && near(data.pixel, GREEN) && data.text === '', brief(data))

  // ---- a real Image item on this server, read and never written
  if (REAL) {
    const real = await waitLook('Real', (l) => l.natural > 0)
    ok(`this server’s own Image item ${REAL} shows the picture it holds`, real && /^data:image\//.test(real.src) && real.natural > 0 && real.pixel !== 'tainted', brief(real))
  } else {
    ok('this server’s own Image item shows the picture it holds (SKIPPED: the server has no Image item of its own)', true)
  }

  if (!skipOnProduction(ok, 'the Image and String item sections create items')) {
    // ---- an Image item: the stream only says "raw type (image/png): 75 bytes", so the picture is read
    const held = await waitLook('Held', (l) => near(l.pixel, RED))
    ok('an Image item shows the picture it holds', held && /^data:image\/png;base64,/.test(held.src) && held.natural === 2 && near(held.pixel, RED), brief(held))
    ok(
      'and it is scaled to show the whole picture on the background it was given',
      held && held.fit === 'contain' && /nh-image--contain/.test(held.cls) && held.bg === 'rgb(255, 0, 255)',
      `fit=${held?.fit} bg=${held?.bg}`
    )
    const idle = reads.get(IMG) ?? 0
    await sleep(3000)
    ok('an Image item with no refresh is read, and not read again while nothing changes', idle >= 1 && (reads.get(IMG) ?? 0) === idle, `reads ${idle} -> ${reads.get(IMG) ?? 0}`)

    await putState(IMG, URI.blue)
    const blue = await waitLook('Held', (l) => near(l.pixel, BLUE))
    ok('a new picture of exactly the same size still shows, though the stream sends the same text for both', near(blue?.pixel, BLUE), `pixel=${JSON.stringify(blue?.pixel)} reads=${reads.get(IMG)}`)

    await putState(IMG, 'NULL')
    const gone = await waitLook('Held', (l) => l.text === 'This item has no image yet.')
    ok('an Image item that loses its state says it has no image yet', gone && gone.src === null && gone.text === 'This item has no image yet.', brief(gone))
    await putState(IMG, URI.red)
    const back = await waitLook('Held', (l) => near(l.pixel, RED))
    ok('and shows the next picture it is given', near(back?.pixel, RED), brief(back))

    const before = reads.get(IMG) ?? 0
    // yellow appears only at the end, so no earlier stall can pass for the last picture
    const sequence = [URI.blue, URI.green, URI.red, URI.blue, URI.green, URI.red, URI.blue, URI.yellow]
    for (const uri of sequence) await putState(IMG, uri)
    const settled = await waitLook('Held', (l) => near(l.pixel, YELLOW), 10000)
    await sleep(1500)
    const final = await look('Held')
    const burstReads = (reads.get(IMG) ?? 0) - before
    ok(
      'a burst of changes ends on the last picture, at no more than one read per change',
      near(settled?.pixel, YELLOW) && near(final?.pixel, YELLOW) && burstReads >= 1 && burstReads <= sequence.length + 1,
      `pixel=${JSON.stringify(final?.pixel)} reads for ${sequence.length} changes: ${burstReads}`
    )

    // a read that fails says why and puts itself right; nothing changes on the server meanwhile
    const STATE_URL = itemUrl(IMG) + '/state'
    const refuse = (r) => r.fulfill({ status: 500, contentType: 'text/plain', body: '' })
    await page.route(STATE_URL, refuse)
    await putState(IMG, URI.red)
    const refused = await waitLook('Held', (l) => /Could not read the image/.test(l.text))
    ok(
      'a read the server refuses says so, with the reason',
      refused && refused.src === null && refused.text === 'Could not read the image from openHAB: the openHAB server could not handle it (500)',
      brief(refused)
    )
    const failedAt = Date.now()
    await page.unroute(STATE_URL, refuse)
    const healed = await waitLook('Held', (l) => near(l.pixel, RED), 20000)
    ok('and tries again by itself, without any change to the item', near(healed?.pixel, RED), `recovered after ${Date.now() - failedAt}ms ${brief(healed)}`)

    // the stream can still say "a picture" when the read finds the item emptied
    const emptied = (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: 'NULL' })
    await page.route(STATE_URL, emptied)
    await putState(IMG, URI.blue)
    const nothing = await waitLook('Held', (l) => l.text !== '' && l.src === null)
    ok('a read that finds the item emptied says it has no image yet', nothing && nothing.text === 'This item has no image yet.', brief(nothing))
    await page.unroute(STATE_URL, emptied)
    await putState(IMG, URI.green)
    await waitLook('Held', (l) => near(l.pixel, GREEN))

    const refBefore = reads.get(IMGB) ?? 0
    await sleep(3500)
    const refreshed = await look('HeldRefresh')
    ok(
      'an Image item with a refresh is read again on it, even with nothing changed',
      (reads.get(IMGB) ?? 0) - refBefore >= 2 && near(refreshed?.pixel, GREEN) && refreshed.src === URI.green,
      `reads in 3.5s: ${(reads.get(IMGB) ?? 0) - refBefore} src=${refreshed?.src?.slice(0, 30)}`
    )

    const SLOW_URL = itemUrl(IMGB) + '/state'
    const slow = async (r) => {
      await sleep(3000)
      await r.continue().catch(() => {})
    }
    await page.route(SLOW_URL, slow)
    await page.reload()
    const loading = await waitLook('HeldRefresh', (l) => l.text === 'Loading…', 2500)
    ok('the first read of an Image item says it is loading while it is on its way', loading && loading.text === 'Loading…' && loading.src === null, brief(loading))
    await page.unroute(SLOW_URL, slow)
    const loaded = await waitLook('HeldRefresh', (l) => near(l.pixel, GREEN), 10000)
    ok('and then shows the picture', near(loaded?.pixel, GREEN), brief(loaded))

    // ---- a String item: its state is the address
    const addr = await waitLook('Address', (l) => l.natural > 0)
    ok('a String item is read as the address of a picture', addr && addr.src === TILE && addr.natural > 0, brief(addr))
    const addrRefresh = await waitLook('AddressRefresh', (l) => /[?&]_=\d+$/.test(l.src ?? '') && l.natural > 0, 6000)
    ok('and a refresh adds the timestamp to the address it holds', addrRefresh && /\/neohab\/tile\.png\?_=\d+$/.test(addrRefresh.src), brief(addrRefresh))
    await putState(STR, TILE + '?v=2')
    const moved = await waitLook('Address', (l) => l.src === TILE + '?v=2' && l.natural > 0)
    ok('and a new address in it shows the new picture', moved && moved.src === TILE + '?v=2' && moved.natural > 0, brief(moved))

    const empty = await waitLook('Empty', (l) => l.text !== '')
    ok('an Image item with no state says so', empty && empty.text === 'This item has no image yet.' && empty.src === null, brief(empty))
    const bad = await waitLook('Hostile addr', (l) => l.text !== '')
    ok('a String item holding an address that could run script is refused', bad && bad.src === null && bad.text === 'That image address cannot be shown.', brief(bad))
    const pdf = await waitLook('Pdf', (l) => l.text !== 'Loading…' && l.text !== '')
    ok('an Image item holding something that is not a picture says so', pdf && pdf.src === null && pdf.text === 'This item does not hold an image that can be shown.', brief(pdf))
    const missing = await waitLook('Missing', (l) => l.text === 'nh_e2e_img_nonesuch')
    ok('an item the server does not have is named on the tile', missing && missing.src === null && missing.text === 'nh_e2e_img_nonesuch', brief(missing))
    const mixed = await waitLook('Mixed', (l) => l.natural > 0 || /HTTPS/.test(l.text))
    if (HTTPS) {
      ok('over HTTPS a String item’s http:// address is reported, not silently blocked', mixed && mixed.src === null && /served over HTTPS/.test(mixed.text), brief(mixed))
    } else {
      ok('over plain http a String item’s http:// address loads', mixed && mixed.natural > 0 && mixed.src === PLAIN_HTTP + '/neohab/tile.png', brief(mixed))
    }

    // ---- the hold sheet: the widget only reads its item, so the sheet shows it and offers nothing
    const cell = page.locator('.nh-gcell', { has: page.locator('.nh-widget__labeltext', { hasText: /^Held$/ }) }).first()
    await cell.scrollIntoViewIfNeeded().catch(() => {})
    const b = await cell.boundingBox().catch(() => null)
    if (b) {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.down()
      await sleep(750)
      await page.mouse.up()
      await sleep(400)
    }
    let sheet = null
    for (let i = 0; i < 30; i++) {
      sheet = await probe(page, () => {
        const d = document.querySelector('.nh-detail')
        return d ? { range: d.querySelectorAll('input[type="range"]').length, buttons: d.querySelectorAll('.nh-quickbtns, .nh-detail__control button').length, text: (d.textContent ?? '').slice(0, 200) } : null
      })
      if (sheet && /raw type/.test(sheet.text)) break
      await sleep(150)
    }
    ok('a hold opens the item’s sheet with its state and no control', sheet && sheet.range === 0 && sheet.buttons === 0 && /raw type \(image\/png\)/.test(sheet.text) && /Image/.test(sheet.text), JSON.stringify(sheet))
    await page.keyboard.press('Escape').catch(() => {})
    await sleep(400)

    // ---- the settings panel
    await page.locator('[aria-label="Edit dashboard"]').first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForSelector('.nh-cell', { timeout: 10000 }).catch(() => {})
    const inEditor = await waitLook('Held', (l) => near(l.pixel, GREEN), 6000)
    ok('the editor draws the held picture too', near(inEditor?.pixel, GREEN) && (await probe(page, () => !!document.querySelector('.nh-grid--edit'))), brief(inEditor))
    const editCell = (label) => page.locator('.nh-cell', { has: page.locator('.nh-widget__labeltext', { hasText: new RegExp('^' + label + '$') }) }).first()
    await editCell('Held').click({ timeout: 5000 }).catch(() => {})
    await page.waitForSelector('.nh-sheet select', { timeout: 10000 }).catch(() => {})
    const field = (label) => page.locator(`.nh-sheet .nh-field:has(.nh-field__label:text-is("${label}"))`).first()
    const sourceSel = field('Image source').locator('select').first()
    const panel = async () => ({
      source: await sourceSel.inputValue({ timeout: 3000 }).catch(() => null),
      options: await sourceSel.locator('option').count().catch(() => -1),
      url: await field('Image URL').count(),
      item: await field('openHAB Item').count(),
      itemValue: await field('openHAB Item').locator('input').first().inputValue({ timeout: 3000 }).catch(() => null),
      stamp: await field('Add a timestamp to the address when refreshing').count(),
      scaling: await field('Scaling').locator('select').first().inputValue({ timeout: 3000 }).catch(() => null),
    })
    const first = await panel()
    ok(
      'an item-bound image offers its item, not an address, and says how it scales',
      first.source === 'item' && first.options === 2 && first.url === 0 && first.item === 1 && first.itemValue === IMG && first.stamp === 0 && first.scaling === 'contain',
      JSON.stringify(first)
    )
    await sourceSel.selectOption('url', { timeout: 5000 }).catch(() => {})
    await sleep(300)
    const asUrl = await panel()
    ok('switching to an address swaps the item field for the address field', first.item === 1 && asUrl.source === 'url' && asUrl.url === 1 && asUrl.item === 0, JSON.stringify(asUrl))
    await sourceSel.selectOption('item', { timeout: 5000 }).catch(() => {})
    await sleep(300)

    const input = field('openHAB Item').locator('input').first()
    await input.fill('', { timeout: 5000 }).catch(() => {})
    await input.click({ timeout: 5000 }).catch(() => {})
    // one short of a whole name: an exact name binds itself, and the list is what this asks about
    await page.keyboard.type('nh_e2e_im', { delay: 40 })
    await sleep(600)
    const offered = await probe(page, () => [...document.querySelectorAll('.nh-picker__option .nh-picker__name')].map((e) => e.textContent.trim()))
    ok(
      'the item picker offers Image and String items and leaves the rest out',
      Array.isArray(offered) && offered.includes(IMG) && offered.includes(STR) && offered.includes(NUL) && !offered.includes(NUM),
      JSON.stringify(offered)
    )
    await input.fill('', { timeout: 5000 }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
    const landed = (await input.count()) > 0 ? await pickItem(page, input, STR) : '<no item field>'
    ok('picking a String item from the picker binds it', landed === STR, landed)
    // the String item was moved to ?v=2 above, and that is the address it holds now
    const swapped = await waitLook('Held', (l) => l.natural > 0 && l.src === TILE + '?v=2', 6000)
    ok('and the tile follows the new item straight away', swapped && swapped.src === TILE + '?v=2' && swapped.natural > 0, brief(swapped))

    await page.keyboard.press('Escape').catch(() => {})
    await editCell('Busted').click({ timeout: 5000 }).catch(() => {})
    await sleep(500)
    const stampField = field('Add a timestamp to the address when refreshing')
    const stampShown = await stampField.count()
    const stampOn = await stampField.locator('input[type="checkbox"]').first().isChecked({ timeout: 3000 }).catch(() => null)
    await editCell('NoSuffix').click({ timeout: 5000 }).catch(() => {})
    await sleep(500)
    const stampOff = await field('Add a timestamp to the address when refreshing').locator('input[type="checkbox"]').first().isChecked({ timeout: 3000 }).catch(() => null)
    ok('a refreshing address offers the timestamp switch, on unless it was turned off', stampShown === 1 && stampOn === true && stampOff === false, JSON.stringify({ stampShown, stampOn, stampOff }))

    await page.locator('button:has-text("Exit")').first().click({ timeout: 5000 }).catch(() => {})
    await sleep(800)
    const stored = await fetch(NS + '/' + encodeURIComponent(UID), { headers: AUTH })
      .then((r) => r.json())
      .catch(() => null)
    const same = !!stored && canonical(stored.config.widgets) === seeded
    ok('leaving the editor without saving left the dashboard as it was', same, stored ? (same ? 'stored widgets identical to the seed' : 'stored widgets differ from the seed') : 'unreadable')
  }

  const totalReads = [...reads.values()].reduce((a, b) => a + b, 0)
  ok('every item read asked for text', (PRODUCTION && !REAL) || (totalReads > 0 && !errs.some((e) => e.startsWith('state read without'))), `reads=${totalReads}`)
  ok('nothing was commanded', posts.length === 0, posts.slice(0, 3).join(' | '))
  ok('no page or console errors', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  ok('suite ran without crashing', false, String(e && e.message))
} finally {
  await fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})
  if (!PRODUCTION) for (const item of ITEMS_MADE) await fetch(itemUrl(item), { method: 'DELETE', headers: AUTH }).catch(() => {})
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
  console.log('\n' + (failed.length === 0 ? 'ALL PASS' : 'SOME FAILED') + '  (' + (results.length - failed.length) + '/' + results.length + ')')
  process.exitCode = failed.length === 0 ? 0 : 1
}
