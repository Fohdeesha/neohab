import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notes: string[] = []
vi.mock('./notify', () => ({ notify: (text: string) => notes.push(text) }))

class FakeSource {
  static last: FakeSource | null = null
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeSource.last = this
  }
  close() {}
}
vi.stubGlobal('EventSource', FakeSource)
const noopEvents = { addEventListener: () => {}, removeEventListener: () => {} }
vi.stubGlobal('document', { ...noopEvents, documentElement: {}, visibilityState: 'visible' })
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })

const { clearUnconfirmed, expectAnswer, readStatesFrom, useUnconfirmedStore, withdraw } = await import('./unconfirmed')

const states = new Map<string, string>()
readStatesFrom((item) => states.get(item))

const report = (item: string, value: string) =>
  FakeSource.last?.onmessage?.({ data: JSON.stringify({ topic: `openhab/items/${item}/state`, payload: JSON.stringify({ value }) }) })
const asked = (item: string) => useUnconfirmedStore.getState().asked[item]

describe('a command to an item whose autoupdate is vetoed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    notes.length = 0
    states.clear()
  })
  afterEach(() => {
    clearUnconfirmed(Object.keys(useUnconfirmedStore.getState().asked))
    vi.useRealTimers()
  })

  it('shows what was asked for until the device answers, and a confirming answer ends it', async () => {
    states.set('Door', 'OFF')
    void expectAnswer('Door', 'OFF')
    await vi.advanceTimersByTimeAsync(0)
    expect(asked('Door')).toBe('OFF')
    report('Door', 'OFF')
    expect(asked('Door')).toBeUndefined()
  })

  it('leaves a changing answer to the state that follows it, so the old state never flashes back', async () => {
    states.set('Lamp', 'OFF')
    void expectAnswer('Lamp', 'ON')
    await vi.advanceTimersByTimeAsync(0)
    report('Lamp', 'ON')
    expect(asked('Lamp')).toBe('ON')
  })

  it('says so when the device answers with the opposite of what was asked', async () => {
    states.set('Dmx', 'ON')
    void expectAnswer('Dmx', 'OFF')
    await vi.advanceTimersByTimeAsync(0)
    report('Dmx', 'ON')
    expect(notes).toEqual([])
    await vi.advanceTimersByTimeAsync(4000)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('Dmx')
  })

  it('keeps the hold for a device that never answers, since nothing will arrive that it could hide', async () => {
    void expectAnswer('Quiet', 'ON')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(asked('Quiet')).toBe('ON')
    expect(notes).toEqual([])
  })

  it('lets go at once when the command never reached the server', async () => {
    void expectAnswer('Gone', 'ON')
    await vi.advanceTimersByTimeAsync(0)
    withdraw('Gone', 'ON')
    expect(asked('Gone')).toBeUndefined()
  })

  it('works for an item named like an Object.prototype member', async () => {
    states.set('constructor', 'OFF')
    void expectAnswer('constructor', 'ON')
    await vi.advanceTimersByTimeAsync(0)
    expect(asked('constructor')).toBe('ON')
    report('constructor', 'ON')
    states.set('constructor', 'ON')
    clearUnconfirmed(['constructor'])
    expect(asked('constructor')).toBeUndefined()
  })
})
