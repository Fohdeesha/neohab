import { useEffect, useRef, type RefObject } from 'react'

// innermost last, so Escape closes one layer at a time and only the top one keeps Tab to itself
const layers: { close: () => void }[] = []

export function anyDialogOpen(): boolean {
  return layers.length > 0
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
}

/**
 * Escape closes the top layer and nothing under it. A modal layer also takes focus when it opens, keeps Tab
 * inside itself and gives focus back to whatever had it when it closes. A docked side panel is not modal -
 * the editor beside it has to stay reachable - so it only joins the Escape order.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, modal: boolean): void {
  const latest = useRef(onClose)
  latest.current = onClose

  useEffect(() => {
    const entry = { close: () => latest.current() }
    layers.push(entry)
    const root = ref.current
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (modal && root && !root.contains(document.activeElement)) (focusables(root)[0] ?? root).focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== entry || e.defaultPrevented) return
      if (e.key === 'Escape') {
        e.preventDefault()
        entry.close()
        return
      }
      if (e.key !== 'Tab' || !modal || !root) return
      const list = focusables(root)
      const at = document.activeElement
      if (list.length === 0) {
        e.preventDefault()
        root.focus({ preventScroll: true })
      } else if (e.shiftKey && (at === list[0] || !root.contains(at))) {
        e.preventDefault()
        list[list.length - 1].focus()
      } else if (!e.shiftKey && (at === list[list.length - 1] || !root.contains(at))) {
        e.preventDefault()
        list[0].focus()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      const at = layers.indexOf(entry)
      if (at >= 0) layers.splice(at, 1)
      window.removeEventListener('keydown', onKey)
      // only where focus would otherwise be lost: inside the layer that closed, or nowhere at all
      const active = document.activeElement
      const lost = active === null || active === document.body || (root?.contains(active) ?? false)
      if (modal && lost && returnTo?.isConnected) returnTo.focus({ preventScroll: true })
    }
  }, [ref, modal])
}
