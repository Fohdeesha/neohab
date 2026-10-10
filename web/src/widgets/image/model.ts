import type { ItemState } from '../../api/types'

export interface ImageConfig {
  source?: 'url' | 'item'
  url: string
  item?: string
  label?: string
  refresh?: number
  cacheBust?: boolean
  fit?: 'cover' | 'contain'
  background?: string
}

export function sourceOf(config: { source?: unknown }): 'url' | 'item' {
  return config.source === 'item' ? 'item' : 'url'
}

export function fitOf(config: { fit?: unknown }): 'cover' | 'contain' {
  return config.fit === 'contain' ? 'contain' : 'cover'
}

export function cacheBustOf(config: { cacheBust?: unknown }): boolean {
  return config.cacheBust !== false
}

export function backgroundOf(config: { background?: unknown }): string | undefined {
  return typeof config.background === 'string' && config.background.trim() !== '' ? config.background.trim() : undefined
}

export type ItemPicture = { kind: 'none' } | { kind: 'address'; url: string } | { kind: 'held' }

const RAW_SUMMARY = /^raw type \(/

// an Image item's state reaches the page as a summary ("raw type (image/jpeg): 51234 bytes"), never the
// picture itself, so it has to be read from the item. 3.x sends no `type`, hence the summary as the fallback
export function pictureOf(st: ItemState | undefined): ItemPicture | undefined {
  if (!st || typeof st.state !== 'string') return undefined
  const type = typeof st.type === 'string' ? st.type : undefined
  if (type === 'UnDef' || (type === undefined && (st.state === 'NULL' || st.state === 'UNDEF'))) return { kind: 'none' }
  if (type === 'Raw' || (type === undefined && RAW_SUMMARY.test(st.state))) return { kind: 'held' }
  const url = st.state.trim()
  return url === '' ? { kind: 'none' } : { kind: 'address', url }
}

// a data: or blob: address is the picture itself, and a query string breaks it
export function withCacheBust(url: string, stamp: number): string {
  if (stamp <= 0 || /^(?:data|blob):/i.test(url)) return url
  return url + (url.includes('?') ? '&' : '?') + '_=' + encodeURIComponent(String(stamp))
}

export interface LatestReader {
  request(): void
  dispose(): void
}

// one read at a time, always ending on the newest ask. Aborting on every update would let a camera that
// updates faster than its picture downloads starve the tile, so an ask mid-read waits and reads once more.
export function latestReader<T>(
  load: (signal: AbortSignal) => Promise<T>,
  done: (result: { ok: true; value: T } | { ok: false; error: unknown }) => void
): LatestReader {
  const ctrl = new AbortController()
  let running = false
  let again = false
  let disposed = false

  const run = (): void => {
    running = true
    let p: Promise<T>
    try {
      p = load(ctrl.signal)
    } catch (error) {
      p = Promise.reject(error)
    }
    p.then(
      (value) => {
        if (!disposed) done({ ok: true, value })
      },
      // a read already queued behind this one is the retry, so a failure is only worth showing without one
      (error: unknown) => {
        if (!disposed && !again) done({ ok: false, error })
      }
    ).finally(() => {
      running = false
      if (disposed || !again) return
      again = false
      run()
    })
  }

  return {
    request() {
      if (disposed) return
      if (running) again = true
      else run()
    },
    dispose() {
      disposed = true
      ctrl.abort()
    }
  }
}
