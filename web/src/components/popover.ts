import { useEffect, useRef, useState } from 'react'

// A popover list is placed against its input's box, so only a scroll in one of that input's own
// ancestors can move it. Any other scroller - a log tile following its newest line once a second -
// must be left alone, or the list closes under whoever is typing into it.
export function scrollMoves(target: EventTarget | null, el: Element | null): boolean {
  if (!el) return false
  if (target === window) return true
  return target instanceof Node && target.contains(el)
}

export interface ListPos {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const MARGIN = 8

/**
 * A picker's list, fixed against the input box it belongs to: placed below it, or above when there is
 * more room there, and closed by a press outside, a scroll that moves the box, or a resize.
 */
export function useAnchoredList<L extends HTMLElement>(opts: {
  // below this much room underneath, the list opens upwards if there is more room above
  flipBelow: number
  minHeight: number
  minWidth?: number
  onClose?: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<L>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<ListPos | null>(null)
  const openedAt = useRef(0)
  const onClose = useRef(opts.onClose)
  onClose.current = opts.onClose

  const place = () => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    const below = window.innerHeight - box.bottom - MARGIN
    const above = box.top - MARGIN
    const flip = below < opts.flipBelow && above > below
    const maxHeight = Math.max(opts.minHeight, flip ? above : below)
    const width = Math.max(box.width, opts.minWidth ?? 0)
    setPos(
      flip
        ? { left: box.left, width, bottom: window.innerHeight - box.top + 4, maxHeight }
        : { left: box.left, width, top: box.bottom + 4, maxHeight }
    )
  }

  const openList = () => {
    place()
    setOpen(true)
    openedAt.current = Date.now()
  }

  const close = () => {
    setOpen(false)
    onClose.current?.()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) close()
    }
    const onScroll = (e: Event) => {
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return
      if (!scrollMoves(e.target, rootRef.current)) return
      // the focus-follow scroll of a just-tapped input is part of opening the list, not the user scrolling away
      if (Date.now() - openedAt.current < 300) {
        place()
        return
      }
      close()
    }
    const onResize = () => close()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-registered per opening only, as both pickers always did
  }, [open])

  return { rootRef, boxRef, listRef, open, pos, openList, close }
}
