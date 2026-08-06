/**
 * Thin fetch wrapper around the openHAB REST API.
 * The access token is attached whenever one is available, so servers running with
 * `requireToken` (no anonymous user role) work for reading and commands too, not just
 * for admin writes. Without a token, requests go out anonymous as before.
 */
import { applyAuthHeader, applyProxyAuth, getAccessToken } from './auth'
import { ohUrl } from './base'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Send as text/plain instead of JSON (item commands). */
  text?: boolean
  signal?: AbortSignal
}

/** Pull the human-meaningful part out of an openHAB error response, if any. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text()
    const json = JSON.parse(text) as { error?: { message?: string } }
    if (json.error?.message) return ': ' + json.error.message
    return text ? ': ' + text.slice(0, 200) : ''
  } catch {
    return ''
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = new Headers()
  let body: BodyInit | undefined

  if (opts.body !== undefined) {
    if (opts.text) {
      headers.set('Content-Type', 'text/plain')
      body = String(opts.body)
    } else {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(opts.body)
    }
  }

  // The proxy's credentials go on first: applyAuthHeader knows to move an openHAB token out of
  // the Authorization header when they are present.
  applyProxyAuth(headers)
  const token = await getAccessToken()
  if (token) applyAuthHeader(headers, token)

  // Resolved against openHAB's own path prefix, so this works behind a sub-path reverse proxy.
  const url = ohUrl(path)
  let res = await fetch(url, { method: opts.method ?? 'GET', headers, body, signal: opts.signal })
  if (res.status === 401 && token) {
    // A stale/revoked stored token must not break what anonymous access would allow
    // (e.g. viewing dashboards with the default user role) - retry once without it. The proxy's
    // own credentials stay: dropping those would fail the request before openHAB ever sees it.
    headers.delete('Authorization')
    headers.delete('X-OPENHAB-TOKEN')
    applyProxyAuth(headers)
    res = await fetch(url, { method: opts.method ?? 'GET', headers, body, signal: opts.signal })
  }
  if (!res.ok) {
    throw new ApiError(res.status, `${opts.method ?? 'GET'} ${path} -> ${res.status}${await errorDetail(res)}`)
  }

  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
}
