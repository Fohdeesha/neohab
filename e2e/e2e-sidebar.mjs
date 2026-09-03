/**
 * Navigation sidebar:
 *   - ☰ replaces ‹ on every screen; opening insets the content on wide screens
 *   - stays open until deliberately dismissed (click/tap outside, Escape, navigation) and
 *     survives the pointer wandering off it; pinning survives the dismissing click too
 *   - pin is per-device (localStorage) and survives a reload
 *   - phones overlay instead of insetting (no room to shrink into), with a scrim, no pin
 *   - the editor's stacked-vs-grid surface subtracts the pinned inset, so run and edit agree
 *   - hideInSidebar hides a dashboard from the list but not from Home; dashboard icons render
 *   - turning the setting off restores the old ‹-to-Home navigation entirely
 *
 * SAFE: creates only nh-e2e-sb* components, exact-uid cleanup, restores the real settings
 * component, commands nothing and clicks no real device control.
 */
import { chromium } from 'playwright-core'
import { BASE, NS, TOKEN, AUTH, ITEMS } from './lib/target.mjs'
import { getSettings, patchSettings, restoreSettings } from './lib/components.mjs'

const launchBrowser = async () => { for (const c of ['msedge', 'chrome']) { try { return await chromium.launch({ channel: c, headless: true }) } catch {} } return chromium.launch({ headless: true }) }

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

/**
 * The live settings component: the sidebar-off section rewrites it, so keep the original.
 * Null on a server where nobody has changed a setting yet, and cleanup then removes the one
 * this suite created rather than leaving it behind.
 */
const settingsBefore = await getSettings()

const widget = (id) => ({
  id,
  type: 'label',
  config: { text: id, fontSize: 20 },
  layout: { lg: { x: 0, y: 0, w: 3, h: 2 } },
})

/**
 * A narrow button hard against the left edge: closing the sidebar removes the whole 260px inset
 * from in front of it, so it used to jump out from under the pointer between pointerdown and
 * pointerup and never receive the click. Every command it would send is aborted by a route, so
 * this drives the real widget without ever commanding the device - and it is bound to the
 * configured test item, so even a routing mistake cannot switch anything unexpected.
 */
const probeButton = {
  id: 'sb-btn',
  type: 'button',
  config: { item: ITEMS.switch, label: 'Probe', command: 'ON', toggle: true },
  layout: { lg: { x: 0, y: 3, w: 1, h: 2 } },
}

/**
 * The same, at the RIGHT edge - and this is the one that proves the scrim.
 *
 * A left-edge button did not command on the broken build either (it jumped 260px away before
 * pointerup), so asserting "no command" there cannot tell the fix from the bug. The grid's right
 * edge barely moves, so this button only shifted ~22px, stayed under the pointer, and DID command
 * - measured. It must not now.
 */
const probeButtonRight = {
  id: 'sb-btn-r',
  type: 'button',
  config: { item: ITEMS.switch, label: 'ProbeR', command: 'ON', toggle: true },
  layout: { lg: { x: 11, y: 3, w: 1, h: 2 } },
}

// Names sort last on purpose so they can be found at a predictable end of the list without
// depending on how the server's own dashboards are named.
const dash = (id, name, extra = {}) => ({
  uid: 'dashboard:' + id,
  component: 'neohab:dashboard',
  tags: [],
  config: { version: 1, id, name, columns: 12, rowHeight: 'match', gap: 5, widgets: [widget(id + '-w')], ...extra },
})

await put(
  dash('nh-e2e-sb-a', 'ZZE2E Alpha', { icon: 'mdi:sofa', widgets: [widget('sb-a-w'), probeButton, probeButtonRight] })
)
await put(dash('nh-e2e-sb-b', 'ZZE2E Beta'))
await put(dash('nh-e2e-sb-h', 'ZZE2E Hidden', { hideInSidebar: true }))

const browser = await launchBrowser()

// A fresh context starts with empty storage, so it is unpinned by default. Do NOT clear the pin
// key in here: an init script re-runs on every load, so it would wipe the pin on reload and make
// "the pin survives a reload" unprovable.
const openCtx = async (width, height, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, ...opts })
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('neohab:apiToken', t)
    } catch {}
  }, TOKEN)
  return ctx
}

const inset = (page) =>
  page.evaluate(() => parseInt(getComputedStyle(document.querySelector('.nh-app')).paddingLeft, 10) || 0)
const sideOpen = (page) => page.evaluate(() => !!document.querySelector('.nh-side.nh-side--open'))

try {
  /* ---------------- desktop: open, inset, navigate ---------------- */
  {
    const ctx = await openCtx(1400, 900)
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })

    ok('dashboard bar shows ☰', (await page.locator('.nh-side__trigger').count()) === 1)
    ok('the ‹-to-Home button is gone (Home moved into the sidebar)', (await page.locator('button[aria-label="Home"]').count()) === 0)
    ok('sidebar starts closed', !(await sideOpen(page)))
    ok('closed sidebar does not inset the content', (await inset(page)) === 0)

    await page.click('.nh-side__trigger')
    await page.waitForTimeout(300)
    ok('☰ opens the sidebar', await sideOpen(page))
    ok('opening insets the content by the sidebar width', (await inset(page)) === 260, 'inset=' + (await inset(page)))
    // A scrim exists at every width (it is what stops the dismissing click also pressing a
    // widget), but on a wide screen nothing is covered, so it must not dim anything.
    ok('a scrim guards the dashboard while it is unpinned', (await page.locator('.nh-side__scrim').count()) === 1)
    ok(
      'the wide-screen scrim is invisible (the content is beside it, not under it)',
      (await page.evaluate(() => getComputedStyle(document.querySelector('.nh-side__scrim')).backgroundColor)) ===
        'rgba(0, 0, 0, 0)'
    )

    const labels = await page.locator('.nh-side__item .nh-side__label').allTextContents()
    ok('Home is the first entry', labels[0] === 'Home', labels.slice(0, 3).join('|'))
    ok('Settings is the last entry', labels[labels.length - 1] === 'Settings', labels.slice(-2).join('|'))
    ok('a normal dashboard is listed', labels.includes('ZZE2E Alpha'))
    ok('hideInSidebar keeps a dashboard out of the list', !labels.includes('ZZE2E Hidden'), labels.join('|'))

    const active = await page.locator('.nh-side__item--active .nh-side__label').textContent()
    ok('the dashboard being viewed is marked active', active === 'ZZE2E Alpha', 'active=' + active)

    const iconOk = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.nh-side__item')]
      const row = rows.find((r) => r.textContent.includes('ZZE2E Alpha'))
      return !!row?.querySelector('.nh-side__icon')
    })
    ok('a dashboard icon renders in its sidebar row', iconOk)

    // Order must match Home's tiles: two lists of the same things that disagreed would confuse.
    // Sliced, not filtered by name: a live dashboard can itself be named "Home", so
    // dropping entries called "Home" would drop a dashboard as well as the nav entry.
    const sideDashes = labels.slice(1, -1)
    await page.goto(BASE + '/neohab/index.html#/')
    await page.waitForSelector('.nh-tile', { timeout: 10000 })
    const tiles = (await page.locator('.nh-tile:not(.nh-tile--new) .nh-tile__name').allTextContents()).filter(
      (t) => t !== 'ZZE2E Hidden'
    )
    ok('sidebar order matches the Home tiles', JSON.stringify(sideDashes) === JSON.stringify(tiles), sideDashes.slice(0, 3).join('|'))
    ok('a hidden dashboard is still on Home', (await page.locator('.nh-tile__name').allTextContents()).includes('ZZE2E Hidden'))
    ok('Home shows the tile icon', (await page.locator('.nh-tile .nh-tile__icon').count()) >= 1)
    ok('Home has a floating ☰', (await page.locator('.nh-home__menu').count()) === 1)

    // navigate from the sidebar. A goto that only changes the fragment is a same-document
    // navigation, so assert the state rather than assuming the trigger opens it.
    ok('arriving on Home closed the sidebar behind us', !(await sideOpen(page)))
    await page.click('.nh-home__menu')
    await page.waitForTimeout(250)
    ok('Home’s ☰ opens it too', await sideOpen(page))
    await page.locator('.nh-side__item', { hasText: 'ZZE2E Beta' }).click()
    await page.waitForTimeout(400)
    ok('clicking a row navigates to that dashboard', page.url().endsWith('#/d/nh-e2e-sb-b'), page.url())
    ok('and the sidebar closes behind it', !(await sideOpen(page)))

    ok('no console/page errors', errs.length === 0, errs.join('|').slice(0, 200))
    await ctx.close()
  }

  /* ---------------- closing: only on a deliberate dismissal ---------------- */
  {
    const ctx = await openCtx(1400, 900)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })

    // Moving the pointer around must NOT close it: reading down the list means leaving the
    // sidebar, and a menu that vanishes because the mouse drifted has to be re-opened to use.
    await page.click('.nh-side__trigger')
    await page.waitForTimeout(300)
    await page.mouse.move(130, 400) // into the sidebar
    await page.waitForTimeout(150)
    ok('the sidebar stays open while the pointer is on it', await sideOpen(page))
    await page.mouse.move(900, 400) // off it, over the dashboard
    await page.waitForTimeout(700)
    ok('moving the pointer off it does NOT close it', await sideOpen(page))
    await page.mouse.move(1300, 800) // wander further
    await page.mouse.move(700, 100)
    await page.waitForTimeout(700)
    ok('…nor does wandering around the dashboard', await sideOpen(page))
    ok('…and the content stays inset meanwhile', (await inset(page)) === 260)

    // only a real click dismisses it
    await page.mouse.click(900, 500)
    await page.waitForTimeout(300)
    ok('clicking the dashboard closes it', !(await sideOpen(page)))
    ok('and the content reclaims the space', (await inset(page)) === 0)

    await page.click('.nh-side__trigger')
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    ok('Escape closes it', !(await sideOpen(page)))

    // clicking inside it (not on a row) must keep it open
    await page.click('.nh-side__trigger')
    await page.waitForTimeout(300)
    await page.mouse.click(130, 700) // empty space in the list
    await page.waitForTimeout(300)
    ok('clicking inside the sidebar keeps it open', await sideOpen(page))
    await ctx.close()
  }

  /* ---------------- the dismissing click only dismisses ---------------- */
  {
    const ctx = await openCtx(1400, 900)
    const page = await ctx.newPage()

    // every command is recorded and aborted: the real widget is driven, the device is not
    const posts = []
    await page.route('**/rest/items/**', async (route) => {
      if (route.request().method() === 'POST') {
        posts.push(route.request().postData())
        return route.abort()
      }
      return route.continue()
    })

    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-button', { timeout: 15000 })
    const leftBtn = page.locator('.nh-button', { hasText: 'Probe' }).first()
    const rightBtn = page.locator('.nh-button', { hasText: 'ProbeR' })

    // baseline: with no sidebar in the way the button works
    await leftBtn.click()
    await page.waitForTimeout(400)
    ok('baseline: the button commands normally', posts.length === 1, JSON.stringify(posts))

    // the reported bug: with the sidebar open, this click used to close the sidebar AND leave the
    // button untoggled, because removing the inset moved the button out from under the pointer
    // between pointerdown and pointerup, so the click landed on the grid instead.
    const clickAt = async (locator) => {
      const box = await locator.boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
    }

    posts.length = 0
    await page.click('.nh-side__trigger')
    await page.waitForTimeout(500)
    await clickAt(leftBtn)
    ok('the dismissing click closes the sidebar', !(await sideOpen(page)))
    ok('…and does NOT command the widget it landed on', posts.length === 0, JSON.stringify(posts))

    // The discriminating one: this button barely moves when the inset goes, so on the broken
    // build the click reached it and commanded. The scrim must swallow this one too.
    posts.length = 0
    await page.click('.nh-side__trigger')
    await page.waitForTimeout(500)
    await clickAt(rightBtn)
    ok('a widget that the click used to reach is guarded too', posts.length === 0, JSON.stringify(posts))
    ok('…and that click still dismissed the sidebar', !(await sideOpen(page)))

    // and the dashboard is live again immediately afterwards
    posts.length = 0
    await leftBtn.click()
    await page.waitForTimeout(400)
    ok('the next click works normally', posts.length === 1, JSON.stringify(posts))

    // under a pinned sidebar the dashboard is live: it is not going anywhere, so nothing is guarded
    posts.length = 0
    await page.evaluate(() => localStorage.setItem('neohab:sidebarPinned', '1'))
    await page.reload()
    await page.waitForSelector('.nh-side--open', { timeout: 15000 })
    await page.waitForTimeout(600)
    ok('a pinned sidebar has no scrim', (await page.locator('.nh-side__scrim').count()) === 0)
    await page.locator('.nh-button', { hasText: 'Probe' }).first().click()
    await page.waitForTimeout(400)
    ok('widgets work normally under a pinned sidebar', posts.length === 1, JSON.stringify(posts))
    ok('…and it stays open', await sideOpen(page))
    await ctx.close()
  }

  /* ---------------- pin ---------------- */
  {
    const ctx = await openCtx(1400, 900)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })

    await page.click('.nh-side__trigger')
    await page.waitForTimeout(300)
    ok('the pin is offered on a wide screen', (await page.locator('.nh-side__pin').count()) === 1)
    await page.click('.nh-side__pin')
    await page.waitForTimeout(300)

    // What pinning buys you now that nothing closes on mouse-off: surviving the click that would
    // dismiss an unpinned sidebar.
    await page.mouse.click(900, 500)
    await page.waitForTimeout(400)
    ok('a pinned sidebar survives a click on the dashboard', await sideOpen(page))
    ok('a pinned sidebar keeps the content inset', (await inset(page)) === 260)
    ok('☰ disappears while pinned (the list is already there)', (await page.locator('.nh-side__trigger').count()) === 0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    ok('Escape does not close a pinned sidebar', await sideOpen(page))

    ok('the pin is stored per-device', (await page.evaluate(() => localStorage.getItem('neohab:sidebarPinned'))) === '1')

    // A pinned tablet rotated to portrait drops below the push threshold. The pin must simply
    // stop applying - NOT resurface as an overlay thrown over the dashboard unasked. Checked
    // here, in the same page that did the pinning: a reload re-inits the store and would hide
    // the stale open flag this is about.
    await page.setViewportSize({ width: 500, height: 900 })
    await page.waitForTimeout(400)
    ok('narrowing past the push threshold does not overlay a pinned sidebar', !(await sideOpen(page)))
    ok('…and ☰ is offered again so it can still be reached', (await page.locator('.nh-side__trigger').count()) === 1)
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(400)
    ok('widening again restores the pin', await sideOpen(page))

    await page.reload()
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    ok('the pin survives a reload', await sideOpen(page), 'inset=' + (await inset(page)))
    ok('…still insetting the content', (await inset(page)) === 260)

    // navigating with it pinned keeps it pinned
    await page.locator('.nh-side__item', { hasText: 'ZZE2E Beta' }).click()
    await page.waitForTimeout(400)
    ok('it stays open across navigation while pinned', await sideOpen(page))

    await page.click('.nh-side__pin')
    await page.waitForTimeout(200)
    ok('unpinning leaves it on screen rather than yanking it from under the cursor', await sideOpen(page))
    await page.mouse.click(900, 400)
    await page.waitForTimeout(400)
    ok('an unpinned sidebar is dismissable by a click again', !(await sideOpen(page)))
    ok('and the pin is forgotten', (await page.evaluate(() => localStorage.getItem('neohab:sidebarPinned'))) === null)
    await ctx.close()
  }

  /* ---------------- editor surface agrees with the runtime grid ---------------- */
  {
    // 1080 viewport - 260 pinned = 820, under the 840 stacking threshold: run mode stacks, so
    // edit mode must stack too. Before the inset was subtracted the editor showed a wide grid.
    const ctx = await openCtx(1080, 900)
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      try {
        localStorage.setItem('neohab:sidebarPinned', '1')
      } catch {}
    })
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-side--open', { timeout: 15000 })
    await page.waitForTimeout(400)
    ok('pinned at 1080: run mode stacks (820px of content)', (await page.locator('.nh-grid--stacked').count()) === 1)

    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForTimeout(600)
    const stackEdit = await page.locator('.nh-grid--stackedit').count()
    const gridEdit = await page.locator('.nh-grid--edit').count()
    ok('pinned at 1080: the editor stacks too (surfaces agree)', stackEdit === 1 && gridEdit === 0, `stackedit=${stackEdit} grid=${gridEdit}`)
    await ctx.close()
  }

  {
    // wide enough that the pin costs nothing: both surfaces stay on the grid
    const ctx = await openCtx(1400, 900)
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      try {
        localStorage.setItem('neohab:sidebarPinned', '1')
      } catch {}
    })
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-side--open', { timeout: 15000 })
    await page.waitForTimeout(400)
    ok('pinned at 1400: run mode keeps the grid', (await page.locator('.nh-grid--stacked').count()) === 0)
    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })
    ok('pinned at 1400: the editor keeps the grid', (await page.locator('.nh-grid--edit').count()) === 1)
    ok('☰ is not offered while editing (a stray tap would drop the draft)', (await page.locator('.nh-side__trigger').count()) === 0)
    await ctx.close()
  }

  /* ---------------- phone: overlay, no inset, no pin ---------------- */
  {
    const ctx = await openCtx(393, 830, { deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })

    await page.click('.nh-side__trigger')
    await page.waitForTimeout(400)
    ok('phone: ☰ opens the sidebar', await sideOpen(page))
    ok('phone: the content is NOT inset (133px of dashboard would be unusable)', (await inset(page)) === 0)
    ok('phone: a scrim covers the dashboard instead', (await page.locator('.nh-side__scrim').count()) === 1)
    ok('phone: no pin (nothing to pin it beside)', (await page.locator('.nh-side__pin').count()) === 0)

    const w = await page.evaluate(() => document.querySelector('.nh-side').getBoundingClientRect().width)
    ok('phone: the sidebar leaves the dashboard visible behind it', w <= 280 && w < 393, 'width=' + w)

    const tall = await page.evaluate(() => {
      const r = document.querySelector('.nh-side__item').getBoundingClientRect()
      return r.height
    })
    ok('phone: rows are touch-sized', tall >= 44, 'height=' + tall)

    ok('phone: no horizontal scroll with the sidebar open', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))

    // touch has no hover, so nothing but a real tap should dismiss it
    await page.mouse.move(200, 400)
    await page.mouse.move(360, 400)
    await page.waitForTimeout(600)
    ok('phone: it stays open until actually tapped', await sideOpen(page))

    await page.tap('.nh-side__scrim', { position: { x: 350, y: 500 } }).catch(async () => {
      await page.mouse.click(350, 500)
    })
    await page.waitForTimeout(400)
    ok('phone: tapping outside closes it', !(await sideOpen(page)))
    ok('phone: no page errors', errs.length === 0, errs.join('|').slice(0, 160))
    await ctx.close()
  }

  /* ---------------- unsaved-draft guard ---------------- */
  {
    const ctx = await openCtx(1400, 900)
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      try {
        localStorage.setItem('neohab:sidebarPinned', '1')
      } catch {}
    })
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-side--open', { timeout: 15000 })
    await page.click('button[aria-label="Edit dashboard"]')
    await page.waitForFunction(() => document.querySelectorAll('.nh-grid--edit .nh-cell').length > 0, { timeout: 10000 })
    // make the draft dirty without touching the server
    await page.click('button[aria-label="Add widget"]')
    await page.waitForSelector('.nh-palette', { timeout: 8000 })
    // A pinned sidebar is stacked above a bottom sheet (it has to overlay a phone), so the sheet
    // must start where the sidebar ends or its first column of cards cannot be pressed. That is
    // how the Clock click below died the day the palette gained one more card and Clock moved
    // into that column: the sheet spanned the viewport and the sidebar covered its left 260px.
    const sheetGeo = await page.evaluate(() => {
      const sh = document.querySelector('.nh-sheet')?.getBoundingClientRect()
      const sb = document.querySelector('.nh-side')?.getBoundingClientRect()
      return sh && sb ? { sheetLeft: Math.round(sh.left), sideRight: Math.round(sb.right) } : null
    })
    ok('pinned: the palette sheet starts where the sidebar ends', sheetGeo && sheetGeo.sheetLeft >= sheetGeo.sideRight, JSON.stringify(sheetGeo))
    await page.locator('.nh-palette button', { hasText: 'Clock' }).first().click()
    await page.waitForTimeout(400)

    let asked = false
    page.once('dialog', async (d) => {
      asked = /discard/i.test(d.message())
      await d.dismiss() // stay put
    })
    await page.locator('.nh-side__item', { hasText: 'ZZE2E Beta' }).click()
    await page.waitForTimeout(500)
    ok('navigating away from an unsaved draft asks first', asked)
    ok('dismissing the prompt stays on the dashboard', page.url().endsWith('#/d/nh-e2e-sb-a'), page.url())
    await ctx.close()
  }

  /* ---------------- the setting turns it all off ---------------- */
  {
    const r = await patchSettings(settingsBefore, { sidebar: false })
    ok('setting sidebar:false persisted', r.ok, 'status=' + r.status)

    const ctx = await openCtx(1400, 900)
    const page = await ctx.newPage()
    await page.goto(BASE + '/neohab/index.html#/d/nh-e2e-sb-a')
    await page.waitForSelector('.nh-gcell', { timeout: 15000 })
    ok('off: no ☰', (await page.locator('.nh-side__trigger').count()) === 0)
    ok('off: the ‹-to-Home button is back', (await page.locator('button[aria-label="Home"]').count()) === 1)
    ok('off: no sidebar in the DOM at all', (await page.locator('.nh-side').count()) === 0)
    ok('off: content is not inset', (await inset(page)) === 0)
    await page.click('button[aria-label="Home"]')
    await page.waitForTimeout(400)
    ok('off: ‹ still goes Home', page.url().endsWith('#/'), page.url())
    ok('off: Home has no floating ☰ either', (await page.locator('.nh-home__menu').count()) === 0)

    // and the Settings toggle turns it back on
    await page.goto(BASE + '/neohab/index.html#/settings')
    await page.waitForSelector('#nh-set-sidebar', { timeout: 10000 })
    ok('the Settings toggle reflects the stored value', !(await page.locator('#nh-set-sidebar').isChecked()))
    await page.locator('#nh-set-sidebar').check()
    await page.waitForTimeout(600)
    ok('ticking it brings the ☰ back immediately', (await page.locator('.nh-side__trigger').count()) === 1)
    const stored = await getSettings()
    ok('…and persists it', stored?.config?.sidebar === true, JSON.stringify(stored?.config))
    await ctx.close()
  }
} catch (err) {
  ok('suite ran without crashing', false, String(err))
} finally {
  await browser.close()

  // put the settings component back exactly as it was found, including not existing
  const settingsBack = await restoreSettings(settingsBefore)
  ok(`cleanup: settings ${settingsBack.mode}`, settingsBack.ok, settingsBack.detail)

  for (const uid of created) {
    const r = await fetch(NS + '/' + uid, { method: 'DELETE', headers: AUTH })
    ok('cleanup: ' + uid + ' removed', r.ok || r.status === 404, 'status=' + r.status)
  }
  // Scoped to what THIS suite made: asserting on every `nh-e2e` component made one suite's
  // stray leftover fail three unrelated suites in the same battery run.
  const mine = new Set(created)
  const left = (await (await fetch(NS)).json()).filter((c) => mine.has(c.uid))
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
