import { describe, expect, it } from 'vitest'
import { isDragging, markDragging, unmarkDragging, useDraggingStore } from './dragging'

// openHAB accepts constructor, toString, valueOf, hasOwnProperty and __proto__ as item names, and a
// map built from {} answers four of the five with a function. ColorControl reads this one as
// `(endedAt ?? 0) + STEADY_MS - Date.now()`: a function is not nullish, so no ?? catches it, the
// arithmetic gives NaN, and `wait <= 0` is false for NaN so the guard is skipped.
const HOSTILE = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

describe('the dragging store', () => {
  it('starts prototype-free, so an item nobody has dragged reads as undefined', () => {
    const { endedAt } = useDraggingStore.getState()
    expect(Object.getPrototypeOf(endedAt)).toBeNull()
    for (const name of HOSTILE) expect(endedAt[name]).toBeUndefined()
  })

  it('stays prototype-free after a drag ends, whatever the item is called', () => {
    for (const name of HOSTILE) {
      markDragging(name)
      expect(isDragging(name)).toBe(true)
      unmarkDragging(name)
    }
    const { endedAt, items } = useDraggingStore.getState()
    expect(Object.getPrototypeOf(endedAt)).toBeNull()
    expect(items.size).toBe(0)
    for (const name of HOSTILE) expect(typeof endedAt[name]).toBe('number')
  })

  it('leaves an item nobody dragged undefined beside ones that were', () => {
    markDragging('Lamp')
    unmarkDragging('Lamp')
    const { endedAt } = useDraggingStore.getState()
    expect(typeof endedAt.Lamp).toBe('number')
    expect(endedAt.Never).toBeUndefined()
  })

  it('ignores an empty item name', () => {
    markDragging('')
    expect(useDraggingStore.getState().items.has('')).toBe(false)
  })
})
