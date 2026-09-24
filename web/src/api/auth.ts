import { ApiError, boundedFetch, ohUrl } from './base'
import { sha256 } from './sha256'

const STORAGE_REFRESH = 'neohab:refreshToken'
const STORAGE_API_TOKEN = 'neohab:apiToken'
const SESSION_VERIFIER = 'neohab:codeVerifier'
const SESSION_STATE = 'neohab:authState'
// the login page returns to the bare page address, which would land every sign-in on Home
const SESSION_RETURN = 'neohab:authReturn'

const MAINUI_REFRESH = 'openhab.ui:refreshToken'

let accessToken: string | null = null
let accessTokenExpiry = 0
let refreshInFlight: Promise<void> | null = null

export interface BasicCredentials {
  id: string
  password: string
}

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
    // no stored credential, or the browser refused silently - nothing to do
  }
  return false
}

export function tokenInCustomHeader(): boolean {
  return document.cookie.includes('X-OPENHAB-AUTH-HEADER')
}

// localStorage throws on the bare reference when a browser blocks site data, and these run during render
function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage blocked
  }
}

let mainUiRefreshDead = false

export function getRefreshToken(): string | null {
  return readLocal(STORAGE_REFRESH) ?? (mainUiRefreshDead ? null : readLocal(MAINUI_REFRESH))
}

export function getApiToken(): string | null {
  return readLocal(STORAGE_API_TOKEN)
}

export function setApiToken(token: string): void {
  writeLocal(STORAGE_API_TOKEN, token.trim())
}

export function clearApiToken(): void {
  writeLocal(STORAGE_API_TOKEN, null)
}

export function isLoggedIn(): boolean {
  return getApiToken() !== null || getRefreshToken() !== null
}

// core wants client_id to be exactly the redirect_uri, or the credential POST comes back unauthorized_client
function redirectUri(): string {
  return window.location.origin + window.location.pathname
}

export function applyAuthHeader(headers: Headers, token: string): void {
  if (tokenInCustomHeader() || basicCredentials) {
    headers.set('X-OPENHAB-TOKEN', token)
  } else {
    headers.set('Authorization', 'Bearer ' + token)
  }
}

// btoa only takes bytes, so a password with an accent in it needs UTF-8 encoding first
function basicToken(id: string, password: string): string {
  const bytes = new TextEncoder().encode(`${id}:${password}`)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function applyProxyAuth(headers: Headers): void {
  const creds = basicCredentials
  if (creds) headers.set('Authorization', 'Basic ' + basicToken(creds.id, creds.password))
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const bytes = new TextEncoder().encode(verifier)
  const digest = crypto.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)) : sha256(bytes)
  return { verifier, challenge: base64url(digest) }
}

export async function authorize(): Promise<void> {
  const { verifier, challenge } = await makePkce()
  const state = base64url(crypto.getRandomValues(new Uint8Array(8)))
  sessionStorage.setItem(SESSION_VERIFIER, verifier)
  sessionStorage.setItem(SESSION_STATE, state)
  sessionStorage.setItem(SESSION_RETURN, window.location.hash)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: redirectUri(),
    redirect_uri: redirectUri(),
    scope: 'admin',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state
  })
  window.location.href = ohUrl('/auth') + '?' + params.toString()
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

/**
 * The token endpoint refused the grant itself (openHAB's `invalid_grant`): that refresh token is dead.
 * Anything else - a proxy's 401, a restart's 502, no answer at all - says nothing about the token.
 */
export class GrantRefused extends Error {
  constructor() {
    super('invalid_grant')
    this.name = 'GrantRefused'
  }
}

const TOKEN_TIMEOUT_MS = 15_000

// both token POSTs go through here, so neither can forget the proxy's credentials
async function postToken(body: Record<string, string>, proxy: BasicCredentials | null = basicCredentials): Promise<TokenResponse> {
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
  if (proxy) headers.set('Authorization', 'Basic ' + basicToken(proxy.id, proxy.password))
  const res = await boundedFetch(
    ohUrl('/rest/auth/token'),
    { method: 'POST', headers, body: new URLSearchParams(body).toString() },
    TOKEN_TIMEOUT_MS
  )
  if (!res.ok) {
    const code = await res
      .json()
      .then((j: { error?: unknown }) => j?.error)
      .catch(() => undefined)
    if (res.status === 400 && code === 'invalid_grant') throw new GrantRefused()
    throw new ApiError(res.status, `POST /rest/auth/token -> ${res.status}`)
  }
  return (await res.json()) as TokenResponse
}

async function requestToken(body: Record<string, string>): Promise<void> {
  let data: TokenResponse
  try {
    data = await postToken(body)
  } catch (err) {
    if (err instanceof GrantRefused && body.grant_type === 'refresh_token') writeLocal(STORAGE_REFRESH, null)
    throw err
  }
  if (!data.access_token) throw new ApiError(502, 'POST /rest/auth/token -> no access token')
  accessToken = data.access_token
  accessTokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000
  if (data.refresh_token) writeLocal(STORAGE_REFRESH, data.refresh_token)
}

/** where the sign-in started, handed out once; only an address inside this app is kept */
export function takeReturnHash(): string {
  try {
    const hash = sessionStorage.getItem(SESSION_RETURN) ?? ''
    sessionStorage.removeItem(SESSION_RETURN)
    return /^#\/[^\s]*$/.test(hash) ? hash : ''
  } catch {
    return ''
  }
}

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
    code_verifier: verifier
  })
  return true
}

export async function getAccessToken(): Promise<string | null> {
  const apiToken = getApiToken()
  if (apiToken) return apiToken

  if (accessToken && Date.now() < accessTokenExpiry) return accessToken
  const refresh = getRefreshToken()
  if (!refresh) return null

  refreshInFlight ??= requestToken({
    grant_type: 'refresh_token',
    client_id: redirectUri(),
    refresh_token: refresh
  }).finally(() => {
    refreshInFlight = null
  })

  try {
    await refreshInFlight
    return accessToken
  } catch (err) {
    // only a refused grant kills Main UI's sign-in for this page; a restart or a dropped network does not
    if (err instanceof GrantRefused && refresh === readLocal(MAINUI_REFRESH)) mainUiRefreshDead = true
    return null
  }
}

export async function logout(): Promise<void> {
  const refresh = readLocal(STORAGE_REFRESH)
  const live = accessToken && Date.now() < accessTokenExpiry ? accessToken : null
  const proxy = basicCredentials

  accessToken = null
  accessTokenExpiry = 0
  mainUiRefreshDead = true
  clearBasicCredentials()
  writeLocal(STORAGE_REFRESH, null)
  // or a proxy login remembered in the browser signs this device straight back in on the next load
  if (proxy) void navigator.credentials?.preventSilentAccess?.().catch(() => undefined)
  if (!refresh) return

  try {
    const token = live ?? (await mintAccessToken(refresh, proxy))
    const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
    if (proxy) headers.set('Authorization', 'Basic ' + basicToken(proxy.id, proxy.password))
    if (token) {
      if (tokenInCustomHeader() || proxy) headers.set('X-OPENHAB-TOKEN', token)
      else headers.set('Authorization', 'Bearer ' + token)
    }
    await fetch(ohUrl('/rest/auth/logout'), {
      method: 'POST',
      headers,
      body: new URLSearchParams({ refresh_token: refresh }).toString()
    })
  } catch {
    // offline, or the session was already gone - the device is signed out
  }
}

async function mintAccessToken(refresh: string, proxy: BasicCredentials | null): Promise<string | null> {
  try {
    const data = await postToken({ grant_type: 'refresh_token', client_id: redirectUri(), refresh_token: refresh }, proxy)
    return data.access_token ?? null
  } catch {
    return null
  }
}
