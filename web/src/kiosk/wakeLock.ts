import { create } from 'zustand'

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
    if (!wanted) {
      void s.release()
      return
    }
    sentinel = s
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null
      useWakeLockStore.setState({ active: false })
      if (wanted && document.visibilityState === 'visible') void acquire()
    })
    useWakeLockStore.setState({ active: true })
  } catch {
    useWakeLockStore.setState({ active: false })
  } finally {
    acquiring = false
  }
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void acquire()
}

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
