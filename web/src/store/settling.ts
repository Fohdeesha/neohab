import { create } from 'zustand'
import { commandMatchesState } from '../model/presets'
import { SETTLE_MS, settledDisplay, type Settling } from '../model/settling'
import { useItemsStore } from './items'
import { useSteadyStates } from '../widgets/common/useSteadyValue'
import { emptyMap, mergeMap } from '../model/lookup'

interface SettlingState {
  pending: Record<string, Settling>
}

export const useSettlingStore = create<SettlingState>(() => ({ pending: emptyMap() }))

export function markSettling(commands: { item: string; command: string }[]): void {
  const add: Record<string, Settling> = emptyMap()
  const at = Date.now()
  for (const c of commands) {
    if (typeof c.item === 'string' && c.item !== '') add[c.item] = { command: String(c.command), at }
  }
  const items = Object.keys(add)
  if (items.length === 0) return
  useSettlingStore.setState((s) => ({ pending: mergeMap(s.pending, add) }))
  setTimeout(() => dropUnconfirmed(items, at), SETTLE_MS + 50)
}

export function clearSettling(items: string[]): void {
  useSettlingStore.setState((s) => {
    const pending = mergeMap(s.pending)
    let changed = false
    for (const item of items) {
      // hasOwnProperty rather than `in`, so this does not lean on another module's invariant
      if (Object.prototype.hasOwnProperty.call(pending, item)) {
        delete pending[item]
        changed = true
      }
    }
    return changed ? { pending } : s
  })
}

function dropUnconfirmed(items: string[], at: number): void {
  const states = useItemsStore.getState().states
  useSettlingStore.setState((s) => {
    const pending = mergeMap(s.pending)
    let changed = false
    for (const item of items) {
      const p = pending[item]
      if (!p || p.at !== at) continue
      if (commandMatchesState(p.command, states[item]?.state)) continue
      delete pending[item]
      changed = true
    }
    return changed ? { pending } : s
  })
}

export function useSettledState(): (item: string, live: string | undefined) => string | undefined {
  const pending = useSettlingStore((s) => s.pending)
  const steady = useSteadyStates()
  const now = Date.now()
  return (item, live) => settledDisplay(pending[item], steady(item, live), now)
}
