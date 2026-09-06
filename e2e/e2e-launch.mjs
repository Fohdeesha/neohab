/**
 * The first-run and failure paths a public-launch review went through by hand.
 *
 * Everything here is a screen somebody meets when something is wrong, or on their very first
 * visit - the parts of the app that had never been driven by a suite because they only appear
 * when the happy path does not happen:
 *   - the configuration cannot be read (a proxy answering an error page with 200, a 502, a
 *     request that never answers), and there is a way to try again rather than a dead screen
 *   - a server that shows nothing without an account: the welcome, the sign-in sheet's own
 *     wording, and a deep link that used to claim the dashboard did not exist
 *   - a save the server refuses offers a sign-in and keeps the draft
 *   - Escape closes a sheet, and only the one on top
 *   - the edit toolbar fits a phone
 *   - the first fields a new administrator types into are styled like every other field
 *   - a lazy chunk that 404s after an upgrade says "reload" instead of failing silently
 *   - binding an item names an unnamed widget after it
 *   - the empty-dashboard message matches what the reader can actually do
 *
 * SAFE: creates only dashboard:nh-e2e-launch and -launch-empty, exact-uid cleanup, commands
 * nothing (its widgets are a clock and a label). Every failure is produced by answering the app's
 * own requests locally, so the server is never reconfigured and a refused save writes nothing.
 *
 * It DOES mint version-history restore points: the refused save is refused at the configuration
 * namespace, and the history capture that runs before every write is a different namespace and
 * goes through. That is deliberate - intercepting it too would test a path nobody has.
 */
import { launchChromium } from './lib/browser.mjs'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'

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

/**
 * Read the page without letting a missing element abort the section: a build without the fix
 * must fail the CHECK, not take every check after it down with a locator timeout.
 */
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

/** An empty dashboard, for the two "nothing here yet" messages. */
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

/** A context, optionally signed in, always on the default theme (this suite reads geometry). */
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

  /* ---------- 1. the configuration cannot be read ---------- */
  {
    const { ctx, page } = await open()
    // A proxy that has lost its upstream answers a page with status 200. The store used to call
    // .map on it and report "e.map is not a function".
    await page.route(/\/rest\/ui\/components\/neohab:config$/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Gateway</body></html>' })
    )
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-welcome', { timeout: 15000 }).catch(() => {})
    const html = (await probe(page, () => document.querySelector('.nh-welcome')?.textContent ?? '')) ?? ''
    ok('an HTML answer is reported as one, not as a JavaScript error', !/is not a function/.test(html), html.slice(0, 120))
    ok('and it offers a way to try again', (await page.locator('.nh-welcome button', { hasText: /again/i }).count()) === 1)

    // Retry against a server that answers properly: the same screen recovers without a reload.
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

  /* ---------- 2. a server that shows nothing without an account ---------- */
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
    // "Editing dashboards requires an administrator account" describes a problem this person does
    // not have: they cannot see anything at all yet.
    ok('the sheet is about signing in to see, not about editing', !/edit/i.test(sheet.title) && !/edit/i.test(sheet.text), JSON.stringify(sheet))

    // A deep link on the same server used to say the dashboard did not exist.
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-dash__empty', { timeout: 15000 }).catch(() => {})
    const deep = (await probe(page, () => document.querySelector('.nh-dash__empty')?.textContent ?? '')) ?? ''
    ok('a deep link asks for a sign-in instead of claiming the dashboard is missing', /sign in/i.test(deep) && !/does not exist/i.test(deep), deep.slice(0, 120))
    await ctx.close()
  }

  /* ---------- 3. a refused save keeps the draft and offers a sign-in ---------- */
  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/d/' + DASH, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[aria-label="Edit dashboard"]', { timeout: 20000 })
    await page.click('[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })
    // Make the draft dirty without touching the server.
    await page.click('[aria-label="Add widget"]')
    await page.waitForSelector('.nh-palette__card', { timeout: 8000 })
    await page.locator('.nh-palette__card', { hasText: /^Clock/ }).first().click()
    await sleep(400)

    // Refuse the save the way a signed-out server does. Fulfilled locally: nothing is written.
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

  /* ---------- 4. leaving with unsaved changes asks, and no does not lose the draft ---------- */
  {
    const { ctx, page } = await open()
    // Home first, then INTO the dashboard by a hash change, so there is a same-document entry to
    // go back to. A `goto` straight at the dashboard would leave the browser's Back pointing at
    // the blank page before the app, which unloads the document rather than changing the route.
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
    // Browser Back, which is the case that used to lose the work without a word.
    await page.goBack()
    await sleep(800)
    ok('going back from an unsaved draft asks first', asked)
    ok('declining keeps the editor open', (await page.locator('.nh-grid--edit').count()) === 1)
    ok('and keeps the draft', (await page.locator('.nh-grid--edit .nh-cell').count()) === 3, String(await page.locator('.nh-grid--edit .nh-cell').count()))
    ok('and puts the address back', page.url().includes('/d/' + DASH), page.url())

    // Nothing was written: the draft only ever existed in the browser.
    const stored = await (await fetch(NS + '/' + UID, { headers: AUTH })).json()
    ok('and wrote nothing to the server', stored?.config?.widgets?.length === 2, String(stored?.config?.widgets?.length))

    page.once('dialog', (d) => void d.accept())
    await page.evaluate(() => (window.location.hash = '/'))
    await sleep(800)
    ok('accepting leaves the editor', (await page.locator('.nh-grid--edit').count()) === 0)
    await ctx.close()
  }

  /* ---------- 5. Escape closes the sheet on top, one layer at a time ---------- */
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
    // A settings panel with the palette over it: two sheets, and Escape must take one.
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

  /* ---------- 6. the edit toolbar fits a phone ---------- */
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
      // Line count from the TEXT's own boxes, not from the element's height over a line-height
      // that computes to the keyword "normal" - which is a NaN and reads as a failure whatever
      // the title is doing. A Range over the contents gives one rect per line box.
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
    // Against the BAR, not the window: the overflowing bar laid out wider than the viewport, so
    // "Save is inside the window" passed by equality on a build where Save was 14px past the edge.
    ok('the Save button is inside the toolbar', bar != null && bar.saveRight <= bar.barRight, JSON.stringify(bar))
    ok('the title stays on one line', bar != null && bar.titleLines === 1, JSON.stringify(bar))
    // The hint has to describe gestures a finger has.
    const hint = (await probe(page, () => document.querySelector('.nh-dash__edithint')?.textContent ?? '')) ?? ''
    ok('the edit hint does not tell a phone about Ctrl+C', !/Ctrl/.test(hint), hint.slice(0, 100))
    await ctx.close()
  }

  /* ---------- 7. the first fields a new administrator types into are styled ---------- */
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
    // A browser-default text input has no border-radius and no min-height; the themed one has both.
    ok('the new-dashboard name field is themed like every other field', styled != null && parseFloat(styled.radius) >= 4 && parseFloat(styled.minHeight) >= 36, JSON.stringify(styled))
    await page.keyboard.press('Escape')
    await ctx.close()
  }

  /* ---------- 8. binding an item names an unnamed widget ---------- */
  {
    // Needs an item that HAS a label: the name comes from the item's label, and inventing one
    // from the item NAME is exactly what this must not do. Servers differ, so the item is chosen
    // from what this one has rather than assumed.
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

    // Typed as a person types, then clicked: filling the exact name auto-binds it and would prove
    // nothing about the list. The row is picked by name, since a partial search matches several.
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
    // One user action is one undo step. Both halves have to be SET first, or "both are empty
    // afterwards" is true on a build that never filled the name in the first place.
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

  /* ---------- 9. the empty-dashboard message matches what the reader can do ---------- */
  {
    const admin = await open()
    await admin.page.goto(APP + '#/d/' + DASH + '-empty', { waitUntil: 'domcontentloaded' })
    await admin.page.reload({ waitUntil: 'domcontentloaded' })
    await admin.page.waitForSelector('.nh-dash__empty', { timeout: 20000 }).catch(() => {})
    const adminText = (await probe(admin.page, () => document.querySelector('.nh-dash__empty')?.textContent ?? '')) ?? ''
    ok('an administrator is pointed at the pencil', /✎/.test(adminText), adminText.slice(0, 80))

    // In edit mode the hint is about adding the first widget, not about dragging ones that do
    // not exist.
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

  /* ---------- 10. Settings has an index, and it survives a notice ---------- */
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
    // A link that names something no heading says sends people to the wrong place.
    ok('every link names a section that is there', (index?.missing.length ?? 1) === 0, JSON.stringify(index?.missing))
    ok('Account is one of them', (index?.links ?? []).includes('Account'), JSON.stringify(index?.links))

    const accountTop = () =>
      probe(page, () => Math.round(document.getElementById('nh-sec-account')?.getBoundingClientRect().top ?? 0))
    const before = await accountTop()
    await page.locator('.nh-settings__indexlink', { hasText: /^Account$/ }).click()
    // Smooth scrolling over five screens takes a moment, and how long depends on the machine, so
    // wait for it to stop rather than guessing a delay.
    let after = await accountTop()
    for (let i = 0; i < 20; i++) {
      await sleep(200)
      const now = await accountTop()
      if (now === after) break
      after = now
    }
    // Under the sticky header rather than at zero: what matters is that the section is on screen
    // and the five screens above it are not.
    ok('clicking one scrolls to its section', before > 1000 && after < 500, `${before} -> ${after}`)

    // The sections keep their own state across a notice. Each anchor wrapper has to be a stable
    // component type, or every section is unmounted and remounted whenever the shell re-renders
    // - which threw away the backup import's confirmation card the moment it was created.
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
    await page.waitForSelector('.nh-settings__notice', { timeout: 10000 }).catch(() => {})
    ok('a refused file leaves a notice', (await page.locator('.nh-settings__notice').count()) === 1)
    await drop(good)
    await page.waitForSelector('.nh-settings__importchoice', { timeout: 10000 }).catch(() => {})
    ok('and the next file still gets its card, after the notice cleared', (await page.locator('.nh-settings__importchoice').count()) === 1)
    await ctx.close()
  }

  /* ---------- 11. an upgrade under an open tab ---------- */
  {
    const { ctx, page } = await open()
    await page.goto(APP + '#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-tiles, .nh-welcome', { timeout: 20000 })
    ok('nothing announces an update on a healthy page', (await page.locator('.nh-update').count()) === 0)
    // What Vite raises when a dynamic import 404s, which after a jar swap is every lazy chunk.
    await page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })))
    await sleep(300)
    ok('a chunk that is gone offers a reload', (await page.locator('.nh-update').count()) === 1)
    ok('with a button that does it', (await page.locator('.nh-update button', { hasText: /reload/i }).count()) === 1)
    await ctx.close()
  }
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  for (const uid of [UID, UID + '-empty']) {
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
