/**
 * `window.OHApp` - the bridge the official openHAB Android and iOS apps inject into their webview.
 *
 * Only the hooks neohab actually uses are declared, and every one is optional: the same page runs
 * in an ordinary browser, where none of this exists. Nothing here is required for neohab to work;
 * each hook only removes a rough edge when running inside the phone app.
 *
 * Deliberately NOT used: the theme preference hooks. neohab's theme is a shared configuration
 * setting with a per-device override, and having the phone app quietly win over both would be
 * surprising.
 */
interface OHAppBridge {
  /** Ask the native app to go full screen (kiosk mode, or the fullscreen button). */
  goFullscreen?: () => void
  /** Offer to pin the current page to the phone's home screen. */
  pinToHome?: () => void
  /** Leave the webview and return to the native app's own UI. */
  exitToApp?: () => void
  /** Credentials the app already holds for a reverse proxy in front of openHAB. */
  getBasicCredentialsUsername?: () => string
  getBasicCredentialsPassword?: () => string
}

function bridge(): OHAppBridge | undefined {
  return (window as { OHApp?: OHAppBridge }).OHApp
}

export function canPinToHome(): boolean {
  return typeof bridge()?.pinToHome === 'function'
}

export function canExitToApp(): boolean {
  return typeof bridge()?.exitToApp === 'function'
}

/** True when the native app took the request (so the caller can skip the browser's own API). */
export function appGoFullscreen(): boolean {
  const fn = bridge()?.goFullscreen
  if (typeof fn !== 'function') return false
  try {
    fn()
    return true
  } catch {
    return false
  }
}

export function appPinToHome(): void {
  try {
    bridge()?.pinToHome?.()
  } catch {
    /* the app declined; nothing else to do */
  }
}

export function appExitToApp(): void {
  try {
    bridge()?.exitToApp?.()
  } catch {
    /* the app declined; nothing else to do */
  }
}
