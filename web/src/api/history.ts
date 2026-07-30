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

/**
 * Create or replace a component, given a hint about whether it is already there.
 *
 * The hint saves a round trip but is never trusted: openHAB answers a create for an existing uid
 * with a 500 and an update of a missing one with a 404, and either can happen legitimately when a
 * second administrator is editing at the same time. Whichever verb the hint chose, the other one
 * is tried before giving up - and the first failure is what gets reported, since the fallback's
 * error would only describe the symptom.
 */
async function write<C>(base: string, component: UIComponent<C>, exists: boolean): Promise<void> {
  const path = base + '/' + encodeURIComponent(component.uid)
  const update = () => api.put(path, component)
  const create = () => api.post(base, component)
  const [first, second] = exists ? [update, create] : [create, update]
  try {
    await first()
  } catch (err) {
    try {
      await second()
    } catch {
      throw err
    }
  }
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
