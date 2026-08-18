import { describe, expect, it } from 'vitest'
import { editingAllowed, jwtRoles, useAuthStore, type AuthStatus } from './auth'
import { useConfigStore, type AppSettings } from './config'

const b64url = (obj: unknown) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

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

  it('always lets an administrator device edit', () => {
    expect(withState('admin', {})).toBe(true)
    expect(withState('admin', { allowAnonymousEditing: true })).toBe(true)
  })

  it('locks everyone else by default - absent means locked', () => {
    expect(withState('anonymous', {})).toBe(false)
    expect(withState('user', {})).toBe(false)
    expect(withState('unknown', {})).toBe(false)
  })

  it('opens every device when allowAnonymousEditing is on', () => {
    expect(withState('anonymous', { allowAnonymousEditing: true })).toBe(true)
    expect(withState('user', { allowAnonymousEditing: true })).toBe(true)
  })

  it('only true opens it - stored junk stays locked', () => {
    expect(withState('anonymous', { allowAnonymousEditing: 'yes' as unknown as boolean })).toBe(false)
    expect(withState('anonymous', { allowAnonymousEditing: 1 as unknown as boolean })).toBe(false)
  })

  it('ignores the retired lockEditing key: a config that had the lock off no longer opens editing', () => {
    expect(withState('anonymous', { lockEditing: false })).toBe(false)
    expect(withState('anonymous', { lockEditing: true })).toBe(false)
  })
})
