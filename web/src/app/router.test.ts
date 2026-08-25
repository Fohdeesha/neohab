import { describe, expect, it } from 'vitest'
import { parseHash } from './router'

describe('parseHash', () => {
  it('reads the routes the app produces', () => {
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/settings')).toEqual({ name: 'settings' })
    expect(parseHash('#/d/kitchen')).toEqual({ name: 'dashboard', id: 'kitchen' })
    expect(parseHash('#/c/kitchen/w-1')).toEqual({ name: 'chart', dashboard: 'kitchen', widget: 'w-1' })
  })

  it('decodes an escaped id', () => {
    expect(parseHash('#/d/' + encodeURIComponent('Bedroom Lighting'))).toEqual({
      name: 'dashboard',
      id: 'Bedroom Lighting',
    })
  })

  it('ignores a query suffix, which carries parameters and not the route', () => {
    expect(parseHash('#/d/kitchen?kiosk=on')).toEqual({ name: 'dashboard', id: 'kitchen' })
  })

  /*
   * A hash the app never writes but a person can: `navigate()` always encodes, so every one of
   * these arrives by hand, from a bookmark, or from a chat client that mangled a link. An
   * unguarded `decodeURIComponent` throws `URIError` on all of them, and it throws during App's
   * own render, which is a blank page with no way back.
   */
  it('does not throw on a malformed escape, from any route', () => {
    expect(() => parseHash('#/d/%')).not.toThrow()
    expect(() => parseHash('#/d/100%')).not.toThrow()
    expect(() => parseHash('#/d/%E0%A4%A')).not.toThrow()
    expect(() => parseHash('#/c/%/x')).not.toThrow()
    expect(() => parseHash('#/c/x/%')).not.toThrow()
  })

  it('keeps a segment it cannot decode, so the id simply matches no dashboard', () => {
    expect(parseHash('#/d/100%')).toEqual({ name: 'dashboard', id: '100%' })
    expect(parseHash('#/c/%/w%')).toEqual({ name: 'chart', dashboard: '%', widget: 'w%' })
  })
})
