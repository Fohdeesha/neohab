/**
 * Live item-state store. Backed by the SSE {@link StatesTracker}; components read individual
 * item states and re-render only when their item changes.
 */
import { create } from 'zustand'
import { StatesTracker, type StateMap } from '../api/sse'
import type { ItemState } from '../api/types'

interface ItemsState {
  states: StateMap
  connected: boolean
  /** Item names currently needed by mounted widgets, ref-counted. */
  tracked: Map<string, number>
}

const tracker = new StatesTracker()

export const useItemsStore = create<ItemsState>(() => ({
  states: {},
  connected: false,
  tracked: new Map(),
}))

tracker.onStates((delta: StateMap) => {
  useItemsStore.setState((s) => ({ states: { ...s.states, ...merge(s.states, delta) } }))
})

// Preserve fields the server omits from a delta (e.g. displayState) by shallow-merging per item.
function merge(prev: StateMap, delta: StateMap): StateMap {
  const out: StateMap = {}
  for (const [name, next] of Object.entries(delta)) {
    out[name] = prev[name] ? { ...prev[name], ...next } : next
  }
  return out
}

export function startItemTracking(): void {
  tracker.start()
  useItemsStore.setState({ connected: true })
}

export function stopItemTracking(): void {
  tracker.stop()
  useItemsStore.setState({ connected: false })
}

/** Ref-count item subscriptions so unmounting one widget doesn't drop another's item. */
export function subscribeItems(names: string[]): () => void {
  if (names.length === 0) return () => {}
  const tracked = new Map(useItemsStore.getState().tracked)
  for (const n of names) tracked.set(n, (tracked.get(n) ?? 0) + 1)
  useItemsStore.setState({ tracked })
  tracker.setTracked(tracked.keys())

  return () => {
    const t = new Map(useItemsStore.getState().tracked)
    for (const n of names) {
      const c = (t.get(n) ?? 1) - 1
      if (c <= 0) t.delete(n)
      else t.set(n, c)
    }
    useItemsStore.setState({ tracked: t })
    tracker.setTracked(t.keys())
  }
}

/** Selector hook for one item's live state. */
export function useItemState(name: string | undefined): ItemState | undefined {
  return useItemsStore((s) => (name ? s.states[name] : undefined))
}
