import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'dashboard'; id: string }
  | { name: 'settings' }
  | { name: 'chart'; dashboard: string; widget: string }
  | { name: 'log'; dashboard: string; widget: string }

// decodeURIComponent throws on a stray %, and this runs during App's own render - which is a blank page with
// no way back
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/'
  if (path === '/settings') return { name: 'settings' }
  const chart = /^\/c\/([^/]+)\/(.+)$/.exec(path)
  if (chart) {
    return { name: 'chart', dashboard: decodeSegment(chart[1]), widget: decodeSegment(chart[2]) }
  }
  const log = /^\/log\/([^/]+)\/(.+)$/.exec(path)
  if (log) {
    return { name: 'log', dashboard: decodeSegment(log[1]), widget: decodeSegment(log[2]) }
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
          : route.name === 'log'
            ? '/log/' + encodeURIComponent(route.dashboard) + '/' + encodeURIComponent(route.widget)
            : '/'
}
