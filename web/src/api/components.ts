/**
 * CRUD for UI components in a namespace (`/rest/ui/components/{namespace}`).
 * neohab stores all its configuration under the `neohab:config` namespace as granular root
 * components (settings, per-dashboard, per-theme, per-widget-definition). Reads are public;
 * writes require an admin token.
 */
import { api } from './client'
import type { UIComponent } from './types'

export const NAMESPACE = 'neohab:config'

/**
 * A list, or a clear error saying it was not one.
 *
 * A reverse proxy that has lost its upstream answers a captive-portal or error PAGE with status
 * 200, and `res.json()` never sees it because the content type is not JSON - so what came back was
 * a string, and the first thing the store did with it was `.map`. The configuration screen then
 * read "The configuration could not be loaded: e.map is not a function", which points at nothing a
 * person can act on. Checked here, once, for both callers.
 */
function asComponentList(value: unknown): UIComponent[] {
  if (Array.isArray(value)) return value as UIComponent[]
  throw new Error('The server answered with something that is not a component list')
}

export async function listComponents(signal?: AbortSignal): Promise<UIComponent[]> {
  return asComponentList(await api.get<unknown>('/rest/ui/components/' + NAMESPACE, { signal }))
}

/** List components from an arbitrary namespace (e.g. reading habpanel:panelconfig). */
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
