import { api } from './client'

export interface HistoryPoint {
  time: number
  state: string
}

interface ItemHistory {
  name: string
  data?: HistoryPoint[]
}

/** Fetch an item's history from the default (or a specific) persistence service. */
export async function getItemHistory(
  item: string,
  startTime: Date,
  serviceId?: string,
  signal?: AbortSignal
): Promise<HistoryPoint[]> {
  const params = new URLSearchParams({ starttime: startTime.toISOString() })
  if (serviceId) params.set('serviceId', serviceId)
  const dto = await api.get<ItemHistory>(
    '/rest/persistence/items/' + encodeURIComponent(item) + '?' + params.toString(),
    { signal }
  )
  return dto.data ?? []
}
