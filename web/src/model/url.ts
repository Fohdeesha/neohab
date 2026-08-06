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
 * Configuration is untrusted input — an imported HABPanel file, a partial export someone shared, a
 * hand edit — and some of the places it lands execute what they are given: an `<iframe src>` or a
 * `window.open()` of a `javascript:` URL runs in THIS page's origin, with its session and its
 * token. An allow-list rather than a block-list, because the block-list version of this was
 * written once already and let `vbscript:` and `data:text/html` walk straight through.
 *
 * A value with no scheme at all is a relative URL and is fine, which is what makes an openHAB
 * path like `/basicui/app` work.
 */
const SAFE_URL_SCHEME = /^(?:https?:|mailto:|tel:|ftp:|blob:|data:image\/)/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** The URL if it is safe to navigate to or embed, otherwise null. */
export function safeUrl(url: string | undefined): string | null {
  const v = (url ?? '').trim()
  if (!v) return null
  if (!HAS_SCHEME.test(v)) return v
  return SAFE_URL_SCHEME.test(v) ? v : null
}

/** Open a stored URL in a new tab, doing nothing at all if its scheme is not one we allow. */
export function openExternal(url: string | undefined): void {
  const safe = safeUrl(url)
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer')
}
