/**
 * Thin fetch wrapper around the openHAB REST API.
 * Injects the access token when available; callers that require admin rights pass `auth: true`.
 */
import { applyAuthHeader, getAccessToken } from './auth'

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
  /** Attach an access token; required for admin operations. */
  auth?: boolean
  signal?: AbortSignal
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

  if (opts.auth) {
    const token = await getAccessToken()
    if (token) applyAuthHeader(headers, token)
  }

  const res = await fetch(path, { method: opts.method ?? 'GET', headers, body, signal: opts.signal })
  if (!res.ok) {
    throw new ApiError(res.status, `${opts.method ?? 'GET'} ${path} -> ${res.status}`)
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
