import { useEffect, useRef } from 'react'

const STEP_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
const KEYBOARD_COMMIT_DELAY = 500

export function useKeyboardCommit<T>(commit: (value: T) => void) {
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    now: (value: T) => {
      window.clearTimeout(timer.current)
      commit(value)
    },
    key: (key: string, value: T) => {
      if (!STEP_KEYS.has(key)) return
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => commit(value), KEYBOARD_COMMIT_DELAY)
    }
  }
}
