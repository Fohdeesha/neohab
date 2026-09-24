/**
 * Where on a dial's arc the pointer is, as a fraction of the scale: the dials and the thermostat all ask
 * this one function. `svgAngle` is atan2's (0 at three o'clock); `start` is measured from twelve.
 *
 * A press (`previous` null) must land on the arc: in the gap it answers null. A drag follows the
 * shortest way round from where it was, so once it leaves the arc - into the gap, or over the top of
 * a full ring - it stays at the end it left by. Dragging a light down past its min end is "off", never
 * "full", and a degree past max on a full ring is not min.
 */
export function dialFraction(svgAngle: number, start: number, sweep: number, previous: number | null): number | null {
  const span = Math.min(360, Math.max(1, sweep))
  let rel = (svgAngle + 90 - start) % 360
  if (rel < 0) rel += 360
  if (previous === null) return rel <= span ? rel / span : null
  const from = Math.min(1, Math.max(0, previous)) * span
  const delta = ((((rel - from) % 360) + 540) % 360) - 180
  const to = from + delta
  if (to < 0) return 0
  if (to > span) return 1
  return to / span
}

export function valueAtFraction(frac: number, min: number, max: number, step: number, decimals: number): number {
  const raw = min + frac * (max - min)
  const snapped = Number((Math.round(raw / step) * step).toFixed(decimals))
  return Math.min(max, Math.max(min, snapped))
}

// the keys a slider answers to, for a dial that has the slider role
export function keyStep(key: string, value: number, min: number, max: number, step: number, decimals: number): number | null {
  const page = Math.max(step, (max - min) / 10)
  const move = (by: number) => {
    const frac = max > min ? Math.min(1, Math.max(0, (value + by - min) / (max - min))) : 0
    return valueAtFraction(frac, min, max, step, decimals)
  }
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return move(step)
    case 'ArrowDown':
    case 'ArrowLeft':
      return move(-step)
    case 'PageUp':
      return move(page)
    case 'PageDown':
      return move(-page)
    case 'Home':
      return min
    case 'End':
      return max
    default:
      return null
  }
}
