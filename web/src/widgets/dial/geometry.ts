/**
 * Geometry and formatting shared by the two dial renderers.
 *
 * Split out of the widget so the ring gauge and the classic arc can each live in a file of their
 * own without either importing the other. Everything here is pure trigonometry and formatting;
 * the model that decides what is lit, coloured or in alarm is in `gauge.ts`.
 */
import { useEffect, useRef, useState } from 'react'

/** Classic arc geometry: 270° sweep starting at 135° (7:30 position), like a volume knob. */
export const START = 135
export const SWEEP = 270

export function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const from = polar(cx, cy, r, fromDeg)
  const to = polar(cx, cy, r, toDeg)
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${from.x} ${from.y} A ${r} ${r} 0 ${large} 1 ${to.x} ${to.y}`
}

export const TWEEN_MS = 450

/**
 * Eased follow of a changing live value, so the LED ring sweeps to a new reading instead of
 * jumping. Disabled (returns the target directly) while the user is dragging.
 */
export function useTweened(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(shown)
  shownRef.current = shown
  useEffect(() => {
    if (!enabled) return
    const from = shownRef.current
    if (from === target) return
    let raf: number | null = null
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / TWEEN_MS)
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      setShown(from + (target - from) * e)
      raf = t < 1 ? requestAnimationFrame(tick) : null
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [target, enabled])
  return enabled ? shown : target
}
