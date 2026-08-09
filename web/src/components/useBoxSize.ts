/**
 * Live width AND height of a container element - the floor plan needs both to place its
 * object-fit image math. Same discipline as {@link useContainerWidth}, for the same reasons
 * (that hook's header records the two failure modes): the observer re-attaches whenever the
 * ref points somewhere new, and the last known size is kept while nothing is rendered.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'

export interface BoxSize {
  width: number
  height: number
}

export function useBoxSize(ref: RefObject<HTMLElement | null>): BoxSize {
  const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 })
  const observed = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  // Deliberately runs after every render (it costs a reference comparison) so a container that
  // was swapped, remounted or replaced is picked up. It cannot loop: `setSize` only runs when
  // the ref points somewhere new, which is a comparison against a ref rather than against state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current
    if (el === observed.current) return
    observer.current?.disconnect()
    observer.current = null
    observed.current = el
    if (!el) return
    setSize({ width: el.clientWidth, height: el.clientHeight })
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ width: Math.round(r.width), height: Math.round(r.height) })
    })
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

  return size
}
