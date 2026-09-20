import { describe, expect, it } from 'vitest'
import { LIVE_ARM_PX, LIVE_INTERVAL_MS, LiveCommand, liveDragModeOf, liveDragOn, type LiveDeps } from './liveCommand'

function harness() {
  let now = 1000
  let taken = false
  let nextId = 0
  const timers: { fn: () => void; at: number; id: number }[] = []
  const sent: { v: number; at: number }[] = []
  const events: string[] = []
  let resolvers: ((ok: boolean) => void)[] = []
  const deps: LiveDeps<number> = {
    command: String,
    send: (v) => {
      sent.push({ v, at: now })
      return new Promise((r) => resolvers.push(r))
    },
    onSend: (v) => events.push('commit ' + v),
    onRefused: (v) => events.push('refused ' + v),
    onArm: () => events.push('arm'),
    onRelease: () => events.push('release'),
    holdTaken: () => taken,
    cancelHold: () => events.push('cancelHold'),
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { fn, at: now + ms, id: ++nextId }
      timers.push(t)
      return t.id
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === h)
      if (i >= 0) timers.splice(i, 1)
    }
  }
  const live = new LiveCommand<number>(() => deps)
  const advance = (ms: number) => {
    const until = now + ms
    for (;;) {
      const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      now = due.at
      timers.splice(timers.indexOf(due), 1)
      due.fn()
    }
    now = until
  }
  // answers every request in flight, then lets the promise callbacks run
  const settle = async (ok = true) => {
    const rs = resolvers
    resolvers = []
    for (const r of rs) r(ok)
    await new Promise((r) => setTimeout(r, 0))
  }
  const press = (x = 100, y = 100) => live.begin(x, y)
  const arm = () => live.moved(100 + LIVE_ARM_PX + 1, 100)
  return {
    live,
    sent,
    events,
    advance,
    settle,
    press,
    arm,
    setTaken: (t: boolean) => (taken = t),
    inFlight: () => resolvers.length,
    timers
  }
}

describe('a live press', () => {
  it('sends nothing for a press that never moves, and leaves the release to the caller', () => {
    const h = harness()
    h.press()
    h.live.stage(30)
    expect(h.live.end(30)).toBe(false)
    expect(h.sent).toEqual([])
    expect(h.events).toEqual([])
  })

  it('does not arm inside the tolerance, and arms one pixel past it', () => {
    const h = harness()
    h.press()
    h.live.moved(100 + LIVE_ARM_PX, 100)
    h.live.stage(31)
    expect(h.live.isLive).toBe(false)
    expect(h.sent).toEqual([])
    h.live.moved(100, 100 - LIVE_ARM_PX - 1)
    expect(h.live.isLive).toBe(true)
    expect(h.events).toEqual(['cancelHold', 'arm'])
  })

  it('sends the first armed change at once', () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    expect(h.sent.map((s) => s.v)).toEqual([40])
    expect(h.events).toContain('commit 40')
  })

  it('never sends the value the press itself jumped to', () => {
    const h = harness()
    h.press()
    h.live.stage(12)
    h.arm()
    expect(h.sent).toEqual([])
    h.live.stage(13)
    expect(h.sent.map((s) => s.v)).toEqual([13])
  })

  it('coalesces changes inside the interval and sends the newest when it opens', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    await h.settle()
    h.advance(50)
    h.live.stage(41)
    h.advance(50)
    h.live.stage(42)
    h.advance(50)
    h.live.stage(43)
    expect(h.sent.map((s) => s.v)).toEqual([40])
    h.advance(60)
    expect(h.sent.map((s) => ({ v: s.v, at: s.at }))).toEqual([
      { v: 40, at: 1000 },
      { v: 43, at: 1000 + LIVE_INTERVAL_MS }
    ])
  })

  it('keeps one request in flight, then sends the newest value once it lands', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    h.advance(300)
    h.live.stage(50)
    h.live.stage(55)
    expect(h.sent.map((s) => s.v)).toEqual([40])
    expect(h.inFlight()).toBe(1)
    await h.settle()
    expect(h.sent.map((s) => s.v)).toEqual([40, 55])
  })

  it('never exceeds one command per interval over a long drag', async () => {
    const h = harness()
    h.press()
    h.arm()
    for (let i = 0; i < 60; i++) {
      h.live.stage(i)
      await h.settle()
      h.advance(25)
    }
    expect(h.sent.length).toBeLessThanOrEqual(1500 / LIVE_INTERVAL_MS + 1)
    for (let i = 1; i < h.sent.length; i++) expect(h.sent[i].at - h.sent[i - 1].at).toBeGreaterThanOrEqual(LIVE_INTERVAL_MS)
  })

  it('sends the released value last, without waiting for the interval', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    await h.settle()
    h.advance(30)
    h.live.stage(45)
    expect(h.live.end(47)).toBe(true)
    expect(h.events).toContain('release')
    expect(h.events).toContain('commit 47')
    expect(h.sent.map((s) => s.v)).toEqual([40, 47])
    expect(h.timers).toEqual([])
  })

  it('waits for the request in flight before the final send, so the item ends where the thumb was', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    expect(h.live.end(70)).toBe(true)
    expect(h.sent.map((s) => s.v)).toEqual([40])
    await h.settle()
    expect(h.sent.map((s) => s.v)).toEqual([40, 70])
    await h.settle()
    expect(h.sent.length).toBe(2)
  })

  it('does not repeat the last value on release', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    await h.settle()
    expect(h.live.end(40)).toBe(true)
    await h.settle()
    expect(h.sent.map((s) => s.v)).toEqual([40])
  })

  it('stops after a refusal, and the release sends nothing either', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    await h.settle(false)
    expect(h.events).toContain('refused 40')
    h.advance(300)
    h.live.stage(50)
    h.advance(300)
    expect(h.sent.map((s) => s.v)).toEqual([40])
    expect(h.live.end(60)).toBe(true)
    await h.settle()
    expect(h.sent.map((s) => s.v)).toEqual([40])
    expect(h.events.filter((e) => e === 'release')).toEqual(['release'])
  })

  it('never arms once the hold has taken the press', () => {
    const h = harness()
    h.press()
    h.setTaken(true)
    h.arm()
    expect(h.live.isLive).toBe(false)
    h.live.stage(40)
    expect(h.sent).toEqual([])
    expect(h.live.end(40)).toBe(false)
    expect(h.events).toEqual([])
  })

  it('goes quiet if the hold takes the press after arming, as a touch long press can', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    await h.settle()
    h.setTaken(true)
    h.advance(300)
    h.live.stage(50)
    expect(h.sent.map((s) => s.v)).toEqual([40])
    expect(h.live.end(55)).toBe(true)
    await h.settle()
    expect(h.sent.map((s) => s.v)).toEqual([40])
  })

  it('sends nothing more after a cancel, not even the final value', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    h.advance(30)
    h.live.stage(45)
    h.live.cancel()
    expect(h.events).toContain('release')
    await h.settle()
    h.advance(500)
    expect(h.sent.map((s) => s.v)).toEqual([40])
    expect(h.timers).toEqual([])
  })

  it('ignores a request landing after a new press began', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    h.live.end(60)
    h.press()
    await h.settle(false)
    expect(h.events).not.toContain('refused 40')
    expect(h.sent.map((s) => s.v)).toEqual([40])
  })

  it('starts each press clean', async () => {
    const h = harness()
    h.press()
    h.arm()
    h.live.stage(40)
    await h.settle()
    h.live.end(40)
    await h.settle()
    h.press()
    expect(h.live.isLive).toBe(false)
    h.arm()
    h.live.stage(40)
    expect(h.sent.map((s) => s.v)).toEqual([40, 40])
  })
})

describe('the live drag setting', () => {
  it('reads a stored mode and nothing else', () => {
    expect(liveDragModeOf({ liveDrag: 'always' })).toBe('always')
    expect(liveDragModeOf({ liveDrag: 'release' })).toBe('release')
    for (const junk of [undefined, '', 'yes', true, false, 1, null, {}]) expect(liveDragModeOf({ liveDrag: junk })).toBeUndefined()
    expect(liveDragModeOf(undefined)).toBeUndefined()
  })

  it('lets the widget win, then the shared setting, which is on unless turned off', () => {
    expect(liveDragOn({}, {})).toBe(true)
    expect(liveDragOn(undefined, undefined)).toBe(true)
    expect(liveDragOn({}, { liveDrag: false })).toBe(false)
    expect(liveDragOn({}, { liveDrag: true })).toBe(true)
    expect(liveDragOn({ liveDrag: 'always' }, { liveDrag: false })).toBe(true)
    expect(liveDragOn({ liveDrag: 'release' }, { liveDrag: true })).toBe(false)
    expect(liveDragOn({ liveDrag: 'release' }, {})).toBe(false)
    expect(liveDragOn({ liveDrag: 'nonsense' }, { liveDrag: false })).toBe(false)
  })
})
