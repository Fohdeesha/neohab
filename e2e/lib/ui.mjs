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
