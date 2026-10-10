import { useEffect, useState } from 'react'

// 0 until the first tick, so the first load is the address exactly as written
export function useRefreshStamp(period: number | null): number {
  const [stamp, setStamp] = useState(0)
  useEffect(() => {
    if (period === null) return
    const id = setInterval(() => setStamp(Date.now()), period)
    return () => clearInterval(id)
  }, [period])
  return stamp
}
