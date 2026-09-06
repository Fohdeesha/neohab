/**
 * Item catalog for editor pickers: the full item list (names, types, labels), fetched once per
 * session on first use. Not used by the runtime dashboard, which only tracks visible items.
 */
import { create } from 'zustand'
import { getItems } from '../api/items'
import type { Item } from '../api/types'

interface CatalogState {
  items: Item[]
  loaded: boolean
  loading: boolean
}

export const useCatalogStore = create<CatalogState>(() => ({
  items: [],
  loaded: false,
  loading: false
}))

export function ensureCatalog(): void {
  const s = useCatalogStore.getState()
  if (s.loaded || s.loading) return
  useCatalogStore.setState({ loading: true })
  getItems()
    .then((items) => {
      items.sort((a, b) => a.name.localeCompare(b.name))
      useCatalogStore.setState({ items, loaded: true, loading: false })
    })
    .catch(() => useCatalogStore.setState({ loading: false }))
}
