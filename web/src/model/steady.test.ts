import { describe, expect, it } from 'vitest'
import { STEADY_MS, steadyFlush, steadyHolding, steadyInitial, steadyStep, type SteadyState } from './steady'

const NOW = 1_000_000

/**
 * The sequence one DMX strip actually produced for one press of a button running an openHAB
 * rule, as [offset, state] - see model/steady.ts. Both ends are the value the rule asked for;
 * everything between is the fade.
 */
const FADE: [number, string][] = [
  [0, '21,87,100'],
  [50, '0.000,100,4.7059'],
  [50, '60.000,100,4.7059'],
  [51, '0,0,4.7059'],
  [1075, '0.000,95.29400,100'],
  [1076, '24.198,95.29400,100'],
  [1076, '20.810,87.05900,100']
]

/** Run a sequence through the rule, returning every value that reached the screen. */
function play(sequence: [number, string][], start = '0,0,0'): string[] {
  let state: SteadyState<string> = steadyInitial(start, start)
  const shown = [state.shown]
  const push = (s: SteadyState<string>) => {
    state = s
    if (shown[shown.length - 1] !== s.shown) shown.push(s.shown)
  }
  for (const [at, value] of sequence) {
    // whatever the window would have flushed before this arrived, flushes first
    push(steadyFlush(state, NOW + at) ?? state)
    push(steadyStep(state, value, value, NOW + at))
  }
  const last = sequence[sequence.length - 1][0]
  push(steadyFlush(state, NOW + last + STEADY_MS) ?? state)
  return shown
}

describe('the steady display rule', () => {
  it('shows a single change at once', () => {
    const state = steadyStep(steadyInitial('10', '10'), '40', '40', NOW + 5)
    expect(state.shown).toBe('40')
    expect(steadyHolding(state)).toBe(false)
  })

  it('shows the first state to arrive at once, however soon after mounting', () => {
    // A widget mounts before its item's state does. Holding that back would leave every control
    // on a dashboard sitting at zero for a window after every page load.
    const state = steadyStep(steadyInitial('0,0,0', '0,0,0'), '21,87,100', '21,87,100', NOW + 1)
    expect(state.shown).toBe('21,87,100')
    expect(steadyHolding(state)).toBe(false)
  })

  it('moves a fader once for a whole fade, not three times', () => {
    // Without the rule this is 0,0,0 > 21,87,100 > 0,100,4.7 > 0,0,4.7 > 0,95,100 > 20.8,87,100
    expect(play(FADE)).toEqual(['0,0,0', '21,87,100', '20.810,87.05900,100'])
  })

  it('ends on the value the device settled at, not on a mid-fade one', () => {
    const shown = play(FADE)
    expect(shown[shown.length - 1]).toBe(FADE[FADE.length - 1][1])
  })

  it('holds nothing back once the window has passed', () => {
    let state = steadyInitial('a', 'a')
    state = steadyStep(state, 'b', 'b', NOW)
    state = steadyStep(state, 'c', 'c', NOW + STEADY_MS)
    expect(state.shown).toBe('c')
    expect(steadyHolding(state)).toBe(false)
  })

  it('shows the newest value when the window closes, and starts a fresh one', () => {
    let state = steadyStep(steadyInitial('a', 'a'), 'a2', 'a2', NOW)
    state = steadyStep(state, 'b', 'b', NOW + 10)
    state = steadyStep(state, 'c', 'c', NOW + 20)
    expect(state.shown).toBe('a2')
    expect(steadyHolding(state)).toBe(true)
    expect(steadyFlush(state, NOW + 100)).toBeNull() // window still open
    const flushed = steadyFlush(state, NOW + STEADY_MS)
    expect(flushed?.shown).toBe('c')
    expect(flushed?.since).toBe(NOW + STEADY_MS)
    expect(steadyHolding(flushed!)).toBe(false)
  })

  it('has nothing to flush when nothing is held back', () => {
    expect(steadyFlush(steadyInitial('a', 'a'), NOW + STEADY_MS * 10)).toBeNull()
  })

  it('ignores a repeat of the value it is already following', () => {
    const state = steadyStep(steadyInitial('a', 'a'), 'a', 'a', NOW)
    expect(steadyStep(state, 'a', 'a', NOW + 10)).toBe(state)
    // and a burst's held value repeating does not restart or extend anything
    const held = steadyStep(steadyStep(steadyInitial('a', 'a'), 'a0', 'a0', NOW), 'b', 'b', NOW + 10)
    expect(steadyStep(held, 'b', 'b', NOW + 900)).toBe(held)
  })

  it('treats a key that is not a number as equal to itself', () => {
    // This runs during render. A NaN key comparing unequal to itself would be a render loop,
    // not a wrong reading - so the comparison has to be Object.is, not ===.
    const state = steadyStep(steadyInitial(0, 0), NaN, NaN, NOW)
    expect(steadyStep(state, NaN, NaN, NOW + 10)).toBe(state)
    expect(steadyHolding(state)).toBe(false)
    expect(steadyFlush(state, NOW + STEADY_MS * 2)).toBeNull()
  })

  it('separates the value from the key, so a rebuilt object is not a change', () => {
    // parseHsb makes a new object each render; the raw state is what identifies it
    const first = { h: 21, s: 87, b: 100 }
    let state = steadyStep(steadyInitial({ h: 0, s: 0, b: 0 }, '0,0,0'), first, '21,87,100', NOW)
    state = steadyStep(state, { h: 21, s: 87, b: 100 }, '21,87,100', NOW + 10)
    expect(state.shown).toBe(first)
    state = steadyStep(state, { h: 0, s: 0, b: 5 }, '0,0,5', NOW + 20)
    expect(state.shown).toBe(first)
    expect(state.latest).toEqual({ h: 0, s: 0, b: 5 })
  })

  it('keeps a display that really is following something live, stepwise', () => {
    // A value changing every 400ms for 5s never freezes: it moves once per window.
    const ticks: [number, string][] = []
    for (let i = 1; i <= 12; i++) ticks.push([i * 400, String(i)])
    const shown = play(ticks, '0')
    expect(shown.length).toBeGreaterThan(3)
    expect(shown[shown.length - 1]).toBe('12')
    // ... and never shows a value it was never given
    for (const s of shown) expect(['0', ...ticks.map((t) => t[1])]).toContain(s)
  })
})
