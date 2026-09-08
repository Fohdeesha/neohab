// Dashboard generator e2e: the four sources, the review step and what actually lands on the server.
// SAFE with a live config: records the namespace before each creation and deletes exactly what appeared, so
// nothing else is touched.
import { launchChromium } from './lib/browser.mjs'
import { APP, BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const listUids = async () => {
  const r = await fetch(NS, { headers: AUTH })
  return new Set((await r.json()).map((c) => c.uid))
}
const getComp = async (uid) => {
  const r = await fetch(NS + '/' + encodeURIComponent(uid), { headers: AUTH })
  return r.ok ? r.json() : null
}
const del = (uid) => fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH })

const freshUids = async (before) => [...(await listUids())].filter((u) => !before.has(u))

const overlapping = (widgets) => {
  const r = widgets.map((w) => w.layout.lg)
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return [a, b]
    }
  return null
}

const MODEL_ITEMS = [
  { name: 'gKitchen', type: 'Group', state: 'NULL', label: 'Kitchen', tags: ['Kitchen'], groupNames: [] },
  { name: 'gLiving', type: 'Group', state: 'NULL', label: 'Living Room', tags: ['LivingRoom'], groupNames: [] },
  { name: 'gCeiling', type: 'Group', groupType: 'Switch', state: 'ON', label: 'Ceiling Light', tags: ['Lightbulb'], groupNames: ['gKitchen'] },
  { name: 'Ceiling_Power', type: 'Switch', state: 'ON', label: 'Power', tags: ['Switch', 'Light'], groupNames: ['gCeiling'] },
  { name: 'Ceiling_Level', type: 'Dimmer', state: '40', label: 'Brightness', tags: ['Control', 'Light'], groupNames: ['gCeiling'] },
  { name: 'Kitchen_Temp', type: 'Number:Temperature', state: '21', label: 'Temperature', tags: ['Measurement', 'Temperature'], groupNames: ['gKitchen'], stateDescription: { readOnly: true } },
  { name: 'Living_Lamp', type: 'Switch', state: 'OFF', label: 'Lamp', tags: ['Lightbulb'], groupNames: ['gLiving'] },
  { name: 'Living_Motion', type: 'Switch', state: 'OFF', label: 'Motion', tags: ['Status', 'Presence'], groupNames: ['gLiving'] },
  { name: 'Unmodelled', type: 'Switch', state: 'OFF', label: 'Nowhere', tags: [], groupNames: [] },
]

function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try { return launchChromium({ channel, headless: true }) } catch {}
  }
  return launchChromium({ headless: true })
}
const browser = await launch()
const errs = []

async function openPage({ model = false, viewport = { width: 1500, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('dialog', (d) => d.accept())
  await page.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
  if (model) {
    await page.route('**/rest/items*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MODEL_ITEMS) })
    )
  }
  return page
}

async function openWizard(page) {
  await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nh-tile--new, .nh-welcome', { timeout: 15000 })
  if (await page.$('.nh-tile--new')) {
    await page.click('.nh-tile--new')
    await page.waitForSelector('button:has-text("Generate from my items…")', { timeout: 5000 })
    await page.click('button:has-text("Generate from my items…")')
  } else {
    await page.click('button:has-text("Generate from my items")')
  }
  await page.waitForSelector('[data-source="prefix"]', { timeout: 15000 })
}

const created = []

try {
  {
    const page = await openPage()
    await openWizard(page)
    const cards = await page.$$eval('.nh-palette__card', (els) =>
      els.map((e) => ({
        source: e.dataset.source,
        desc: e.querySelector('.nh-palette__desc')?.textContent ?? '',
        disabled: e.disabled,
      }))
    )
    const by = Object.fromEntries(cards.map((c) => [c.source, c]))
    ok('all four sources offered', cards.length === 4, cards.map((c) => c.source).join(','))
    ok('naming source finds clusters', !by.prefix.disabled && /\d+ groups? of items/.test(by.prefix.desc), by.prefix.desc)
    ok('hand-picking always available', !by.pick.disabled && /Choose from \d+ items?/.test(by.pick.desc), by.pick.desc)
    ok(
      'a source that finds nothing is disabled and says why',
      by.semantic.disabled === by.semantic.desc.startsWith('No items'),
      JSON.stringify(by.semantic)
    )

    await page.click('[data-source="prefix"]')
    await page.waitForSelector('.nh-gen__list', { timeout: 5000 })
    ok('choosing a source moves to the cluster step', true)
    await page.click('.nh-sheet button:text-is("Back")')
    await page.waitForSelector('[data-source="prefix"]', { timeout: 5000 })
    ok('Back returns to the source step', true)
    await page.close()
  }

  {
    const page = await openPage()
    await openWizard(page)
    await page.click('[data-source="prefix"]')
    await page.waitForSelector('.nh-gen__list', { timeout: 5000 })

    const clusters = await page.$$eval('.nh-gen__list .nh-gen__row', (els) =>
      els.map((e) => ({
        name: e.querySelector('.nh-gen__rowname')?.textContent ?? '',
        meta: e.querySelector('.nh-gen__meta')?.textContent ?? '',
        checked: e.querySelector('input')?.checked,
      }))
    )
    ok('clusters listed with item counts', clusters.length > 0 && /\d+ items?/.test(clusters[0].meta), JSON.stringify(clusters[0]))
    ok('everything starts selected', clusters.every((c) => c.checked))
    ok('largest cluster first', clusters.length < 2 || parseInt(clusters[0].meta) >= parseInt(clusters[1].meta), clusters.slice(0, 2).map((c) => c.meta).join(' '))

    await page.click('button:has-text("Select none")')
    ok('Select none clears the selection', (await page.$$eval('.nh-gen__list input', (els) => els.every((e) => !e.checked))))
    const nextDisabled = await page.$eval('.nh-gen__footer button.nh-btn--primary', (b) => b.disabled)
    ok('cannot continue with nothing selected', nextDisabled)
    await page.click('button:has-text("Select all")')
    ok('Select all restores it', (await page.$$eval('.nh-gen__list input', (els) => els.every((e) => e.checked))))

    await page.click('button:has-text("Select none")')
    await page.locator('.nh-gen__list .nh-gen__row').first().locator('input').check()
    const firstName = clusters[0].name
    await page.locator('.nh-gen__mode input').nth(1).check()
    ok('an unnamed single dashboard can still be reviewed', !(await page.$eval('.nh-gen__footer button.nh-btn--primary', (b) => b.disabled)))
    ok(
      'and the placeholder is the name it would take',
      (await page.$eval('#nh-gen-name', (e) => e.placeholder)) === firstName,
      await page.$eval('#nh-gen-name', (e) => e.placeholder)
    )
    await page.fill('#nh-gen-name', 'nh-e2e-gen-one')
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-gen__cluster', { timeout: 5000 })

    const rows = await page.$$eval('.nh-gen__cluster .nh-gen__row', (els) =>
      els.map((e) => ({
        label: e.querySelector('.nh-gen__rowname')?.childNodes[0]?.textContent ?? '',
        note: e.querySelector('.nh-gen__note')?.textContent ?? '',
        type: e.querySelector('select')?.value,
        types: [...(e.querySelector('select')?.options ?? [])].map((o) => o.value),
      }))
    )
    ok('review lists one row per item', rows.length === parseInt(clusters[0].meta), `${rows.length} vs ${clusters[0].meta}`)
    ok('review shows the cluster name', (await page.textContent('.nh-gen__clusterhead'))?.includes(firstName))
    ok('every row has a widget type', rows.every((r) => r.type))
    ok('each row offers alternatives', rows.every((r) => r.types.length >= 2), JSON.stringify(rows[0]?.types))
    ok('the chosen type is the first option', rows.every((r) => r.types[0] === r.type))

    await page.locator('.nh-gen__cluster .nh-gen__row').first().locator('input').uncheck()
    const btn = await page.textContent('.nh-gen__footer button.nh-btn--primary')
    ok('the button counts only the included rows', btn?.includes(String(rows.length - 1)), btn ?? '')

    const included = rows.slice(1)
    let overrideAt = -1
    let alt = null
    for (let i = 0; i < included.length && overrideAt < 0; i++) {
      const candidate = included[i].types.find((type) => type !== included[i].type && !included.some((r) => r.type === type))
      if (candidate) {
        overrideAt = i + 1
        alt = candidate
      }
    }
    ok('an unused alternative type exists to override with', overrideAt >= 0, JSON.stringify(included.map((r) => r.type)))
    if (overrideAt >= 0) await page.locator('.nh-gen__cluster .nh-gen__row').nth(overrideAt).locator('select').selectOption(alt)

    const before = await listUids()
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-dash__bar', { timeout: 15000 })
    created.push(...(await freshUids(before)))
    ok('creating one dashboard navigates into it', page.url().includes('#/d/nh-e2e-gen-one'), page.url())

    const comp = await getComp('dashboard:nh-e2e-gen-one')
    const cfg = comp?.config
    ok('dashboard persisted to the server', !!cfg, comp ? '' : 'missing')
    ok('it has one widget per included row', cfg?.widgets.length === rows.length - 1, String(cfg?.widgets.length))
    ok('the dropped row was not created', !JSON.stringify(cfg).includes(`"label":"${rows[0].label}"`), rows[0].label)
    ok(
      'the overridden type was used, and only for the overridden row',
      cfg?.widgets.filter((w) => w.type === alt).length === 1,
      `${alt}: ${cfg?.widgets.filter((w) => w.type === alt).length}`
    )
    ok('square cells and 12 columns, like a hand-made dashboard', cfg?.rowHeight === 'match' && cfg?.columns === 12, `${cfg?.rowHeight}/${cfg?.columns}`)
    ok('no widget overlaps another', overlapping(cfg?.widgets ?? []) === null, JSON.stringify(overlapping(cfg?.widgets ?? [])))
    ok('every widget fits the grid', cfg?.widgets.every((w) => w.layout.lg.x + w.layout.lg.w <= cfg.columns))
    ok('every widget is bound and labelled', cfg?.widgets.every((w) => (typeof w.config.item === 'string' && w.config.item) || Array.isArray(w.config.series)))
    const labelled = new Map(
      (await (await fetch(`${BASE}/rest/items?fields=name,label`, { headers: AUTH })).json()).map((i) => [i.name, i.label])
    )
    const derivedLabels = (cfg?.widgets ?? []).filter((w) => typeof w.config.item === 'string' && !labelled.get(w.config.item))
    if (derivedLabels.length === 0) {
      ok('labels have the cluster prefix stripped (SKIPPED: every item here carries its own label)', true)
    } else {
      ok(
        'labels have the cluster prefix stripped',
        derivedLabels.every((w) => !String(w.config.label ?? '').toLowerCase().startsWith(firstName.toLowerCase() + ' ')),
        JSON.stringify(derivedLabels.map((w) => w.config.label))
      )
    }

    await sleep(1200)
    const cells = await page.$$eval('.nh-gcell', (els) => els.length)
    ok('the generated dashboard renders every widget', cells === cfg?.widgets.length, `${cells} vs ${cfg?.widgets.length}`)
    await page.close()
  }

  {
    const page = await openPage()
    await openWizard(page)
    await page.click('[data-source="pick"]')
    await page.waitForSelector('#nh-gen-search', { timeout: 5000 })
    const all = await page.$$eval('.nh-gen__list .nh-gen__row', (els) => els.length)
    await page.fill('#nh-gen-search', 'zzz-no-such-item')
    await sleep(200)
    ok('search filters the item list', (await page.$$eval('.nh-gen__list .nh-gen__row', (els) => els.length)) === 0, String(all))
    ok('an empty result says so', (await page.textContent('.nh-gen__list'))?.includes('No matching items'))

    await page.fill('#nh-gen-search', '')
    await sleep(200)
    ok('cannot continue before picking anything', await page.$eval('.nh-gen__footer button.nh-btn--primary', (b) => b.disabled))
    for (const i of [0, 1, 2]) await page.locator('.nh-gen__list .nh-gen__row').nth(i).locator('input').check()
    await page.fill('#nh-gen-pickname', 'nh-e2e-gen-pick')
    await sleep(100)
    ok('picking items enables the next step', !(await page.$eval('.nh-gen__footer button.nh-btn--primary', (b) => b.disabled)))
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-gen__cluster', { timeout: 5000 })
    ok('review shows the picked items', (await page.$$eval('.nh-gen__cluster .nh-gen__row', (e) => e.length)) === 3)

    const before = await listUids()
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-dash__bar', { timeout: 15000 })
    created.push(...(await freshUids(before)))
    const cfg = (await getComp('dashboard:nh-e2e-gen-pick'))?.config
    ok('hand-picked dashboard created with the chosen items', cfg?.widgets.length === 3, String(cfg?.widgets.length))
    ok('hand-picked labels keep the full item name', cfg?.widgets.every((w) => String(w.config.label ?? '').length > 0))
    await page.close()
  }

  {
    const page = await openPage({ model: true })
    await openWizard(page)
    const semantic = await page.$eval('[data-source="semantic"]', (e) => ({ desc: e.querySelector('.nh-palette__desc')?.textContent, disabled: e.disabled }))
    ok('a tagged server offers the semantic source', !semantic.disabled && /2 locations/.test(semantic.desc ?? ''), JSON.stringify(semantic))

    await page.click('[data-source="semantic"]')
    await page.waitForSelector('.nh-gen__list', { timeout: 5000 })
    const locations = await page.$$eval('.nh-gen__list .nh-gen__row .nh-gen__rowname', (els) => els.map((e) => e.textContent))
    ok('one entry per location, by label', JSON.stringify(locations) === '["Kitchen","Living Room"]', JSON.stringify(locations))

    await page.locator('.nh-gen__mode input').nth(1).check()
    await page.fill('#nh-gen-name', 'nh-e2e-gen-model')
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-gen__cluster', { timeout: 5000 })

    const sections = await page.$$eval('.nh-gen__section', (els) => els.map((e) => e.textContent))
    ok('equipment becomes a named section', sections.includes('Ceiling Light'), JSON.stringify(sections))
    const rows = await page.$$eval('.nh-gen__cluster .nh-gen__row', (els) =>
      els.map((e) => ({ label: e.querySelector('.nh-gen__rowname')?.childNodes[0]?.textContent, note: e.querySelector('.nh-gen__note')?.textContent, type: e.querySelector('select')?.value }))
    )
    const row = (label) => rows.find((r) => r.label === label)
    ok('a control point stays a control', row('Brightness')?.type === 'slider', JSON.stringify(row('Brightness')))
    ok('a status point becomes a value, and says why', row('Motion')?.type === 'value' && row('Motion')?.note === 'read-only', JSON.stringify(row('Motion')))
    ok('a read-only measurement is a value', row('Temperature')?.type === 'value')
    ok('equipment with its own state is included', row('Ceiling Light')?.type === 'button', JSON.stringify(row('Ceiling Light')))
    ok('items outside the model are left out', !rows.some((r) => r.label === 'Nowhere'), JSON.stringify(rows.map((r) => r.label)))

    const before = await listUids()
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-dash__bar', { timeout: 15000 })
    created.push(...(await freshUids(before)))
    const cfg = (await getComp('dashboard:nh-e2e-gen-model'))?.config
    ok('the model dashboard was created', !!cfg)
    const labels = (cfg?.widgets ?? []).filter((w) => w.type === 'label').map((w) => w.config.text)
    ok('section headings written as label widgets', labels.includes('Ceiling Light'), JSON.stringify(labels))
    ok('headings span the full width', (cfg?.widgets ?? []).filter((w) => w.type === 'label').every((w) => w.layout.lg.w === cfg.columns))
    ok('cluster headings present in single-dashboard mode', labels.includes('Kitchen') && labels.includes('Living Room'), JSON.stringify(labels))
    const temp = cfg?.widgets.find((w) => w.config.item === 'Kitchen_Temp')
    ok('a temperature point gets a temperature icon', temp?.config.icon === 'mdi:thermometer', String(temp?.config.icon))
    ok('nothing overlaps in a sectioned dashboard', overlapping(cfg?.widgets ?? []) === null, JSON.stringify(overlapping(cfg?.widgets ?? [])))
    await page.close()
  }

  {
    const page = await openPage({ model: true })
    await openWizard(page)
    await page.click('[data-source="semantic"]')
    await page.waitForSelector('.nh-gen__list', { timeout: 5000 })
    await page.locator('.nh-gen__mode input').nth(0).check()
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-gen__cluster', { timeout: 5000 })

    await page.locator('.nh-gen__clusterhead').nth(1).locator('input').uncheck()
    const before = await listUids()
    await page.click('.nh-gen__footer button.nh-btn--primary')
    await page.waitForSelector('.nh-dash__bar, .nh-tiles', { timeout: 15000 })
    await sleep(600)
    const fresh = await freshUids(before)
    created.push(...fresh)
    ok('only the kept cluster became a dashboard', fresh.length === 1, JSON.stringify(fresh))
    const cfg = fresh.length === 1 ? (await getComp(fresh[0]))?.config : null
    ok('it is named after the location', cfg?.name === 'Kitchen', String(cfg?.name))
    ok('its id is slugified from the name', fresh[0] === 'dashboard:kitchen' || /^dashboard:kitchen(-\d+)?$/.test(fresh[0]), fresh[0] ?? '')
    ok('the location suggests a tile icon', typeof cfg?.icon === 'string' && cfg.icon.startsWith('mdi:'), String(cfg?.icon))
    ok('per-location dashboards carry no cluster heading', !(cfg?.widgets ?? []).some((w) => w.type === 'label' && w.config.text === 'Kitchen'))
    await page.close()
  }

  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    await page.route(/\/rest\/ui\/components\/neohab:config(\?|$)/, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        : route.abort()
    )
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-welcome', { timeout: 15000 })
    ok(
      'signed out, the first-run screen offers no setup actions',
      (await page.locator('.nh-welcome__actions .nh-btn:has-text("Generate from my items")').count()) === 0
    )
    ok(
      'signed out, the first-run screen offers a sign-in',
      (await page.locator('.nh-welcome__actions .nh-btn:text-is("Sign in")').count()) === 1
    )

    await page.click('.nh-welcome__actions .nh-btn:text-is("Sign in")', { timeout: 10000 }).catch(() => {})
    const sheetOpened = await page
      .waitForSelector('.nh-signin', { timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    ok('the welcome sign-in opens the sign-in sheet', sheetOpened)
    let revealed = false
    if (sheetOpened) {
      await page.click('button:has-text("Use an API token instead")')
      await page.fill('#nh-token', TOKEN)
      await page.click('button:has-text("Use token")')
      revealed = await page
        .waitForSelector('.nh-welcome__actions .nh-btn:has-text("Generate from my items")', { timeout: 15000 })
        .then(() => true)
        .catch(() => false)
    }
    ok('signing in reveals the setup actions without a reload', revealed, sheetOpened ? '' : 'no sign-in sheet')
    if (revealed) {
      await page.click('.nh-welcome__actions .nh-btn:has-text("Generate from my items")')
      const sheet = await page
        .waitForSelector('[data-source="prefix"]', { timeout: 10000 })
        .then(() => true)
        .catch(() => false)
      ok('Generate then opens the generator directly, no gate', sheet && (await page.locator('.nh-signin').count()) === 0)
    } else {
      ok('Generate then opens the generator directly, no gate', false, 'setup actions never appeared')
    }
    await page.close()
  }

  ok('no console errors anywhere', errs.length === 0, errs.slice(0, 4).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err && err.message ? err.message : err))
} finally {
  for (const uid of [...new Set(created)]) {
    const r = await del(uid)
    if (!r.ok) console.log('cleanup failed for ' + uid + ': ' + r.status)
  }
  for (const uid of await listUids()) {
    if (uid.startsWith('dashboard:nh-e2e-gen')) await del(uid)
  }
  await browser.close()
}

let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass || !r.detail ? '' : '  -> ' + r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exitCode = failed ? 1 : 0
