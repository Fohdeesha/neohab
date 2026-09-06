import { api } from './client'
import type { UIComponent } from './types'

export const NAMESPACE = 'neohab:config'

// a proxy that lost its upstream answers an error PAGE with status 200, so check this really is a list
function asComponentList(value: unknown): UIComponent[] {
  if (Array.isArray(value)) return value as UIComponent[]
  throw new Error('The server answered with something that is not a component list')
}

export async function listComponents(signal?: AbortSignal): Promise<UIComponent[]> {
  return asComponentList(await api.get<unknown>('/rest/ui/components/' + NAMESPACE, { signal }))
}

export async function listComponentsIn(namespace: string, signal?: AbortSignal): Promise<UIComponent[]> {
  return asComponentList(await api.get<unknown>('/rest/ui/components/' + encodeURIComponent(namespace), { signal }))
}

export function addComponent<C>(component: UIComponent<C>): Promise<UIComponent<C>> {
  return api.post<UIComponent<C>>('/rest/ui/components/' + NAMESPACE, component)
}

export function updateComponent<C>(component: UIComponent<C>): Promise<UIComponent<C>> {
  return api.put<UIComponent<C>>('/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(component.uid), component)
}

export function deleteComponent(uid: string): Promise<void> {
  return api.delete<void>('/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(uid))
}
