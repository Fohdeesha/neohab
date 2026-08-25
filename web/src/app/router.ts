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

/**
 * One path segment as the app meant it, or the raw segment when it cannot be decoded.
 *
 * `decodeURIComponent` throws `URIError` on a stray `%` - and `#/d/100%` is a hash a person can
 * type, a bookmark can hold and a chat client can produce by mangling a link. `navigate()` always
 * encodes, so the app itself never writes one, which is exactly why this went unseen. It matters
 * because `useRoute()` runs during App's own render: the throw unmounts the whole tree, and a
 * blank page has no way back to a working route.
 *
 * Keeping the raw text is the right answer rather than a diagnostic: an id that decodes to
 * nothing sensible matches no dashboard, which is already a screen that says so and offers a way
 * home.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function parseHash(hash: string): Route {
  // Tolerate a query suffix (`#/d/x?kiosk=on`): parameters are not part of the route.
  const path = hash.replace(/^#/, '').split('?')[0] || '/'
  if (path === '/settings') return { name: 'settings' }
  const chart = /^\/c\/([^/]+)\/(.+)$/.exec(path)
  if (chart) {
    return { name: 'chart', dashboard: decodeSegment(chart[1]), widget: decodeSegment(chart[2]) }
  }
  const m = /^\/d\/(.+)$/.exec(path)
  if (m) return { name: 'dashboard', id: decodeSegment(m[1]) }
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
  return parseHash(hash)
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
