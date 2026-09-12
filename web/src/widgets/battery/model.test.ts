import { describe, expect, it } from 'vitest'
import {
  METER_MAX,
  METER_MIN,
  RING_TICKS,
  animateOf,
  cellStates,
  chargingOf,
  colorModeOf,
  displayPercent,
  inputRange,
  levelOf,
  litCount,
  meterCount,
  percentOf,
  podFadeStop,
  showTextOf,
  styleOf,
  thresholdsOf,
  wavePath
} from './model'

const state = (s: string) => ({ state: s, type: 'Number' })

describe('battery readers', () => {
  it('fall back for anything a stored config could hold', () => {
    expect(styleOf(undefined)).toBe('neon')
    expect(styleOf('glow')).toBe('glow')
    expect(styleOf('constructor')).toBe('neon')
    expect(styleOf(42)).toBe('neon')
    expect(colorModeOf('accent')).toBe('accent')
    expect(colorModeOf('toString')).toBe('level')
    expect(colorModeOf(undefined)).toBe('level')
    expect(showTextOf(undefined)).toBe(true)
    expect(showTextOf(false)).toBe(false)
    expect(showTextOf('no')).toBe(true)
    expect(animateOf(undefined)).toBe(true)
    expect(animateOf(false)).toBe(false)
  })

  it('reads the input range and refuses one that cannot hold a value', () => {
    expect(inputRange(undefined, undefined)).toEqual({ min: 0, max: 100 })
    expect(inputRange(3000, 4200)).toEqual({ min: 3000, max: 4200 })
    expect(inputRange('3000', '4200')).toEqual({ min: 3000, max: 4200 })
    expect(inputRange('abc', -5)).toEqual({ min: 0, max: 100 })
    expect(inputRange(50, 50)).toEqual({ min: 50, max: 150 })
    expect(inputRange(50, 10)).toEqual({ min: 50, max: 150 })
    expect(inputRange('', '')).toEqual({ min: 0, max: 100 })
  })

  it('scales any input range onto 0 to 100 and clamps outside it', () => {
    const mv = inputRange(3000, 4200)
    expect(percentOf(3600, mv)).toBe(50)
    expect(percentOf(3000, mv)).toBe(0)
    expect(percentOf(4200, mv)).toBe(100)
    expect(percentOf(5000, mv)).toBe(100)
    expect(percentOf(-1, mv)).toBe(0)
    expect(percentOf(56, inputRange(0, 100))).toBe(56)
    expect(percentOf(undefined, mv)).toBeNull()
    expect(percentOf(NaN, mv)).toBeNull()
  })

  it('keeps the thresholds in order and inside the scale', () => {
    expect(thresholdsOf(undefined, undefined)).toEqual({ low: 20, mid: 45 })
    expect(thresholdsOf(10, 30)).toEqual({ low: 10, mid: 30 })
    expect(thresholdsOf(60, 30)).toEqual({ low: 60, mid: 60 })
    expect(thresholdsOf(-5, 500)).toEqual({ low: 0, mid: 100 })
    expect(thresholdsOf('abc', {})).toEqual({ low: 20, mid: 45 })
  })

  it('names the level, and nothing for an unknown state', () => {
    const th = thresholdsOf(20, 45)
    expect(levelOf(92, th)).toBe('good')
    expect(levelOf(45, th)).toBe('good')
    expect(levelOf(44.9, th)).toBe('mid')
    expect(levelOf(20, th)).toBe('mid')
    expect(levelOf(19.9, th)).toBe('low')
    expect(levelOf(0, th)).toBe('low')
    expect(levelOf(null, th)).toBeNull()
  })

  it('prints a whole percent or a dash', () => {
    expect(displayPercent(56.4)).toBe('56')
    expect(displayPercent(56.5)).toBe('57')
    expect(displayPercent(0)).toBe('0')
    expect(displayPercent(null)).toBe('-')
  })

  it('reads charging from a switch, a contact or a number', () => {
    expect(chargingOf(state('ON'))).toBe(true)
    expect(chargingOf(state('OFF'))).toBe(false)
    expect(chargingOf(state('OPEN'))).toBe(true)
    expect(chargingOf(state('CLOSED'))).toBe(false)
    expect(chargingOf(state('12'))).toBe(true)
    expect(chargingOf(state('0'))).toBe(false)
    expect(chargingOf(state('NULL'))).toBe(false)
    expect(chargingOf(undefined)).toBe(false)
  })
})

describe('battery geometry', () => {
  it('lights cells from the bottom and marks the one the level sits in', () => {
    expect(cellStates(56, 4)).toEqual(['full', 'full', 'part', 'empty'])
    expect(cellStates(100, 4)).toEqual(['full', 'full', 'full', 'full'])
    expect(cellStates(0, 4)).toEqual(['empty', 'empty', 'empty', 'empty'])
    expect(cellStates(25, 4)).toEqual(['full', 'empty', 'empty', 'empty'])
    expect(cellStates(12, 5)).toEqual(['part', 'empty', 'empty', 'empty', 'empty'])
  })

  it('counts lit ticks and segments to the nearest one, never past the end', () => {
    expect(litCount(56, RING_TICKS)).toBe(27)
    expect(litCount(100, RING_TICKS)).toBe(RING_TICKS)
    expect(litCount(0, 20)).toBe(0)
    expect(litCount(101, 20)).toBe(20)
    expect(litCount(-3, 20)).toBe(0)
  })

  it('fits between 8 and 20 meter segments to the width it has', () => {
    expect(meterCount(290)).toBe(METER_MAX)
    expect(meterCount(129)).toBe(11)
    expect(meterCount(40)).toBe(METER_MIN)
    expect(meterCount(0)).toBe(METER_MIN)
    expect(meterCount(NaN)).toBe(METER_MIN)
  })

  it('fades a pods fill over a fixed depth, so a low level keeps a solid band', () => {
    expect(podFadeStop(0, 55)).toBe(0)
    expect(podFadeStop(12, 55)).toBeCloseTo(0.5)
    expect(podFadeStop(148, 139)).toBeCloseTo(62.55 / 148)
    expect(podFadeStop(200, 55)).toBeCloseTo(24.75 / 200)
  })

  it('draws a closed wave one period wide that covers the vessel at any shift', () => {
    const d = wavePath(100, 170, 80, 5, 0)
    expect(d.startsWith('M-100,80')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect((d.match(/ q/g) ?? []).length).toBe(6)
    expect(wavePath(100, 170, 80, 5, 25).startsWith('M-75,80')).toBe(true)
    expect(wavePath(100, 170, 80, 5, 0, 3.5).startsWith('M-100,76.5')).toBe(true)
  })
})
