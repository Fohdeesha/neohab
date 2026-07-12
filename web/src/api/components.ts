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

/** List components from an arbitrary namespace (e.g. reading habpanel:panelconfig). */
export function listComponentsIn(namespace: string, signal?: AbortSignal): Promise<UIComponent[]> {
  return api.get<UIComponent[]>('/rest/ui/components/' + encodeURIComponent(namespace), { signal })
}

export function getComponent(uid: string, signal?: AbortSignal): Promise<UIComponent> {
  return api.get<UIComponent>('/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(uid), {
    signal,
  })
}

export function addComponent<C>(component: UIComponent<C>): Promise<UIComponent<C>> {
  return api.post<UIComponent<C>>('/rest/ui/components/' + NAMESPACE, component)
}

export function updateComponent<C>(component: UIComponent<C>): Promise<UIComponent<C>> {
  return api.put<UIComponent<C>>(
    '/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(component.uid),
    component
  )
}

export function deleteComponent(uid: string): Promise<void> {
  return api.delete<void>('/rest/ui/components/' + NAMESPACE + '/' + encodeURIComponent(uid))
}

