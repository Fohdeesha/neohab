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
  /** Persistence service id; empty = server default. */
  serviceId?: string
  /** Also return one value just outside the window, so the state AT the start is known. */
  boundary?: boolean
  /** End of the window; omitted means "up to now" (a closed window for calendar navigation). */
  endTime?: Date
  signal?: AbortSignal
}

/** Fetch an item's history from the default (or a specific) persistence service. */
export async function getItemHistory(item: string, startTime: Date, opts: HistoryOptions = {}): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({ starttime: startTime.toISOString() })
  if (opts.endTime) params.set('endtime', opts.endTime.toISOString())
  if (opts.serviceId) params.set('serviceId', opts.serviceId)
  if (opts.boundary) params.set('boundary', 'true')
  const dto = await api.get<ItemHistory>('/rest/persistence/items/' + encodeURIComponent(item) + '?' + params.toString(), {
    signal: opts.signal
  })
  return dto.data ?? []
}

/**
 * The persistence services this server has, or null if we may not ask.
 *
 * `GET /rest/persistence` is admin-only (verified on 4.3.7: anonymous 401), which is exactly why
 * the auth store uses it to establish admin-ness. Null therefore means "unknown", not "none" -
 * a viewer must never be told nothing is installed on the strength of a 401.
 *
 * Cached for the session because it answers a question about the server's installation, which
 * does not change while a wall panel is looking at it; a failure is not cached, so a device that
 * signs in later gets a real answer.
 */
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

/** Forget the cached list - the signed-in role changed, so the answer may have too. */
export function forgetPersistenceServices(): void {
  servicesPromise = null
}
