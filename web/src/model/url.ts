/**
 * Is this URL served by the same origin as neohab?
 *
 * There were two of these, same name, opposite answers for a URL that cannot be parsed - each
 * right for its own caller, and together a trap for anyone reading both. The fallback is an
 * argument now, so the answer to "what about a URL we cannot place?" is stated at the call site
 * rather than hidden inside a helper.
 */
export function isSameOrigin(url: string, whenUnparseable: boolean): boolean {
  try {
    return new URL(url, location.href).origin === location.origin
  } catch {
    return whenUnparseable
  }
}

/**
 * Schemes a URL out of stored configuration may use.
 *
 * Configuration is untrusted input (an imported HABPanel file, a partial export someone shared, a
 * hand edit), and some of the places it lands execute what they are given: an `<iframe src>` or a
 * `window.open()` of a `javascript:` URL runs in THIS page's origin, with its session and its
 * token. An allow-list rather than a block-list, because the block-list version of this was
 * written once already and let `vbscript:` and `data:text/html` walk straight through.
 *
 * A value with no scheme at all is a relative URL and is fine, which is what makes an openHAB
 * path like `/basicui/app` work.
 */
const SAFE_URL_SCHEME = /^(?:https?:|mailto:|tel:|ftp:|blob:|data:image\/)/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * The same normalisation the URL parser performs before it decides what the scheme is: leading
 * and trailing C0 controls or spaces are removed, then ASCII tab, newline and carriage return are
 * removed from ANY position.
 *
 * Without it the check reads a different string from the browser: put a tab inside the scheme,
 * as in `jav<TAB>ascript:alert(1)`, and the scheme regex stops matching, so the value is filed as
 * a harmless relative address and returned untouched - then the browser strips the tab and runs
 * it. Six of seven executable URLs got past the allow-list that way, reaching an `<iframe src>`,
 * a `window.open` and every interpolated `href` in a template. Normalise first, then decide, and
 * return the normalised form so what was judged is what the caller uses.
 */
function urlNormalize(raw: string): string {
  // Deliberate control characters: these ARE the ones the URL parser strips, and matching
  // them is the whole point of this function.
  // eslint-disable-next-line no-control-regex
  return raw.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\u0009\u000a\u000d]/g, '')
}

/** The URL if it is safe to navigate to or embed, otherwise null. */
export function safeUrl(url: string | undefined): string | null {
  const v = urlNormalize(url ?? '')
  if (!v) return null
  if (!HAS_SCHEME.test(v)) return v
  return SAFE_URL_SCHEME.test(v) ? v : null
}

/** Open a stored URL in a new tab, doing nothing at all if its scheme is not one we allow. */
export function openExternal(url: string | undefined): void {
  const safe = safeUrl(url)
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer')
}
