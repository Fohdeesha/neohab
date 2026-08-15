/**
 * The theme editor's two guardrails, in a real browser: the stylesheet checker that reports what
 * a custom theme gets wrong as it is typed, and the copy-from source following the theme this
 * device is actually showing rather than the shared setting.
 *
 * Safe-additive: this suite creates one theme component of its own and deletes it, drives the
 * theme through the per-device override so the shared `settings` component is never written, and
 * commands nothing.
 */
import { chromium } from 'playwright-core'
import { APP, BASE, NS, TOKEN, AUTH } from './lib/target.mjs'

const del = (uid) => fetch(`${NS}/${encodeURIComponent(uid)}`, { method: 'DELETE', headers: AUTH }).catch(() => {})
const listUids = async () => (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)

/** The suites use whichever Chromium-family browser this machine has. */
async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true })
    } catch {
      /* try the next one */
    }
  }
  return chromium.launch({ headless: true })
}

const UID = 'theme:nh-e2e-rules'
let pass = 0
let fail = 0
const check = (ok, name, detail = '') => {
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`)
  }
}

/** Read a value from the page without letting a missing element abort the run. */
const probe = async (page, fn, fallback = null) => page.evaluate(fn).catch(() => fallback)

async function main() {
  await del(UID)

  const browser = await launch()
  const ctx = await browser.newContext()
  await ctx.addInitScript(
    ([token]) => {
      try {
        localStorage.setItem('neohab:apiToken', token)
        // Pin the default theme: this suite asserts what the editor does, not what whichever
        // theme the server happens to share does to it.
        localStorage.setItem('neohab:themeOverride', 'dark')
      } catch {
        /* sandboxed frame */
      }
    },
    [TOKEN]
  )
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  try {
    await page.goto(`${APP}#/settings`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-themes', { timeout: 20000 })

    /* ---------------- the copy-from source follows this device ---------------- */
    console.log('\n== the theme this device is showing ==')
    const newBtn = page.locator('button:has-text("New theme from")')
    await newBtn.waitFor({ timeout: 10000 })
    const label = await newBtn.textContent()
    check(/neohab Dark/.test(label ?? ''), 'the new-theme button names the theme on screen', label ?? '')

    // Switch this device to a theme that carries a stylesheet; the shared setting is untouched.
    await page.selectOption('#nh-set-devicetheme', 'swiss')
    await page.waitForFunction(
      () => /Swiss Sheet/.test(document.querySelector('button.nh-btn--ghost')?.textContent ?? ''),
      { timeout: 10000 }
    ).catch(() => {})
    const label2 = await newBtn.textContent()
    check(/Swiss Sheet/.test(label2 ?? ''), 'it follows a per-device theme override', label2 ?? '')

    const note = await probe(page, () =>
      [...document.querySelectorAll('.nh-settings__text')].some((p) => /This device is showing/.test(p.textContent))
    )
    check(note === true, 'the screen says the highlighted card is the shared theme, not this one')

    /* ---------------- the stylesheet checker ---------------- */
    console.log('\n== the stylesheet checker ==')
    await newBtn.click()
    await page.waitForSelector('#theme-css', { timeout: 10000 })

    const copyBtn = page.locator('button:has-text("Start from")')
    const copyLabel = await copyBtn.textContent().catch(() => '')
    check(/Swiss Sheet/.test(copyLabel ?? ''), 'the copy button offers the theme on screen', copyLabel ?? '')

    const issues = async () =>
      probe(page, () => [...document.querySelectorAll('.nh-cssissues li')].map((li) => li.textContent), [])

    const CASES = [
      ['.nh-gauge__rim { stroke: red; }', /paints itself/, 'paint the widget computes'],
      ['.nh-widget__body { padding: 4px; }', /@container/, 'ungated padding'],
      ['.nh-button { background: red; }', /--active/, 'a control styled without its active state'],
      ["@font-face { font-family: 'X'; src: url('https://x/y.woff2'); }", /not bundled/, 'an asset that is not bundled'],
      ['.nh-widget, .nh-tile { background: red; }', /nh-widget--bare/, 'a blanket tile rule'],
    ]
    for (const [css, expected, name] of CASES) {
      await page.fill('#theme-css', css)
      await page.waitForTimeout(150)
      const found = await issues()
      check(found.some((t) => expected.test(t ?? '')), `reports ${name}`, JSON.stringify(found))
    }

    // Ordered after a case that reports something, so "reports nothing" cannot pass simply
    // because there is no checker on the page at all.
    await page.fill('#theme-css', 'body { font-family: serif; }')
    await page.waitForTimeout(200)
    check((await issues()).length === 0, 'and says nothing about a stylesheet that breaks no rule')

    // border-image depends on the radius token, so it has to react to a token edit too. The
    // draft was copied from Swiss Sheet, whose radius is already 0px - so the corner has to be
    // rounded first, or neither of these two checks can fail.
    await page.fill('#tok-radius', '12px')
    await page.fill('#theme-css', '.nh-x { border-image: linear-gradient(red, blue) 1; }')
    await page.waitForTimeout(200)
    const before = await issues()
    check(before.some((t) => /border-image/.test(t ?? '')), 'reports border-image against a rounded radius', JSON.stringify(before))

    await page.fill('#tok-radius', '0px')
    await page.waitForTimeout(200)
    const after = await issues()
    check(!after.some((t) => /border-image/.test(t ?? '')), 'and stops once the radius token is 0px', JSON.stringify(after))

    /* ---------------- the preview really is live ---------------- */
    console.log('\n== live preview ==')
    await page.fill('#theme-css', '')
    await page.fill('#tok-bg', '#123456')
    await page.waitForTimeout(200)
    const bg = await probe(page, () => getComputedStyle(document.documentElement).getPropertyValue('--nh-bg').trim())
    check(bg === '#123456', 'a token edit applies to the running app', String(bg))

    await page.click('button:has-text("Close")')
    await page.waitForTimeout(300)
    const restored = await probe(page, () => getComputedStyle(document.documentElement).getPropertyValue('--nh-bg').trim())
    check(restored !== '#123456', 'and closing puts the real theme back', String(restored))

    /* ---------------- the way back from a theme that broke the app ---------------- */
    console.log('\n== the ?theme= escape hatch ==')

    // A theme that genuinely locks you out: it hides the controls on the very screen you would
    // use to undo it. This is the scenario the hatch exists for, so the suite builds it for real
    // rather than asserting on a harmless one.
    const hostile = {
      uid: UID,
      component: 'neohab:theme',
      config: {
        version: 1,
        id: 'nh-e2e-rules',
        name: 'E2E Hostile',
        scheme: 'dark',
        tokens: { bg: '#220000', primary: '#ff0000' },
        css: '.nh-themes, .nh-settings__h, .nh-btn { display: none !important; }',
      },
    }
    await del(UID)
    const seeded = await fetch(NS, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(hostile),
    })
    check(seeded.status === 200, 'seeded a theme that hides the settings controls', String(seeded.status))

    // Pin it on this device only - the shared setting is never touched.
    const hostilePage = await ctx.newPage()
    await hostilePage.addInitScript(() => localStorage.setItem('neohab:themeOverride', 'nh-e2e-rules'))
    await hostilePage.goto(`${APP}#/settings`, { waitUntil: 'domcontentloaded' })
    await hostilePage.waitForTimeout(1200)
    const lockedOut = await hostilePage
      .evaluate(() => {
        const el = document.querySelector('.nh-themes')
        return el ? getComputedStyle(el).display : 'missing'
      })
      .catch(() => 'error')
    check(lockedOut === 'none', 'the theme really does hide the way back', String(lockedOut))

    await hostilePage.goto(`${APP}?theme=none#/settings`, { waitUntil: 'domcontentloaded' })
    await hostilePage.waitForSelector('.nh-themes', { timeout: 15000 }).catch(() => {})
    const rescued = await hostilePage
      .evaluate(() => ({
        themes: getComputedStyle(document.querySelector('.nh-themes') ?? document.body).display,
        bg: getComputedStyle(document.documentElement).getPropertyValue('--nh-bg').trim(),
        notice: [...document.querySelectorAll('.nh-settings__notice')].some((n) => /\?theme=/.test(n.textContent)),
      }))
      .catch(() => ({}))
    check(rescued.themes && rescued.themes !== 'none', 'and ?theme=none gets the controls back', String(rescued.themes))
    check(rescued.bg === '#0f1317', 'loading with the default theme, not the broken one', String(rescued.bg))
    check(rescued.notice === true, 'and says why the theme looks different')

    // Not persisted: the override is still the device's, so reloading without the parameter is
    // back where it was. A hatch that stuck would silently reconfigure the device.
    await hostilePage.goto(`${APP}#/settings`, { waitUntil: 'domcontentloaded' })
    await hostilePage.waitForTimeout(1200)
    const stillBroken = await hostilePage
      .evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--nh-bg').trim())
      .catch(() => '')
    check(stillBroken === '#220000', 'the parameter is not persisted', String(stillBroken))
    await hostilePage.close()

    /* ---------------- the docs link the editor offers ---------------- */
    console.log('\n== the documentation link ==')
    const res = await page.request.get(`${BASE}/neohab/docs/theming.html`)
    check(res.status() === 200, 'docs/theming.html is served by the add-on', String(res.status()))
    const html = await res.text()
    check(/Theming neohab/.test(html), 'and it is the theming guide')
    check(!/https?:\/\//.test(html.split('<body>')[0]), 'with no external requests in its head')

    check(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '))
  } finally {
    // Cleanup: only ever this suite's own component, by exact uid.
    await del(UID)
    const strays = (await listUids()).filter((u) => u.includes('nh-e2e-rules'))
    check(strays.length === 0, 'left nothing behind', strays.join(', '))
    await browser.close()
  }

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`)
  process.exitCode = fail === 0 ? 0 : 1
}

main()
