import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryPoint } from './persistence'

const NOW = Date.UTC(2026, 10, 1)
const DAY = 86400e3

interface Server {
  store: HistoryPoint[]
  honoursPages: boolean
  // rows a window may hold before the store gives up on it, the way InfluxDB does after 10 s
  givesUpOver?: number
  delay?: () => Promise<void>
  answer?: (query: URLSearchParams) => unknown
}

interface Asked {
  query: URLSearchParams
  begin: number
  end: number | undefined
  inWindow: number
  answered: number
}

let server: Server = { store: [], honoursPages: true }
const asked: Asked[] = []
let running = 0
let mostRunning = 0

const twoState = (s: string): boolean => s === 'ON' || s === 'OFF' || s === 'OPEN' || s === 'CLOSED'

// what openHAB's PersistenceResource does with a history request: the row before the window stamped at its
// start, the window's rows (a page of them when the store honours pagelength) with the previous state
// repeated before each change of a switch or contact, and the row after the window stamped at its end
function serve(s: Server, q: URLSearchParams, gaveUp = false): HistoryPoint[] {
  const begin = Date.parse(q.get('starttime') as string)
  const end = q.has('endtime') ? Date.parse(q.get('endtime') as string) : Date.now()
  const size = Number(q.get('pagelength') ?? 0)
  const boundary = q.get('boundary') === 'true'
  const out: HistoryPoint[] = []
  if (boundary) {
    const earlier = s.store.filter((p) => p.time <= begin)
    const before = earlier[earlier.length - 1]
    if (before) out.push({ time: begin, state: before.state })
  }
  let rows = gaveUp ? [] : s.store.filter((p) => p.time >= begin && p.time <= end)
  if (size > 0 && s.honoursPages) rows = rows.slice(0, size)
  let last: string | undefined
  for (const p of rows) {
    if (twoState(p.state) && last !== undefined && last !== p.state) out.push({ time: p.time, state: last })
    out.push(p)
    last = p.state
  }
  if (boundary) {
    const after = s.store.find((p) => p.time >= end)
    if (after) out.push({ time: end, state: after.state })
  }
  return out
}

vi.mock('./client', () => ({
  api: {
    get: async (path: string, opts: { signal?: AbortSignal } = {}) => {
      const query = new URLSearchParams(path.slice(path.indexOf('?') + 1))
      const begin = Date.parse(query.get('starttime') as string)
      const end = query.has('endtime') ? Date.parse(query.get('endtime') as string) : undefined
      const inWindow = server.store.filter((p) => p.time >= begin && p.time <= (end ?? Date.now())).length
      const record: Asked = { query, begin, end, inWindow, answered: 0 }
      asked.push(record)
      running++
      mostRunning = Math.max(mostRunning, running)
      try {
        if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        await server.delay?.()
        if (server.answer) return server.answer(query)
        const gaveUp = server.givesUpOver !== undefined && inWindow > server.givesUpOver
        if (gaveUp) await new Promise((r) => setTimeout(r, 10000))
        const data = serve(server, query, gaveUp)
        record.answered = data.length
        return { name: 'x', data }
      } finally {
        running--
      }
    }
  }
}))

const { getItemHistory, readItemHistory, HISTORY_PAGE } = await import('./persistence')

// the clock is faked, so a promise only settles while it is being advanced
async function settle<T>(work: Promise<T>): Promise<T> {
  let done = false
  work.then(
    () => (done = true),
    () => (done = true)
  )
  while (!done) await vi.advanceTimersByTimeAsync(1000)
  return work
}

// odd milliseconds, so a window on an even one never has a row exactly on its edge
function numbers(count: number, from: number, to: number): HistoryPoint[] {
  const step = Math.floor((to - from) / count / 2) * 2
  return Array.from({ length: count }, (_, i) => ({ time: from + 1 + i * step, state: (20 + (i % 97) / 10).toFixed(1) }))
}

function switches(count: number, from: number, to: number): HistoryPoint[] {
  const step = Math.floor((to - from) / count / 2) * 2
  // runs of one to three equal states, so some rows change and some repeat
  return Array.from({ length: count }, (_, i) => ({ time: from + 1 + i * step, state: Math.floor(i / ((i % 3) + 1)) % 2 ? 'ON' : 'OFF' }))
}

const iso = (ms: number): string => new Date(ms).toISOString()

interface Shape {
  from: number
  to?: number
  boundary?: boolean
}

// one unpaged request for the same range, which is what the app used to send
function unpaged(shape: Shape): HistoryPoint[] {
  const q: Record<string, string> = { starttime: iso(shape.from) }
  if (shape.to !== undefined) q.endtime = iso(shape.to)
  if (shape.boundary) q.boundary = 'true'
  return serve({ ...server, honoursPages: false, givesUpOver: undefined }, new URLSearchParams(q))
}

// the same, less the row after a closed window when the range came in parts
function expected(shape: Shape, parts: number): HistoryPoint[] {
  const want = unpaged(shape)
  const afterRow = shape.boundary && shape.to !== undefined && parts > 1 && want.length > 0 && want[want.length - 1].time === shape.to
  return afterRow ? want.slice(0, -1) : want
}

const load = (shape: Shape, signal?: AbortSignal): Promise<HistoryPoint[]> =>
  settle(
    getItemHistory('x', new Date(shape.from), {
      boundary: shape.boundary,
      endTime: shape.to === undefined ? undefined : new Date(shape.to),
      signal
    })
  )

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  server = { store: [], honoursPages: true }
  asked.length = 0
  running = 0
  mostRunning = 0
})

afterEach(() => vi.useRealTimers())

describe('history in parts', () => {
  it('asks once for a range that fits a window and a page, and hands the answer on untouched', async () => {
    server.store = numbers(500, NOW - DAY, NOW)
    const got = await load({ from: NOW - DAY })
    expect(asked.length).toBe(1)
    expect(asked[0].query.get('pagelength')).toBe(String(HISTORY_PAGE))
    expect(asked[0].query.has('endtime')).toBe(false)
    expect(got).toEqual(unpaged({ from: NOW - DAY }))
    expect(got.length).toBe(500)
  })

  it('keeps the rows before and after a closed window when one request is enough', async () => {
    server.store = numbers(900, NOW - 40 * DAY, NOW - DAY)
    const shape = { from: NOW - 30 * DAY, to: NOW - 10 * DAY, boundary: true }
    const got = await load(shape)
    expect(asked.length).toBe(1)
    expect(got).toEqual(unpaged(shape))
    expect(got[0].time).toBe(shape.from)
    expect(got[got.length - 1].time).toBe(shape.to)
  })

  it('walks a long quiet range in a handful of windows', async () => {
    server.store = numbers(9000, NOW - 365 * DAY, NOW)
    const got = await load({ from: NOW - 365 * DAY })
    expect(asked.length).toBeGreaterThan(1)
    expect(asked.length).toBeLessThanOrEqual(6)
    expect(Math.max(...asked.map((a) => (a.end ?? Date.now()) - a.begin))).toBeLessThanOrEqual(90 * DAY)
    expect(asked[asked.length - 1].query.has('endtime')).toBe(false)
    expect(got).toEqual(server.store)
  })

  it('never asks a busy range for more than a page, or for a window far bigger than one', async () => {
    server.store = numbers(400000, NOW - 30 * DAY, NOW)
    const got = await load({ from: NOW - 30 * DAY })
    expect(asked.every((a) => a.query.get('pagelength') === String(HISTORY_PAGE))).toBe(true)
    expect(Math.max(...asked.map((a) => a.answered))).toBe(HISTORY_PAGE)
    // the first window is a guess; once a page has shown how busy the item is, windows hold about two pages
    expect(Math.max(...asked.slice(1).map((a) => a.inWindow))).toBeLessThanOrEqual(2.5 * HISTORY_PAGE)
    expect(asked.length).toBeLessThanOrEqual(24)
    expect(got.length).toBe(400000)
    expect(got).toEqual(server.store)
  })

  it('gives the rows one unpaged request would, whatever the shape of the request', async () => {
    const from = NOW - 200 * DAY
    for (const make of [numbers, switches]) {
      for (const count of [HISTORY_PAGE - 1, HISTORY_PAGE, HISTORY_PAGE + 1, 2 * HISTORY_PAGE, 47001]) {
        // rows on both sides of the window, so there is something to carry in and something after it
        const store = [
          ...make(40, from - 20 * DAY, from - DAY),
          ...make(count, from, NOW - 30 * DAY),
          ...make(40, NOW - 20 * DAY, NOW - DAY)
        ]
        for (const boundary of [false, true]) {
          for (const to of [undefined, NOW - 25 * DAY, from + 20 * DAY]) {
            for (const honoursPages of [true, false]) {
              server = { store, honoursPages }
              asked.length = 0
              const shape = { from, to, boundary }
              const got = await load(shape)
              const want = expected(shape, asked.length)
              const label = `${make.name} ${count} boundary=${boundary} to=${to === undefined ? 'now' : (to - from) / DAY + 'd'} pages=${honoursPages}`
              expect(got.length, label).toBe(want.length)
              expect(got, label).toEqual(want)
            }
          }
        }
      }
    }
  })

  it('keeps a switch stepping across the join between two parts', async () => {
    const store = switches(HISTORY_PAGE + 50, NOW - 20 * DAY, NOW)
    // make sure the state really changes exactly at the join
    store[HISTORY_PAGE - 1].state = 'OFF'
    store[HISTORY_PAGE].state = 'ON'
    server.store = store
    const got = await load({ from: NOW - 20 * DAY })
    const join = got.findIndex((p) => p.time === store[HISTORY_PAGE].time)
    expect(got[join]).toEqual({ time: store[HISTORY_PAGE].time, state: 'OFF' })
    expect(got[join + 1]).toEqual({ time: store[HISTORY_PAGE].time, state: 'ON' })
    expect(got).toEqual(unpaged({ from: NOW - 20 * DAY }))
  })

  it('keeps a change that falls on the last row of a full first answer', async () => {
    const store = [...switches(4, NOW - 30 * DAY, NOW - 29 * DAY), ...switches(HISTORY_PAGE + 500, NOW - 20 * DAY, NOW)]
    // the page ends on a change, so its last two rows share an instant: the repeated old state and the new one
    store[4 + HISTORY_PAGE - 2].state = 'OFF'
    store[4 + HISTORY_PAGE - 1].state = 'ON'
    server.store = store
    const shape = { from: NOW - 20 * DAY, boundary: true }
    const got = await load(shape)
    expect(asked.length).toBeGreaterThan(1)
    expect(got).toEqual(unpaged(shape))
  })

  it('is not cut short by a row that lands while the server is answering', async () => {
    // with no end time the server stamps the row after the window at its own "now", like any other row
    const store = [
      ...numbers(10, NOW - 30 * DAY, NOW - 29 * DAY),
      ...numbers(50000, NOW - 20 * DAY, NOW - DAY),
      { time: NOW + 3600e3, state: '99.0' }
    ]
    server.store = store
    const got = await load({ from: NOW - 20 * DAY, boundary: true })
    expect(got.length).toBe(50001)
    expect(got[0]).toEqual({ time: NOW - 20 * DAY, state: store[9].state })
    expect(got.slice(1)).toEqual(store.slice(10, 50010))
  })

  it('loses nothing on a store that ignores the page size', async () => {
    server = { store: numbers(30000, NOW - 20 * DAY, NOW), honoursPages: false }
    const got = await load({ from: NOW - 20 * DAY })
    expect(asked.length).toBe(2)
    expect(got).toEqual(server.store)
  })

  it('asks again for less when a store gives up on a window and answers with nothing', async () => {
    // quiet for most of a year, then busy: the windows have grown by the time they reach the busy part
    server = { store: numbers(300000, NOW - 60 * DAY, NOW), honoursPages: true, givesUpOver: 100000 }
    const got = await load({ from: NOW - 365 * DAY })
    expect(asked.some((a) => a.inWindow > 100000)).toBe(true)
    expect(got.length).toBe(300000)
    expect(got).toEqual(server.store)
  })

  it('does the same when the very first window is too much, with the row before it kept', async () => {
    server = {
      store: [...numbers(5, NOW - 40 * DAY, NOW - 39 * DAY), ...numbers(300000, NOW - 30 * DAY, NOW - DAY)],
      honoursPages: true,
      givesUpOver: 100000
    }
    const shape = { from: NOW - 30 * DAY, boundary: true }
    const got = await load(shape)
    expect(asked[0].inWindow).toBe(300000)
    expect(got).toEqual(unpaged(shape))
  })

  it('takes a slow empty answer for what it says once the window is small', async () => {
    server.store = []
    server.delay = () => new Promise((r) => setTimeout(r, 6000))
    const got = await load({ from: NOW - 2 * DAY })
    expect(got).toEqual([])
    // a quarter of the window each time down to an hour, then the walk carries on as for any store
    expect(asked.length).toBeLessThanOrEqual(8)
  })

  it('stops when a store keeps answering with rows it already gave', async () => {
    const rows = numbers(HISTORY_PAGE, NOW - 20 * DAY, NOW)
    server.answer = () => ({ name: 'x', data: rows })
    const got = await load({ from: NOW - 20 * DAY })
    expect(asked.length).toBe(2)
    expect(got).toEqual(rows)
  })

  it('reads an answer that is not a history as no history', async () => {
    server.answer = () => '<html>502 Bad Gateway</html>'
    expect(await load({ from: NOW - DAY })).toEqual([])
    server.answer = () => ({ name: 'x', data: { length: 3 } })
    expect(await load({ from: NOW - DAY })).toEqual([])
  })

  it('stops asking once the caller has gone', async () => {
    server.store = numbers(90000, NOW - 20 * DAY, NOW)
    const ctrl = new AbortController()
    server.delay = async () => {
      if (asked.length === 2) ctrl.abort()
    }
    const outcome = await load({ from: NOW - 20 * DAY }, ctrl.signal).catch((e: unknown) => e)
    expect(outcome).toBeInstanceOf(DOMException)
    expect(asked.length).toBe(3)
  })

  it('runs four requests at a time, however many are asked for', async () => {
    server.store = numbers(100, NOW - DAY, NOW)
    const gates: (() => void)[] = []
    server.delay = () => new Promise<void>((go) => gates.push(go))
    const all = Promise.all(Array.from({ length: 12 }, () => getItemHistory('x', new Date(NOW - DAY))))
    for (let served = 0; served < 12;) {
      await vi.advanceTimersByTimeAsync(1)
      expect(running).toBeLessThanOrEqual(4)
      const open = gates.splice(0)
      served += open.length
      open.forEach((go) => go())
    }
    const results = await settle(all)
    expect(mostRunning).toBe(4)
    expect(results.every((rows) => rows.length === 100)).toBe(true)
  })

  it('hands a slot back when a request fails', async () => {
    server.answer = () => {
      throw new Error('GET /rest/persistence/items/x -> 500')
    }
    const failed = await settle(
      Promise.all(Array.from({ length: 9 }, () => getItemHistory('x', new Date(NOW - DAY)).catch(() => 'failed')))
    )
    expect(failed.every((r) => r === 'failed')).toBe(true)
    server = { store: numbers(10, NOW - DAY, NOW), honoursPages: true }
    expect((await load({ from: NOW - DAY })).length).toBe(10)
  })
})

describe('history handed on as it arrives', () => {
  const read = async (shape: Shape): Promise<HistoryPoint[][]> => {
    const parts: HistoryPoint[][] = []
    await settle(
      readItemHistory(
        'x',
        new Date(shape.from),
        { boundary: shape.boundary, endTime: shape.to === undefined ? undefined : new Date(shape.to) },
        (rows) => parts.push(rows.slice())
      )
    )
    return parts
  }

  it('comes in parts of a page at most, which together are the rows the whole answer has', async () => {
    const from = NOW - 200 * DAY
    for (const make of [numbers, switches]) {
      const store = [...make(40, from - 20 * DAY, from - DAY), ...make(90000, from, NOW - 30 * DAY), ...make(40, NOW - 20 * DAY, NOW - DAY)]
      for (const shape of [{ from }, { from, boundary: true }, { from, to: NOW - 25 * DAY, boundary: true }]) {
        server = { store, honoursPages: true }
        asked.length = 0
        const parts = await read(shape)
        const requests = asked.length
        expect(parts.length).toBeGreaterThan(3)
        // a page and the row carried in before the window. A switch has its old state repeated at each change
        const most = make === numbers ? HISTORY_PAGE + 1 : 2 * HISTORY_PAGE + 1
        expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(most)
        expect(parts.every((p) => p.length > 0)).toBe(true)
        expect(parts.flat()).toEqual(expected(shape, requests))
        asked.length = 0
        expect(await load(shape)).toEqual(parts.flat())
      }
    }
  })

  it('hands a short answer on once, as the server sent it', async () => {
    server.store = numbers(300, NOW - DAY, NOW)
    const parts = await read({ from: NOW - DAY, boundary: true })
    expect(parts.length).toBe(1)
    expect(parts[0]).toEqual(unpaged({ from: NOW - DAY, boundary: true }))
  })

  it('hands nothing on when there is nothing', async () => {
    expect(await read({ from: NOW - DAY })).toEqual([])
    expect(await read({ from: NOW - 300 * DAY, to: NOW - 100 * DAY, boundary: true })).toEqual([])
  })
})
