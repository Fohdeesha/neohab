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
}

const tracker = new StatesTracker()

/** Item names currently needed by mounted widgets, ref-counted. Kept outside the store:
 * subscription changes shouldn't notify every widget the way a setState would. */
const trackedCounts = new Map<string, number>()

export const useItemsStore = create<ItemsState>(() => ({
  states: {},
  connected: false,
}))

tracker.onStates((delta: StateMap) => {
  // Each event carries the complete state of the items it mentions, so replace per item.
  // (The server intentionally omits displayState when it equals the raw state - merging old
  // fields over a new event would keep a stale formatted value around.)
  useItemsStore.setState((s) => ({ states: { ...s.states, ...delta } }))
})

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
  for (const n of names) trackedCounts.set(n, (trackedCounts.get(n) ?? 0) + 1)
  tracker.setTracked(trackedCounts.keys())

  return () => {
    for (const n of names) {
      const c = (trackedCounts.get(n) ?? 1) - 1
      if (c <= 0) trackedCounts.delete(n)
      else trackedCounts.set(n, c)
    }
    tracker.setTracked(trackedCounts.keys())
  }
}

/** Selector hook for one item's live state. */
export function useItemState(name: string | undefined): ItemState | undefined {
  return useItemsStore((s) => (name ? s.states[name] : undefined))
}
