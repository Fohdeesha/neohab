import { describe, expect, it } from 'vitest'
import { stepPending, type Pending, type PendingInput } from './optimistic'

const sent = (v: number, at = 0): Pending<number> => ({ v, at, awaited: false })
const input = (over: Partial<PendingInput> = {}): PendingInput => ({
  now: 0,
  settleMs: 4000,
  waiting: false,
  dragging: false,
  liveKey: '0',
  close: false,
  ...over
})

describe('what a control shows after sending', () => {
  it('holds what it sent through the settle window, whatever echoes back', () => {
    const p = sent(50)
    expect(stepPending(p, input({ now: 3000, liveKey: '12' }))).toBe(p)
  })

  it('lets go after the window when the item went somewhere else', () => {
    expect(stepPending(sent(50), input({ now: 5000, liveKey: '12' }))).toBeNull()
  })

  it('keeps a value the item settled close to, until the item next changes', () => {
    const settled = stepPending(sent(21), input({ now: 5000, liveKey: '21.0', close: true }))
    expect(settled?.settledOn).toBe('21.0')
    expect(stepPending(settled, input({ now: 60_000, liveKey: '21.0', close: true }))).toBe(settled)
    // a schedule moves the setpoint half a step: within tolerance, and still a real change
    expect(stepPending(settled, input({ now: 60_000, liveKey: '20.5', close: true }))).toBeNull()
  })

  it('waits for an autoupdate=false answer past the window, and only for its own', () => {
    const asked = stepPending(sent(0), input({ now: 100, waiting: true }))
    expect(asked?.awaited).toBe(true)
    expect(stepPending(asked, input({ now: 3_600_000, waiting: true }))).toBe(asked)
    expect(stepPending(asked, input({ now: 3_600_000, waiting: false }))).toBeNull()
  })

  it('does not come back when another control on the item starts a wait an hour later', () => {
    const old = stepPending(sent(50), input({ now: 5000, liveKey: '50', close: true }))
    // the item changes when the other control's OFF lands, which drops the old value for good
    expect(stepPending(old, input({ now: 3_600_000, liveKey: 'OFF', waiting: true }))).toBeNull()
    // and one dropped at the window is simply gone
    expect(stepPending(null, input({ now: 3_600_000, waiting: true }))).toBeNull()
  })

  it('gives way at once while another control drags the same item', () => {
    expect(stepPending(sent(50), input({ now: 100, dragging: true }))).toBeNull()
  })
})
