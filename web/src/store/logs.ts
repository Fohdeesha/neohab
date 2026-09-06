/**
 * The server's log entries, shared by every log widget on the page.
 *
 * One socket, however many widgets: each subscribes here, the first one opens the connection and
 * the last one to leave closes it - after a short grace, so that holding a tile to open the
 * full-screen page (which unmounts the dashboard and mounts the page) does not drop and reopen
 * the connection in between. The socket carries no server-side filter; every widget filters the
 * one shared buffer to its own source, level and patterns, so two widgets with different
 * settings cost the server one connection rather than two.
 *
 * Not shared across tabs the way the item-state stream is: a log is a diagnostic somebody opens
 * on purpose, rarely in more than one tab, and the relay would double the code for that case.
 */
import { create } from 'zustand'
import { LogSocket, type LogSocketStatus } from '../api/logs'
import { BUFFER_MAX, trimEntries, type LogEntry } from '../widgets/log/model'
import { useAuthStore } from './auth'

export interface LogsState {
  entries: LogEntry[]
  status: LogSocketStatus
}

export const useLogsStore = create<LogsState>(() => ({ entries: [], status: 'idle' }))

/** How long the socket outlives its last subscriber: a route change, not a tab left open. */
const STOP_GRACE_MS = 3000

const socket = new LogSocket({
  onEntries: (batch) => useLogsStore.setState((s) => ({ entries: trimEntries(s.entries.concat(batch), BUFFER_MAX) })),
  onStatus: (status) => useLogsStore.setState({ status })
})

let refs = 0
let stopTimer: ReturnType<typeof setTimeout> | null = null

/** Hold the connection open while this caller needs it. Returns the release. */
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

/**
 * Empty what is shown. On openHAB 5 a later reconnect asks only for entries after the last one
 * seen, so what was cleared stays cleared rather than coming back as history.
 */
export function clearLogs(): void {
  useLogsStore.setState({ entries: [] })
}

// Signing in or out changes what the server will hand this device, so the socket is opened
// again with the credentials there are now. Not on every status change: at boot the status moves
// from unknown to admin while a socket opened with the same token is already live, and a restart
// there would only churn. A device gaining or losing its credentials, or a socket that is not
// live anyway, is what warrants one.
useAuthStore.subscribe((s, prev) => {
  if (s.status === prev.status || refs === 0) return
  const credentialsMoved = s.status === 'anonymous' || prev.status === 'anonymous'
  if (credentialsMoved || useLogsStore.getState().status !== 'live') socket.restart()
})
