// openHAB paths resolve against whatever prefix openHAB itself is served under, so a sub-path proxy works

const APP_SEGMENT = '/neohab/'

function computeRoot(): string {
  try {
    const path = window.location.pathname
    const at = path.lastIndexOf(APP_SEGMENT)
    return at > 0 ? path.slice(0, at) : ''
  } catch {
    return ''
  }
}

let root: string | null = null

function ohRoot(): string {
  root ??= computeRoot()
  return root
}

export function ohUrl(path: string): string {
  return ohRoot() + path
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail = ''
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** The request never got an answer: the server is unreachable, or it did not answer in time. */
export class NetworkError extends Error {
  constructor(public timedOut: boolean) {
    super(timedOut ? 'request timed out' : 'request failed')
    this.name = 'NetworkError'
  }
}

/**
 * fetch with a bound, reporting a request that got no answer as a NetworkError - so a programming error
 * (also a TypeError) is not mistaken for an unreachable server. A request with no bound does not fail,
 * it pends, and everything queued behind it waits too. A caller's own abort stays an abort.
 */
export async function boundedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const outer = init.signal
  const forward = () => controller.abort()
  if (outer?.aborted) controller.abort()
  else outer?.addEventListener('abort', forward, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (outer?.aborted) throw err
    throw new NetworkError(timedOut)
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', forward)
  }
}
