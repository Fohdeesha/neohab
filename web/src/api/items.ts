import { applyProxyAuth } from './auth'
import { ohUrl } from './base'
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

// just the names: 12.8KB gzipped against the catalog's 37.8KB on a 3000-item server, measured
export function getItemNames(signal?: AbortSignal): Promise<{ name: string }[]> {
  return api.get<{ name: string }[]>('/rest/items?fields=name', { signal })
}

export function getItem(name: string, signal?: AbortSignal): Promise<Item> {
  return api.get<Item>('/rest/items/' + encodeURIComponent(name), { signal })
}

/**
 * Will this server serve a read with no account? An EventSource carries the proxy's credentials
 * and no openHAB token, so this sends exactly what the item-state stream sends - which is the
 * only way to ask. Going through `api` instead would attach the token and answer 200 on the very
 * server the question is about.
 *
 * The item name is deliberately one nobody has: 404 means we were allowed to look and there is no
 * such item, 401 means we were not. Measured on 5.2.1: 63 bytes in 1.2ms refused, 77 bytes in
 * 1.9ms allowed.
 */
const PROBE_ITEM = '__neohab_anonymous_read_probe__'
let anonRead: Promise<boolean> | null = null

export function anonymousReadAllowed(): Promise<boolean> {
  anonRead ??= (async () => {
    const headers = new Headers()
    applyProxyAuth(headers)
    try {
      const res = await fetch(ohUrl('/rest/items/' + PROBE_ITEM), { headers })
      return res.status !== 401 && res.status !== 403
    } catch {
      // unreachable is not the same as refused, and it must not stick
      anonRead = null
      return true
    }
  })()
  return anonRead
}

export function forgetAnonymousRead(): void {
  anonRead = null
}

export function sendCommand(name: string, command: string): Promise<void> {
  return api.post<void>('/rest/items/' + encodeURIComponent(name), command, { text: true })
}
