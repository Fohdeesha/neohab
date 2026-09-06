import { create } from 'zustand'
import { LogSocket, type LogSocketStatus } from '../api/logs'
import { BUFFER_MAX, trimEntries, type LogEntry } from '../widgets/log/model'
import { useAuthStore } from './auth'

export interface LogsState {
  entries: LogEntry[]
  status: LogSocketStatus
}

export const useLogsStore = create<LogsState>(() => ({ entries: [], status: 'idle' }))

const STOP_GRACE_MS = 3000

const socket = new LogSocket({
  onEntries: (batch) => useLogsStore.setState((s) => ({ entries: trimEntries(s.entries.concat(batch), BUFFER_MAX) })),
  onStatus: (status) => useLogsStore.setState({ status })
})

let refs = 0
let stopTimer: ReturnType<typeof setTimeout> | null = null

export function subscribeLogs(): () => void {
  refs++
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
  if (refs === 1) socket.start()
  let released = false
  return () => {
    if (released) return
    released = true
    refs--
    if (refs > 0) return
    stopTimer = setTimeout(() => {
      stopTimer = null
      if (refs === 0) socket.stop()
    }, STOP_GRACE_MS)
  }
}

export function clearLogs(): void {
  useLogsStore.setState({ entries: [] })
}

// reopen when the credentials themselves move, not on every status change - at boot unknown -> admin would
// only churn
useAuthStore.subscribe((s, prev) => {
  if (s.status === prev.status || refs === 0) return
  const credentialsMoved = s.status === 'anonymous' || prev.status === 'anonymous'
  if (credentialsMoved || useLogsStore.getState().status !== 'live') socket.restart()
})
