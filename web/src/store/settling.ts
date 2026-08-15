/**
 * Values just commanded, held on screen while the devices catch up - see `model/settling.ts`
 * for the rule and the device behaviour that makes it necessary.
 *
 * Written by preset activation and by the floor plan's light popup, and read by the floor plan;
 * no other widget consults it, so nothing else changes what it shows.
 */
import { create } from 'zustand'
import { commandMatchesState } from '../model/presets'
import { SETTLE_MS, settledDisplay, type Settling } from '../model/settling'
import { useItemsStore } from './items'

interface SettlingState {
  /** item name -> the value commanded for it, and when. */
  pending: Record<string, Settling>
}

export const useSettlingStore = create<SettlingState>(() => ({ pending: {} }))

/** Record values just commanded. Entries for the same item replace each other. */
export function markSettling(commands: { item: string; command: string }[]): void {
  const add: Record<string, Settling> = {}
  const at = Date.now()
  for (const c of commands) {
    if (typeof c.item === 'string' && c.item !== '') add[c.item] = { command: String(c.command), at }
  }
  const items = Object.keys(add)
  if (items.length === 0) return
  useSettlingStore.setState((s) => ({ pending: { ...s.pending, ...add } }))
  // Re-render once the window closes, so a value the device never took stops being displayed
  // even when no further state event arrives to trigger one.
  setTimeout(() => dropUnconfirmed(items, at), SETTLE_MS + 50)
}

/** Forget commanded values (the server refused them, so they never happened). */
export function clearSettling(items: string[]): void {
  useSettlingStore.setState((s) => {
    const pending = { ...s.pending }
    let changed = false
    for (const item of items) {
      if (item in pending) {
        delete pending[item]
        changed = true
      }
    }
    return changed ? { pending } : s
  })
}

/**
 * At the end of a window, drop the entries the live state never agreed with - which is exactly
 * what the display rule already ignores, so this only forces the re-render and keeps the map
 * from growing. Entries the device confirmed stay: showing the commanded numbers is the point.
 */
function dropUnconfirmed(items: string[], at: number): void {
  const states = useItemsStore.getState().states
  useSettlingStore.setState((s) => {
    const pending = { ...s.pending }
    let changed = false
    for (const item of items) {
      const p = pending[item]
      // A newer command for the same light replaced this one and carries its own timer.
      if (!p || p.at !== at) continue
      if (commandMatchesState(p.command, states[item]?.state)) continue
      delete pending[item]
      changed = true
    }
    return changed ? { pending } : s
  })
}

/** Subscribe to the settling map and read one item's display state through it. */
export function useSettledState(): (item: string, live: string | undefined) => string | undefined {
  const pending = useSettlingStore((s) => s.pending)
  const now = Date.now()
  return (item, live) => settledDisplay(pending[item], live, now)
}
