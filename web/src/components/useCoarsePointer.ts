import { useEffect, useState } from 'react'

const QUERY = '(pointer: coarse)'

function query(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
}

/**
 * Whether the device's primary pointer is a finger rather than a mouse or a trackpad.
 *
 * This is what decides the text-scale floor (see textFloor in model/layout.ts): a monitor at a
 * desk should never draw a label below its normal size, while a landscape phone's cells cannot
 * hold one. The pointer, not the viewport width, because the two questions are different - a
 * narrow desktop window is still read from a chair, and a wide wall tablet is still read from
 * across a room. Kept live rather than read once: a convertible that folds into a tablet flips
 * it, and so does plugging a mouse into one.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => query()?.matches ?? false)
  useEffect(() => {
    const mq = query()
    if (!mq) return
    const onChange = () => setCoarse(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return coarse
}
