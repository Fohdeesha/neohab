import { api } from './client'

export interface HistoryPoint {
  time: number
  state: string
}

interface ItemHistory {
  name: string
  data?: HistoryPoint[]
}

export interface HistoryOptions {
  /** Persistence service id; empty = server default. */
  serviceId?: string
  /** Also return one value just outside the window, so the state AT the start is known. */
  boundary?: boolean
  signal?: AbortSignal
}

/** Fetch an item's history from the default (or a specific) persistence service. */
export async function getItemHistory(
  item: string,
  startTime: Date,
  opts: HistoryOptions = {}
): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({ starttime: startTime.toISOString() })
  if (opts.serviceId) params.set('serviceId', opts.serviceId)
  if (opts.boundary) params.set('boundary', 'true')
  const dto = await api.get<ItemHistory>(
    '/rest/persistence/items/' + encodeURIComponent(item) + '?' + params.toString(),
    { signal: opts.signal }
  )
  return dto.data ?? []
}
