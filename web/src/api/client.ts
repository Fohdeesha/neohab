import { applyAuthHeader, applyProxyAuth, getAccessToken } from './auth'
import { ApiError, bodyText, boundedFetch, ohUrl } from './base'

export { ApiError }

// long enough for a year of persistence or a large image upload on a slow link
const REQUEST_TIMEOUT_MS = 60_000

interface RequestOptions {
  method?: string
  body?: unknown
  text?: boolean
  accept?: string
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

const RETRY_WITHOUT_TOKEN: unique symbol = Symbol('retry without token')

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

  if (opts.accept) headers.set('Accept', opts.accept)
  applyProxyAuth(headers)
  const token = await getAccessToken()
  if (token) applyAuthHeader(headers, token)

  const url = ohUrl(path)
  const method = opts.method ?? 'GET'
  const init = { method, headers, body, signal: opts.signal }
  const first = await boundedFetch<T | typeof RETRY_WITHOUT_TOKEN>(url, init, REQUEST_TIMEOUT_MS, (res, alive) =>
    res.status === 401 && token ? Promise.resolve(RETRY_WITHOUT_TOKEN) : readAnswer<T>(res, alive, method, path)
  )
  if (first !== RETRY_WITHOUT_TOKEN) return first
  // a stale token must not break what anonymous access allows, so retry once without it - the proxy's own
  // credentials stay
  headers.delete('Authorization')
  headers.delete('X-OPENHAB-TOKEN')
  applyProxyAuth(headers)
  return boundedFetch(url, init, REQUEST_TIMEOUT_MS, (res, alive) => readAnswer<T>(res, alive, method, path))
}

async function readAnswer<T>(res: Response, alive: () => void, method: string, path: string): Promise<T> {
  if (!res.ok) {
    const detail = await errorDetail(res)
    throw new ApiError(res.status, `${method} ${path} -> ${res.status}${detail ? ': ' + detail : ''}`, detail)
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('Content-Type') ?? ''
  const text = await bodyText(res, alive)
  return (contentType.includes('application/json') ? JSON.parse(text) : text) as T
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' })
}
