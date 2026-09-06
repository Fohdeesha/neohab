// two namespaces: the index alone stays cheap to list, and snapshots are only ever fetched by uid
import { api, ApiError } from './client'
import { writeWithFallback } from './write'
import type { UIComponent } from './types'

export const HISTORY_NAMESPACE = 'neohab:history'
export const HISTORY_DATA_NAMESPACE = 'neohab:historydata'

const indexBase = '/rest/ui/components/' + HISTORY_NAMESPACE
const dataBase = '/rest/ui/components/' + HISTORY_DATA_NAMESPACE

export function listIndexComponents(signal?: AbortSignal): Promise<UIComponent[]> {
  return api.get<UIComponent[]>(indexBase, { signal })
}

export function listDataComponents(signal?: AbortSignal): Promise<UIComponent[]> {
  return api.get<UIComponent[]>(dataBase, { signal })
}

export async function getDataComponent<C>(uid: string, signal?: AbortSignal): Promise<UIComponent<C> | null> {
  try {
    return await api.get<UIComponent<C>>(dataBase + '/' + encodeURIComponent(uid), { signal })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

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
    if (err instanceof ApiError && err.status === 404) return
    throw err
  }
}

export const deleteIndexComponent = (uid: string) => remove(indexBase, uid)
export const deleteDataComponent = (uid: string) => remove(dataBase, uid)
