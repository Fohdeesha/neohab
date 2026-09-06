import { describe, expect, it } from 'vitest'
import { buildDashboardManifest, manifestHref } from './webmanifest'
import { parseHash } from './router'

const PAGE = 'http://box:8080/neohab/index.html'

describe('buildDashboardManifest', () => {
  it('starts on the dashboard, not the dashboard list', () => {
    const m = buildDashboardManifest({ id: 'mobile', name: 'Mobile' }, PAGE + '#/d/mobile')
    expect(m.start_url).toBe('http://box:8080/neohab/index.html?app=mobile#/d/mobile')
    expect(m.scope).toBe('http://box:8080/neohab/')
  })

  it('names the shortcut after the dashboard', () => {
    const m = buildDashboardManifest({ id: 'mobile', name: 'Mobile' }, PAGE)
    expect(m.short_name).toBe('Mobile')
    expect(m.name).toBe('Mobile - neohab')
  })

  it('falls back to the id when the dashboard has no name', () => {
    const m = buildDashboardManifest({ id: 'kitchen', name: '  ' }, PAGE)
    expect(m.short_name).toBe('kitchen')
  })

  it('gives two dashboards two start_urls, ignoring the fragment', () => {
    const a = buildDashboardManifest({ id: 'mobile', name: 'Mobile' }, PAGE)
    const b = buildDashboardManifest({ id: 'kitchen', name: 'Kitchen' }, PAGE)
    const withoutHash = (m: Record<string, unknown>) => String(m.start_url).split('#')[0]
    // a browser strips the fragment before it decides two shortcuts are the same app
    expect(withoutHash(a)).not.toBe(withoutHash(b))
  })

  it('survives a dashboard id that needs escaping', () => {
    const id = 'Guest Room/1'
    const m = buildDashboardManifest({ id, name: 'Guest' }, PAGE)
    const start = new URL(String(m.start_url))
    expect(start.searchParams.get('app')).toBe(id)
    expect(parseHash(start.hash)).toEqual({ name: 'dashboard', id })
  })

  it('drops whatever query and hash the page already had', () => {
    const m = buildDashboardManifest({ id: 'mobile', name: 'Mobile' }, PAGE + '?theme=none#/d/other')
    expect(m.start_url).toBe('http://box:8080/neohab/index.html?app=mobile#/d/mobile')
  })

  it('points at icons the add-on serves, absolutely', () => {
    const m = buildDashboardManifest({ id: 'mobile', name: 'Mobile' }, PAGE)
    const icons = m.icons as { src: string; purpose: string }[]
    expect(icons.map((i) => i.src)).toEqual([
      'http://box:8080/neohab/pwa-192.png',
      'http://box:8080/neohab/pwa-512.png',
      'http://box:8080/neohab/pwa-maskable-512.png'
    ])
    expect(icons.filter((i) => i.purpose === 'maskable')).toHaveLength(1)
  })

  it('is a manifest a browser can read off the link', () => {
    const href = manifestHref({ id: 'mobile', name: 'Mobile' }, PAGE)
    expect(href.startsWith('data:application/manifest+json,')).toBe(true)
    const json = JSON.parse(decodeURIComponent(href.slice('data:application/manifest+json,'.length)))
    expect(json.display).toBe('standalone')
    expect(json.name).toBe('Mobile - neohab')
  })
})
