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
const FLUSH_MS = 200

let pending: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flush(): void {
  flushTimer = null
  if (pending.length === 0) return
  const batch = pending
  pending = []
  useLogsStore.setState((s) => ({ entries: trimEntries(s.entries.concat(batch), BUFFER_MAX) }))
}

function dropPending(): void {
  pending = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

const socket = new LogSocket({
  // the server sends a message per line, and a store write per line re-renders every tile's whole list:
  // a busy install writes dozens a second, which is enough to saturate the main thread. Arrivals are
  // collected and written once a flush, which a reader cannot tell apart from line by line
  onEntries: (batch) => {
    for (const entry of batch) pending.push(entry)
    if (pending.length > BUFFER_MAX) pending.splice(0, pending.length - BUFFER_MAX)
    flushTimer ??= setTimeout(flush, FLUSH_MS)
  },
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
  // a queued flush would put lines from before the clear straight back
  dropPending()
  useLogsStore.setState({ entries: [] })
}

// reopen when the credentials themselves move, not on every status change - at boot unknown -> admin would
// only churn
useAuthStore.subscribe((s, prev) => {
  if (s.status === prev.status || refs === 0) return
  const credentialsMoved = s.status === 'anonymous' || prev.status === 'anonymous'
  if (credentialsMoved || useLogsStore.getState().status !== 'live') socket.restart()
})
