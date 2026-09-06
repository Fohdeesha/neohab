// same discipline as useContainerWidth, for the same reasons
import { useEffect, useRef, useState, type RefObject } from 'react'

export interface BoxSize {
  width: number
  height: number
}

export function useBoxSize(ref: RefObject<HTMLElement | null>): BoxSize {
  const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 })
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
