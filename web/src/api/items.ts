import { api } from './client'
import type { Item, RootInfo } from './types'

export function getRootInfo(signal?: AbortSignal): Promise<RootInfo> {
  return api.get<RootInfo>('/rest/', { signal })
}

export function getItems(signal?: AbortSignal): Promise<Item[]> {
  return api.get<Item[]>('/rest/items?metadata=.*', { signal })
}

export function getItem(name: string, signal?: AbortSignal): Promise<Item> {
  return api.get<Item>('/rest/items/' + encodeURIComponent(name), { signal })
}

/** Send a command to an item (text/plain body, no auth required with the default user role). */
export function sendCommand(name: string, command: string): Promise<void> {
  return api.post<void>('/rest/items/' + encodeURIComponent(name), command, { text: true })
}
