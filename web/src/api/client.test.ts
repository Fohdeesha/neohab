import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let token: string | null = 'oh.token'
vi.mock('./auth', () => ({
  applyProxyAuth: () => {},
  applyAuthHeader: (headers: Headers, t: string) => headers.set('Authorization', 'Bearer ' + t),
  getAccessToken: async () => token
}))
vi.stubGlobal('window', { location: { pathname: '/neohab/index.html' } })

const { api, ApiError } = await import('./client')
const { boundedFetch, NetworkError } = await import('./base')

type Call = { url: string; auth: string | null }
const calls: Call[] = []
const answer = (status: number, body: string, type = 'application/json') =>
  new Response(status === 204 ? null : body, { status, headers: { 'Content-Type': type } })

describe('bounded fetch', () => {
  afterEach(() => vi.useRealTimers())

  it('reports a request with no answer as a network error, and says when it timed out', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      (_: string, init: RequestInit) =>
        new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    )
    const pending = boundedFetch('/x', {}, 1000).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1001)
    const err = await pending
    expect(err).toBeInstanceOf(NetworkError)
    expect((err as InstanceType<typeof NetworkError>).timedOut).toBe(true)
  })

  it('tells an unreachable server from a timeout', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await boundedFetch('/x', {}, 1000).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NetworkError)
    expect((err as InstanceType<typeof NetworkError>).timedOut).toBe(false)
  })

  it('leaves the caller’s own abort an abort', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      (_: string, init: RequestInit) =>
        new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    )
    const pending = boundedFetch('/x', { signal: controller.signal }, 60_000).catch((e: unknown) => e)
    controller.abort()
    const err = await pending
    expect(err).not.toBeInstanceOf(NetworkError)
    expect((err as Error).name).toBe('AbortError')
  })
})

describe('a body that arrives slowly, or stops arriving', () => {
  afterEach(() => vi.useRealTimers())

  // what a real fetch does: the abort that cancels the request also errors a body still arriving
  const streaming = (plan: (push: (s: string) => void, end: () => void) => void) => async (_: string, init: RequestInit) => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        init.signal?.addEventListener('abort', () => {
          try {
            c.error(new DOMException('aborted', 'AbortError'))
          } catch {
            // already closed
          }
        })
        plan(
          (s) => c.enqueue(enc.encode(s)),
          () => c.close()
        )
      }
    })
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  it('fails a body that has gone quiet for the whole bound, where it used to wait for ever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      streaming((push) => push('data:image/png;base64,AA'))
    )
    const pending = api.get('/rest/items/cam/state').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(60_001)
    const err = await pending
    expect(err).toBeInstanceOf(NetworkError)
    expect((err as InstanceType<typeof NetworkError>).timedOut).toBe(true)
  })

  it('lets a slow body finish for as long as it keeps arriving', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      streaming((push, end) => {
        let n = 0
        const next = () => {
          push(String(n))
          if (++n < 4) setTimeout(next, 40_000)
          else end()
        }
        setTimeout(next, 40_000)
      })
    )
    const pending = api.get('/rest/persistence/items/x')
    await vi.advanceTimersByTimeAsync(170_000)
    expect(await pending).toBe('0123')
  })

  it('hands the caller’s abort on to a body still arriving', async () => {
    const ctrl = new AbortController()
    vi.stubGlobal(
      'fetch',
      streaming((push) => push('part'))
    )
    const pending = api.get('/rest/items/cam/state', { signal: ctrl.signal }).catch((e: unknown) => e)
    await new Promise((r) => setTimeout(r, 0))
    ctrl.abort()
    const err = await pending
    expect(err).not.toBeInstanceOf(NetworkError)
    expect((err as Error).name).toBe('AbortError')
  })

  it('still reads JSON as JSON and text as text', async () => {
    vi.stubGlobal('fetch', async () => answer(200, '{"a":[1,"é"]}'))
    expect(await api.get('/rest/x')).toEqual({ a: [1, 'é'] })
    vi.stubGlobal('fetch', async () => answer(200, '{"a":1}', 'text/plain'))
    expect(await api.get('/rest/x')).toBe('{"a":1}')
    vi.stubGlobal('fetch', async () => answer(204, ''))
    expect(await api.delete('/rest/x')).toBeUndefined()
  })
})

describe('the api client', () => {
  beforeEach(() => {
    calls.length = 0
    token = 'oh.token'
  })

  it('tries once more without a stale token, since anonymous access may allow what the token no longer does', async () => {
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const auth = new Headers(init.headers).get('Authorization')
      calls.push({ url, auth })
      return auth ? answer(401, '{"error":{"message":"Authentication required"}}') : answer(200, '[1]')
    })
    expect(await api.get('/rest/items')).toEqual([1])
    expect(calls.map((c) => c.auth)).toEqual(['Bearer oh.token', null])
  })

  it('carries the server’s own words on a refusal, and keeps the request line for the log', async () => {
    vi.stubGlobal('fetch', async () => answer(409, '{"error":{"message":"Rule already exists"}}'))
    const err = await api.post('/rest/rules', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as InstanceType<typeof ApiError>).status).toBe(409)
    expect((err as InstanceType<typeof ApiError>).detail).toBe('Rule already exists')
    expect((err as Error).message).toContain('POST /rest/rules -> 409')
  })

  it('asks for the type it was told to, on the retry without a token too, and hands back text as text', async () => {
    const accepts: (string | null)[] = []
    vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      accepts.push(headers.get('Accept'))
      return headers.get('Authorization') ? answer(401, '') : answer(200, 'data:image/png;base64,AAAA', 'text/plain')
    })
    expect(await api.get('/rest/items/cam/state', { accept: 'text/plain' })).toBe('data:image/png;base64,AAAA')
    expect(accepts).toEqual(['text/plain', 'text/plain'])
    accepts.length = 0
    await api.get('/rest/items/cam/state').catch(() => {})
    expect(accepts).toEqual([null, null])
  })

  it('resolves paths under the prefix openHAB is served from', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push({ url, auth: null })
      return answer(204, '')
    })
    await api.delete('/rest/ui/components/neohab:config/x')
    expect(calls[0].url).toBe('/rest/ui/components/neohab:config/x')
  })
})
