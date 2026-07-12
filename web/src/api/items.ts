import { api } from './client'
import type { Item, RootInfo } from './types'

export function getRootInfo(signal?: AbortSignal): Promise<RootInfo> {
  return api.get<RootInfo>('/rest/', { signal })
}

export function getItems(signal?: AbortSignal): Promise<Item[]> {
  // no metadata: the catalog only needs names, types, labels and option descriptions
  return api.get<Item[]>('/rest/items', { signal })
}

export function getItem(name: string, signal?: AbortSignal): Promise<Item> {
  return api.get<Item>('/rest/items/' + encodeURIComponent(name), { signal })
}

/** Send a command to an item (text/plain body, no auth required with the default user role). */
export function sendCommand(name: string, command: string): Promise<void> {
  return api.post<void>('/rest/items/' + encodeURIComponent(name), command, { text: true })
}
