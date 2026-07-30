/**
 * Live width of a container element, for grid math that depends on real pixels.
 *
 * The element being measured can change between renders - a grid that swaps its container for a
 * message, an editor that switches between the wide and stacked surfaces - so the observer is
 * re-attached whenever the ref points somewhere new. Two things this must not do, both of which
 * left a grid stuck rendering nothing at all:
 *   - keep observing a detached node: a removed element reports a 0x0 resize, which would read as
 *     "the container has no width" and send the caller back to its first-paint branch;
 *   - observe only once at mount: after the ref moved to a different element the old observer is
 *     stale, and the width would never update again.
 * When nothing is rendered to measure, the last known width is kept rather than reset to zero.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'

export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  const observed = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  // Deliberately runs after every render (it costs a reference comparison) so a container that
  // was swapped, remounted or replaced is picked up.
  useEffect(() => {
    const el = ref.current
    if (el === observed.current) return
    observer.current?.disconnect()
    observer.current = null
    observed.current = el
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)))
    ro.observe(el)
    observer.current = ro
  })

  useEffect(
    () => () => {
      observer.current?.disconnect()
      observer.current = null
      observed.current = null
    },
    []
  )

  return width
}
