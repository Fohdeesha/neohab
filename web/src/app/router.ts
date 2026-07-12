/** Minimal hash router. Routes: `#/` (home), `#/d/:id` (dashboard), `#/settings`. */
import { useSyncExternalStore } from 'react'

export type Route = { name: 'home' } | { name: 'dashboard'; id: string } | { name: 'settings' }

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/settings') return { name: 'settings' }
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
        : '/'
}
