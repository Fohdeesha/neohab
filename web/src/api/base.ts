/**
 * Where openHAB is, relative to this page.
 *
 * neohab is served by the add-on at `<openHAB>/neohab/`, so every API path it uses (`/rest`,
 * `/auth`, `/icon`, `/static`) hangs off whatever prefix openHAB itself is under. Directly that
 * prefix is empty and an absolute `/rest/...` is correct — but behind a reverse proxy that mounts
 * openHAB at a sub-path (`https://home.example/openhab/`), an absolute path leaves the prefix out
 * and every request 404s. That is a common enough deployment to be worth getting right.
 *
 * The prefix is read from this page's own location once, and is exactly the part before the app's
 * own `/neohab/` segment. In the dev server, where the app is served from the root, it is empty
 * and every path is unchanged.
 */

const APP_SEGMENT = '/neohab/'

function computeRoot(): string {
  try {
    const path = window.location.pathname
    const at = path.lastIndexOf(APP_SEGMENT)
    // `at === 0` is the ordinary add-on install: openHAB is at the root, so there is no prefix.
    return at > 0 ? path.slice(0, at) : ''
  } catch {
    return ''
  }
}

let root: string | null = null

/** The path prefix openHAB is served under: '' normally, '/openhab' behind a sub-path proxy. */
function ohRoot(): string {
  root ??= computeRoot()
  return root
}

/** An absolute openHAB path (`/rest/items`), resolved against that prefix. */
export function ohUrl(path: string): string {
  return ohRoot() + path
}
