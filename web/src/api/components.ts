/**
 * CRUD for UI components in a namespace (`/rest/ui/components/{namespace}`).
 * neohab stores all its configuration under the `neohab:config` namespace as granular root
 * components (settings, per-dashboard, per-theme, per-widget-definition). Reads are public;
 * writes require an admin token.
 */
import { api } from './client'
import type { UIComponent } from './types'

export const NAMESPACE = 'neohab:config'

export function listComponents(signal?: AbortSignal): Promise<UIComponent[]> {
  return api.get<UIComponent[]>('/rest/ui/components/' + NAMESPACE, { signal })
}

export function getComponent(uid: string, signal?: AbortSignal): Promise<UIComponent> {
  return api.get<UIComponent>('/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(uid), {
    signal,
  })
}

export function addComponent<C>(component: UIComponent<C>): Promise<UIComponent<C>> {
  return api.post<UIComponent<C>>('/rest/ui/components/' + NAMESPACE, component, { auth: true })
}

export function updateComponent<C>(component: UIComponent<C>): Promise<UIComponent<C>> {
  return api.put<UIComponent<C>>(
    '/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(component.uid),
    component,
    { auth: true }
  )
}

export function deleteComponent(uid: string): Promise<void> {
  return api.delete<void>('/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(uid), {
    auth: true,
  })
}

/** Upsert: PUT if it exists, otherwise POST. */
export async function saveComponent<C>(component: UIComponent<C>): Promise<UIComponent<C>> {
  try {
    await getComponent(component.uid)
    return await updateComponent(component)
  } catch {
    return await addComponent(component)
  }
}
