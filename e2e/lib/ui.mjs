// what a person does in the UI, done the same way by every suite that needs it

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Binds `name` through an item picker the way a person does: part of the name typed in lower case,
 * a keystroke at a time, then a click on the option. Filling the exact name binds it by itself, so a
 * dead option click would pass unnoticed. Types a little more while the option is not listed yet,
 * never the whole name. Answers what the input holds afterwards, for the caller to assert on.
 */
export async function pickItem(page, input, name) {
  await input.click()
  const option = page
    .locator('.nh-picker__option', { has: page.locator('.nh-picker__name', { hasText: new RegExp('^' + escapeRe(name) + '$') }) })
    .first()
  let typed = 0
  for (const want of [5, 8, 12, name.length - 1]) {
    const upTo = Math.min(want, name.length - 1)
    if (upTo <= typed) continue
    await page.keyboard.type(name.slice(typed, upTo).toLowerCase(), { delay: 40 })
    typed = upTo
    const listed = await option.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
    if (listed) break
  }
  await option.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(300)
  return input.inputValue().catch(() => '')
}

/**
 * The HABPanel import asks before it writes anything, in a sheet rather than a browser dialog,
 * because it has to name the SHARED settings a panel configuration would change - a theme, a
 * background, the speech item are stored once for the whole server - and let them be declined
 * while the dashboards are imported anyway.
 *
 * Every suite that imports has to answer it, so it lives here rather than four times over.
 */
export async function confirmHabpanelImport(page, { shared = true } = {}) {
  await page.waitForSelector('.nh-sheet .nh-hpconfirm', { timeout: 20000 })
  // the shared block is only drawn when the file actually carries one of those settings
  if (!shared) await page.click('.nh-hpconfirm__shared input[type="checkbox"]')
  await page.click('.nh-sheet .nh-form__footer button:has-text("Import")')
}
