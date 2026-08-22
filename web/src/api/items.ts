import { api } from './client'
import type { Item, RootInfo } from './types'

export function getRootInfo(signal?: AbortSignal): Promise<RootInfo> {
  return api.get<RootInfo>('/rest/', { signal })
}

/**
 * The fields the item catalog actually reads. Everything else openHAB sends per item - the
 * link, editable flag, unit symbol and group members - is dead weight here, because the catalog
 * exists to fill editor pickers, the generator and the template helpers.
 *
 * This matters at the scale neohab is aimed at. A long-time HABPanel user has thousands of
 * items, and the whole list is fetched into memory the first time a picker opens: measured
 * against a real server, limiting the fields takes 245 bytes per item down to 170, so a
 * 3000-item install transfers ~509KB instead of ~735KB.
 *
 * `fields` is a core `ItemResource` parameter, present in both openHAB 4.x and 5.x (checked
 * against 4.3.7 and 5.2.1, not just the source).
 */
const CATALOG_FIELDS = [
  'name',
  'type',
  // a typed Group's member type, which is what decides the widget for it
  'groupType',
  'label',
  // semantic tags and group membership, for the dashboard generator's sources
  'tags',
  'groupNames',
  // declared range and options, so a generated slider is never given an invented range
  'stateDescription',
  'commandDescription',
  // the pre-SSE fallback for the HABPanel-compatible template helpers (`getItem`,
  // `itemsInGroup`, `itemsWithTag`), which would otherwise read empty on a template's first
  // render pass. Worth ~45 bytes an item to keep the migration path behaving as it did.
  'state',
].join(',')

export function getItems(signal?: AbortSignal): Promise<Item[]> {
  return api.get<Item[]>('/rest/items?fields=' + CATALOG_FIELDS, { signal })
}

/**
 * One item, every field the server offers. Deliberately not part of the catalog above: the detail
 * sheet wants the registry's own state history, which is worth a request for the single item
 * somebody is looking at and dead weight across three thousand of them.
 */
export function getItem(name: string, signal?: AbortSignal): Promise<Item> {
  return api.get<Item>('/rest/items/' + encodeURIComponent(name), { signal })
}

/** Send a command to an item (text/plain body, no auth required with the default user role). */
export function sendCommand(name: string, command: string): Promise<void> {
  return api.post<void>('/rest/items/' + encodeURIComponent(name), command, { text: true })
}
