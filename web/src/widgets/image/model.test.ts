import { describe, expect, it } from 'vitest'
import type { ItemState } from '../../api/types'
import { backgroundOf, cacheBustOf, fitOf, latestReader, pictureOf, sourceOf, withCacheBust } from './model'

const PROTO_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

// what the state stream really sends, measured on 3.1.0, 3.4.5, 4.0.0, 4.3.11 and 5.2.1: 3.x has no type
const st = (state: string, type?: string): ItemState => (type === undefined ? { state } : { state, type }) as ItemState

describe('pictureOf', () => {
  it('reads an Image item’s summary as a picture that has to be fetched, with or without a type', () => {
    expect(pictureOf(st('raw type (image/jpeg): 51234 bytes', 'Raw'))).toEqual({ kind: 'held' })
    expect(pictureOf(st('raw type (image/png): 70 bytes'))).toEqual({ kind: 'held' })
    expect(pictureOf(st('raw type (application/pdf): 9 bytes', 'Raw'))).toEqual({ kind: 'held' })
  })

  it('reads a String item’s state as the address, trimmed', () => {
    expect(pictureOf(st('http://cam/snap.jpg', 'String'))).toEqual({ kind: 'address', url: 'http://cam/snap.jpg' })
    expect(pictureOf(st('  /static/plan.png \n'))).toEqual({ kind: 'address', url: '/static/plan.png' })
    expect(pictureOf(st('data:image/png;base64,AAAA', 'String'))).toEqual({ kind: 'address', url: 'data:image/png;base64,AAAA' })
  })

  it('says there is nothing to show for an item with no state, or an empty one', () => {
    for (const s of [st('NULL', 'UnDef'), st('UNDEF', 'UnDef'), st('NULL'), st('UNDEF'), st('', 'String'), st('   ')]) {
      expect(pictureOf(s)).toEqual({ kind: 'none' })
    }
  })

  it('trusts the type over the text where there is one', () => {
    expect(pictureOf(st('raw type (image/png): 1 bytes', 'String'))).toEqual({ kind: 'address', url: 'raw type (image/png): 1 bytes' })
    expect(pictureOf(st('NULL', 'String'))).toEqual({ kind: 'address', url: 'NULL' })
  })

  it('knows nothing yet before a state has arrived, or from one of the wrong shape', () => {
    expect(pictureOf(undefined)).toBeUndefined()
    expect(pictureOf({ state: 42, type: 'Raw' } as unknown as ItemState)).toBeUndefined()
    expect(pictureOf({ type: 'Raw' } as unknown as ItemState)).toBeUndefined()
    expect(pictureOf({ state: 'http://x/y.png', type: 7 } as unknown as ItemState)).toEqual({ kind: 'address', url: 'http://x/y.png' })
  })
})

describe('withCacheBust', () => {
  it('adds the stamp as its own parameter, after any the address already has', () => {
    expect(withCacheBust('http://cam/snap.jpg', 1700000000000)).toBe('http://cam/snap.jpg?_=1700000000000')
    expect(withCacheBust('http://cam/snap.cgi?ch=1', 5)).toBe('http://cam/snap.cgi?ch=1&_=5')
  })

  it('leaves the address alone before the first refresh', () => {
    expect(withCacheBust('http://cam/snap.jpg', 0)).toBe('http://cam/snap.jpg')
  })

  it('never touches an address that is the picture itself', () => {
    expect(withCacheBust('data:image/png;base64,AAAA', 5)).toBe('data:image/png;base64,AAAA')
    expect(withCacheBust('DATA:image/png;base64,AAAA', 5)).toBe('DATA:image/png;base64,AAAA')
    expect(withCacheBust('blob:http://x/1234', 5)).toBe('blob:http://x/1234')
  })
})

describe('the config readers', () => {
  it('reads an item source only from the exact word, so old and hostile configs keep their address', () => {
    expect(sourceOf({ source: 'item' })).toBe('item')
    for (const source of [undefined, 'url', '', 'Item', 1, {}, ...PROTO_KEYS]) expect(sourceOf({ source })).toBe('url')
  })

  it('fills the tile unless told to fit, as the widget always did', () => {
    expect(fitOf({ fit: 'contain' })).toBe('contain')
    for (const fit of [undefined, 'cover', 'stretch', 3, ...PROTO_KEYS]) expect(fitOf({ fit })).toBe('cover')
  })

  it('adds the timestamp unless it was turned off in so many words', () => {
    expect(cacheBustOf({ cacheBust: false })).toBe(false)
    for (const cacheBust of [undefined, true, 'false', 0, null]) expect(cacheBustOf({ cacheBust })).toBe(true)
  })

  it('takes a background only as a non-empty string', () => {
    expect(backgroundOf({ background: ' #102030 ' })).toBe('#102030')
    expect(backgroundOf({ background: 'rgb(0, 0, 0)' })).toBe('rgb(0, 0, 0)')
    for (const background of [undefined, '', '   ', 5, {}, []]) expect(backgroundOf({ background })).toBeUndefined()
  })
})

describe('latestReader', () => {
  const deferred = <T>() => {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0))

  it('reads once per ask when the asks are spaced out', async () => {
    let n = 0
    const got: unknown[] = []
    const r = latestReader(
      async () => ++n,
      (res) => got.push(res)
    )
    r.request()
    await tick()
    r.request()
    await tick()
    expect(got).toEqual([
      { ok: true, value: 1 },
      { ok: true, value: 2 }
    ])
  })

  it('folds any number of asks during a read into one more read, and shows each read as it lands', async () => {
    const pending: ReturnType<typeof deferred<number>>[] = []
    const got: unknown[] = []
    const r = latestReader(
      () => {
        const d = deferred<number>()
        pending.push(d)
        return d.promise
      },
      (res) => got.push(res)
    )
    r.request()
    for (let i = 0; i < 5; i++) r.request()
    expect(pending).toHaveLength(1)
    pending[0].resolve(1)
    await tick()
    expect(got).toEqual([{ ok: true, value: 1 }])
    expect(pending).toHaveLength(2)
    pending[1].resolve(2)
    await tick()
    expect(got).toEqual([
      { ok: true, value: 1 },
      { ok: true, value: 2 }
    ])
    expect(pending).toHaveLength(2)
  })

  it('never starves: a read that keeps being overtaken still lands', async () => {
    const pending: ReturnType<typeof deferred<number>>[] = []
    const got: number[] = []
    const r = latestReader(
      () => {
        const d = deferred<number>()
        pending.push(d)
        return d.promise
      },
      (res) => res.ok && got.push(res.value)
    )
    r.request()
    for (let i = 0; i < 4; i++) {
      r.request()
      pending[i].resolve(i)
      await tick()
    }
    expect(got).toEqual([0, 1, 2, 3])
  })

  it('reports a failure only when no read is queued behind it to put it right', async () => {
    const pending: ReturnType<typeof deferred<number>>[] = []
    const got: unknown[] = []
    const r = latestReader(
      () => {
        const d = deferred<number>()
        pending.push(d)
        return d.promise
      },
      (res) => got.push(res)
    )
    r.request()
    r.request()
    pending[0].reject(new Error('blip'))
    await tick()
    expect(got).toEqual([])
    pending[1].reject(new Error('down'))
    await tick()
    expect(got).toEqual([{ ok: false, error: new Error('down') }])
  })

  it('treats a load that throws outright as a failed read rather than throwing at the caller', async () => {
    const got: unknown[] = []
    const r = latestReader(
      () => {
        throw new Error('sync')
      },
      (res) => got.push(res)
    )
    expect(() => r.request()).not.toThrow()
    await tick()
    expect(got).toEqual([{ ok: false, error: new Error('sync') }])
  })

  it('aborts the read in flight, reports nothing and starts nothing once disposed', async () => {
    const pending: ReturnType<typeof deferred<number>>[] = []
    const signals: AbortSignal[] = []
    const got: unknown[] = []
    const r = latestReader(
      (signal) => {
        signals.push(signal)
        const d = deferred<number>()
        pending.push(d)
        return d.promise
      },
      (res) => got.push(res)
    )
    r.request()
    r.request()
    r.dispose()
    expect(signals[0].aborted).toBe(true)
    pending[0].resolve(1)
    await tick()
    r.request()
    await tick()
    expect(got).toEqual([])
    expect(pending).toHaveLength(1)
  })
})
