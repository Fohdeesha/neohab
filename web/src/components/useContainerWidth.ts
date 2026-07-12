/** Live width of a container element, for grid math that depends on real pixels. */
import { useEffect, useState, type RefObject } from 'react'

export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      setWidth(Math.round(entries[0].contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}
