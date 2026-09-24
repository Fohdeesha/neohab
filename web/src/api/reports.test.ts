import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportStream } from './reports'

class FakeSource {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {}
  close() {
    this.closed = true
  }
}

function stream() {
  const sources: FakeSource[] = []
  const reports: [string, string][] = []
  const s = new ReportStream(
    (item, value) => reports.push([item, value]),
    (url) => {
      const src = new FakeSource(url)
      sources.push(src)
      return src as unknown as EventSource
    }
  )
  return { s, sources, reports }
}

const flush = () => Promise.resolve()

describe('the report stream', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('opens one stream for everything asked in one tick, and lets every command go once it is open', async () => {
    const { s, sources } = stream()
    let released = 0
    for (const item of ['A', 'B', 'C', 'D', 'E']) void s.listen([item]).then(() => released++)
    await flush()
    expect(sources).toHaveLength(1)
    expect(decodeURIComponent(sources[0].url)).toContain('openhab/items/E/state')
    sources[0].onopen?.()
    await flush()
    expect(released).toBe(5)
  })

  it('does not hold a command up for longer than the bound when the stream never opens', async () => {
    const { s } = stream()
    let released = false
    void s.listen(['A']).then(() => (released = true))
    await flush()
    await vi.advanceTimersByTimeAsync(1499)
    expect(released).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(released).toBe(true)
  })

  it('lets a command go at once when the server refuses the stream', async () => {
    const { s, sources } = stream()
    let released = false
    void s.listen(['A']).then(() => (released = true))
    await flush()
    sources[0].onerror?.()
    await flush()
    expect(released).toBe(true)
  })

  it('answers at once for items it already hears, on an open stream', async () => {
    const { s, sources } = stream()
    void s.listen(['A'])
    await flush()
    sources[0].onopen?.()
    let released = false
    void s.listen(['A']).then(() => (released = true))
    await flush()
    expect(released).toBe(true)
    expect(sources).toHaveLength(1)
  })

  it('reports the value of each state event, and ignores anything else', async () => {
    const { s, sources, reports } = stream()
    void s.listen(['Lamp'])
    await flush()
    const send = (topic: string, payload: unknown) =>
      sources[0].onmessage?.({ data: JSON.stringify({ topic, payload: JSON.stringify(payload) }) })
    send('openhab/items/Lamp/state', { type: 'OnOff', value: 'ON' })
    send('openhab/items/Lamp/statechanged', { value: 'OFF' })
    send('openhab/things/x/status', { value: 'ONLINE' })
    sources[0].onmessage?.({ data: 'not json' })
    expect(reports).toEqual([['Lamp', 'ON']])
  })

  it('refuses a name that would make the server reject the whole filter', async () => {
    const { s, sources } = stream()
    void s.listen(['ok_1', 'bad name', 'x/y'])
    await flush()
    const url = decodeURIComponent(sources[0].url)
    expect(url).toContain('ok_1')
    expect(url).not.toContain('bad name')
    expect(url).not.toContain('x/y')
  })
})
