// Hue-wrap e2e: the color track's top end (360) must reach the device.
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

const UID = 'dashboard:nh-e2e-hue'
const ITEM = ITEMS.color

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stateOf = async () => (await (await fetch(`${BASE}/rest/items/${ITEM}`, { headers: AUTH })).json()).state
const cmd = (body) => fetch(`${BASE}/rest/items/${ITEM}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'text/plain' }, body })

let browser, initial

try {
  initial = await stateOf()
  console.log('initial ' + ITEM + ' = ' + initial)

  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const seedRes = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: 'nh-e2e-hue', name: 'E2E Hue', columns: 12, rowHeight: 'match', gap: 8,
        widgets: [{ id: 'w-color', type: 'color', config: { item: ITEM, label: 'Hue' }, layout: { lg: { x: 0, y: 0, w: 3, h: 5 } } }],
      },
    }),
  })
  ok('seed dashboard created', seedRes.ok, 'HTTP ' + seedRes.status)

  browser = await launchChromium({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

  const posts = []
  page.on('response', async (res) => {
    const req = res.request()
    if (req.method() === 'POST' && req.url().includes('/rest/items/' + ITEM)) posts.push({ body: req.postData(), status: res.status() })
  })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await cmd('120,100,100')
  await sleep(2000)

  await page.goto(APP + '#/d/nh-e2e-hue', { waitUntil: 'domcontentloaded', timeout: 20000 })
  const hue = page.locator('input[aria-label="h"]')
  const swatch = page.locator('.nh-color__swatch')
  await hue.waitFor({ state: 'visible', timeout: 10000 })
  await sleep(1500)
  ok('starts on the live green', (await hue.inputValue()) === '120', 'h=' + (await hue.inputValue()))

  const box = await hue.boundingBox()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  await sleep(2500)

  const sent = posts.map((p) => p.body + ' -> ' + p.status).join(' | ')
  console.log('POSTs: ' + sent)
  ok('slider is at the far end', (await hue.inputValue()) === '360', 'h=' + (await hue.inputValue()))
  ok('command wraps 360 -> 0', posts.some((p) => /^0,/.test(p.body || '')), sent)
  ok('no 360 ever leaves the browser', !posts.some((p) => /^360,/.test(p.body || '')), sent)
  ok('server ACCEPTS it now', posts.length > 0 && posts.every((p) => p.status === 200), sent)

  const afterDrag = await stateOf()
  console.log('device after drag = ' + afterDrag)
  ok('THE LIGHT ACTUALLY TURNS RED', /^(0|359|360)\./.test(afterDrag) || /^0,/.test(afterDrag), 'state=' + afterDrag)

  const sw = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor)
  const [r, g] = sw.match(/\d+/g).map(Number)
  ok('swatch matches the device (both red)', r > 200 && g < 60, sw)

  await sleep(8500)
  ok('slider stays at the end (no snap-back)', (await hue.inputValue()) === '360', 'h=' + (await hue.inputValue()))

  posts.length = 0
  await hue.evaluate((el) => el.focus())
  const box2 = await hue.boundingBox()
  await page.mouse.click(box2.x + box2.width * 0.5, box2.y + box2.height / 2)
  await sleep(2500)
  const mid = posts[0]?.body || ''
  const midHue = Number(mid.split(',')[0])
  console.log('mid-track POST: ' + mid + ' -> device ' + (await stateOf()))
  ok('mid-track hue sends ~180, unwrapped', midHue > 150 && midHue < 210, mid)
  ok('mid-track accepted', posts.every((p) => p.status === 200), posts.map((p) => p.status).join(','))

  ok('no console errors', errors.length === 0, errors.join(' ~ ') || '(clean)')
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  if (initial) {
    const [h, s, b] = initial.split(',')
    for (let i = 0; i < 5; i++) {
      await cmd(`${h},${s},${b}`)
      await sleep(1500)
      if ((await stateOf()) === initial) break
    }
    const now = await stateOf()
    console.log('restored ' + ITEM + ' = ' + now + (now === initial ? ' (exact)' : ' (WANT ' + initial + ')'))
  }
  if (browser) await browser.close()
  console.log('\n=== e2e-hue results')
  for (const r of results) console.log((r.pass ? ' PASS ' : ' FAIL ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''))
  const failed = results.filter((r) => !r.pass).length
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
}
