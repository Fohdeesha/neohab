/**
 * Asking a camera server what it has.
 *
 * This is a convenience, never a requirement: the endpoints that list cameras are not the ones
 * that carry video, and go2rtc marks none of them CORS-open, so a perfectly working camera can
 * still be undiscoverable from this page. Every caller must stay usable when it fails, which is
 * why the stream name remains a plain typed field with this bolted on beside it.
 */
import { normalizeServer, type CameraSourceKind } from './model'

export type DiscoveryResult = { ok: true; streams: string[] } | { ok: false; reason: 'no-server' | 'unreachable' | 'bad-response' }

export async function listStreams(server: string | undefined, source: CameraSourceKind): Promise<DiscoveryResult> {
  const base = normalizeServer(server)
  if (!base) return { ok: false, reason: 'no-server' }

  const url = source === 'frigate' ? base + '/api/config' : base + '/api/streams'

  let body: unknown
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { ok: false, reason: 'bad-response' }
    body = await res.json()
  } catch {
    // A cross-origin refusal and an unreachable host are the same TypeError here - the browser
    // deliberately hides which. The UI says both rather than guessing.
    return { ok: false, reason: 'unreachable' }
  }

  const map = source === 'frigate' ? (body as { cameras?: Record<string, unknown> })?.cameras : (body as Record<string, unknown>)
  if (!map || typeof map !== 'object') return { ok: false, reason: 'bad-response' }

  return { ok: true, streams: Object.keys(map).sort((a, b) => a.localeCompare(b)) }
}
