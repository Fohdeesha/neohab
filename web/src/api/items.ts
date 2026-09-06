import { api } from './client'
import type { Item, RootInfo } from './types'

export function getRootInfo(signal?: AbortSignal): Promise<RootInfo> {
  return api.get<RootInfo>('/rest/', { signal })
}

// only the fields the catalog reads - on a 3000-item install that is ~500KB instead of ~735KB
const CATALOG_FIELDS = [
  'name',
  'type',
  'groupType',
  'label',
  'tags',
  'groupNames',
  'stateDescription',
  'commandDescription',
  // the pre-SSE fallback for the template helpers, which would otherwise read empty on a first render
  'state'
].join(',')

export function getItems(signal?: AbortSignal): Promise<Item[]> {
  return api.get<Item[]>('/rest/items?fields=' + CATALOG_FIELDS, { signal })
}

export function getItem(name: string, signal?: AbortSignal): Promise<Item> {
  return api.get<Item>('/rest/items/' + encodeURIComponent(name), { signal })
}

export function sendCommand(name: string, command: string): Promise<void> {
  return api.post<void>('/rest/items/' + encodeURIComponent(name), command, { text: true })
}
