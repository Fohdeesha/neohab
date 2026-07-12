/**
 * Commit helper for range-style controls. Pointer release commits immediately, but keyboard
 * stepping (arrow keys) coalesces into a single commit shortly after the last key so a device
 * gets one command per adjustment instead of one per step - and the local draft value stays
 * put in between, so the control doesn't snap back while stepping.
 */
import { useEffect, useRef } from 'react'

const STEP_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
const KEYBOARD_COMMIT_DELAY = 500

export function useKeyboardCommit<T>(commit: (value: T) => void) {
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    /** Commit now (pointer release), cancelling any pending keyboard commit. */
    now: (value: T) => {
      window.clearTimeout(timer.current)
      commit(value)
    },
    /** Queue a commit for after keyboard stepping settles; ignores non-stepping keys. */
    key: (key: string, value: T) => {
      if (!STEP_KEYS.has(key)) return
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => commit(value), KEYBOARD_COMMIT_DELAY)
    },
  }
}
