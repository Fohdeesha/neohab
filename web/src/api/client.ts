import { applyAuthHeader, applyProxyAuth, getAccessToken } from './auth'
import { ApiError, boundedFetch, ohUrl } from './base'

export { ApiError }

// long enough for a year of persistence or a large image upload on a slow link
const REQUEST_TIMEOUT_MS = 60_000

interface RequestOptions {
  method?: string
  body?: unknown
  text?: boolean
  signal?: AbortSignal
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text()
    const json = JSON.parse(text) as { error?: { message?: string } }
    if (json.error?.message) return json.error.message
    return text ? text.slice(0, 200) : ''
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

  applyProxyAuth(headers)
  const token = await getAccessToken()
  if (token) applyAuthHeader(headers, token)

  const url = ohUrl(path)
  const init = { method: opts.method ?? 'GET', headers, body, signal: opts.signal }
  let res = await boundedFetch(url, init, REQUEST_TIMEOUT_MS)
  if (res.status === 401 && token) {
    // a stale token must not break what anonymous access allows, so retry once without it - the proxy's own
    // credentials stay
    headers.delete('Authorization')
    headers.delete('X-OPENHAB-TOKEN')
    applyProxyAuth(headers)
    res = await boundedFetch(url, init, REQUEST_TIMEOUT_MS)
  }
  if (!res.ok) {
    const detail = await errorDetail(res)
    throw new ApiError(res.status, `${opts.method ?? 'GET'} ${path} -> ${res.status}${detail ? ': ' + detail : ''}`, detail)
  }

  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' })
}
