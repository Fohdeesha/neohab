import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'dashboard'; id: string }
  | { name: 'settings'; section?: string }
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
  const settings = /^\/settings(?:\/([^/]+))?$/.exec(path)
  if (settings) return settings[1] ? { name: 'settings', section: decodeSegment(settings[1]) } : { name: 'settings' }
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

/**
 * A home-screen shortcut's start_url names its dashboard in ?app= as well as in the hash, so a
 * launcher that drops the fragment still opens the right one. Runs once at boot, before anything
 * else can navigate; replaceState rather than a hash assignment so it leaves no history step to
 * go back to.
 */
export function applyLaunchQuery(): void {
  try {
    const id = new URLSearchParams(window.location.search).get('app')
    if (!id) return
    if (parseHash(window.location.hash).name !== 'home') return
    const { pathname, search } = window.location
    history.replaceState(null, '', pathname + search + '#/d/' + encodeURIComponent(id))
  } catch {
    // replaceState throws on an opaque origin, and this runs before anything can catch for us
  }
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
        ? '/settings' + (route.section ? '/' + encodeURIComponent(route.section) : '')
        : route.name === 'chart'
          ? '/c/' + encodeURIComponent(route.dashboard) + '/' + encodeURIComponent(route.widget)
          : route.name === 'log'
            ? '/log/' + encodeURIComponent(route.dashboard) + '/' + encodeURIComponent(route.widget)
            : '/'
}
