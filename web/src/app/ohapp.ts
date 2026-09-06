interface OHAppBridge {
  goFullscreen?: () => void
  pinToHome?: () => void
  exitToApp?: () => void
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
    // the app declined
  }
}

export function appExitToApp(): void {
  try {
    bridge()?.exitToApp?.()
  } catch {
    // the app declined
  }
}
