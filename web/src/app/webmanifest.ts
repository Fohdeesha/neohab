/**
 * A home-screen shortcut made from a dashboard should open that dashboard.
 *
 * Browsers take the shortcut's address from the manifest's start_url, not from the page you were
 * looking at, and the manifest we ship is a static file - so every shortcut landed on the
 * dashboard list. The manifest for a dashboard route is built here instead and swapped in as a
 * data: URL, which Chrome parses with no errors and still counts as installable.
 *
 * start_url carries the dashboard twice on purpose. The hash is the route; the ?app= copy is
 * there because a browser strips the fragment when it works out an app's identity, so two
 * dashboards differing only after the # would install as the same app - and because a launcher
 * that drops the fragment can still be told which dashboard was meant (see applyLaunchQuery).
 */

export type ManifestDashboard = { id: string; name: string }

const ICONS = [
  { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

export function buildDashboardManifest(dashboard: ManifestDashboard, pageUrl: string): Record<string, unknown> {
  const here = new URL(pageUrl)
  here.hash = ''
  here.search = ''
  const start = new URL(here.href)
  start.searchParams.set('app', dashboard.id)
  start.hash = '/d/' + encodeURIComponent(dashboard.id)
  const label = dashboard.name.trim() || dashboard.id

  // no id member: a browser falls back to start_url, which ?app= already makes one per dashboard
  return {
    name: `${label} - neohab`,
    short_name: label,
    description: 'Dashboards for openHAB',
    start_url: start.href,
    scope: new URL('./', here).href,
    display: 'standalone',
    background_color: '#0f1317',
    theme_color: '#0f1317',
    icons: ICONS.map((i) => ({ ...i, src: new URL(i.src, here).href }))
  }
}

export function manifestHref(dashboard: ManifestDashboard, pageUrl: string): string {
  return 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(buildDashboardManifest(dashboard, pageUrl)))
}

let shippedHref: string | null = null

/**
 * Already running as an installed app? Then there is no add-to-home-screen to serve, and a browser
 * that spotted a different manifest under an installed app might take it for an update and rename
 * the icon somebody already has.
 */
function installedHere(): boolean {
  if (typeof window.matchMedia !== 'function') return false
  // standalone and nothing else: an installed neohab is always standalone, where a browser at
  // F11 reports fullscreen and is still just a browser
  return window.matchMedia('(display-mode: standalone)').matches
}

/** Point the document at this dashboard's manifest, or back at the one the add-on ships. */
export function syncAppManifest(dashboard: ManifestDashboard | null): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) return
  if (shippedHref === null) shippedHref = link.href
  const href = dashboard && !installedHere() ? manifestHref(dashboard, window.location.href) : shippedHref
  if (link.href !== href) link.href = href
}

/** iOS names a shortcut after the page, not the manifest. */
export function syncTitle(dashboard: ManifestDashboard | null): void {
  const label = dashboard ? dashboard.name.trim() || dashboard.id : ''
  document.title = label ? `${label} - neohab` : 'neohab'
}
