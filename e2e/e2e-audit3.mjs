// Third-pass audit fixes: frame widget offers a per-widget opt-in sandbox for same-origin pages (default
// off.
import { launchChromium } from './lib/browser.mjs'
import { BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await launchChromium({ channel: c, headless: true }) } catch {} } return launchChromium({ headless: true }) }

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const created = []

const put = async (comp) => {
  await fetch(NS + '/' + comp.uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(comp),
  })
  if (r.ok) created.push(comp.uid)
  return r.ok
}

await put({
  uid: 'widgetdef:nh-e2e-a3-tpl',
  component: 'neohab:widgetdef',
  tags: [],
  config: {
    version: 1,
    id: 'nh-e2e-a3-tpl',
    name: 'E2E A3 Template',
    template:
      '<div x-init="total = 0">' +
      '<span x-for="n in [1,2,3]"><i x-init="total = total + n"></i></span>' +
      '<b class="a3-sum">{{ total }}</b>' +
      '<em class="a3-extra">{{ config.toString }}</em>' +
      '</div>',
  },
})

const SAME = BASE + '/neohab/tile.png'
const crossUrl = new URL(BASE)
crossUrl.port = String(Number(crossUrl.port || '80') + 1)
const CROSS = crossUrl.origin + '/nothing.png'

await put({
  uid: 'dashboard:nh-e2e-a3',
  component: 'neohab:dashboard',
  tags: [],
  config: {
    version: 1,
    id: 'nh-e2e-a3',
    name: 'E2E Audit3',
    columns: 12,
    rowHeight: 'match',
    gap: 5,
    widgets: [
      { id: 'a3-f-same', type: 'frame', config: { url: SAME, label: 'Same' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
      { id: 'a3-f-on', type: 'frame', config: { url: SAME, label: 'On', sandbox: true }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
      { id: 'a3-f-cross', type: 'frame', config: { url: CROSS, label: 'Cross', sandbox: true }, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } },
      { id: 'a3-f-str', type: 'frame', config: { url: SAME, label: 'Str', refresh: '30' }, layout: { lg: { x: 9, y: 0, w: 3, h: 2 } } },
      { id: 'a3-tpl', type: 'template', config: { customwidget: 'nh-e2e-a3-tpl', config: { toString: 'kept' } }, layout: { lg: { x: 0, y: 2, w: 4, h: 2 } } },
    ],
  },
})

const browser = await launchBrowser()
const newPage = async (ctx) => {
  const page = await ctx.newPage()
  return page
}

try {
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    const page = await newPage(ctx)
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a3')
    await page.waitForSelector('iframe[title="Same"]', { timeout: 15000 })
    await page.waitForTimeout(1500) // let the same-origin frames finish loading

    const probe = await page.evaluate(() => {
      const read = (title) => {
        const f = document.querySelector(`iframe[title="${title}"]`)
        if (!f) return { missing: true }
        let doc = 'null'
        try {
          doc = f.contentDocument ? 'accessible' : 'null'
        } catch {
          doc = 'throws'
        }
        return { sandbox: f.getAttribute('sandbox'), doc }
      }
      return { same: read('Same'), on: read('On'), cross: read('Cross') }
    })

    ok('a frame without the key is NOT sandboxed (openHAB pages keep working)', probe.same.sandbox === null, JSON.stringify(probe.same))
    ok('that page is still reachable, i.e. functional', probe.same.doc === 'accessible', 'contentDocument=' + probe.same.doc)
    ok('opting in sandboxes a same-origin page', probe.on.sandbox === 'allow-scripts', JSON.stringify(probe.on))
    ok(
      'the opt-in really isolates it from the app',
      probe.on.doc !== 'accessible',
      'contentDocument=' + probe.on.doc
    )
    ok('opting in cannot sandbox a cross-origin page', probe.cross.sandbox === null, JSON.stringify(probe.cross))
    ok('no page errors rendering the frames', errs.length === 0, errs.join('|'))
    await ctx.close()
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    const page = await newPage(ctx)
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a3')
    await page.waitForSelector('.nh-template__host', { timeout: 15000 })
    await page.waitForTimeout(1200)

    const tpl = await page.evaluate(() => {
      const host = document.querySelector('.nh-template__host')
      const root = host?.shadowRoot
      if (!root) return { noShadow: true }
      return {
        sum: root.querySelector('.a3-sum')?.textContent ?? '',
        extra: root.querySelector('.a3-extra')?.textContent ?? '',
      }
    })
    ok('assignment writes through to the scope that declared it (1+2+3)', tpl.sum === '6', 'sum=' + JSON.stringify(tpl.sum))
    ok(
      'a setting named "toString" survives the merge',
      tpl.extra === 'kept',
      'extra=' + JSON.stringify(tpl.extra).slice(0, 60)
    )
    ok('no page errors rendering the template', errs.length === 0, errs.join('|'))
    await ctx.close()
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('neohab:apiToken', t)
      } catch {}
    }, TOKEN)
    const page = await newPage(ctx)
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-a3')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })

    await page.locator('.nh-cell').nth(0).locator('.nh-cell__overlay').click()
    await page.waitForSelector('.nh-form', { timeout: 10000 })

    const cb = page.locator('.nh-field:has-text("Sandbox the embedded page") input[type="checkbox"]')
    ok('settings: sandbox checkbox is offered', (await cb.count()) === 1, 'count=' + (await cb.count()))
    ok('settings: it is off for a config without the key', !(await cb.isChecked()))
    const hint = await page.locator('.nh-field__hint').first().textContent()
    ok('settings: the hint states the cost of turning it on', /no longer reach openHAB/.test(hint ?? ''), (hint ?? '').slice(0, 50) + '…')

    await cb.check()
    await page.waitForTimeout(600)
    const attrAfter = await page.evaluate(() => document.querySelector('iframe[title="Same"]')?.getAttribute('sandbox'))
    ok('checking sandboxes the live frame', attrAfter === 'allow-scripts', 'sandbox=' + attrAfter)
    await cb.uncheck()
    await page.waitForTimeout(400)
    const attrBack = await page.evaluate(() => document.querySelector('iframe[title="Same"]')?.getAttribute('sandbox'))
    ok('unchecking takes it back off', attrBack === null, 'sandbox=' + attrBack)

    await page.locator('.nh-cell').nth(3).locator('.nh-cell__overlay').click()
    await page.waitForTimeout(500)
    const refresh = page.locator('.nh-field:has-text("Reload (seconds)") input[type="number"]')
    ok('settings: a number stored as a string still shows', (await refresh.inputValue()) === '30', 'value=' + (await refresh.inputValue()))

    ok('no page errors in the editor', errs.length === 0, errs.join('|'))
    await ctx.close()
  }
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  await browser.close()
  for (const uid of created) {
    const r = await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH })
    ok('cleanup: ' + uid + ' removed', r.ok || r.status === 404, 'status=' + r.status)
  }
  const left = (await (await fetch(NS)).json()).filter((c) => c.uid.includes('nh-e2e-a3'))
  ok('cleanup: no suite leftovers', left.length === 0, JSON.stringify(left.map((c) => c.uid)))
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks`)
console.log(pass === results.length ? 'ALL PASS' : 'SOME FAILED')
process.exitCode = pass === results.length ? 0 : 1
