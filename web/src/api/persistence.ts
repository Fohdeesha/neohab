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
