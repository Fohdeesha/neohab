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
  // the full catalog could not be read, so a picker says so instead of "loading" for ever
  failed: boolean
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
  failed: false,
  names: null,
  noAutoUpdate: new Set<string>(),
  namesStatus: 'idle'
}))

const vetoed = (rows: { name: string; metadata?: unknown }[]): ReadonlySet<string> =>
  new Set(rows.filter((i) => autoUpdateVetoed(i.metadata)).map((i) => i.name))

// an item made in Main UI after this page loaded has to be pickable without a reload
const STALE_MS = 30_000

// bumped when the credentials change, so an answer to the old question cannot land after it
let generation = 0
let loadedAt = 0

export function ensureCatalog(opts?: { refresh?: boolean }): void {
  const s = useCatalogStore.getState()
  if (s.loading) return
  if (s.loaded && !(opts?.refresh && Date.now() - loadedAt > STALE_MS)) return
  const gen = generation
  // a refresh keeps the list it has on screen until the new one arrives
  useCatalogStore.setState({ loading: true, failed: false })
  getItems()
    .then((items) => {
      if (gen !== generation) return
      items.sort((a, b) => a.name.localeCompare(b.name))
      loadedAt = Date.now()
      useCatalogStore.setState({
        items,
        loaded: true,
        loading: false,
        names: new Set(items.map((i) => i.name)),
        noAutoUpdate: vetoed(items),
        namesStatus: 'ready'
      })
    })
    .catch(() => {
      if (gen !== generation) return
      useCatalogStore.setState((st) => ({ loading: false, failed: !st.loaded }))
    })
}

export function ensureItemNames(): void {
  const s = useCatalogStore.getState()
  if (s.namesStatus !== 'idle' && s.namesStatus !== 'failed') return
  if (s.loading) return
  const gen = generation
  useCatalogStore.setState({ namesStatus: 'loading' })
  getItemNames()
    .then((items) => {
      if (gen !== generation) return
      useCatalogStore.setState({ names: new Set(items.map((i) => i.name)), noAutoUpdate: vetoed(items), namesStatus: 'ready' })
    })
    .catch((err: unknown) => {
      if (gen !== generation) return
      // a refused read is an answer, and a different one from "the server did not respond"
      const denied = err instanceof ApiError && (err.status === 401 || err.status === 403)
      useCatalogStore.setState({ namesStatus: denied ? 'denied' : 'failed' })
    })
}

/** After a sign-in or sign-out: what this device may read has changed, so everything is asked again. */
export function forgetCatalog(): void {
  const before = useCatalogStore.getState()
  generation++
  loadedAt = 0
  useCatalogStore.setState({ items: [], loaded: false, loading: false, failed: false, names: null, namesStatus: 'idle' })
  // the widgets that asked once will not ask again, so the question goes out on their behalf
  if (before.loaded || before.loading) ensureCatalog()
  else if (before.namesStatus !== 'idle') ensureItemNames()
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
