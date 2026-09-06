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

export function notify(text: string): void {
  const { notices } = useNotifyStore.getState()
  if (notices.some((n) => n.text === text)) return

  const id = nextId++
  useNotifyStore.setState({ notices: [...notices, { id, text }].slice(-MAX_NOTICES) })
  setTimeout(() => dismissNotice(id), NOTICE_MS)
}

export function dismissNotice(id: number): void {
  useNotifyStore.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
}
