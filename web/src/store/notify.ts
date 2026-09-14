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
const MAX_NOTICES = 3

let nextId = 1

/**
 * A sticky notice stays until it is dismissed or the caller replaces it, which is what a failure
 * somebody may need to read twice or copy out of needs. The id comes back so a caller that owns
 * one place on screen can replace its own rather than stacking them up.
 */
export function notify(text: string, opts?: { sticky?: boolean }): number {
  const { notices } = useNotifyStore.getState()
  const already = notices.find((n) => n.text === text)
  if (already) return already.id

  const id = nextId++
  useNotifyStore.setState({ notices: [...notices, { id, text }].slice(-MAX_NOTICES) })
  if (!opts?.sticky) setTimeout(() => dismissNotice(id), NOTICE_MS)
  return id
}

/**
 * What a settings section says back to the reader. A message stays put until the section replaces
 * it or the reader dismisses it; 'done' marks a confirmation, which fades on its own.
 */
export type NoticeFn = (message: string | null, kind?: 'done') => void

export function dismissNotice(id: number): void {
  useNotifyStore.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
}
