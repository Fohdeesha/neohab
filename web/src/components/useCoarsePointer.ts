import { useEffect, useState } from 'react'

const QUERY = '(pointer: coarse)'

function query(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
}

// the pointer, not the viewport: a narrow desktop window is still read from a chair, and a wide wall tablet
// from across a room
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
