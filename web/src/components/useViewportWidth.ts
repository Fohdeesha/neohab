import { useEffect, useState } from 'react'

/**
 * Live viewport width. The edit surface picks grid vs. stacked mode from this rather than
 * its container width so opening the 391px side panel (which shrinks the container) can't
 * flip the editor mid-edit.
 */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}
