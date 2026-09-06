import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

async function withUrl(href: string): Promise<typeof import('./urlTheme')> {
  const url = new URL(href)
  vi.stubGlobal('window', { location: { hash: url.hash, search: url.search } })
  vi.resetModules()
  return import('./urlTheme')
}

const BASE = 'http://server:8080/neohab/index.html'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('the ?theme= escape hatch', () => {
  it('is off when the parameter is absent', async () => {
    const m = await withUrl(`${BASE}#/d/kitchen`)
    expect(m.urlThemeForced).toBe(false)
    expect(m.urlThemeId).toBe(null)
  })

  it('reads it from the query string, which is what a kiosk browser has pinned', async () => {
    const m = await withUrl(`${BASE}?theme=none#/d/kitchen`)
    expect(m.urlThemeForced).toBe(true)
    expect(m.urlThemeId).toBe('none')
  })

  it('reads it from inside the hash, which is what a person types on the end', async () => {
    const m = await withUrl(`${BASE}#/settings?theme=none`)
    expect(m.urlThemeId).toBe('none')
  })

  it('prefers the hash, so the one just typed wins over one already in the address', async () => {
    const m = await withUrl(`${BASE}?theme=light#/settings?theme=none`)
    expect(m.urlThemeId).toBe('none')
  })

  it('takes a named built-in too', async () => {
    expect((await withUrl(`${BASE}?theme=light`)).urlThemeId).toBe('light')
  })

  it('treats an empty value as present, not absent', async () => {
    const m = await withUrl(`${BASE}?theme=`)
    expect(m.urlThemeForced).toBe(true)
    expect(m.urlThemeId).toBe('')
  })

  it('is not confused by another parameter of a similar name', async () => {
    expect((await withUrl(`${BASE}?themex=none&kiosk=on`)).urlThemeForced).toBe(false)
  })

  it('survives a route with no query at all', async () => {
    expect((await withUrl(`${BASE}#/`)).urlThemeForced).toBe(false)
  })
})
