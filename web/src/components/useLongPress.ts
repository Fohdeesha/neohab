// a hold REPLACES the tap: the click it produces is swallowed, so a slow press never also commands the widget
import { useCallback, useEffect, useRef } from 'react'

export const LONG_PRESS_MS = 500
const MOVE_TOLERANCE_PX = 10

// controls that stage on the press and send on the release ask this, since no click-swallow can reach a
// pointerup
let taken = false

export function holdTookGesture(): boolean {
  return taken
}

// a live drag arms a few px into a press, before the hold's own 10px tolerance would cancel it. It also
// suppresses the contextmenu Android raises for its own long press, or the sheet would open mid-drag.
let activeCancel: (() => void) | null = null
let suppressed = false

export function cancelActiveHold(): void {
  suppressed = true
  activeCancel?.()
  activeCancel = null
}

// Android's own long press selects a word under the finger and preventing contextmenu is too late, so nothing
// is selectable while a press we handle lasts
let guarding = false

function setHoldGuard(on: boolean): void {
  if (on === guarding) return
  guarding = on
  document.documentElement.classList.toggle('nh-holding', on)
}

// window-level backstop: one missed release would leave the whole app unselectable until a reload
let listening = false

function armGuardRelease(): void {
  if (listening) return
  listening = true
  const release = () => setHoldGuard(false)
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', release, true)
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onClickCapture: (e: React.MouseEvent) => void
}

export function useLongPress(onOpen: () => void, enabled = true): LongPressHandlers {
  const timer = useRef<number | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
  }, [])

  useEffect(
    () => () => {
      cancel()
      taken = false
      setHoldGuard(false)
    },
    [cancel]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    // a right-click raises contextmenu AFTER its own pointerup on Windows, so start every press clean
    taken = false
    suppressed = false
    if (!enabled) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    fired.current = false
    cancel()
    origin.current = { x: e.clientX, y: e.clientY }
    activeCancel = cancel
    if (e.pointerType !== 'mouse') {
      armGuardRelease()
      setHoldGuard(true)
    }
    const touch = e.pointerType === 'touch'
    timer.current = window.setTimeout(() => {
      timer.current = null
      fired.current = true
      taken = true
      if (touch) navigator.vibrate?.(10)
      onOpen()
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const from = origin.current
    if (!from) return
    if (Math.abs(e.clientX - from.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - from.y) > MOVE_TOLERANCE_PX) {
      cancel()
    }
  }

  const endPress = () => {
    cancel()
    activeCancel = null
    setHoldGuard(false)
    if (fired.current) window.setTimeout(() => (fired.current = false), 0)
    if (taken) window.setTimeout(() => (taken = false), 0)
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (!fired.current) return
    e.preventDefault()
    e.stopPropagation()
  }

  const onContextMenu = (e: React.MouseEvent) => {
    if (!enabled) return
    e.preventDefault()
    if (fired.current || suppressed) return
    const duringPress = origin.current !== null
    cancel()
    if (duringPress) {
      fired.current = true
      taken = true
    }
    onOpen()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPress,
    onPointerCancel: endPress,
    onPointerLeave: endPress,
    onContextMenu,
    onClickCapture
  }
}
