import { create } from 'zustand'
import { ApiError } from '../api/client'
import { getItemNames, getItems } from '../api/items'
import type { Item } from '../api/types'
import { autoUpdateVetoed } from '../model/autoupdate'

/**
 * `names` answers a much cheaper question than the full catalog: which item names does this server
 * have. A widget needs it to tell "this item is not here" from "this item reads 0", and the
 * live-status notice needs the `denied` case to know whether a signed-out read is refused at all.
 * One request serves both; the full catalog is a superset, so loading it fills `names` too.
 */
export type NamesStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'failed'

interface CatalogState {
  items: Item[]
  loaded: boolean
  loading: boolean
  names: ReadonlySet<string> | null
  // items whose `autoupdate` metadata vetoes the update openHAB would otherwise post on a command,
  // so commanding one of these produces no state at all until the binding reports back
  noAutoUpdate: ReadonlySet<string>
  namesStatus: NamesStatus
}

export const useCatalogStore = create<CatalogState>(() => ({
  items: [],
  loaded: false,
  loading: false,
  names: null,
  noAutoUpdate: new Set<string>(),
  namesStatus: 'idle'
}))

const vetoed = (rows: { name: string; metadata?: unknown }[]): ReadonlySet<string> =>
  new Set(rows.filter((i) => autoUpdateVetoed(i.metadata)).map((i) => i.name))

export function ensureCatalog(): void {
  const s = useCatalogStore.getState()
  if (s.loaded || s.loading) return
  useCatalogStore.setState({ loading: true })
  getItems()
    .then((items) => {
      items.sort((a, b) => a.name.localeCompare(b.name))
      useCatalogStore.setState({
        items,
        loaded: true,
        loading: false,
        names: new Set(items.map((i) => i.name)),
        noAutoUpdate: vetoed(items),
        namesStatus: 'ready'
      })
    })
    .catch(() => useCatalogStore.setState({ loading: false }))
}

export function ensureItemNames(): void {
  const s = useCatalogStore.getState()
  if (s.namesStatus !== 'idle' && s.namesStatus !== 'failed') return
  if (s.loading) return
  useCatalogStore.setState({ namesStatus: 'loading' })
  getItemNames()
    .then((items) => {
      useCatalogStore.setState({ names: new Set(items.map((i) => i.name)), noAutoUpdate: vetoed(items), namesStatus: 'ready' })
    })
    .catch((err: unknown) => {
      // a refused read is an answer, and a different one from "the server did not respond"
      const denied = err instanceof ApiError && (err.status === 401 || err.status === 403)
      useCatalogStore.setState({ namesStatus: denied ? 'denied' : 'failed' })
    })
}

export function forgetCatalog(): void {
  useCatalogStore.setState({ items: [], loaded: false, loading: false, names: null, namesStatus: 'idle' })
}

/**
 * Which of these names this server does not have. Empty unless the answer is actually known:
 * while the list is loading, or when reading it was refused, nothing is "missing" - claiming
 * otherwise would put a configuration error on screen for a server we simply could not ask.
 */
export function missingFrom(names: ReadonlySet<string> | null, status: NamesStatus, wanted: string[]): string[] {
  if (status !== 'ready' || names === null) return []
  return wanted.filter((n) => !names.has(n))
}
