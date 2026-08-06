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
 * Reverse-proxy sign-in: a proxy in front of openHAB (openHAB Cloud, or an nginx with basic auth)
 * wants `Authorization: Basic ...` for itself, which is why an openHAB token then has to travel in
 * `X-OPENHAB-TOKEN`. Those credentials are held in memory only - never in our own storage - and can
 * optionally be remembered by the browser's own password manager, or handed to us by the openHAB
 * phone app through `window.OHApp`. Note EventSource cannot carry headers at all, so live item
 * states behind such a proxy depend on the browser's own credential caching for that connection.
 *
 * Reading items and sending commands work unauthenticated when the server allows the implicit
 * user role (default). A token is only required for admin operations such as saving config.
 */

import { ohUrl } from './base'
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

export interface BasicCredentials {
  id: string
  password: string
}

/** In memory for this page only: a password does not belong in localStorage. */
let basicCredentials: BasicCredentials | null = null
const basicListeners = new Set<() => void>()

export function getBasicCredentials(): BasicCredentials | null {
  return basicCredentials
}

export function onBasicCredentialsChange(fn: () => void): () => void {
  basicListeners.add(fn)
  return () => basicListeners.delete(fn)
}

function announceBasic(): void {
  for (const fn of [...basicListeners]) fn()
}

export function setBasicCredentials(id: string, password: string): void {
  basicCredentials = id ? { id, password } : null
  announceBasic()
}

export function clearBasicCredentials(): void {
  basicCredentials = null
  announceBasic()
}

/** Offer the credentials to the browser's password manager, where it supports one. */
export async function rememberBasicCredentials(): Promise<boolean> {
  const creds = basicCredentials
  const ctor = (window as { PasswordCredential?: new (data: BasicCredentials) => Credential }).PasswordCredential
  if (!creds || !ctor || !navigator.credentials?.store) return false
  try {
    await navigator.credentials.store(new ctor(creds))
    return true
  } catch {
    return false
  }
}

/**
 * Pick up proxy credentials without asking: from the openHAB phone app's webview bridge, or
 * silently from the browser's password manager. Called once at startup.
 */
export async function restoreBasicCredentials(): Promise<boolean> {
  const app = (window as { OHApp?: { getBasicCredentialsUsername?: () => string; getBasicCredentialsPassword?: () => string } }).OHApp
  if (typeof app?.getBasicCredentialsUsername === 'function' && typeof app.getBasicCredentialsPassword === 'function') {
    const id = app.getBasicCredentialsUsername()
    const password = app.getBasicCredentialsPassword()
    if (id) {
      setBasicCredentials(id, password)
      return true
    }
  }
  if (!navigator.credentials?.get || !('PasswordCredential' in window)) return false
  try {
    const cred = (await navigator.credentials.get({ password: true, mediation: 'silent' } as CredentialRequestOptions)) as
      | (Credential & { id?: string; password?: string })
      | null
    if (cred?.id && typeof cred.password === 'string') {
      setBasicCredentials(cred.id, cred.password)
      return true
    }
  } catch {
    /* no stored credential, or the browser refused silently - nothing to do */
  }
  return false
}

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
 *
 * It doubles as the client_id: core's authorize page REQUIRES client_id to exactly equal
 * redirect_uri (AuthorizePageServlet rejects the credential submit with unauthorized_client
 * otherwise). Sending the bare origin as client_id passed every step up to the login form
 * and died only there - found the day the credential exchange first ran end to end.
 */
function redirectUri(): string {
  return window.location.origin + window.location.pathname
}

/**
 * Apply the current access token to a set of request headers, if we have one. With proxy
 * credentials in play the Authorization header belongs to the proxy, so the openHAB token moves to
 * `X-OPENHAB-TOKEN` - the same rule openHAB Cloud's cookie asks for.
 */
export function applyAuthHeader(headers: Headers, token: string): void {
  if (tokenInCustomHeader() || basicCredentials) {
    headers.set('X-OPENHAB-TOKEN', token)
  } else {
    headers.set('Authorization', 'Bearer ' + token)
  }
}

/**
 * Apply the proxy credentials, if any. Separate from the token because a proxy demands them on
 * EVERY request, including the anonymous ones a viewer makes.
 */
export function applyProxyAuth(headers: Headers): void {
  const creds = basicCredentials
  if (creds) headers.set('Authorization', 'Basic ' + btoa(`${creds.id}:${creds.password}`))
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
    client_id: redirectUri(),
    redirect_uri: redirectUri(),
    scope: 'admin',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.href = ohUrl('/auth') + '?' + params.toString()
}

async function requestToken(body: Record<string, string>): Promise<void> {
  const res = await fetch(ohUrl('/rest/auth/token'), {
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
    client_id: redirectUri(),
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
    client_id: redirectUri(),
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

/**
 * Sign out on this device.
 *
 * Main UI's refresh token is not ours to delete - it belongs to the other UI on this origin -
 * but continuing to fall back to it would mean "Sign out" left the device signed in, with admin
 * rights, and the Account screen still reporting a session. So it is disowned for this page
 * instead: the token stays where Main UI put it, and nothing here uses it again.
 */
export function logout(): void {
  const refresh = localStorage.getItem(STORAGE_REFRESH)
  accessToken = null
  accessTokenExpiry = 0
  mainUiRefreshDead = true
  clearBasicCredentials()
  localStorage.removeItem(STORAGE_REFRESH)
  if (refresh) {
    void fetch(ohUrl('/rest/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: refresh }).toString(),
    })
  }
}
