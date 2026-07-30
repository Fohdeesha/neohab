/**
 * Minimal hash router. Routes: `#/` (home), `#/d/:id` (dashboard), `#/settings`, and
 * `#/c/:dashboardId/:widgetId` (one chart, full screen, with calendar navigation).
 */
import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'dashboard'; id: string }
  | { name: 'settings' }
  | { name: 'chart'; dashboard: string; widget: string }

function parse(hash: string): Route {
  // Tolerate a query suffix (`#/d/x?kiosk=on`): parameters are not part of the route.
  const path = hash.replace(/^#/, '').split('?')[0] || '/'
  if (path === '/settings') return { name: 'settings' }
  const chart = /^\/c\/([^/]+)\/(.+)$/.exec(path)
  if (chart) {
    return { name: 'chart', dashboard: decodeURIComponent(chart[1]), widget: decodeURIComponent(chart[2]) }
  }
  const m = /^\/d\/(.+)$/.exec(path)
  if (m) return { name: 'dashboard', id: decodeURIComponent(m[1]) }
  return { name: 'home' }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '#/'
  )
  return parse(hash)
}

export function navigate(route: Route): void {
  window.location.hash =
    route.name === 'dashboard'
      ? '/d/' + encodeURIComponent(route.id)
      : route.name === 'settings'
        ? '/settings'
        : route.name === 'chart'
          ? '/c/' + encodeURIComponent(route.dashboard) + '/' + encodeURIComponent(route.widget)
          : '/'
}
