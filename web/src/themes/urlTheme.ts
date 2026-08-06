/**
 * The way back from a theme that made the app unusable.
 *
 * A theme's stylesheet is real CSS with no sandbox, and it applies to the whole app — including
 * the Settings screen you would use to undo it. A rule that hides a control, or an imported theme
 * from someone else, can therefore leave a device with no route back: the theme is cached locally
 * and applied before first paint, so reloading only reapplies it, and if the *shared* theme is the
 * broken one then every device is in the same position.
 *
 * `?theme=none` in the URL loads with the default theme instead, ignoring the shared setting, this
 * device's override and the local cache. Same shape as the kiosk escape hatch (`?kiosk=off`):
 * accepted both before the hash (`/neohab/index.html?theme=none#/d/x`) and inside it
 * (`#/settings?theme=none`), and **never persisted** — it lasts for the page load, so a device is
 * not silently reconfigured by a link, and closing the tab changes nothing. From there the theme
 * can be fixed or deleted in Settings like anything else.
 *
 * A built-in id also works (`?theme=light`), which is useful for looking at one without adopting
 * it. Only built-ins are honoured — resolving happens in `themes.ts`, which owns that list. This
 * module deliberately imports nothing: it is read on the pre-paint path, and the whole value of an
 * escape hatch is that it answers before anything else has had a chance to go wrong.
 */

/** The `theme` parameter, from inside the hash first, then the ordinary query string. */
function readParam(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  const q = hash.indexOf('?')
  const fromHash = q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('theme') : null
  return fromHash ?? new URLSearchParams(window.location.search).get('theme')
}

/**
 * Read once, at load. The parameter describes how this page load starts; re-reading it as the
 * user navigates would let an ordinary route change silently re-pin the theme.
 */
export const urlThemeId: string | null = readParam()

/** Is the app running with a theme forced by the URL? */
export const urlThemeForced: boolean = urlThemeId !== null
