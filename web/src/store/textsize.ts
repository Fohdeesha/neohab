/**
 * Per-device text size (percent, 100 = normal). Lives in localStorage like the sidebar pin
 * and kiosk settings - a wall panel across the room and a desktop monitor want different
 * sizes for the same dashboards - and is deliberately not part of backup bundles.
 * Applied as a root CSS variable the cell font-size composes in, so it multiplies the
 * automatic scaling everywhere without touching any layout math.
 */
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

/** Set the root variable from the stored value; called at boot (pre-paint) and on change. */
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
    // storage unavailable (private mode): still applies for this page load
  }
  applyDeviceTextSize()
}
