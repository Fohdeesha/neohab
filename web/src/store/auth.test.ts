import { afterEach, describe, expect, it, vi } from 'vitest'
import { editingAllowed, jwtRoles, useAuthStore, type AuthStatus } from './auth'
import { useConfigStore, type AppSettings } from './config'

const b64url = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const jwt = (payload: unknown) => `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`

describe('jwtRoles', () => {
  it('reads the role list out of an openHAB session token', () => {
    expect(jwtRoles(jwt({ sub: 'jon', role: ['administrator', 'user'] }))).toEqual(['administrator', 'user'])
  })

  it('accepts a payload whose base64url needs re-padding', () => {
    // A 2-char-mod-4 payload: {"role":["user"]} happens to produce one; assert on behavior, not luck.
    const token = jwt({ role: ['user'] })
    expect(jwtRoles(token)).toEqual(['user'])
  })

  it('accepts a single string role', () => {
    expect(jwtRoles(jwt({ role: 'administrator' }))).toEqual(['administrator'])
  })

  it('answers null for an opaque API token', () => {
    expect(jwtRoles('oh.mytoken.4fbf1a2c9d')).toBeNull()
  })

  it('answers null for garbage and for a payload without roles', () => {
    expect(jwtRoles('not-a-jwt')).toBeNull()
    expect(jwtRoles('a.b')).toBeNull()
    expect(jwtRoles(jwt({ sub: 'jon' }))).toBeNull()
    expect(jwtRoles('x.%%%%.y')).toBeNull()
  })
})

describe('editingAllowed', () => {
  const withState = (status: AuthStatus, settings: Partial<AppSettings> & Record<string, unknown>) => {
    useAuthStore.setState({ status })
    useConfigStore.setState({ settings: { version: 1, theme: 'dark', ...settings } as AppSettings })
    return editingAllowed()
  }

  /** A device holding an API token. Node has no localStorage, so it is stood in for. */
  const withStoredToken = (fn: () => void) => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'neohab:apiToken' ? 'oh.test' : null),
      setItem: () => {},
      removeItem: () => {}
    })
    fn()
  }
  afterEach(() => vi.unstubAllGlobals())

  it('lets an administrator device edit', () => {
    expect(withState('admin', {})).toBe(true)
  })

  it('everyone else is view-only', () => {
    expect(withState('anonymous', {})).toBe(false)
    expect(withState('user', {})).toBe(false)
    expect(withState('unknown', {})).toBe(false)
  })

  /**
   * 'unknown' is the probe not having answered, or having failed for a reason that says nothing
   * about the account. A device with credentials keeps its affordances through that rather than
   * being locked out of its own panel by a hiccup; a device with none is offered nothing.
   */
  it('keeps a credentialed device editing while the probe has not answered', () => {
    withStoredToken(() => {
      expect(withState('unknown', {})).toBe(true)
      // Still not enough on its own: a probe that came back "not an administrator" is an answer.
      expect(withState('user', {})).toBe(false)
      expect(withState('anonymous', {})).toBe(false)
    })
  })

  it('ignores both retired keys: neither an unlocked lockEditing nor the removed switch opens editing', () => {
    expect(withState('anonymous', { lockEditing: false })).toBe(false)
    expect(withState('anonymous', { lockEditing: true })).toBe(false)
    expect(withState('anonymous', { allowAnonymousEditing: true })).toBe(false)
    expect(withState('user', { allowAnonymousEditing: true })).toBe(false)
  })
})
