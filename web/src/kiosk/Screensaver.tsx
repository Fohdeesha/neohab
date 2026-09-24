import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useKioskStore } from '../store/kiosk'
import { appLocale } from '../i18n'

const CHECK_MS = 1000

export const useScreensaverStore = create<{ active: boolean }>(() => ({ active: false }))

export function Screensaver() {
  const mode = useKioskStore((s) => s.settings.screensaver)
  const minutes = useKioskStore((s) => s.settings.screensaverMinutes)
  // component state, not the store below: the swallow depends on React batching, and a store write flushes
  // before the click arrives
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)
  activeRef.current = active
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    useScreensaverStore.setState({ active: active && mode !== 'off' })
    return () => useScreensaverStore.setState({ active: false })
  }, [active, mode])

  useEffect(() => {
    if (mode === 'off') return
    lastActivity.current = Date.now() // re-arm when the mode or timeout changes

    const onInput = (e: Event) => {
      lastActivity.current = Date.now()
      if (activeRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setActive(false)
      }
    }
    // two registrations: only the waking input has to be cancellable, and a non-passive wheel listener opts the
    // whole page out of fast scrolling
    const always: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown']
    const scrollish: (keyof WindowEventMap)[] = ['wheel', 'touchstart']
    for (const ev of always) window.addEventListener(ev, onInput, { capture: true, passive: false })
    for (const ev of scrollish) window.addEventListener(ev, onInput, { capture: true, passive: !active })

    const timer = window.setInterval(() => {
      if (activeRef.current) return
      const idleMs = Math.max(0.02, minutes) * 60_000
      if (Date.now() - lastActivity.current >= idleMs) setActive(true)
    }, CHECK_MS)

    return () => {
      for (const ev of [...always, ...scrollish]) {
        window.removeEventListener(ev, onInput, { capture: true } as EventListenerOptions)
      }
      window.clearInterval(timer)
    }
  }, [mode, minutes, active])

  if (!active || mode === 'off') return null
  return (
    <div className="nh-saver" role="presentation" data-mode={mode}>
      {mode === 'clock' ? <SaverClock /> : null}
    </div>
  )
}

function SaverClock() {
  const [now, setNow] = useState(() => new Date())
  const [pos, setPos] = useState({ x: 50, y: 50 })

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 10_000)
    const drift = window.setInterval(() => {
      setPos({ x: 18 + Math.random() * 64, y: 18 + Math.random() * 64 })
    }, 60_000)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(drift)
    }
  }, [])

  return (
    <div className="nh-saver__clock" style={{ left: pos.x + '%', top: pos.y + '%' }}>
      <div className="nh-saver__time">{now.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="nh-saver__date">{now.toLocaleDateString(appLocale(), { weekday: 'long', month: 'long', day: 'numeric' })}</div>
    </div>
  )
}
