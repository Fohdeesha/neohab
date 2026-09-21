import { create } from 'zustand'

export interface NoticeAction {
  label: string
  run: () => void
}

export interface Notice {
  id: number
  text: string
  action?: NoticeAction
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
export function notify(text: string, opts?: { sticky?: boolean; action?: NoticeAction }): number {
  const already = useNotifyStore.getState().notices.find((n) => n.text === text)
  // the same words twice means the same event again. With no button that is one notice either way;
  // with one, the button has to act on the NEWEST event and get a full life of its own, so the old
  // notice goes and this one takes its place rather than inheriting a timer part way through.
  if (already && !opts?.action) return already.id
  if (already) dismissNotice(already.id)

  const id = nextId++
  useNotifyStore.setState((s) => ({ notices: [...s.notices, { id, text, action: opts?.action }].slice(-MAX_NOTICES) }))
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
