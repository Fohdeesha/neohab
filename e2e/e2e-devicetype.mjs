// The device type kept on one device (Settings > Appearance): Tablet makes a wide screen draw and edit the
// tablet layout, Phone makes it a stack, Desktop makes a phone-sized screen a grid, and Automatic goes back to
// deciding by width. Set through the real field, kept across a reload, and on that device only.
// SAFE with a live config: creates only dashboard:nh-e2e-devtype and deletes exactly that. The surface bounds
// it needs are shown to this browser only (lib/sandbox.mjs). Label widgets only, so it commands nothing.
import { launchChromium } from './lib/browser.mjs'
import { APP, NS, TOKEN, AUTH, isAppResource } from './lib/target.mjs'
import { sharedSettings } from './lib/sandbox.mjs'

const results = []
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''))
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const DASH = 'nh-e2e-devtype'
const UID = 'dashboard:' + DASH
const DESKTOP = { width: 1500, height: 950 }
const PHONE = { width: 393, height: 850 }
const label = (id, text, lg, md, extra = {}) => ({ id, type: 'label', config: { text, fontSize: 20, ...extra }, layout: md ? { lg, md } : { lg } })
const WIDGETS = [
  label('w-a', 'AAA', { x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 }),
  label('w-b', 'BBB', { x: 4, y: 0, w: 2, h: 2 }, { x: 0, y: 2, w: 2, h: 2 }),
  label('w-t', 'NOTAB', { x: 8, y: 0, w: 2, h: 2 }, { x: 4, y: 0, w: 2, h: 2 }, { hideOn: ['tablet'] })
]
const del = () => fetch(NS + '/' + encodeURIComponent(UID), { method: 'DELETE', headers: AUTH }).catch(() => {})

const sb = await sharedSettings({ phoneBelow: 840, tabletBelow: 1200 })
let browser
try {
  await del()
  const seeded = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: UID, component: 'neohab:dashboard', config: { version: 3, id: DASH, name: 'E2E Device type', columns: 12, mdColumns: 6, rowHeight: 60, gap: 8, widgets: WIDGETS } })
  })
  ok('seed', seeded.ok, `HTTP ${seeded.status}`)

  browser = await launchChromium({ channel: 'chrome', headless: true }).catch(() => launchChromium({ headless: true }))
  const errs = []
  const newPage = async (viewport) => {
    const ctx = await browser.newContext({ viewport })
    await sb.install(ctx)
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const at = m.location?.()?.url
      if (isAppResource(at)) errs.push(m.text() + (at ? ' <- ' + at : ''))
    })
    page.on('dialog', (d) => void d.accept())
    return { ctx, page }
  }
  // what the dashboard draws: a stack, or a grid with how many columns, and which widgets
  const drawn = async (page) => {
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
    await sleep(500)
    return page.evaluate(() => {
      const grid = document.querySelector('.nh-grid')
      return {
        stacked: !!document.querySelector('.nh-grid--stacked'),
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        texts: [...document.querySelectorAll('.nh-gcell .nh-widget')].map((w) => w.textContent.trim()).join(',')
      }
    })
  }
  const choose = async (page, value) => {
    await page.goto(APP + '#/settings/appearance', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#nh-set-devicetype', { timeout: 15000 }).catch(() => {})
    await page.selectOption('#nh-set-devicetype', value, { timeout: 5000 }).catch(() => {})
    await sleep(200)
  }

  // ---- a wide screen told it is a tablet --------------------------------------------------------------
  const d = await newPage(DESKTOP)
  const auto = await drawn(d.page)
  ok('a wide screen draws the desktop layout by itself', !auto.stacked && auto.columns === 12, JSON.stringify(auto))
  await choose(d.page, 'tablet')
  const field = await d.page.evaluate(() => ({
    value: document.querySelector('#nh-set-devicetype')?.value ?? null,
    hint: document.querySelector('#nh-set-devicetype')?.closest('.nh-field')?.querySelector('.nh-field__hint')?.textContent ?? null,
    stored: localStorage.getItem('neohab:deviceType')
  }))
  ok('Settings > Appearance offers the device type, and keeps the choice on this device', field.value === 'tablet' && field.stored === 'tablet', JSON.stringify(field))
  ok('and says what it does', /always gets that layout/.test(field.hint ?? ''), String(field.hint))
  const tab = await drawn(d.page)
  ok('set to Tablet, the wide screen draws the tablet layout', !tab.stacked && tab.columns === 6, JSON.stringify(tab))
  ok('and leaves out what is hidden on tablets', !/NOTAB/.test(tab.texts) && /AAA/.test(tab.texts), tab.texts)
  await d.page.reload({ waitUntil: 'domcontentloaded' })
  await d.page.waitForSelector('.nh-gcell', { timeout: 20000 }).catch(() => {})
  await sleep(400)
  const cols = await d.page.evaluate(() => getComputedStyle(document.querySelector('.nh-grid')).gridTemplateColumns.split(' ').length)
  ok('it holds across a reload', cols === 6, String(cols))
  await d.page.click('[aria-label="Edit dashboard"]', { timeout: 5000 }).catch(() => {})
  await d.page.waitForSelector('.nh-grid--edit .nh-cell, .nh-grid--stackedit .nh-cell', { timeout: 10000 }).catch(() => {})
  ok('the editor opens on the tablet layout too', (await d.page.locator('.nh-bpswitch--md').count()) === 1)
  await d.page.click('button:has-text("Exit")', { timeout: 5000 }).catch(() => {})
  await d.page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 10000 }).catch(() => {})

  // ---- told it is a phone -------------------------------------------------------------------------------
  await choose(d.page, 'phone')
  const ph = await drawn(d.page)
  ok('set to Phone, the wide screen stacks the widgets', ph.stacked === true, JSON.stringify(ph))
  await d.page.click('[aria-label="Edit dashboard"]', { timeout: 5000 }).catch(() => {})
  await d.page.waitForSelector('.nh-grid--edit .nh-cell, .nh-grid--stackedit .nh-cell', { timeout: 10000 }).catch(() => {})
  ok('and the editor edits the stack', (await d.page.locator('.nh-grid--stackedit').count()) === 1)
  await d.page.click('button:has-text("Exit")', { timeout: 5000 }).catch(() => {})
  await d.page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 10000 }).catch(() => {})

  // ---- another device is not affected ---------------------------------------------------------------------
  const other = await newPage(DESKTOP)
  const o = await drawn(other.page)
  // only means anything while this device is being told otherwise
  ok('another device still decides by its width', ph.stacked === true && !o.stacked && o.columns === 12, JSON.stringify(o))
  await other.ctx.close()

  // ---- Automatic goes back to the width ---------------------------------------------------------------------
  await choose(d.page, '')
  const back = await drawn(d.page)
  ok('Automatic goes back to deciding by width', ph.stacked === true && !back.stacked && back.columns === 12, JSON.stringify(back))
  ok('and stores nothing', field.stored === 'tablet' && (await d.page.evaluate(() => localStorage.getItem('neohab:deviceType'))) === null)
  await d.ctx.close()

  // ---- a phone-sized screen told it is a desktop ------------------------------------------------------------
  const p = await newPage(PHONE)
  const pAuto = await drawn(p.page)
  ok('a phone-sized screen stacks by itself', pAuto.stacked === true, JSON.stringify(pAuto))
  await choose(p.page, 'desktop')
  const pDesk = await drawn(p.page)
  ok('set to Desktop, it draws the desktop grid', !pDesk.stacked && pDesk.columns === 12 && /NOTAB/.test(pDesk.texts), JSON.stringify(pDesk))
  await p.ctx.close()

  ok('console clean', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (err) {
  ok('suite ran to completion', false, String(err?.stack ?? err).slice(0, 300))
} finally {
  await del()
  const untouched = await sb.verify().catch((e) => ({ ok: false, detail: String(e) }))
  ok('cleanup: the shared settings on the server were never written', untouched.ok, untouched.detail)
  const left = ((await (await fetch(NS, { headers: AUTH })).json()) ?? []).map((c) => c.uid).filter((u) => u === UID)
  ok('cleanup: no leftovers', left.length === 0, left.join(','))
  await browser?.close().catch(() => {})
  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
