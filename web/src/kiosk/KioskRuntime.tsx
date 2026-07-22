/**
 * Invisible glue for the kiosk features. Mounted once in App; renders nothing. It
 *   - keeps the wake lock in sync with the per-device setting,
 *   - opens this device's pinned dashboard on app start (a deep link wins over the pin),
 *   - follows the dashboard-control item (a String item whose state names a dashboard, used to
 *     drive wall panels remotely from rules), and
 *   - while kiosk mode hides all chrome, watches for the 5-taps-in-a-corner exit gesture.
 */
import { useEffect, useRef } from 'react'
import { navigate } from '../app/router'
import { useConfigStore } from '../store/config'
import { useEditorStore } from '../store/editor'
import { subscribeItems, useItemState } from '../store/items'
import { setKioskSettings, useKioskMode, useKioskStore } from '../store/kiosk'
import { syncWakeLock } from './wakeLock'
import i18n from '../i18n'

/** Corner hot-zone size for the exit gesture: the extreme corner, where grid padding lives. */
const CORNER_PX = 48
/** Max pause between taps for them to count as one sequence. */
const TAP_WINDOW_MS = 800
const TAPS_TO_EXIT = 5

function cornerOf(x: number, y: number): string | null {
  const side = x <= CORNER_PX ? 'l' : x >= window.innerWidth - CORNER_PX ? 'r' : null
  const band = y <= CORNER_PX ? 't' : y >= window.innerHeight - CORNER_PX ? 'b' : null
  return side && band ? band + side : null
}

export function KioskRuntime() {
  const kiosk = useKioskMode()

  /* ---- wake lock ---- */
  const wantWake = useKioskStore((s) => s.settings.wakeLock)
  useEffect(() => {
    syncWakeLock(wantWake)
    // No cleanup: App never unmounts, and the browser drops the lock on unload anyway.
  }, [wantWake])

  /* ---- pinned start dashboard ---- */
  const loaded = useConfigStore((s) => s.loaded)
  const redirected = useRef(false)
  useEffect(() => {
    if (!loaded || redirected.current) return
    redirected.current = true
    const pinned = useKioskStore.getState().settings.pinnedDashboard
    if (!pinned) return
    const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/'
    if (path !== '/') return // opened on a specific dashboard/settings on purpose
    if (useConfigStore.getState().dashboards.some((d) => d.id === pinned)) {
      navigate({ name: 'dashboard', id: pinned })
    }
  }, [loaded])

  /* ---- dashboard-control item ---- */
  const controlItem = useConfigStore((s) => s.settings.controlItem)
  const followSetting = useKioskStore((s) => s.settings.followControl)
  const follow = (followSetting ?? kiosk) && !!controlItem ? controlItem : undefined

  useEffect(() => {
    if (!follow) return
    return subscribeItems([follow])
  }, [follow])

  const state = useItemState(follow)?.state
  const lastState = useRef<string | undefined>(undefined)
  const primed = useRef(false)
  useEffect(() => {
    primed.current = false
    lastState.current = undefined
  }, [follow])
  useEffect(() => {
    if (!follow || state === undefined) return
    if (!primed.current) {
      // The state that was already current when we started following is history, not a command.
      primed.current = true
      lastState.current = state
      return
    }
    if (state === lastState.current) return
    lastState.current = state
    if (state === 'NULL' || state === 'UNDEF') return
    const dashboards = useConfigStore.getState().dashboards
    const target =
      dashboards.find((d) => d.id === state) ??
      dashboards.find((d) => String(d.name ?? '').toLowerCase() === state.toLowerCase())
    if (!target) return
    if (useEditorStore.getState().editing) return // never yank an open editor away
    navigate({ name: 'dashboard', id: target.id })
  }, [follow, state])

  /* ---- kiosk exit gesture ---- */
  useEffect(() => {
    if (!kiosk) return
    let corner: string | null = null
    let count = 0
    let lastTap = 0
    const onDown = (e: PointerEvent) => {
      const c = cornerOf(e.clientX, e.clientY)
      const now = Date.now()
      if (!c) {
        corner = null
        count = 0
        return
      }
      if (c !== corner || now - lastTap > TAP_WINDOW_MS) {
        corner = c
        count = 1
      } else {
        count++
      }
      lastTap = now
      if (count >= TAPS_TO_EXIT) {
        corner = null
        count = 0
        if (window.confirm(i18n.t('Exit kiosk mode on this device?'))) setKioskSettings({ kiosk: false })
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [kiosk])

  return null
}
