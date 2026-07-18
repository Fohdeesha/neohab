/**
 * Screen wake lock for wall panels.
 *
 * Thin manager over the Wake Lock API: `syncWakeLock(true)` keeps a screen sentinel held for as
 * long as the page is visible, re-acquiring it whenever the browser lets it go (tab hidden and
 * shown again, battery saver ending, ...). The API only exists in secure contexts (HTTPS or
 * localhost) - `wakeLockSupported()` is what the settings screen uses to explain that, and there
 * is deliberately no insecure-context fallback hack.
 */
import { create } from 'zustand'

/** Reactive "the screen is being kept awake right now" flag for the settings screen. */
export const useWakeLockStore = create<{ active: boolean }>(() => ({ active: false }))

let wanted = false
let sentinel: WakeLockSentinel | null = null
let acquiring = false
let listening = false

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator
}

async function acquire(): Promise<void> {
  if (!wanted || sentinel || acquiring || !wakeLockSupported() || document.visibilityState !== 'visible') return
  acquiring = true
  try {
    const s = await navigator.wakeLock.request('screen')
    // The switch may have been turned off while the request was in flight.
    if (!wanted) {
      void s.release()
      return
    }
    sentinel = s
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null
      useWakeLockStore.setState({ active: false })
      // Released by the browser (usually the page becoming hidden): re-acquire when visible.
      if (wanted && document.visibilityState === 'visible') void acquire()
    })
    useWakeLockStore.setState({ active: true })
  } catch {
    // Denied (battery saver, permissions policy). The visibility listener retries on the next
    // return to the page; until then the settings screen shows the switch as not active.
    useWakeLockStore.setState({ active: false })
  } finally {
    acquiring = false
  }
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void acquire()
}

/** Make the held/released state match `enabled`. Safe to call repeatedly. */
export function syncWakeLock(enabled: boolean): void {
  wanted = enabled
  if (!listening) {
    listening = true
    document.addEventListener('visibilitychange', onVisibility)
  }
  if (enabled) {
    void acquire()
  } else if (sentinel) {
    const s = sentinel
    sentinel = null
    void s.release()
    useWakeLockStore.setState({ active: false })
  }
}
