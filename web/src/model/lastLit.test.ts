import { describe, expect, it } from 'vitest'
import { FULL_BRIGHTNESS, LIT_CAP, litOf, noteLit, parseLit, serialiseLit } from './lastLit'
import { emptyMap } from './lookup'

/*
 * openHAB item names are `[a-zA-Z_][a-zA-Z0-9_]*` (ItemUtil.isValidItemName), so every one of
 * these is a name somebody can really give a colour lamp - and this map is keyed by exactly that.
 */
const HOSTILE = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

const from = (entries: Record<string, number>): Record<string, number> => {
  const m = emptyMap<number>()
  for (const [k, v] of Object.entries(entries)) m[k] = v
  return m
}

describe('litOf', () => {
  it('gives back what was remembered', () => {
    expect(litOf(from({ lamp: 40 }), 'lamp')).toBe(40)
  })

  it('falls back to full for a lamp it has never seen lit', () => {
    expect(litOf(emptyMap<number>(), 'lamp')).toBe(FULL_BRIGHTNESS)
    expect(FULL_BRIGHTNESS).toBe(100) // openHAB's own answer for ON, so the fallback matches it
  })

  // GUARD, not a discriminator: two independent defences already cover this, so it passes on a
  // build with either one removed. `lookup()` is the structural one and the prototype-free map is
  // the other, and the scale check below is what would catch a function arriving here. Kept
  // because it is the shape of the bug, and it says here that it cannot fail on its own.
  it('falls back for an item named after an Object.prototype member', () => {
    for (const name of HOSTILE) expect(litOf(emptyMap<number>(), name)).toBe(FULL_BRIGHTNESS)
    // The one that has teeth: whatever a bad read hands back, it is not a brightness.
    expect(litOf({ lamp: (() => 40) as unknown as number }, 'lamp')).toBe(FULL_BRIGHTNESS)
  })

  it('still reads such a name when the lamp really is called that', () => {
    for (const name of HOSTILE) expect(litOf(from({ [name]: 55 }), name)).toBe(55)
  })

  it('falls back rather than trusting a stored value off the scale', () => {
    for (const bad of [0, -5, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(litOf(from({ lamp: bad }), 'lamp')).toBe(FULL_BRIGHTNESS)
    }
  })
})

describe('noteLit', () => {
  it('records a lit brightness', () => {
    expect(litOf(noteLit(emptyMap<number>(), 'lamp', 40), 'lamp')).toBe(40)
  })

  it('ignores anything that is not a brightness worth restoring', () => {
    const map = emptyMap<number>()
    // Zero above all: a dark lamp is the state we are trying to undo, never the one to remember.
    for (const bad of [0, -1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(noteLit(map, 'lamp', bad)).toBe(map)
    }
    expect(noteLit(map, '', 40)).toBe(map)
  })

  it('returns the same map when nothing changed', () => {
    // A fading strip reports a burst of identical states; the store reads this to skip the work.
    const map = noteLit(emptyMap<number>(), 'lamp', 40)
    expect(noteLit(map, 'lamp', 40)).toBe(map)
    expect(noteLit(map, 'lamp', 41)).not.toBe(map)
  })

  it('does not mutate the map it was given', () => {
    const before = from({ lamp: 40 })
    noteLit(before, 'lamp', 70)
    expect(before.lamp).toBe(40)
  })

  it('builds a prototype-free map, so every later read is safe too', () => {
    expect(Object.getPrototypeOf(noteLit(emptyMap<number>(), 'lamp', 40))).toBeNull()
    const hostile = noteLit(emptyMap<number>(), '__proto__', 40)
    expect(Object.getPrototypeOf(hostile)).toBeNull()
    expect(({} as Record<string, unknown>).lamp).toBeUndefined()
  })

  it('keeps the most recently seen lamps when it is full', () => {
    let map = emptyMap<number>()
    for (let i = 0; i < LIT_CAP + 5; i++) map = noteLit(map, 'lamp' + i, 40)
    expect(Object.keys(map)).toHaveLength(LIT_CAP)
    expect(litOf(map, 'lamp0')).toBe(FULL_BRIGHTNESS) // the oldest went
    expect(litOf(map, 'lamp' + (LIT_CAP + 4))).toBe(40)
  })

  it('a lamp seen again survives the cap that would otherwise have dropped it', () => {
    let map = noteLit(emptyMap<number>(), 'old', 40)
    map = noteLit(map, 'old', 41) // seen again: moves to the end of the queue
    for (let i = 0; i < LIT_CAP - 1; i++) map = noteLit(map, 'lamp' + i, 40)
    expect(litOf(map, 'old')).toBe(41)
  })
})

describe('parseLit', () => {
  it('reads back what was written', () => {
    const map = noteLit(noteLit(emptyMap<number>(), 'a', 40), 'b', 12)
    expect(parseLit(serialiseLit(map))).toEqual({ a: 40, b: 12 })
  })

  it('is an empty memory for anything it cannot read', () => {
    // localStorage holds whatever anything ever put there, including a half-written value.
    for (const raw of [null, undefined, '', 'not json', '[]', '"a string"', '42', 'null', '{"a":']) {
      expect(Object.keys(parseLit(raw))).toHaveLength(0)
    }
  })

  it('drops entries that are not a usable brightness', () => {
    expect(parseLit('{"a":40,"b":"70","c":0,"d":null,"e":150,"f":-3,"g":{"h":1}}')).toEqual({ a: 40 })
  })

  it('takes an item named __proto__ as data and pollutes nothing', () => {
    const map = parseLit('{"__proto__":40,"lamp":12}')
    expect(Object.getPrototypeOf(map)).toBeNull()
    expect(litOf(map, '__proto__')).toBe(40)
    expect(({} as Record<string, unknown>).lamp).toBeUndefined()
    expect(Object.getPrototypeOf({})).toBe(Object.prototype)
  })

  it('caps what it reads, so a file grown by an older build cannot come back unbounded', () => {
    const big: Record<string, number> = {}
    for (let i = 0; i < LIT_CAP + 20; i++) big['lamp' + i] = 40
    expect(Object.keys(parseLit(JSON.stringify(big)))).toHaveLength(LIT_CAP)
  })
})
