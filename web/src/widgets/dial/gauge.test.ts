import { describe, expect, it } from 'vitest'
import {
  angleToValue,
  arcOf,
  blockLit,
  fractionOf,
  fractionToAngle,
  gaugeColor,
  gaugeTicks,
  hasInnerRing,
  historyBars,
  inAlarm,
  ledCountOf,
  ledFraction,
  ledLit,
  pickRing,
  severityColor,
  sparkSegments,
  zeroFractionOf,
  type DialConfig,
} from './gauge'

const cfg = (over: Partial<DialConfig> = {}): DialConfig => ({ item: 'X', ...over })

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
    // a partial arc puts the last one exactly at the end instead
    expect(ledFraction(3, 4, 180)).toBe(1)
  })

  it('lights a block by its midpoint, so no block lights one value early', () => {
    // 4 blocks, midpoints at .125 .375 .625 .875
    const lit = (frac: number) => Array.from({ length: 4 }, (_, i) => blockLit(i, 4, frac, 0, false))
    expect(lit(0.2)).toEqual([true, false, false, false])
    expect(lit(0.4)).toEqual([true, true, false, false])
    expect(lit(0)).toEqual([false, false, false, false])
  })

  it('lights exactly one reference block when zero sits on a block edge', () => {
    // zero at .5 is the boundary between blocks 1 and 2 of 4; a midpoint-distance rule lit both
    const lit = Array.from({ length: 4 }, (_, i) => blockLit(i, 4, 0.5, 0.5, true))
    expect(lit.filter(Boolean)).toHaveLength(1)
  })
})

describe('severity colours', () => {
  it('takes the first stop at or above the value, and holds the last one past the end', () => {
    const stops = [
      { value: 10, color: 'blue' },
      { value: 20, color: 'green' },
      { value: 30, color: 'red' },
    ]
    expect(severityColor(5, stops)).toBe('blue')
    expect(severityColor(10, stops)).toBe('blue')
    expect(severityColor(15, stops)).toBe('green')
    expect(severityColor(999, stops)).toBe('red')
  })

  it('sorts stops that were entered out of order', () => {
    const stops = [
      { value: 30, color: 'red' },
      { value: 10, color: 'blue' },
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
  it('snaps to the step and stays inside the range', () => {
    expect(angleToValue(-90, 0, 100, 0, 360, 1, 0)).toBe(0)
    expect(angleToValue(0, 0, 100, 0, 360, 1, 0)).toBe(25)
    expect(angleToValue(-90, 0, 10, 0, 360, 0.1, 1)).toBe(0)
  })

  it('snaps to the step precision rather than trailing float noise', () => {
    const v = angleToValue(12.3, 60, 80, 0, 270, 0.1, 1)
    expect(String(v)).toBe(String(Number(v.toFixed(1))))
  })

  it('clamps an angle in the arc gap to whichever end is nearer', () => {
    // a 270 arc starting at 0 leaves a gap from 270 to 360
    expect(angleToValue(190, 0, 100, 0, 270, 1, 0)).toBe(100)
    expect(angleToValue(260, 0, 100, 0, 270, 1, 0)).toBe(0)
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
    // A dimmer that logs 100 fade points in the first 2% of a bucket must not swamp the value
    // that held for the rest of it.
    const burst = Array.from({ length: 100 }, (_, i) => ({ time: t0 + i, value: 100 }))
    const held = [{ time: t0 + 100, value: 0 }]
    const bars = historyBars([...burst, ...held], t0, t1, 1)
    // one bucket normalises to 0.5, so check the weighting through a two-bucket split instead
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
      [{ time: 0, value: 7 }, { time: 1000, value: 7 }, { time: 2000, value: 7 }],
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
