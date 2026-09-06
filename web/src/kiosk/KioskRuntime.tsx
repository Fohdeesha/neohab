import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { navigate } from '../app/router'
import { useConfigStore } from '../store/config'
import { useEditorStore } from '../store/editor'
import { subscribeItems, useItemState } from '../store/items'
import { setKioskSettings, useKioskMode, useKioskStore } from '../store/kiosk'
import { syncWakeLock } from './wakeLock'

const CORNER_PX = 48
const TAP_WINDOW_MS = 800
const TAPS_TO_EXIT = 5

function cornerOf(x: number, y: number): string | null {
  const side = x <= CORNER_PX ? 'l' : x >= window.innerWidth - CORNER_PX ? 'r' : null
  const band = y <= CORNER_PX ? 't' : y >= window.innerHeight - CORNER_PX ? 'b' : null
  return side && band ? band + side : null
}

export function KioskRuntime() {
  const kiosk = useKioskMode()
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  const wantWake = useKioskStore((s) => s.settings.wakeLock)
  useEffect(() => {
    syncWakeLock(wantWake)
  }, [wantWake])

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
      // the state already current when we started following is history, not a command
      primed.current = true
      lastState.current = state
      return
    }
    if (state === lastState.current) return
    lastState.current = state
    if (state === 'NULL' || state === 'UNDEF') return
    const dashboards = useConfigStore.getState().dashboards
    const target =
      dashboards.find((d) => d.id === state) ?? dashboards.find((d) => String(d.name ?? '').toLowerCase() === state.toLowerCase())
    if (!target) return
    if (useEditorStore.getState().editing) return // never yank an open editor away
    navigate({ name: 'dashboard', id: target.id })
  }, [follow, state])

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
        setConfirming(true)
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [kiosk])

  useEffect(() => {
    if (!kiosk) setConfirming(false)
  }, [kiosk])

  if (!confirming) return null
  return (
    <div className="nh-kioskexit" role="dialog" aria-modal="true" aria-label={t('Exit kiosk mode on this device?')}>
      <div className="nh-kioskexit__box">
        <p>{t('Exit kiosk mode on this device?')}</p>
        <div className="nh-kioskexit__actions">
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setConfirming(false)}>
            {t('Stay in kiosk mode')}
          </button>
          <button
            type="button"
            className="nh-btn nh-btn--primary"
            onClick={() => {
              setConfirming(false)
              setKioskSettings({ kiosk: false })
            }}>
            {t('Exit')}
          </button>
        </div>
      </div>
    </div>
  )
}
