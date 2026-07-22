/**
 * Authentication for neohab.
 *
 * openHAB uses OAuth2 authorization-code + PKCE. The `/auth` login page is served by
 * openHAB core (not by any UI), so neohab runs its own flow:
 *   1. `authorize()` redirects the browser to `/auth?...&code_challenge=...`
 *   2. core redirects back with `?code=...&state=...`
 *   3. `completeLogin()` exchanges the code at `/rest/auth/token` for tokens
 *   4. the refresh token is persisted; access tokens are refreshed on demand
 *
 * Reverse-proxy quirk (openHAB Cloud): when the `X-OPENHAB-AUTH-HEADER` cookie is present the
 * token must be sent as `X-OPENHAB-TOKEN` instead of `Authorization: Bearer`.
 *
 * Reading items and sending commands work unauthenticated when the server allows the implicit
 * user role (default). A token is only required for admin operations such as saving config.
 */

import { sha256 } from './sha256'

const STORAGE_REFRESH = 'neohab:refreshToken'
const STORAGE_API_TOKEN = 'neohab:apiToken'
const SESSION_VERIFIER = 'neohab:codeVerifier'
const SESSION_STATE = 'neohab:authState'

// neohab shares an origin with openHAB, so Main UI's refresh token (if the user is signed in
// there) can be reused for silent SSO.
const MAINUI_REFRESH = 'openhab.ui:refreshToken'

let accessToken: string | null = null
let accessTokenExpiry = 0
let refreshInFlight: Promise<void> | null = null

export function tokenInCustomHeader(): boolean {
  return document.cookie.includes('X-OPENHAB-AUTH-HEADER')
}

// Main UI's token is not ours to delete when it turns out to be dead; just stop using it.
let mainUiRefreshDead = false

export function getRefreshToken(): string | null {
  return (
    localStorage.getItem(STORAGE_REFRESH) ??
    (mainUiRefreshDead ? null : localStorage.getItem(MAINUI_REFRESH))
  )
}

/**
 * openHAB API tokens (prefix "oh.") are accepted by the server as Bearer tokens and never
 * expire client-side. Intended for kiosk devices and headless setups.
 */
export function getApiToken(): string | null {
  return localStorage.getItem(STORAGE_API_TOKEN)
}

export function setApiToken(token: string): void {
  localStorage.setItem(STORAGE_API_TOKEN, token.trim())
}

export function clearApiToken(): void {
  localStorage.removeItem(STORAGE_API_TOKEN)
}

export function isLoggedIn(): boolean {
  return getApiToken() !== null || getRefreshToken() !== null
}

/**
 * The OAuth redirect target: this page without query or hash. The token endpoint compares
 * redirect_uri by exact string equality, and a fragment in it would swallow the `?code=...`
 * (the auth page appends the query to whatever it is given), so it must stay clean.
 */
function redirectUri(): string {
  return window.location.origin + window.location.pathname
}

/** Apply the current access token to a set of request headers, if we have one. */
export function applyAuthHeader(headers: Headers, token: string): void {
  if (tokenInCustomHeader()) {
    headers.set('X-OPENHAB-TOKEN', token)
  } else {
    headers.set('Authorization', 'Bearer ' + token)
  }
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const bytes = new TextEncoder().encode(verifier)
  // SubtleCrypto only exists in secure contexts; a LAN openHAB over plain HTTP is not one,
  // and the login button must work there too - fall back to the bundled SHA-256.
  const digest = crypto.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    : sha256(bytes)
  return { verifier, challenge: base64url(digest) }
}

/** Begin the login flow by redirecting to openHAB's authorization page. */
export async function authorize(): Promise<void> {
  const { verifier, challenge } = await makePkce()
  const state = base64url(crypto.getRandomValues(new Uint8Array(8)))
  sessionStorage.setItem(SESSION_VERIFIER, verifier)
  sessionStorage.setItem(SESSION_STATE, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: window.location.origin,
    redirect_uri: redirectUri(),
    scope: 'admin',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.href = '/auth?' + params.toString()
}

async function requestToken(body: Record<string, string>): Promise<void> {
  const res = await fetch('/rest/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  if (!res.ok) {
    // A rejected refresh token is dead for good (revoked/expired session) - forget it so we
    // don't retry a doomed refresh before every request from now on.
    if (body.grant_type === 'refresh_token' && (res.status === 400 || res.status === 401)) {
      localStorage.removeItem(STORAGE_REFRESH)
    }
    throw new Error('Token request failed: ' + res.status)
  }
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  accessToken = data.access_token
  accessTokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000
  if (data.refresh_token) localStorage.setItem(STORAGE_REFRESH, data.refresh_token)
}

/**
 * If the URL carries an auth `code`, complete the exchange. Returns true if a login was
 * completed (caller should strip the query string).
 */
export async function completeLogin(): Promise<boolean> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code) return false
  if (state !== sessionStorage.getItem(SESSION_STATE)) throw new Error('Auth state mismatch')

  const verifier = sessionStorage.getItem(SESSION_VERIFIER)
  if (!verifier) throw new Error('Missing PKCE verifier')
  sessionStorage.removeItem(SESSION_VERIFIER)
  sessionStorage.removeItem(SESSION_STATE)

  await requestToken({
    grant_type: 'authorization_code',
    client_id: window.location.origin,
    redirect_uri: redirectUri(),
    code,
    code_verifier: verifier,
  })
  return true
}

/** Return a valid access token, refreshing if needed. Null if not logged in. */
export async function getAccessToken(): Promise<string | null> {
  const apiToken = getApiToken()
  if (apiToken) return apiToken

  if (accessToken && Date.now() < accessTokenExpiry) return accessToken
  const refresh = getRefreshToken()
  if (!refresh) return null

  // De-duplicate concurrent refreshes: all callers await the same request.
  refreshInFlight ??= requestToken({
    grant_type: 'refresh_token',
    client_id: window.location.origin,
    refresh_token: refresh,
  }).finally(() => {
    refreshInFlight = null
  })

  try {
    await refreshInFlight
    return accessToken
  } catch {
    if (refresh === localStorage.getItem(MAINUI_REFRESH)) mainUiRefreshDead = true
    return null
  }
}

export function logout(): void {
  const refresh = localStorage.getItem(STORAGE_REFRESH)
  accessToken = null
  accessTokenExpiry = 0
  localStorage.removeItem(STORAGE_REFRESH)
  if (refresh) {
    void fetch('/rest/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: refresh }).toString(),
    })
  }
}
