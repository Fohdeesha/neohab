// The first-run and failure paths a public-launch review went through by hand.
import { launchChromium } from './lib/browser.mjs'
import { BASE, NS, TOKEN, AUTH, ITEMS, UNREACHABLE } from './lib/target.mjs'

const APP = BASE + '/neohab/index.html'
const UID = 'dashboard:nh-e2e-launch'
const DASH = 'nh-e2e-launch'

const launchBrowser = async () => {
  for (const c of ['msedge', 'chrome']) {
    try {
      return await launchChromium({ channel: c, headless: true })
    } catch {}
  }
  return launchChromium({ headless: true })
}

const results = []
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const probe = async (page, fn, arg) => {
  try {
    return await page.evaluate(fn, arg)
  } catch {
    return undefined
  }
}

const seed = async () => {
  await fetch(NS + '/' + UID, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID,
      component: 'neohab:dashboard',
      config: {
        version: 1,
        id: DASH,
        name: 'E2E Launch',
        columns: 12,
        rowHeight: 60,
        gap: 8,
        widgets: [
          { id: 'l-clock', type: 'clock', config: { label: 'Clock' }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
          { id: 'l-label', type: 'label', config: { text: 'Label' }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
        ],
      },
    }),
  })
  return r.ok
}

const seedEmpty = async () => {
  const r = await fetch(NS, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: UID + '-empty',
      component: 'neohab:dashboard',
      config: { version: 1, id: DASH + '-empty', name: 'E2E Launch Empty', columns: 12, rowHeight: 60, gap: 8, widgets: [] },
    }),
  })
  return r.ok
}

const browser = await launchBrowser()

const open = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1400, height: 950 }, ...(opts.touch ? { hasTouch: true, isMobile: true } : {}) })
  await ctx.addInitScript(
    ({ t, signedIn }) => {
      try {
        localStorage.setItem('neohab:themeOverride', 'dark')
        if (signedIn) localStorage.setItem('neohab:apiToken', t)
        else localStorage.removeItem('neohab:apiToken')
      } catch {}
    },
    { t: TOKEN, signedIn: opts.signedIn !== false }
  )
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  return { ctx, page, errs }
}

try {
  ok('seed dashboard', await seed())
  ok('seed empty dashboard', await seedEmpty())

  {
    const { ctx, page } = await open()
    await page.route(/\/rest\/ui\/components\/neohab:config$/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Gateway</body></html>' })
    )
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-welcome', { timeout: 15000 }).catch(() => {})
    const html = (await probe(page, () => document.querySelector('.nh-welcome')?.textContent ?? '')) ?? ''
    ok('an HTML answer is reported as one, not as a JavaScript error', !/is not a function/.test(html), html.slice(0, 120))
    ok('and it offers a way to try again', (await page.locator('.nh-welcome button', { hasText: /again/i }).count()) === 1)

    await page.unroute(/\/rest\/ui\/components\/neohab:config$/)
    await page.locator('.nh-welcome button', { hasText: /again/i }).click().catch(() => {})
    await page.waitForSelector('.nh-tiles .nh-tile', { timeout: 15000 }).catch(() => {})
    ok('trying again loads the dashboards', (await page.locator('.nh-tiles .nh-tile').count()) > 0)
    await ctx.close()
  }

  {
    const { ctx, page } = await open()
    await page.route(/\/rest\/ui\/components\/neohab:config$/, (route) => route.fulfill({ status: 502, body: 'Bad Gateway' }))
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-welcome', { timeout: 15000 }).catch(() => {})
    const text = (await probe(page, () => document.querySelector('.nh-welcome')?.textContent ?? '')) ?? ''
    ok('a 502 is described without the REST call in it', !/\/rest\//.test(text) && !/GET /.test(text), text.slice(0, 140))
    await ctx.close()
  }

  {
    const { ctx, page } = await open({ signedIn: false })
    await page.route(/\/rest\/ui\/components\/neohab:config$/, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Authentication required' } }) })
    )
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-welcome', { timeout: 15000 }).catch(() => {})
    const welcome = (await probe(page, () => document.querySelector('.nh-welcome')?.textContent ?? '')) ?? ''
    ok('the welcome asks for a sign-in rather than reporting a 401', /sign in/i.test(welcome) && !/401/.test(welcome), welcome.slice(0, 120))

    await page.locator('.nh-welcome button', { hasText: /^Sign in$/ }).click().catch(() => {})
    await page.waitForSelector('.nh-signin', { timeout: 8000 }).catch(() => {})
    const sheet = (await probe(page, () => ({
      title: document.querySelector('.nh-sheet__title')?.textContent ?? '',
      text: document.querySelector('.nh-signin__text')?.textContent ?? '',
    }))) ?? { title: '', text: '' }
    ok('the sheet is about signing in to see, not about editing', !/edit/i.test(sheet.title) && !/edit/i.test(sheet.text), JSON.stringify(sheet))

    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-dash__empty', { timeout: 15000 }).catch(() => {})
    const deep = (await probe(page, () => document.querySelector('.nh-dash__empty')?.textContent ?? '')) ?? ''
    ok('a deep link asks for a sign-in instead of claiming the dashboard is missing', /sign in/i.test(deep) && !/does not exist/i.test(deep), deep.slice(0, 120))
    await ctx.close()
  }

  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 20000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })
    await page.click('[aria-label="Add widget"]')
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 })
    await page.locator('.nh-palette__card', { hasText: /^Clock/ }).first().click()
    await sleep(400)

    await page.route(/\/rest\/ui\/components\/neohab:config/, (route) =>
      route.request().method() === 'GET'
        ? route.continue()
        : route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Authentication required' } }) })
    )
    await page.locator('button:has-text("Save")').click()
    await page.waitForSelector('.nh-dash__error', { timeout: 10000 }).catch(() => {})
    const err = (await probe(page, () => document.querySelector('.nh-dash__error')?.textContent ?? '')) ?? ''
    ok('the refusal is in words, not a PUT line', !/PUT |\/rest\//.test(err) && err.length > 0, err.slice(0, 140))
    ok('it offers a sign-in', (await page.locator('.nh-dash__error button', { hasText: /sign in/i }).count()) === 1)
    ok('and the draft is still there', (await page.locator('.nh-grid--edit .nh-cell').count()) === 3, String(await page.locator('.nh-grid--edit .nh-cell').count()))
    await ctx.close()
  }

  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tiles .nh-tile', { timeout: 20000 })
    await page.evaluate((d) => (window.location.hash = '/d/' + d), DASH)
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 20000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })
    await page.click('[aria-label="Add widget"]')
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 })
    await page.locator('.nh-palette__card', { hasText: /^Clock/ }).first().click()
    await sleep(400)

    let asked = false
    page.once('dialog', async (d) => {
      asked = /discard/i.test(d.message())
      await d.dismiss() // keep editing
    })
    await page.goBack()
    await sleep(800)
    ok('going back from an unsaved draft asks first', asked)
    ok('declining keeps the editor open', (await page.locator('.nh-grid--edit').count()) === 1)
    ok('and keeps the draft', (await page.locator('.nh-grid--edit .nh-cell').count()) === 3, String(await page.locator('.nh-grid--edit .nh-cell').count()))
    ok('and puts the address back', page.url().includes('/d/' + DASH), page.url())

    const stored = await (await fetch(NS + '/' + UID, { headers: AUTH })).json()
    ok('and wrote nothing to the server', stored?.config?.widgets?.length === 2, String(stored?.config?.widgets?.length))

    page.once('dialog', (d) => void d.accept())
    await page.evaluate(() => (window.location.hash = '/'))
    await sleep(800)
    ok('accepting leaves the editor', (await page.locator('.nh-grid--edit').count()) === 0)
    await ctx.close()
  }

  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tile--new', { timeout: 20000 })
    await page.click('.nh-tile--new')
    await page.waitForSelector('.nh-sheet', { timeout: 8000 })
    await page.keyboard.press('Escape')
    await sleep(300)
    ok('Escape closes a sheet outside edit mode', (await page.locator('.nh-sheet').count()) === 0)

    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 20000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })
    await page.locator('.nh-cell').first().locator('.nh-cell__overlay').click()
    await page.waitForSelector('.nh-sheet--side', { timeout: 8000 })
    await page.click('[aria-label="Add widget"]')
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 })
    ok('both sheets are open', (await page.locator('.nh-sheet').count()) === 2, String(await page.locator('.nh-sheet').count()))
    await page.keyboard.press('Escape')
    await sleep(300)
    ok('Escape closes the palette and leaves the panel', (await page.locator('.nh-palette__card').count()) === 0 && (await page.locator('.nh-sheet--side').count()) === 1)
    await page.keyboard.press('Escape')
    await sleep(300)
    ok('a second Escape closes the panel', (await page.locator('.nh-sheet--side').count()) === 0)
    ok('and the editor is still open', (await page.locator('.nh-grid--edit').count()) === 1)
    await ctx.close()
  }

  {
    const { ctx, page } = await open({ viewport: { width: 393, height: 850 }, touch: true })
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 20000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForSelector('.nh-dash__bar', { timeout: 10000 })
    const bar = await probe(page, () => {
      const el = document.querySelector('.nh-dash__bar')
      const save = [...document.querySelectorAll('.nh-dash__bar button')].find((b) => /^(Save|Speichern)/.test(b.textContent ?? ''))
      const title = document.querySelector('.nh-dash__title')
      if (!el || !save || !title) return null
      const range = document.createRange()
      range.selectNodeContents(title)
      return {
        barRight: Math.round(el.getBoundingClientRect().right),
        saveRight: Math.round(save.getBoundingClientRect().right),
        titleLines: range.getClientRects().length,
        titleText: title.textContent ?? '',
        viewport: window.innerWidth,
      }
    })
    ok('the Save button is inside the toolbar', bar != null && bar.saveRight <= bar.barRight, JSON.stringify(bar))
    ok('the title stays on one line', bar != null && bar.titleLines === 1, JSON.stringify(bar))
    const hint = (await probe(page, () => document.querySelector('.nh-dash__edithint')?.textContent ?? '')) ?? ''
    ok('the edit hint does not tell a phone about Ctrl+C', !/Ctrl/.test(hint), hint.slice(0, 100))
    await ctx.close()
  }

  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tile--new', { timeout: 20000 })
    await page.click('.nh-tile--new')
    await page.waitForSelector('#nh-newdash-name', { timeout: 8000 })
    const styled = await probe(page, () => {
      const input = document.querySelector('#nh-newdash-name')
      const themed = getComputedStyle(document.documentElement).getPropertyValue('--nh-bg').trim()
      const cs = input ? getComputedStyle(input) : null
      return cs ? { border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, minHeight: cs.minHeight, bg: cs.backgroundColor, themed } : null
    })
    ok('the new-dashboard name field is themed like every other field', styled != null && parseFloat(styled.radius) >= 4 && parseFloat(styled.minHeight) >= 36, JSON.stringify(styled))
    await page.keyboard.press('Escape')
    await ctx.close()
  }

  {
    const all = await (await fetch(BASE + '/rest/items?fields=name,label,type', { headers: AUTH })).json()
    const labelled = all.find((i) => typeof i.label === 'string' && i.label.trim() && i.type !== 'Group')
    const { ctx, page } = await open()
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 20000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })
    await page.click('[aria-label="Add widget"]')
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 })
    await page.locator('.nh-palette__card', { hasText: /^Value/ }).first().click()
    await page.waitForSelector('.nh-sheet--side input[role="combobox"]', { timeout: 8000 })

    const combo = page.locator('.nh-sheet--side input[role="combobox"]').first()
    await combo.click()
    await page.keyboard.type(String(labelled?.name ?? ITEMS.dimmer).slice(0, 6).toLowerCase(), { delay: 40 })
    await page.waitForSelector('.nh-picker__option', { timeout: 8000 })
    await page
      .locator('.nh-picker__option', { has: page.locator('.nh-picker__name', { hasText: new RegExp('^' + labelled.name + '$') }) })
      .first()
      .click()
    await sleep(500)
    const nameField = page.locator('.nh-sheet--side .nh-field', { has: page.locator('.nh-field__label', { hasText: /^Name$/ }) }).locator('input')
    const named = await nameField.inputValue().catch(() => '')
    const bound = await combo.inputValue().catch(() => '')
    ok('binding an item fills the empty Name from the item’s label', named === labelled.label, `name=${named} want=${labelled.label}`)
    await page.click('[aria-label="Undo"]')
    await sleep(400)
    const afterUndo = await nameField.inputValue().catch(() => '')
    const boundAfterUndo = await combo.inputValue().catch(() => '')
    ok(
      'one undo takes back both the item and the name',
      bound === labelled.name && named === labelled.label && afterUndo === '' && boundAfterUndo === '',
      `before=${bound}/${named} after=${boundAfterUndo}/${afterUndo}`
    )
    await ctx.close()
  }

  {
    const admin = await open()
    await admin.page.goto(APP + '#/d/' + DASH + '-empty', { waitUntil: 'domcontentloaded' })
    await admin.page.reload({ waitUntil: 'domcontentloaded' })
    await admin.page.waitForSelector('.nh-dash__empty', { timeout: 20000 }).catch(() => {})
    const adminText = (await probe(admin.page, () => document.querySelector('.nh-dash__empty')?.textContent ?? '')) ?? ''
    ok('an administrator is pointed at the pencil', /✎/.test(adminText), adminText.slice(0, 80))

    await admin.page.click('[aria-label="Edit dashboard"]')
    await admin.page.waitForSelector('.nh-grid--edit', { timeout: 10000 })
    const editHint = (await probe(admin.page, () => document.querySelector('.nh-dash__edithint')?.textContent ?? '')) ?? ''
    ok('an empty editor says how to add the first widget', /\+/.test(editHint) && !/handle/i.test(editHint), editHint.slice(0, 90))
    await admin.ctx.close()

    const guest = await open({ signedIn: false })
    await guest.page.goto(APP + '#/d/' + DASH + '-empty', { waitUntil: 'domcontentloaded' })
    await guest.page.waitForSelector('.nh-dash__empty', { timeout: 20000 }).catch(() => {})
    const guestText = (await probe(guest.page, () => document.querySelector('.nh-dash__empty')?.textContent ?? '')) ?? ''
    ok('a visitor is not told to tap a pencil they do not have', guestText.length > 0 && !/✎/.test(guestText), guestText.slice(0, 80))
    await guest.ctx.close()
  }

  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-settings__index', { timeout: 20000 }).catch(() => {})
    const index = await probe(page, () => {
      const links = [...document.querySelectorAll('.nh-settings__indexlink')].map((b) => b.textContent ?? '')
      const heads = [...document.querySelectorAll('.nh-settings__h')].map((h) => h.textContent ?? '')
      return { links, heads, missing: links.filter((l) => !heads.includes(l)) }
    })
    ok('Settings offers an index of its sections', (index?.links.length ?? 0) >= 10, JSON.stringify(index?.links))
    ok('every link names a section that is there', (index?.missing.length ?? 1) === 0, JSON.stringify(index?.missing))
    ok('Account is one of them', (index?.links ?? []).includes('Account'), JSON.stringify(index?.links))

    const accountTop = () =>
      probe(page, () => Math.round(document.getElementById('nh-sec-account')?.getBoundingClientRect().top ?? 0))
    const before = await accountTop()
    await page.locator('.nh-settings__indexlink', { hasText: /^Account$/ }).click()
    let after = await accountTop()
    for (let i = 0; i < 20; i++) {
      await sleep(200)
      const now = await accountTop()
      if (now === after) break
      after = now
    }
    ok('clicking one scrolls to its section', before > 1000 && after < 500, `${before} -> ${after}`)

    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('section:has(h2:text-is("Backup"))', { timeout: 20000 })
    const bad = { manifest: { app: 'neohab', formatVersion: 3, kind: 'dashboard', primary: 'dashboard:x' }, components: [] }
    const good = {
      manifest: { app: 'neohab', formatVersion: 2, kind: 'dashboard', primary: UID, exportedAt: new Date().toISOString() },
      components: [{ uid: UID, component: 'neohab:dashboard', config: { version: 1, id: DASH, name: 'E2E Launch', columns: 12, rowHeight: 60, gap: 8, widgets: [] } }],
    }
    const drop = async (obj) =>
      page
        .locator('section:has(h2:text-is("Backup")) input[type="file"]')
        .setInputFiles({ name: 'partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) })
    await drop(bad)
    await page.waitForSelector('.nh-toast__text', { timeout: 10000 }).catch(() => {})
    ok('a refused file leaves a notice', (await page.locator('.nh-toast__text').count()) === 1)
    await drop(good)
    await page.waitForSelector('.nh-settings__importchoice', { timeout: 10000 }).catch(() => {})
    ok('and the next file still gets its card, after the notice cleared', (await page.locator('.nh-settings__importchoice').count()) === 1)
    await ctx.close()
  }

  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tiles, .nh-welcome', { timeout: 20000 })
    ok('nothing announces an update on a healthy page', (await page.locator('.nh-update').count()) === 0)
    await page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })))
    await sleep(300)
    ok('a chunk that is gone offers a reload', (await page.locator('.nh-update').count()) === 1)
    ok('with a button that does it', (await page.locator('.nh-update button', { hasText: /reload/i }).count()) === 1)
    await ctx.close()
  }

  // The live-updates notice has to name the reason THIS server cannot stream, which is not the
  // same question as whether the reader is signed out: once signed in the config loads fine, and
  // the item-state stream is still an EventSource that cannot carry the token. Both halves are
  // produced here by answering the app's own requests, so no server setting is touched.
  {
    // openHAB with its implicit user role off refuses a request that carries NO token and serves
    // one that does, so the fake has to do the same. Answering 401 to everything would reproduce
    // being signed out, which is not the case under test: signed out there is no dashboard at all.
    let probesSeen = 0
    const liveNotice = async ({ implicitRole }) => {
      const { ctx, page } = await open()
      await page.route('**/rest/events/states**', (r) => r.abort()) // never connects
      if (!implicitRole) {
        await page.route('**/rest/**', (r) => {
          const auth = r.request().headers()['authorization']
          if (auth) return r.continue()
          probesSeen++
          return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"Authentication required"}}' })
        })
      }
      await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.nh-dash', { timeout: 20000 })
      await page.waitForSelector('.nh-live', { timeout: 20000 }).catch(() => {})
      await sleep(1500) // the probe answers after the notice is already up
      const text = await probe(page, () => document.querySelector('.nh-live')?.innerText.replace(/\s+/g, ' ') ?? '')
      await ctx.close()
      return text ?? ''
    }

    const refused = await liveNotice({ implicitRole: false })
    ok('a server that refuses a signed-out read still raises the live-updates notice', /live updates unavailable/i.test(refused), refused.slice(0, 80))
    ok('the app asked a question the token would have answered wrongly', probesSeen > 0, 'credential-free requests seen: ' + probesSeen)
    ok(
      'and it blames the user role rather than the reader, with a token in hand',
      /user role/i.test(refused) && !/proxy/i.test(refused),
      refused.slice(0, 200)
    )

    const allowed = await liveNotice({ implicitRole: true })
    ok('a server that serves reads but will not stream also raises it', /live updates unavailable/i.test(allowed), allowed.slice(0, 80))
    ok('and that one does blame the plumbing', /proxy/i.test(allowed) && !/user role/i.test(allowed), allowed.slice(0, 200))
  }

  // A widget bound to an item this server does not have reported the control's floor - a slider
  // and a dial both read 0, which looks exactly like a light that is off.
  {
    const GHOST = 'nh_e2e_launch_ghost'
    await fetch(NS + '/' + UID + '-ghost', { method: 'DELETE', headers: AUTH }).catch(() => {})
    await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: UID + '-ghost',
        component: 'neohab:dashboard',
        config: {
          version: 1,
          id: DASH + '-ghost',
          name: 'E2E Launch ghost',
          columns: 12,
          rowHeight: 60,
          widgets: [
            { id: 'ghost', type: 'slider', config: { label: 'Gone', item: GHOST }, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
            { id: 'real', type: 'slider', config: { label: 'Here', item: ITEMS.dimmer }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } }
          ]
        }
      })
    })

    const read = async (route) => {
      const { ctx, page } = await open()
      if (route) await page.route('**/rest/items?fields=name**', route)
      await page.goto(APP + '#/d/' + DASH + '-ghost', { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.nh-gcell', { timeout: 20000 })
      await sleep(3500)
      const out = await probe(page, () => {
        const cells = [...document.querySelectorAll('.nh-gcell')]
        // a failed tile no longer carries the widget's own name, so find it by the item it names
        const of = (t) => cells.find((c) => c.innerText.toLowerCase().includes(t))
        const ghost = of('nh_e2e_launch_ghost') ?? of('gone')
        return {
          ghost: (ghost?.innerText ?? '').replace(/\s+/g, ' ').trim(),
          ghostIsError: !!ghost?.querySelector('.nh-widget--error'),
          real: (of('here')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
          realIsError: !!of('here')?.querySelector('.nh-widget--error'),
          sliders: document.querySelectorAll('.nh-gcell input[type="range"]').length
        }
      })
      await ctx.close()
      return out ?? {}
    }

    const seen = await read(null)
    ok('a widget whose item is not on the server says so', /not on this openhab server/i.test(seen.ghost ?? ''), (seen.ghost ?? '').slice(0, 90))
    ok('and it names the item, so the reader knows which', (seen.ghost ?? '').includes(GHOST), (seen.ghost ?? '').slice(0, 90))
    ok('rather than drawing a control at its floor', seen.sliders === 1, 'range inputs on the page: ' + seen.sliders)
    ok('a widget whose item IS on the server keeps its control', seen.realIsError === false, (seen.real ?? '').slice(0, 60))
    ok('and still shows that item’s value', /\d/.test(seen.real ?? ''), (seen.real ?? '').slice(0, 60))

    // the other half: not knowing is not the same as knowing it is missing
    const refused = await read((r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"Authentication required"}}' })
    )
    ok(
      'a server that will not list its items is never used to call an item missing',
      refused.ghostIsError === false,
      (refused.ghost ?? '').slice(0, 90)
    )
  }

  // An image whose address does not answer drew an empty tile: no picture and nothing said,
  // where the same widget is clear about a missing, unsafe or mixed-content address.
  {
    const { ctx, page } = await open()
    await fetch(NS + '/' + UID + '-img', { method: 'DELETE', headers: AUTH }).catch(() => {})
    await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: UID + '-img',
        component: 'neohab:dashboard',
        config: {
          version: 1,
          id: DASH + '-img',
          name: 'E2E Launch image',
          columns: 12,
          rowHeight: 60,
          widgets: [
            // 192.0.2.0/24 is TEST-NET-1 and is guaranteed not to route, but the request is
            // failed here anyway so the check never waits on a timeout
            // the scheme has to follow the PAGE's: a hardcoded http:// address in an https page is
            // blocked as mixed content, which the widget reports differently and on purpose, so the
            // check would be measuring that instead of a host that does not answer
            { id: 'img', type: 'image', config: { label: 'Cam', url: UNREACHABLE + '192.0.2.77/snapshot.jpg' }, layout: { lg: { x: 0, y: 0, w: 4, h: 3 } } }
          ]
        }
      })
    })
    await page.route('**/192.0.2.77/**', (r) => r.abort())
    await page.goto(APP + '#/d/' + DASH + '-img', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-gcell', { timeout: 20000 })
    await sleep(2500)
    const shown = await probe(page, () => ({
      text: (document.querySelector('.nh-gcell')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      stillAnImg: document.querySelectorAll('.nh-gcell img').length
    }))
    ok('an image that cannot be loaded says so', /could not be loaded/i.test(shown?.text ?? ''), (shown?.text ?? '(blank tile)').slice(0, 90))
    ok('and the broken image element is gone', shown?.stillAnImg === 0, 'img elements: ' + shown?.stillAnImg)
    await ctx.close()
  }
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  for (const uid of [UID, UID + '-empty', UID + '-ghost', UID + '-img']) {
    const r = await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH })
    ok('cleanup: ' + uid + ' removed', r.ok || r.status === 404, 'status=' + r.status)
  }
  const left = (await (await fetch(NS)).json()).filter((c) => c.uid.includes('nh-e2e-launch'))
  ok('cleanup: no suite leftovers', left.length === 0, JSON.stringify(left.map((c) => c.uid)))
  await browser.close()
}

let pass = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`)
  if (r.pass) pass++
}
console.log(`\n${pass}/${results.length} checks`)
console.log(pass === results.length ? 'ALL PASS' : 'SOME FAILED')
process.exitCode = pass === results.length ? 0 : 1
