import { api } from './client'
import type { PersistenceService } from '../model/persistence'

export interface HistoryPoint {
  time: number
  state: string
}

interface ItemHistory {
  name: string
  data?: HistoryPoint[]
}

export interface HistoryOptions {
  serviceId?: string
  boundary?: boolean
  endTime?: Date
  signal?: AbortSignal
}

// openHAB builds a whole history answer in memory, so a year of a busy item in one request can run it out
// of heap. Rows are asked for a page at a time, and only a few requests run at once
export const HISTORY_PAGE = 20000
const MAX_INFLIGHT = 4
const MAX_REQUESTS = 2000

// a store may sort a whole window before it cuts a page out of it (InfluxDB does), so a long range is
// walked in windows sized to hold about a page
const DAY_MS = 86400e3
const FIRST_WINDOW_MS = 31 * DAY_MS
const MAX_WINDOW_MS = 90 * DAY_MS
const MIN_WINDOW_MS = 3600e3
// InfluxDB gives up on a query after 10 s and openHAB then answers with no rows, like an empty stretch
const GAVE_UP_MS = 5000

const TWO_STATE = new Set(['ON', 'OFF', 'OPEN', 'CLOSED'])

let inflight = 0
const waiting: (() => void)[] = []

function takeSlot(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++
    return Promise.resolve()
  }
  return new Promise((go) => waiting.push(go))
}

function freeSlot(): void {
  const next = waiting.shift()
  // the slot goes straight to whoever waited longest, so a newcomer can't slip in ahead
  if (next) next()
  else inflight--
}

async function historyPage(
  item: string,
  from: number,
  stop: number | undefined,
  opts: HistoryOptions,
  boundary: boolean
): Promise<{ page: HistoryPoint[]; took: number }> {
  const params = new URLSearchParams({ starttime: new Date(from).toISOString() })
  if (stop !== undefined) params.set('endtime', new Date(stop).toISOString())
  if (opts.serviceId) params.set('serviceId', opts.serviceId)
  if (boundary) params.set('boundary', 'true')
  params.set('pagelength', String(HISTORY_PAGE))
  await takeSlot()
  const asked = Date.now()
  try {
    const dto = await api.get<ItemHistory>('/rest/persistence/items/' + encodeURIComponent(item) + '?' + params.toString(), {
      signal: opts.signal
    })
    return { page: Array.isArray(dto?.data) ? dto.data : [], took: Date.now() - asked }
  } finally {
    freeSlot()
  }
}

/**
 * Reads an item's history and hands it to `take` as it arrives, in order, keeping none of it: a year of a
 * busy item is millions of rows, and whoever draws it wants a few hundred points. The rows are the ones a
 * single unpaged request would give. A range that fits one window and one page is one request, handed on
 * untouched. A longer or busier one comes in parts, and then the row openHAB adds after a closed window
 * (boundary) is left out: it only means something at the end of a whole answer.
 */
export async function readItemHistory(
  item: string,
  startTime: Date,
  opts: HistoryOptions,
  take: (rows: HistoryPoint[]) => void
): Promise<void> {
  const from = startTime.getTime()
  const end = opts.endTime?.getTime()
  const boundary = opts.boundary === true
  // the last stored row handed on, which is all a later part needs to know of the ones before it
  let seen: HistoryPoint | undefined
  let cursor = from
  let span = FIRST_WINDOW_MS
  let first = true
  let slowStore = false

  for (let asked = 0; asked < MAX_REQUESTS; asked++) {
    const reach = cursor + span
    // the last part of a range with no end goes out without one, so the server's clock decides what "now" is
    const stop = end === undefined ? (reach >= Date.now() ? undefined : reach) : Math.min(reach, end)
    const whole = stop === end
    const { page, took } = await historyPage(item, cursor, stop, opts, first && boundary)
    const full = page.length >= HISTORY_PAGE

    let stored = page.length
    if (first && boundary && page.length > 0) {
      if (page[0].time === from) stored--
      if (stop !== undefined && page[page.length - 1].time === stop) stored--
    }
    const width = (stop ?? Date.now()) - cursor
    if (!slowStore && stored <= 0 && took > GAVE_UP_MS) {
      if (width > MIN_WINDOW_MS) {
        span = Math.max(MIN_WINDOW_MS, width / 4)
        continue
      }
      // even an hour comes back slow and empty, so slow is just how this store is
      slowStore = true
    }

    if (first && whole && !full) {
      if (page.length > 0) take(page)
      return
    }

    let out = page
    if (first) {
      let lead = 0
      if (boundary && page.length > 0) {
        if (page[0].time === from) lead = 1
        // more is coming, so the row after this part isn't the end of anything. With no end it is stamped
        // at the server's "now" and nothing tells it from a stored one: drop the last row and whatever
        // shares its instant, the next part brings the stored ones back
        if (stop !== undefined) {
          if (page.length > lead && page[page.length - 1].time === stop) page.pop()
        } else {
          const dropped = page.pop() as HistoryPoint
          while (page.length > lead && page[page.length - 1].time === dropped.time) page.pop()
        }
      }
      if (page.length > lead) seen = page[page.length - 1]
    } else {
      out = []
      for (const point of page) {
        // a store that rounds the start down answers with rows we already have
        if (seen && point.time <= seen.time) continue
        // openHAB repeats the previous state at each change of a switch or contact so a line steps, but
        // it can't across two requests
        if (out.length === 0 && seen && TWO_STATE.has(point.state) && point.state !== seen.state) {
          out.push({ time: point.time, state: seen.state })
        }
        out.push(point)
      }
      if (out.length > 0) seen = out[out.length - 1]
    }
    const added = out.length
    if (added > 0) take(out)
    first = false

    if (full && added > 0 && seen) {
      const last = seen.time
      span = Math.min(span, Math.max(MIN_WINDOW_MS, (last - cursor) * 2))
      cursor = Math.max(cursor, last) + 1
    } else {
      if (whole || stop === undefined) break
      cursor = stop + 1
      const filled = Math.max(page.length, 1) / (HISTORY_PAGE / 2)
      span = Math.min(MAX_WINDOW_MS, span * Math.min(4, Math.max(1, 1 / filled)))
    }
    if (end !== undefined && cursor > end) break
  }
}

/** The same rows, all of them at once. For a range that is short by nature: a long one wants readItemHistory. */
export async function getItemHistory(item: string, startTime: Date, opts: HistoryOptions = {}): Promise<HistoryPoint[]> {
  let all: HistoryPoint[] | undefined
  await readItemHistory(item, startTime, opts, (rows) => {
    if (!all) all = rows
    else for (const row of rows) all.push(row)
  })
  return all ?? []
}

// null means we were not allowed to ask (admin-only), never that nothing is installed
let servicesPromise: Promise<PersistenceService[] | null> | null = null

export function listPersistenceServices(): Promise<PersistenceService[] | null> {
  servicesPromise ??= api
    .get<PersistenceService[]>('/rest/persistence')
    .then((list) => (Array.isArray(list) ? list : []))
    .catch(() => {
      servicesPromise = null
      return null
    })
  return servicesPromise
}

export function forgetPersistenceServices(): void {
  servicesPromise = null
}
