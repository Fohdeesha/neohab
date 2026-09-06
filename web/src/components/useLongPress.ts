/**
 * The hold-or-right-click gesture that opens a widget's detail sheet.
 *
 * The rule that makes it safe: **a hold REPLACES the tap, it never adds to it.** Every widget's own
 * action runs on `click`, which fires on release however long the button was held, so without this
 * a slow press on a light would open the sheet AND command the light. Once the hold is recognised
 * the click it produces is swallowed in the capture phase, and the worst case becomes "I held too
 * long and got the sheet instead" - one tap from recovery, where the alternative is a garage door
 * nobody meant to move.
 *
 * A control that owns a pointer drag - a range input, a dial - needs the same rule by a second
 * route, because it stages a value on the PRESS and sends it on the release, where no click-swallow
 * can reach. That is `holdTookGesture()` below.
 *
 * Right-click needs none of the timer: `contextmenu` produces no `click` at all. It is also what a
 * keyboard raises for the Menu key and Shift+F10, so the keyboard route comes with it - and on
 * touch it is what the browser raises for a long press, which is why that path takes the gesture
 * exactly as the timer does.
 */
import { useCallback, useEffect, useRef } from 'react'

/** Matches the hold the editor already uses for touch multi-select, so the app has one feel. */
export const LONG_PRESS_MS = 500
/** Past this, the gesture was a drag, a swipe or a scroll - never a hold. */
const MOVE_TOLERANCE_PX = 10

/**
 * Set while a recognised hold is consuming the press that is ending, and read by the controls
 * that own a pointer drag.
 *
 * Those controls - a range input, a dial - stage a value the moment they are pressed and send it
 * on release, which the click-swallow above cannot reach. Pressing a slider's track a long way
 * from its thumb therefore jumped the value there and then commanded it, even when the press was
 * meant as a hold. The fix rests on the one useful fact about all of them: **nothing is sent until
 * the release**, so a hold that is recognised first can make the release send nothing and put the
 * staged value back. `holdTookGesture()` is how each of them asks.
 *
 * The guarantee is now the plain one: a hold never changes a value, and a tap is untouched. A drag
 * is untouched too, because moving past the tolerance cancels the timer long before it fires.
 *
 * Module-level rather than per-hook because one pointer is doing one thing: the cell that armed the
 * timer and the control that staged the value are different components, and the control has no
 * handle on the cell above it. Cleared at the start of every press, so a flag left behind by a
 * right-click cannot reach into the next one.
 */
let taken = false

/** True when a recognised hold has taken over the press now ending: stage nothing, send nothing. */
export function holdTookGesture(): boolean {
  return taken
}

/**
 * The browser has a long press of its own, and on Android it selects the word under the finger and
 * raises the text toolbar over whatever the hold just opened. It lands at about the same 500ms as
 * ours, by which time the detail sheet has rendered under the finger - so the word it selects is
 * the SHEET's, which is the one place selection is deliberately switched back on. Preventing the
 * `contextmenu` cannot help: the selection is made before that event is dispatched, and the cell
 * whose handler would prevent it is no longer anywhere in the event's path.
 *
 * So nothing is selectable for as long as a press we are handling lasts (`.nh-holding` in
 * app.css). Scoped to the press, because a dashboard's text is worth selecting either side of it -
 * a template widget's content, a reading copied out of the sheet - and armed only for a touch or a
 * pen, since a mouse press that suppressed selection would take click-drag selection with it.
 */
let guarding = false

function setHoldGuard(on: boolean): void {
  if (on === guarding) return
  guarding = on
  document.documentElement.classList.toggle('nh-holding', on)
}

/**
 * The release always reaches the window, whichever element the press began on and whatever becomes
 * of it in between - a cell that unmounts mid-press, a pointer captured by a control above it.
 * Without that backstop one missed release would leave the whole app unselectable until the page
 * was reloaded, which is a worse bug than the one this fixes. Armed on first use rather than at
 * import, so the module still loads where there is no window.
 */
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
  /** Set once a hold is recognised; consumed by the one click that follows it. */
  const fired = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
  }, [])

  // A press interrupted by an unmount - a route change, or the viewport crossing the stacking
  // width - would otherwise fire its hold into a dashboard that is no longer on screen, and leave
  // the abandon flag up for a control that never got a release to clear it on.
  useEffect(
    () => () => {
      cancel()
      taken = false
      setHoldGuard(false)
    },
    [cancel]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    // Every press starts clean, whatever it lands on: a right-click raises contextmenu AFTER its
    // own pointerup on Windows, so the flag it sets would otherwise still be up when the next
    // press ends and would abandon a gesture that nothing had taken.
    taken = false
    if (!enabled) return
    // A secondary mouse button raises contextmenu instead, and gets there without a timer.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    fired.current = false
    cancel()
    origin.current = { x: e.clientX, y: e.clientY }
    // Only where the browser has a long press of its own to get in the way.
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
    setHoldGuard(false)
    // Cleared after the click has dispatched, so the hold's own click is swallowed while a stale
    // flag can never swallow an unrelated one later - a widget that silently stops responding is
    // a far worse bug than the one this guards. The same timing serves the abandon flag: the
    // control's own pointerup runs at the target before this one runs on the cell above it, and
    // even if it did not, this clears a turn later.
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
    // This is the menu, so the browser's is not wanted. On touch, the browser raises contextmenu
    // at roughly the same moment the timer fires; whichever arrives first opens the sheet once.
    // This path is how a phone reaches a slider or a dial at all, since the timer's own firing is
    // what a touch long press turns into here - so it takes the gesture in exactly the same way.
    e.preventDefault()
    if (fired.current) return
    // Only when a press is still under way, which is what tells a touch long press apart from a
    // right-click: on Windows a mouse raises contextmenu AFTER its own pointerup, and there is no
    // press left to swallow a click from or to take a staged value off.
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
