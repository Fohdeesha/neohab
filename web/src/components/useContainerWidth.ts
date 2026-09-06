// re-attach whenever the ref moves, and keep the last width while nothing is rendered: a detached node reports
// 0x0, which reads as "no width"
import { useEffect, useRef, useState, type RefObject } from 'react'

export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  const observed = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
