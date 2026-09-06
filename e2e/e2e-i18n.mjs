/**
 * UI translations e2e.
 *
 * Covers: English default; auto-detection from the browser language (a de-DE context renders
 * German with zero configuration); the language chunk loads lazily (an English session fetches
 * no catalog at all, a German one fetches exactly de-*.js); the explicit per-device choice in
 * Settings applies live without a reload, persists across reloads, and 'Auto' returns to
 * detection; plural forms (1 Widget / 3 Widgets); widget-schema labels translate in the
 * settings panel while the user's own widget labels stay untouched; <html lang> follows; and the
 * empty-state text widgets render when they are unconfigured, which used to be hardcoded English
 * (a widget's own strings are as much UI as the chrome around it).
 *
 * SAFE with a live config: creates only dashboard:nh-e2e-i18n-a/-b/-c (clock/label/selection/
 * image/frame widgets, all unbound - commands nothing), exact-uid cleanup.
 */
import { launchChromium } from './lib/browser.mjs'
import { BASE, APP, NS, TOKEN, AUTH } from './lib/target.mjs'

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

const dash = (id, name, widgets) => ({
  uid: 'dashboard:' + id,
  component: 'neohab:dashboard',
  config: { version: 1, id, name, columns: 12, rowHeight: 'match', gap: 5, widgets },
})

const seed = async (comp) => {
  await fetch(NS + '/' + comp.uid, { method: 'DELETE', headers: AUTH }).catch(() => {})
  const r = await fetch(NS, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(comp) })
  return r.ok
}

const UIDS = ['dashboard:nh-e2e-i18n-a', 'dashboard:nh-e2e-i18n-b', 'dashboard:nh-e2e-i18n-c']

const browser = await launch()
try {
  ok('seed a (1 widget)', await seed(dash('nh-e2e-i18n-a', 'E2E I18N A', [
    { id: 'w1', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
  ])))
  ok('seed b (3 widgets)', await seed(dash('nh-e2e-i18n-b', 'E2E I18N B', [
    { id: 'w1', type: 'clock', config: {}, layout: { lg: { x: 0, y: 0, w: 3, h: 2 } } },
    { id: 'w2', type: 'label', config: { text: 'mein eigener text' }, layout: { lg: { x: 3, y: 0, w: 3, h: 2 } } },
    { id: 'w3', type: 'label', config: { text: 'zzz' }, layout: { lg: { x: 6, y: 0, w: 3, h: 2 } } },
  ])))
  // Three widgets left deliberately unconfigured, so each shows its empty-state text.
  ok('seed c (unconfigured widgets)', await seed(dash('nh-e2e-i18n-c', 'E2E I18N C', [
    { id: 'w1', type: 'selection', config: { label: 'Sel', item: '', choices: '' }, layout: { lg: { x: 0, y: 0, w: 4, h: 3 } } },
    { id: 'w2', type: 'image', config: { label: 'Img', url: '' }, layout: { lg: { x: 4, y: 0, w: 4, h: 3 } } },
    { id: 'w3', type: 'frame', config: { label: 'Frm', url: '' }, layout: { lg: { x: 8, y: 0, w: 4, h: 3 } } },
  ])))

  const openCtx = async (locale, withToken = true) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale })
    if (withToken) {
      await ctx.addInitScript((t) => { try { localStorage.setItem('neohab:apiToken', t) } catch {} }, TOKEN)
    }
    const page = await ctx.newPage()
    const track = { errs: [], catalogRequests: [] }
    page.on('pageerror', (e) => track.errs.push(String(e.message)))
    page.on('console', (m) => m.type() === 'error' && track.errs.push(m.text()))
    page.on('request', (r) => {
      const m = /assets\/((?:de|es|fr|it|nl|pl)-[\w-]+\.js)$/.exec(r.url())
      if (m) track.catalogRequests.push(m[1])
    })
    return { ctx, page, track }
  }

  /* ---------------- English default ---------------- */
  {
    const { ctx, page, track } = await openCtx('en-US')
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.nh-theme__pick', { timeout: 20000 })
    ok('en: Appearance heading', (await page.locator('h2:text-is("Appearance")').count()) === 1)
    ok('en: language field defaults to Auto', (await page.locator('#nh-set-lang').inputValue()) === 'auto')
    await sleep(500)
    ok('en: no language chunk fetched at all', track.catalogRequests.length === 0, track.catalogRequests.join(','))
    ok('en: html lang', await page.evaluate(() => document.documentElement.lang) === 'en')
    await ctx.close()
  }

  /* ---------------- German by browser locale (zero configuration) ---------------- */
  {
    const { ctx, page, track } = await openCtx('de-DE')
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Erscheinungsbild")', { timeout: 20000 })
    ok('de-auto: Appearance renders as Erscheinungsbild', true)
    ok('de-auto: exactly the German chunk fetched', track.catalogRequests.length === 1 && track.catalogRequests[0].startsWith('de-'), track.catalogRequests.join(','))
    ok('de-auto: html lang', await page.evaluate(() => document.documentElement.lang) === 'de')

    // plural forms on the Home tiles: 1 Widget vs 3 Widgets
    await page.goto(APP + '#/')
    await page.waitForSelector('.nh-tile', { timeout: 20000 })
    const metaA = await page.locator('.nh-tile:has(.nh-tile__name:text-is("E2E I18N A")) .nh-tile__meta').textContent()
    const metaB = await page.locator('.nh-tile:has(.nh-tile__name:text-is("E2E I18N B")) .nh-tile__meta').textContent()
    ok('de: singular tile meta', metaA === '1 Widget', String(metaA))
    ok('de: plural tile meta', metaB === '3 Widgets', String(metaB))

    // A widget's own empty-state text is UI too: these three were hardcoded English, which is
    // invisible in an English session and the only English left on the screen in any other.
    await page.goto(APP + '#/d/nh-e2e-i18n-c')
    await page.waitForSelector('.nh-widget', { timeout: 20000 })
    const emptyStates = await page.evaluate(() => ({
      selection: document.querySelector('.nh-selection__empty')?.textContent ?? '',
      placeholders: [...document.querySelectorAll('.nh-image__placeholder')].map((e) => e.textContent ?? ''),
    }))
    ok(
      'de: the selection widget says so in German',
      emptyStates.selection.includes('Auswahlmöglichkeiten'),
      emptyStates.selection
    )
    ok(
      'de: the image widget says so in German',
      emptyStates.placeholders.some((p) => p.includes('Keine Bild-URL')),
      JSON.stringify(emptyStates.placeholders)
    )
    ok(
      'de: the frame widget says so in German',
      emptyStates.placeholders.some((p) => p.includes('Keine URL konfiguriert')),
      JSON.stringify(emptyStates.placeholders)
    )
    ok(
      'de: no English empty-state text is left on the screen',
      !/No choices|No image URL|No URL configured/.test(
        emptyStates.selection + emptyStates.placeholders.join(' ')
      ),
      emptyStates.selection + ' | ' + emptyStates.placeholders.join(' | ')
    )

    // schema labels translate in the settings panel; the user's own widget text does not
    await page.goto(APP + '#/d/nh-e2e-i18n-b')
    await page.waitForSelector('.nh-widget', { timeout: 20000 })
    ok('de: user widget text untouched', (await page.locator('.nh-label:has-text("mein eigener text")').count()) === 1)
    await page.click('[aria-label="Dashboard bearbeiten"]')
    await page.waitForSelector('.nh-grid--edit .nh-cell', { timeout: 15000 })
    ok('de: edit toolbar Save button is Speichern', (await page.locator('button:has-text("Speichern")').count()) === 1)
    await page.locator('.nh-cell').first().locator('.nh-cell__overlay').click()
    await page.waitForSelector('.nh-sheet', { timeout: 10000 })
    ok('de: clock schema label translated', (await page.locator('.nh-sheet .nh-field__label:text-is("12-Stunden-Anzeige")').count()) === 1)
    ok('de: sheet title uses translated widget name', /Uhr/.test((await page.locator('.nh-sheet__title').textContent()) ?? ''))
    // leave edit mode without saving anything
    page.on('dialog', (d) => d.accept())
    await page.click('button:has-text("Beenden")')
    await page.waitForSelector('[aria-label="Dashboard bearbeiten"]', { timeout: 10000 })
    ok('de: console clean', track.errs.length === 0, track.errs.slice(0, 3).join(' | '))
    await ctx.close()
  }

  /* ---------------- explicit pick: live switch, persistence, back to Auto ---------------- */
  {
    const { ctx, page, track } = await openCtx('en-US')
    await page.goto(APP + '#/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#nh-set-lang', { timeout: 20000 })
    await page.selectOption('#nh-set-lang', 'fr')
    await page.waitForSelector('h2:text-is("Apparence")', { timeout: 15000 })
    ok('pick: French applies live, no reload', true)
    ok('pick: French chunk fetched on demand', track.catalogRequests.some((c) => c.startsWith('fr-')), track.catalogRequests.join(','))

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h2:text-is("Apparence")', { timeout: 20000 })
    ok('pick: French persists across a reload', true)
    ok('pick: stored choice shown in the selector', (await page.locator('#nh-set-lang').inputValue()) === 'fr')

    await page.selectOption('#nh-set-lang', 'auto')
    await page.waitForSelector('h2:text-is("Appearance")', { timeout: 15000 })
    ok('pick: Auto returns to the browser language', true)
    ok('pick: console clean', track.errs.length === 0, track.errs.slice(0, 3).join(' | '))
    await ctx.close()
  }
} finally {
  for (const uid of UIDS) {
    await fetch(NS + '/' + encodeURIComponent(uid), { method: 'DELETE', headers: AUTH }).catch(() => {})
  }
  const left = (await (await fetch(NS, { headers: AUTH })).json()).filter((c) => c.uid.includes('nh-e2e-i18n'))
  ok('cleanup: no leftovers', left.length === 0, JSON.stringify(left.map((c) => c.uid)))
  await browser.close()

  const fails = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`)
  console.log(fails.length ? 'FAILURES: ' + fails.map((f) => f.name).join(' ; ') : 'ALL PASS')
  process.exitCode = fails.length ? 1 : 0
}
