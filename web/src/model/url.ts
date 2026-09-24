export function isSameOrigin(url: string, whenUnparseable: boolean): boolean {
  try {
    return new URL(url, location.href).origin === location.origin
  } catch {
    return whenUnparseable
  }
}

// an allow-list, because the block-list version let vbscript: and data:text/html through
const SAFE_URL_SCHEME = /^(?:https?:|mailto:|tel:|ftp:|blob:|data:image\/)/i
// a camera stream may also be a websocket; nothing else it takes can run script
const SAFE_STREAM_SCHEME = /^(?:https?:|wss?:|blob:|data:image\/)/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

// normalise exactly as the URL parser does before deciding: it strips C0 controls and removes tab/LF/CR from
// anywhere, so a raw read sees an address the browser never will
function urlNormalize(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\u0009\u000a\u000d]/g, '')
}

export function safeUrl(url: string | undefined): string | null {
  const v = urlNormalize(url ?? '')
  if (!v) return null
  if (!HAS_SCHEME.test(v)) return v
  return SAFE_URL_SCHEME.test(v) ? v : null
}

export function safeStreamUrl(url: string | undefined): string | null {
  const v = urlNormalize(url ?? '')
  if (!v) return null
  if (!HAS_SCHEME.test(v)) return v
  return SAFE_STREAM_SCHEME.test(v) ? v : null
}

export function openExternal(url: string | undefined): void {
  const safe = safeUrl(url)
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer')
}

// an http:// address in an https page is blocked with no error a widget can catch
export function isMixedContent(url: string | undefined, pageProtocol: string): boolean {
  if (pageProtocol !== 'https:') return false
  const v = urlNormalize(url ?? '')
  return /^(?:http|ws):\/\//i.test(v)
}

export function mixedContent(url: string | undefined): boolean {
  return isMixedContent(url, location.protocol)
}
