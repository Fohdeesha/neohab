import { create } from 'zustand'
import { api, ApiError } from '../api/client'
import { getAccessToken, getApiToken, isLoggedIn } from '../api/auth'
import { forgetPersistenceServices } from '../api/persistence'
import { forgetWebAudioSink } from '../api/audioEvents'

export type AuthStatus =
  | 'unknown' // probe not run yet, or it failed for a non-auth reason (server unreachable)
  | 'anonymous' // no stored credentials on this device
  | 'user' // credentials present but rejected for admin reads
  | 'admin'

export const useAuthStore = create<{ status: AuthStatus }>(() => ({ status: 'unknown' }))

export function jwtRoles(token: string): string[] | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: unknown }
    if (Array.isArray(payload.role)) return payload.role.map(String)
    if (typeof payload.role === 'string') return [payload.role]
    return null
  } catch {
    return null
  }
}

// only the newest probe may write the result, or signing out mid-check restores the old status
let generation = 0

export async function refreshAuthStatus(): Promise<void> {
  const gen = ++generation
  forgetPersistenceServices()
  forgetWebAudioSink()
  if (!isLoggedIn()) {
    useAuthStore.setState({ status: 'anonymous' })
    return
  }

  if (!getApiToken()) {
    const token = await getAccessToken()
    if (gen !== generation) return
    const roles = token ? jwtRoles(token) : null
    if (roles) {
      useAuthStore.setState({ status: roles.includes('administrator') ? 'admin' : 'user' })
      return
    }
  }

  try {
    await api.get('/rest/persistence')
    if (gen === generation) useAuthStore.setState({ status: 'admin' })
  } catch (err: unknown) {
    if (gen !== generation) return
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      useAuthStore.setState({ status: 'user' })
    } else {
      useAuthStore.setState({ status: 'unknown' })
    }
  }
}

export function useIsAdmin(): boolean {
  return useAuthStore((s) => s.status === 'admin')
}

export function useEditingAllowed(): boolean {
  return allowed(useAuthStore((s) => s.status))
}

export function editingAllowed(): boolean {
  return allowed(useAuthStore.getState().status)
}

function allowed(status: AuthStatus): boolean {
  return status === 'admin' || (status === 'unknown' && isLoggedIn())
}
