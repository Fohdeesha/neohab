import { create } from 'zustand'
import { emptyMap, mergeMap } from '../model/lookup'

// the items this tab is dragging right now: a display that follows one of them may skip the steady hold,
// since every change it sees is one we caused
interface DraggingState {
  items: ReadonlySet<string>
  // when each item's last drag ended, for anything that should wait for the device to settle afterwards.
  // keyed by item name, so prototype-free: `endedAt['constructor']` would otherwise answer with a function
  endedAt: Record<string, number>
}

export const useDraggingStore = create<DraggingState>(() => ({ items: new Set(), endedAt: emptyMap() }))

// a lost pointerup must not strand an item in the set for good
const SAFETY_MS = 10_000
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function markDragging(item: string): void {
  if (item === '') return
  const timer = timers.get(item)
  if (timer) clearTimeout(timer)
  timers.set(
    item,
    setTimeout(() => unmarkDragging(item), SAFETY_MS)
  )
  if (useDraggingStore.getState().items.has(item)) return
  useDraggingStore.setState((s) => ({ items: new Set([...s.items, item]) }))
}

export function unmarkDragging(item: string): void {
  const timer = timers.get(item)
  if (timer) clearTimeout(timer)
  timers.delete(item)
  if (!useDraggingStore.getState().items.has(item)) return
  useDraggingStore.setState((s) => {
    const items = new Set(s.items)
    items.delete(item)
    return { items, endedAt: mergeMap(s.endedAt, { [item]: Date.now() }) }
  })
}

export function useIsDragging(item: string | undefined): boolean {
  return useDraggingStore((s) => item !== undefined && s.items.has(item))
}

export function useDragEndedAt(item: string): number | undefined {
  return useDraggingStore((s) => s.endedAt[item])
}
