import { describe, expect, it } from 'vitest'
import {
  arcOf,
  blockLit,
  fractionOf,
  fractionToAngle,
  gaugeColor,
  gaugeTicks,
  hasInnerRing,
  HISTORY_PERIODS,
  historyBars,
  historyPeriodMs,
  inAlarm,
  ledCountOf,
  ledFraction,
  ledLit,
  pickRing,
  scaleOf,
  severityColor,
  sparkSegments,
  type DialConfig,
  zeroFractionOf
} from './gauge'
import { dialFraction, keyStep, valueAtFraction } from '../common/dialPointer'

const cfg = (over: Partial<DialConfig> = {}): DialConfig => ({ item: 'X', ...over })

describe('the numeric scale', () => {
  it('reads a configured range as it was written', () => {
    expect(scaleOf(cfg({ min: -40, max: 120, step: 0.5 }))).toEqual({ min: -40, max: 120, step: 0.5 })
  })

  it('takes numbers stored as strings, as imported configurations carry', () => {
    const stored = { min: '10', max: '30', step: '2' } as unknown as Partial<DialConfig>
    expect(scaleOf(cfg(stored))).toEqual({ min: 10, max: 30, step: 2 })
  })

  it('falls back rather than drawing a gauge full of NaN', () => {
    const bad = { min: 'abc', max: null, step: 0 } as unknown as Partial<DialConfig>
    const s = scaleOf(cfg(bad))
    expect(s).toEqual({ min: 0, max: 100, step: 1 })
    for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true)
  })

  it('gives a collapsed or inverted range something to map onto', () => {
    expect(scaleOf(cfg({ min: 50, max: 50 })).max).toBeGreaterThan(50)
    expect(scaleOf(cfg({ min: 100, max: 0 })).max).toBeGreaterThan(100)
    expect(scaleOf(cfg({ step: -5 })).step).toBe(1)
  })

  it('reads the inner ring from its own fields', () => {
    const c = cfg({ min: 0, max: 10, step: 1, item2: 'Y', min2: 100, max2: 200, step2: 5 })
    expect(scaleOf(c, 'inner')).toEqual({ min: 100, max: 200, step: 5 })
    expect(scaleOf(c)).toEqual({ min: 0, max: 10, step: 1 })
  })
})

describe('reading stored configuration', () => {
  it('clamps an arc to something drawable', () => {
    expect(arcOf(cfg({ arcSweep: 9999, arcStart: -720 }))).toEqual({ start: 0, sweep: 360 })
    expect(arcOf(cfg({ arcSweep: 1 })).sweep).toBe(30)
    expect(arcOf(cfg({ arcStart: 450 })).start).toBe(90)
  })

  it('clamps the segment count, with a different default for chunky styles', () => {
    expect(ledCountOf(cfg({ style: 'led' }))).toBe(60)
    expect(ledCountOf(cfg({ style: 'blocks' }))).toBe(20)
    expect(ledCountOf(cfg({ ledCount: 0 }))).toBe(8)
    expect(ledCountOf(cfg({ ledCount: 9999 }))).toBe(200)
    expect(ledCountOf(cfg({ ledCount: 'twelve' as unknown as number }))).toBe(60)
  })

  it('treats a non-array of stops, markers or zones as none at all', () => {
    expect(severityColor(5, 42 as unknown as [])).toBeUndefined()
    expect(severityColor(5, undefined)).toBeUndefined()
    expect(severityColor(5, [{ value: NaN, color: 'red' }])).toBeUndefined()
  })

  it('knows when a second ring is configured', () => {
    expect(hasInnerRing(cfg())).toBe(false)
    expect(hasInnerRing(cfg({ item2: '' }))).toBe(false)
    expect(hasInnerRing(cfg({ item2: {} as unknown as string }))).toBe(false)
    expect(hasInnerRing(cfg({ item2: 'Y' }))).toBe(true)
  })
})

describe('fractions and angles', () => {
  it('maps a value into its range, clamped', () => {
    expect(fractionOf(50, 0, 100)).toBe(0.5)
    expect(fractionOf(-10, 0, 100)).toBe(0)
    expect(fractionOf(200, 0, 100)).toBe(1)
    expect(fractionOf(5, 10, 10), 'a degenerate range reads as 0').toBe(0)
  })

  it('places the bidirectional reference at zero, or the midpoint when zero is outside', () => {
    expect(zeroFractionOf(-50, 50, true)).toBe(0.5)
    expect(zeroFractionOf(0, 100, true)).toBe(0)
    expect(zeroFractionOf(10, 20, true)).toBe(0.5)
    expect(zeroFractionOf(-50, 50, false)).toBe(0)
  })

  it('converts a fraction to an SVG angle', () => {
    expect(fractionToAngle(0, 0, 360)).toBe(-90)
    expect(fractionToAngle(0.25, 0, 360)).toBe(0)
  })
})

describe('lighting', () => {
  it('lights an LED ring from the start up to the value', () => {
    const lit = (frac: number) => Array.from({ length: 5 }, (_, i) => ledLit(i, 5, 180, frac, 0, false))
    expect(lit(0)).toEqual([false, false, false, false, false])
    expect(lit(0.5)).toEqual([true, true, true, false, false])
    expect(lit(1)).toEqual([true, true, true, true, true])
  })

  it('lights bidirectionally from the reference, which stays lit at rest', () => {
    const lit = (frac: number) => Array.from({ length: 5 }, (_, i) => ledLit(i, 5, 180, frac, 0.5, true))
    expect(lit(0.5)).toEqual([false, false, true, false, false])
    expect(lit(1)).toEqual([false, false, true, true, true])
    expect(lit(0)).toEqual([true, true, true, false, false])
  })

  it('spaces a full circle so the first and last do not coincide', () => {
    expect(ledFraction(0, 4, 360)).toBe(0)
    expect(ledFraction(3, 4, 360)).toBe(0.75)
    expect(ledFraction(3, 4, 180)).toBe(1)
  })

  it('lights a block by its midpoint, so no block lights one value early', () => {
    const lit = (frac: number) => Array.from({ length: 4 }, (_, i) => blockLit(i, 4, frac, 0, false))
    expect(lit(0.2)).toEqual([true, false, false, false])
    expect(lit(0.4)).toEqual([true, true, false, false])
    expect(lit(0)).toEqual([false, false, false, false])
  })

  it('lights exactly one reference block when zero sits on a block edge', () => {
    const lit = Array.from({ length: 4 }, (_, i) => blockLit(i, 4, 0.5, 0.5, true))
    expect(lit.filter(Boolean)).toHaveLength(1)
  })
})

describe('severity colours', () => {
  it('takes the first stop at or above the value, and holds the last one past the end', () => {
    const stops = [
      { value: 10, color: 'blue' },
      { value: 20, color: 'green' },
      { value: 30, color: 'red' }
    ]
    expect(severityColor(5, stops)).toBe('blue')
    expect(severityColor(10, stops)).toBe('blue')
    expect(severityColor(15, stops)).toBe('green')
    expect(severityColor(999, stops)).toBe('red')
  })

  it('sorts stops that were entered out of order', () => {
    const stops = [
      { value: 30, color: 'red' },
      { value: 10, color: 'blue' }
    ]
    expect(severityColor(5, stops)).toBe('blue')
  })

  it('prefers a matching stop, then the ring colour, then the theme', () => {
    expect(gaugeColor(5, [{ value: 10, color: 'blue' }], '#fff')).toBe('blue')
    expect(gaugeColor(5, [], '#fff')).toBe('#fff')
    expect(gaugeColor(5, [], '')).toBeUndefined()
    expect(gaugeColor(5, undefined, undefined)).toBeUndefined()
  })
})

describe('ticks', () => {
  it('labels the majors and drops the seam tick on a full circle', () => {
    const full = gaugeTicks(0, 100, 0, 360, 5, 0, true)
    const partial = gaugeTicks(0, 100, 0, 270, 5, 0, true)
    expect(full).toHaveLength(10)
    expect(partial).toHaveLength(11)
    expect(partial[partial.length - 1].major).toBe(true)
  })

  it('drops trailing zeros from scale labels', () => {
    const ticks = gaugeTicks(-40, 60, 0, 270, 5, 1, true)
    expect(ticks[0].label).toBe('-40')
  })

  it('can be asked for no labels at all', () => {
    expect(gaugeTicks(0, 10, 0, 270, 5, 0, false).every((t) => t.label === undefined)).toBe(true)
  })
})

describe('pointer interaction', () => {
  const at = (svgAngle: number, start: number, sweep: number, previous: number | null = null) =>
    dialFraction(svgAngle, start, sweep, previous)

  it('snaps to the step and stays inside the range', () => {
    expect(valueAtFraction(at(-90, 0, 360)!, 0, 100, 1, 0)).toBe(0)
    expect(valueAtFraction(at(0, 0, 360)!, 0, 100, 1, 0)).toBe(25)
    expect(valueAtFraction(at(-90, 0, 360)!, 0, 10, 0.1, 1)).toBe(0)
  })

  it('snaps to the step precision rather than trailing float noise', () => {
    const v = valueAtFraction(at(12.3, 0, 270)!, 60, 80, 0.1, 1)
    expect(String(v)).toBe(String(Number(v.toFixed(1))))
  })

  it('takes no press in the gap at all', () => {
    expect(at(190, 0, 270)).toBeNull()
    expect(at(260, 0, 270)).toBeNull()
  })

  // the classic dial: 225 from twelve, 270 round. Its min end is at 7:30 and the gap is at the bottom.
  it('holds the min end when a drag runs past it, never jumping to max', () => {
    const nearMin = at(140, 225, 270)!
    expect(nearMin).toBeGreaterThan(0)
    expect(nearMin).toBeLessThan(0.05)
    // a few degrees past the min end, into the gap
    expect(at(130, 225, 270, nearMin)).toBe(0)
    // and on round through the whole gap, still the end it left by
    expect(at(60, 225, 270, 0)).toBe(0)
    expect(at(45, 225, 270, 0)).toBe(0)
  })

  it('holds the max end the same way, from the other side', () => {
    const nearMax = at(40, 225, 270)!
    expect(nearMax).toBeGreaterThan(0.95)
    expect(at(50, 225, 270, nearMax)).toBe(1)
    expect(at(125, 225, 270, 1)).toBe(1)
  })

  it('does not wrap from max to min at the top of a full ring', () => {
    const justBelowTop = at(-91, 0, 360)!
    expect(justBelowTop).toBeGreaterThan(0.99)
    expect(at(-89, 0, 360, justBelowTop)).toBe(1)
    expect(at(-89, 0, 360, 0.01)).toBeCloseTo(1 / 360, 5)
    expect(at(-91, 0, 360, 0.001)).toBe(0)
  })

  it('follows an ordinary drag faithfully', () => {
    const a = at(180, 225, 270)!
    const b = at(270, 225, 270, a)!
    expect(b).toBeGreaterThan(a)
    expect(at(180, 225, 270, b)).toBeCloseTo(a, 9)
  })

  it('steps with the keys a slider answers to', () => {
    expect(keyStep('ArrowUp', 50, 0, 100, 1, 0)).toBe(51)
    expect(keyStep('ArrowLeft', 50, 0, 100, 1, 0)).toBe(49)
    expect(keyStep('PageUp', 50, 0, 100, 1, 0)).toBe(60)
    expect(keyStep('Home', 50, 0, 100, 1, 0)).toBe(0)
    expect(keyStep('End', 50, 0, 100, 1, 0)).toBe(100)
    expect(keyStep('ArrowUp', 100, 0, 100, 1, 0)).toBe(100)
    expect(keyStep('Enter', 50, 0, 100, 1, 0)).toBeNull()
  })

  it('addresses whichever ring the pointer is nearer', () => {
    expect(pickRing(44, 44, 33)).toBe('outer')
    expect(pickRing(33, 44, 33)).toBe('inner')
    expect(pickRing(38.5, 44, 33), 'the midpoint belongs to the outer ring').toBe('outer')
  })
})

describe('alarm', () => {
  it('only fires when switched on, and reads the range either way round', () => {
    expect(inAlarm(cfg({ alarm: false, alarmFrom: 0, alarmTo: 10 }), 5, 0, 100)).toBe(false)
    expect(inAlarm(cfg({ alarm: true, alarmFrom: 0, alarmTo: 10 }), 5, 0, 100)).toBe(true)
    expect(inAlarm(cfg({ alarm: true, alarmFrom: 10, alarmTo: 0 }), 5, 0, 100)).toBe(true)
    expect(inAlarm(cfg({ alarm: true, alarmFrom: 0, alarmTo: 10 }), 50, 0, 100)).toBe(false)
  })
})

describe('history bars', () => {
  const t0 = 0
  const t1 = 4000

  it('weighs each sample by how long it held, not by how often it was stored', () => {
    const burst = Array.from({ length: 100 }, (_, i) => ({ time: t0 + i, value: 100 }))
    const held = [{ time: t0 + 100, value: 0 }]
    const bars = historyBars([...burst, ...held], t0, t1, 1)
    const two = historyBars([...burst, ...held, { time: 2000, value: 100 }], t0, t1, 2)
    expect(two[0]!).toBeLessThan(two[1]!)
    expect(bars).toHaveLength(1)
  })

  it('reports a bucket with nothing in it as null rather than zero', () => {
    const bars = historyBars([{ time: 3000, value: 10 }], t0, t1, 4)
    expect(bars[0]).toBeNull()
    expect(bars[3]).not.toBeNull()
  })

  it('draws a flat series at half height instead of vanishing', () => {
    const bars = historyBars(
      [
        { time: 0, value: 7 },
        { time: 1000, value: 7 },
        { time: 2000, value: 7 }
      ],
      t0,
      t1,
      2
    )
    expect(bars.every((b) => b === 0.5)).toBe(true)
  })

  it('survives garbage in the series and a degenerate window', () => {
    expect(historyBars([{ time: NaN, value: 1 }], t0, t1, 4).every((b) => b === null)).toBe(true)
    expect(historyBars([{ time: 0, value: 1 }], 100, 100, 4).every((b) => b === null)).toBe(true)
  })
})

describe('sparkline', () => {
  it('breaks the line at a gap rather than drawing a straight lie across it', () => {
    expect(sparkSegments([0, 1, null, 1, 0], 0, 40, 10, 10)).toHaveLength(2)
  })

  it('draws a lone reading as a short dash so it is still visible', () => {
    const [path] = sparkSegments([null, 0.5, null], 0, 40, 10, 10)
    expect(path).toMatch(/^M .* l /)
  })

  it('answers nothing for nothing', () => {
    expect(sparkSegments([], 0, 40, 10, 10)).toEqual([])
    expect(sparkSegments([1, 2], 0, 0, 10, 10)).toEqual([])
  })
})

describe('historyPeriodMs', () => {
  it('reads the windows the gauge offers, and falls back to a day', () => {
    expect(historyPeriodMs({ item: 'x', historyPeriod: '1h' })).toBe(3600_000)
    expect(historyPeriodMs({ item: 'x' })).toBe(HISTORY_PERIODS['24h'])
    expect(historyPeriodMs({ item: 'x', historyPeriod: 'nonsense' })).toBe(HISTORY_PERIODS['24h'])
  })

  it('falls back for a window named after an Object.prototype member', () => {
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(historyPeriodMs({ item: 'x', historyPeriod: key })).toBe(HISTORY_PERIODS['24h'])
      expect(Number.isFinite(Date.now() - historyPeriodMs({ item: 'x', historyPeriod: key }))).toBe(true)
    }
  })
})
