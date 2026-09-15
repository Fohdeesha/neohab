// Widget gallery e2e. Covers: the bundled catalogue is served from the add-on itself (so it works with no
// internet and no cross-origin permission).
// SAFE with a live config: creates only widgetdef:gallery-* (+ any -2 copy) and dashboard:nh-e2e-gal,
// deletes exactly those, and commands NOTHING.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return await launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}

const DASH = 'nh-e2e-gal'
const UID = 'dashboard:' + DASH
const MINE = /^(widgetdef:gallery-|dashboard:nh-e2e-gal)/

const list = async () => (await (await fetch(NS, { headers: AUTH })).json())
const get = async (u) => {
  const r = await fetch(NS + '/' + encodeURIComponent(u), { headers: AUTH })
  return r.ok ? r.json() : null
}
const del = async (u) => fetch(NS + '/' + encodeURIComponent(u), { method: 'DELETE', headers: AUTH }).catch(() => {})
const put = async (component) => {
  await del(component.uid)
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(component),
  })
  return r.ok
}

const cleanup = async () => {
  for (const c of await list()) if (MINE.test(c.uid)) await del(c.uid)
}
await cleanup()

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e.message)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
page.on('dialog', (d) => void d.accept())
await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)

const openSettings = async () => {
  await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section:has(h2:text-is("Widget gallery"))', { timeout: 20000 })
  await page.waitForSelector('.nh-gallery__card', { timeout: 20000 })
}
const card = (name) => page.locator('.nh-gallery__card', { hasText: name }).first()

try {
  const indexRes = await fetch(BASE + '/neohab/gallery/index.json')
  ok('the bundled catalogue is served from the jar', indexRes.ok, String(indexRes.status))
  const index = await indexRes.json()
  ok('it declares format version 1', index.formatVersion === 1, String(index.formatVersion))
  ok('and lists widgets', Array.isArray(index.widgets) && index.widgets.length >= 3, String(index.widgets?.length))

  let filesOk = 0
  for (const entry of index.widgets) {
    const res = await fetch(BASE + '/neohab/gallery/' + entry.file)
    if (!res.ok) continue
    const def = await res.json()
    const good =
      def.id === entry.id &&
      typeof def.name === 'string' &&
      (def.kind === 'js' ? typeof def.script === 'string' : typeof def.template === 'string') &&
      Array.isArray(def.settings)
    if (good) filesOk++
  }
  ok('every catalogue entry has a valid widget file', filesOk === index.widgets.length, `${filesOk}/${index.widgets.length}`)

  await openSettings()
  const cards = await page.locator('.nh-gallery__card').count()
  ok('every catalogue entry is offered as a card', cards === index.widgets.length, `${cards} vs ${index.widgets.length}`)
  ok('cards name their licence', /EPL-2.0/.test((await page.textContent('.nh-gallery__meta')) ?? ''), String(await page.textContent('.nh-gallery__meta')))
  ok('nothing is marked installed yet', (await page.locator('.nh-gallery__badge:text-is("installed")').count()) === 0)

  const first = index.widgets.find((w) => w.id === 'gallery-progress') ?? index.widgets[0]
  await card(first.name).locator('button').click()
  await page.waitForSelector('.nh-toast__text', { timeout: 20000 })
  const notice = await page.textContent('.nh-toast__text')
  ok('installing reports success', /Installed/.test(notice ?? ''), String(notice))
  const stored = await get('widgetdef:' + first.id)
  ok('a widgetdef component was created', stored !== null)
  ok('with the catalogue id', stored?.config.id === first.id, String(stored?.config.id))
  ok('and its template', typeof stored?.config.template === 'string' && stored.config.template.length > 20)
  ok('marked as coming from the gallery', stored?.config.source === 'gallery', String(stored?.config.source))
  ok('the card now says installed', (await card(first.name).locator('.nh-gallery__badge:text-is("installed")').count()) === 1)

  await card(first.name).locator('button').click()
  await page.waitForSelector('.nh-toast__text:has-text("already installed")', { timeout: 20000 })
  ok('re-installing says it is already installed', true)
  ok('and made no copy', (await get('widgetdef:' + first.id + '-2')) === null)

  ok(
    'edit the installed widget locally',
    await put({
      uid: 'widgetdef:' + first.id,
      component: 'neohab:widgetdef',
      config: { ...stored.config, template: '<div>my own version</div>' },
    })
  )
  await openSettings()
  await card(first.name).locator('button').click()
  await page
    .waitForSelector('.nh-toast__text:has-text("Installed as")', { timeout: 20000 })
    .catch(() => {})
  const copy = await get('widgetdef:' + first.id + '-2')
  ok('the gallery version installed under a free id', copy !== null)
  ok('and my edited one is untouched', (await get('widgetdef:' + first.id))?.config.template === '<div>my own version</div>')
  await del('widgetdef:' + first.id + '-2')

  await del('widgetdef:' + first.id)
  await openSettings()
  await card(first.name).locator('button').click()
  await page.waitForSelector('.nh-toast__text:has-text("Installed")', { timeout: 20000 })
  ok(
    'seed a dashboard using it',
    await put({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1, id: DASH, name: 'E2E Gallery', columns: 12, rowHeight: 60, gap: 8,
        widgets: [
          {
            id: 'w-gal',
            type: 'template',
            config: { label: 'Gal', customwidget: first.id, config: { label: 'Test', min: 0, max: 100 } },
            layout: { lg: { x: 0, y: 0, w: 4, h: 3 } },
          },
        ],
      },
    })
  )
  await page.goto(APP + `#/d/${DASH}`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-template__host', { timeout: 20000 })
  const shadow = await page.evaluate(async () => {
    const host = document.querySelector('.nh-template__host')
    for (let i = 0; i < 40 && (host?.shadowRoot?.childElementCount ?? 0) < 2; i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return { html: host?.shadowRoot?.innerHTML ?? '', text: document.body.innerText }
  })
  ok('the installed widget renders its own markup', /class="pb"|pb__track/.test(shadow.html), shadow.html.slice(0, 120))
  ok('with no "not found" notice', !/was not found/.test(shadow.text))

  await page.click('[aria-label="Edit dashboard"]')
  await page.waitForSelector('.nh-grid--edit', { timeout: 15000 })
  await page.click('[aria-label="Add widget"]')
  await page.waitForSelector('.nh-palette__card', { timeout: 10000 })
  ok(
    'the installed widget is offered in the palette',
    (await page.locator('.nh-palette__card', { hasText: first.name }).count()) >= 1
  )
  await page.click('.nh-sheet__close')
  await page.click('button:has-text("Exit")')

  // a gallery widget carries a template or a script that the app then runs, so the catalogue has to be the
  // jar's own: pressing everything the section offers must not reach a single URL off this origin
  await openSettings()
  const section = page.locator('section:has(h2:text-is("Widget gallery"))')
  const allButtons = await section.locator('button').count()
  const cardButtons = await section.locator('.nh-gallery__card button').count()
  ok('the gallery offers nothing beyond its own cards', allButtons === cardButtons, `${allButtons} buttons, ${cardButtons} on cards`)
  ok('and no card came from somewhere else', (await page.locator('.nh-gallery__badge:text-is("online")').count()) === 0)
  ok('the cards are the bundled ones', (await page.locator('.nh-gallery__card').count()) === index.widgets.length)

  const origin = new URL(APP).origin
  const offOrigin = []
  page.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) offOrigin.push(u)
  })
  for (let i = 0; i < allButtons; i++) {
    await section.locator('button').nth(i).click()
    await sleep(1200)
  }
  ok('pressing every one of them stays inside the add-on', offOrigin.length === 0, offOrigin.slice(0, 3).join(' | '))

  ok('console clean', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err).slice(0, 250))
} finally {
  await cleanup()
  const left = (await list()).map((c) => c.uid).filter((u) => MINE.test(u))
  ok('cleanup: no leftovers', left.length === 0, left.join(','))
  await browser.close()
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
