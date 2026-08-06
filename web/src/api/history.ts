/**
 * Storage for the configuration history.
 *
 * Namespaces of its own, for three reasons: openHAB rewrites a namespace's whole file on every
 * write, so keeping snapshots beside the configuration would mean rewriting all of them on every
 * dashboard save; a backup export lists only `neohab:config`, so history stays out of backups;
 * and an import that replaces everything cannot destroy the history you would want it back from.
 *
 * There are two, and the split is what keeps reads cheap:
 *   - `neohab:history` holds the index and nothing else, so listing it is always tiny. Listing
 *     also answers "is there an index yet?" without asking for a component that may not exist -
 *     a missing one would answer 404, and the browser writes every 404 to the console whether or
 *     not the code expected it.
 *   - `neohab:historydata` holds the snapshots and the shared image bodies, fetched only by uid,
 *     and only for uids the index says are there. It is never listed except to rebuild the index.
 */
import { api, ApiError } from './client'
import { writeWithFallback } from './write'
import type { UIComponent } from './types'

export const HISTORY_NAMESPACE = 'neohab:history'
export const HISTORY_DATA_NAMESPACE = 'neohab:historydata'

const indexBase = '/rest/ui/components/' + HISTORY_NAMESPACE
const dataBase = '/rest/ui/components/' + HISTORY_DATA_NAMESPACE

/** Everything in the index namespace - empty on a server that has never captured anything. */
export function listIndexComponents(signal?: AbortSignal): Promise<UIComponent[]> {
  return api.get<UIComponent[]>(indexBase, { signal })
}

/** Every snapshot and image body. Only used to rebuild a lost index. */
export function listDataComponents(signal?: AbortSignal): Promise<UIComponent[]> {
  return api.get<UIComponent[]>(dataBase, { signal })
}

/** Fetch one snapshot or image body, or null when it is not there. */
export async function getDataComponent<C>(uid: string, signal?: AbortSignal): Promise<UIComponent<C> | null> {
  try {
    return await api.get<UIComponent<C>>(dataBase + '/' + encodeURIComponent(uid), { signal })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

/** Create or replace a component, given a hint about whether it is already there. */
function write<C>(base: string, component: UIComponent<C>, exists: boolean): Promise<void> {
  const path = base + '/' + encodeURIComponent(component.uid)
  const update = () => api.put(path, component)
  const create = () => api.post(base, component)
  const [first, second] = exists ? [update, create] : [create, update]
  return writeWithFallback(first, second)
}

export const putIndexComponent = <C>(component: UIComponent<C>, exists: boolean) => write(indexBase, component, exists)
export const putDataComponent = <C>(component: UIComponent<C>, exists: boolean) => write(dataBase, component, exists)

async function remove(base: string, uid: string): Promise<void> {
  try {
    await api.delete(base + '/' + encodeURIComponent(uid))
  } catch (err) {
    // Already gone is the outcome we wanted.
    if (err instanceof ApiError && err.status === 404) return
    throw err
  }
}

export const deleteIndexComponent = (uid: string) => remove(indexBase, uid)
export const deleteDataComponent = (uid: string) => remove(dataBase, uid)
