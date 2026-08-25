/**
 * Who is this device signed in as, and is it an administrator?
 *
 * This only decides which editing affordances render (see `useEditingAllowed`) - the server
 * enforces the administrator role on every write regardless, so nothing here is a security
 * boundary.
 *
 * Two answers, matching openHAB's two credential kinds:
 *   - openHAB logins issue JWT access tokens whose payload carries the account's roles (the
 *     same claim Main UI reads), so the role comes straight out of the token - no request.
 *   - API tokens ("oh." prefix) are opaque by design and openHAB has no endpoint that reports
 *     a token's scope, so the only way to learn is to use it once: `GET /rest/persistence` is
 *     the cheapest admin-only read in core (a short list of service ids, admin-gated on both
 *     OH 4.x and 5.x - verified live against 4.3.7). 200 = admin, 401/403 = user-level.
 * Devices with no stored credentials skip both paths, so anonymous wall panels pay nothing.
 */
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

/**
 * The roles claimed by an openHAB JWT access token, or null when the token is not a decodable
 * JWT (API tokens, or a future format change - callers then fall back to the probe). Reading
 * a forged claim gains nothing: it only un-hides buttons whose requests the server refuses.
 */
export function jwtRoles(token: string): string[] | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    // base64url, and JWTs omit the padding atob insists on
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

// Guards against an async check that was in flight when the credentials changed: only the
// newest call may write the result (signing out mid-check must not end up looking signed in).
let generation = 0

/** (Re)establish the auth status. Call at boot and after any sign-in or sign-out. */
export async function refreshAuthStatus(): Promise<void> {
  const gen = ++generation
  // Both of these memoise a probe for the whole session, and both can be role-gated on some
  // deployments - so a device that asked while signed out would keep the anonymous answer for
  // ever. This is the one function that runs on every credential change, which makes it the
  // place to forget them. (`forgetPersistenceServices` had existed for exactly this and was
  // called from nowhere.)
  forgetPersistenceServices()
  forgetWebAudioSink()
  if (!isLoggedIn()) {
    useAuthStore.setState({ status: 'anonymous' })
    return
  }

  // Login sessions: the role is right in the access token.
  if (!getApiToken()) {
    const token = await getAccessToken()
    if (gen !== generation) return
    const roles = token ? jwtRoles(token) : null
    if (roles) {
      useAuthStore.setState({ status: roles.includes('administrator') ? 'admin' : 'user' })
      return
    }
    // No usable token (dead refresh, undecodable) - fall through to the probe, which then
    // reports what the server actually accepts.
  }

  try {
    await api.get('/rest/persistence')
    if (gen === generation) useAuthStore.setState({ status: 'admin' })
  } catch (err: unknown) {
    if (gen !== generation) return
    // Only 401/403 are real answers. Anything else (network, server restarting) leaves the
    // status unknown, which the UI treats like the pre-check behavior instead of locking a
    // legitimately signed-in admin out on a hiccup.
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

/**
 * Should this device show editing affordances (the dashboard pencil, the new-dashboard tile,
 * the config-changing Settings sections)?
 *
 * Administrator devices only, like openHAB's own UIs: everyone else gets a view-only panel -
 * widgets still work, nothing about the panel itself can be changed, and Settings > Account is
 * the way in. The server enforces the same rule on every write regardless; this only decides
 * what renders, which is why it stays a separate name from `useIsAdmin`: it is the policy
 * seam, not a role check.
 */
export function useEditingAllowed(): boolean {
  return useAuthStore((s) => s.status === 'admin')
}

/** The same answer outside a component, for handlers deciding between the editor and a sign-in. */
export function editingAllowed(): boolean {
  return useAuthStore.getState().status === 'admin'
}
