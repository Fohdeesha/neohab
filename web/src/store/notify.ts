/**
 * Transient user-facing notices (command failures).
 *
 * Kept deliberately small: notices are ephemeral UI state, never persisted, and any part of the
 * app can raise one without holding a component reference.
 */
import { create } from 'zustand'

export interface Notice {
  id: number
  text: string
}

interface NotifyState {
  notices: Notice[]
}

export const useNotifyStore = create<NotifyState>(() => ({ notices: [] }))

export const NOTICE_MS = 6000
/** A stuck item can fail on every drag frame; keep the newest few rather than a wall of toasts. */
const MAX_NOTICES = 3

let nextId = 1

export function notify(text: string): void {
  const { notices } = useNotifyStore.getState()
  // Repeating the same failure adds nothing - leave the one already on screen alone.
  if (notices.some((n) => n.text === text)) return

  const id = nextId++
  useNotifyStore.setState({ notices: [...notices, { id, text }].slice(-MAX_NOTICES) })
  setTimeout(() => dismissNotice(id), NOTICE_MS)
}

export function dismissNotice(id: number): void {
  useNotifyStore.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
}
