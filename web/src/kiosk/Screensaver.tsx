/**
 * Idle screensaver for wall panels: after the configured idle time the screen goes black
 * (optionally with a slowly drifting dim clock, so an OLED panel never shows a static image).
 * Any input wakes it - and the waking input is swallowed, so the tap that wakes the screen
 * cannot also press whatever happens to be under it.
 */
import { useEffect, useRef, useState } from 'react'
import { useKioskStore } from '../store/kiosk'

/** How often idleness is re-checked. Activity itself is event-driven; this only fires the saver. */
const CHECK_MS = 1000

export function Screensaver() {
  const mode = useKioskStore((s) => s.settings.screensaver)
  const minutes = useKioskStore((s) => s.settings.screensaverMinutes)
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)
  activeRef.current = active
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    if (mode === 'off') return
    lastActivity.current = Date.now() // re-arm when the mode or timeout changes

    const onInput = (e: Event) => {
      lastActivity.current = Date.now()
      if (activeRef.current) {
        // Wake, and swallow the waking input (capture phase, before any app handler).
        e.preventDefault()
        e.stopPropagation()
        setActive(false)
      }
    }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']
    for (const ev of events) window.addEventListener(ev, onInput, { capture: true, passive: false })

    const timer = window.setInterval(() => {
      if (activeRef.current) return
      // Guard against a nonsense stored value; anything below ~1s becomes ~1s.
      const idleMs = Math.max(0.02, minutes) * 60_000
      if (Date.now() - lastActivity.current >= idleMs) setActive(true)
    }, CHECK_MS)

    return () => {
      for (const ev of events) window.removeEventListener(ev, onInput, { capture: true } as EventListenerOptions)
      window.clearInterval(timer)
      setActive(false)
    }
  }, [mode, minutes])

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
    // Drift somewhere new each minute so no pixel shows a static image for long.
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
      <div className="nh-saver__time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="nh-saver__date">
        {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  )
}
