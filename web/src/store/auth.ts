/**
 * Who is this device signed in as, and is it an administrator?
 *
 * openHAB has no "who am I" endpoint that works for both login modes, so the answer comes from
 * a probe: `GET /rest/persistence` is the cheapest admin-only read the core API offers (a short
 * list of persistence service ids, admin-gated on both OH 4.x and 5.x - verified live against
 * 4.3.7). 200 means the credentials carry the administrator role; 401/403 means they are
 * user-level. Devices with no stored credentials at all skip the probe entirely, so anonymous
 * wall panels never pay for it.
 *
 * The status drives which editing affordances render (see `useEditingAllowed`): with the
 * `lockEditing` setting on, only administrator devices see the pencil and the config-changing
 * parts of Settings.
 */
import { create } from 'zustand'
import { api, ApiError } from '../api/client'
import { isLoggedIn } from '../api/auth'
import { useConfigStore } from './config'

export type AuthStatus =
  | 'unknown' // probe not run yet, or it failed for a non-auth reason (server unreachable)
  | 'anonymous' // no stored credentials on this device
  | 'user' // credentials present but rejected for admin reads
  | 'admin'

export const useAuthStore = create<{ status: AuthStatus }>(() => ({ status: 'unknown' }))

// Guards against a probe that was in flight when the credentials changed: only the newest
// call may write the result (signing out mid-probe must not end up looking signed in).
let generation = 0

/** (Re)establish the auth status. Call at boot and after any sign-in or sign-out. */
export async function refreshAuthStatus(): Promise<void> {
  const gen = ++generation
  if (!isLoggedIn()) {
    useAuthStore.setState({ status: 'anonymous' })
    return
  }
  try {
    await api.get('/rest/persistence')
    if (gen === generation) useAuthStore.setState({ status: 'admin' })
  } catch (err: unknown) {
    if (gen !== generation) return
    // Only 401/403 are real answers. Anything else (network, server restarting) leaves the
    // status unknown, which the UI treats like the pre-probe behavior instead of locking a
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
 * Administrators always edit. Without the `lockEditing` setting everyone still sees the
 * affordances - tapping them prompts for a sign-in, which is how a fresh install gets edited
 * in the first place. With the lock on, non-admin devices show none of it (Settings > Account
 * remains the way to sign in on such a device).
 */
export function useEditingAllowed(): boolean {
  const admin = useAuthStore((s) => s.status === 'admin')
  const locked = useConfigStore((s) => s.settings.lockEditing === true)
  return admin || !locked
}
