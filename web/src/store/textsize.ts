import { create } from 'zustand'

const KEY = 'neohab:textSize'
const MIN = 50
const MAX = 300

function clampPct(v: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(v)))
}

function readStored(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? clampPct(v) : 100
  } catch {
    return 100
  }
}

export const useTextSizeStore = create<{ percent: number }>(() => ({ percent: readStored() }))

export function applyDeviceTextSize(): void {
  const pct = useTextSizeStore.getState().percent
  const root = document.documentElement.style
  if (pct === 100) root.removeProperty('--nh-devicescale')
  else root.setProperty('--nh-devicescale', String(pct / 100))
}

export function setDeviceTextSize(percent: number): void {
  const pct = clampPct(percent)
  useTextSizeStore.setState({ percent: pct })
  try {
    if (pct === 100) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(pct))
  } catch {
    // storage unavailable (private mode)
  }
  applyDeviceTextSize()
}
