import { describe, expect, it } from 'vitest'
import type { Item, ItemState } from '../../api/types'
import { numericScale } from '../common/itemControl'
import {
  BAR_FLOOR,
  DEFAULT_COMMANDS,
  DEFAULT_LOOK,
  LOOK_ARC,
  LOOK_FLOOR,
  activityFrom,
  angleFor,
  angleOfPoint,
  auxFrom,
  barOf,
  closeSetpoint,
  colorOf,
  commands,
  draggable,
  fanFrom,
  floorOf,
  formatCurrent,
  formatSetpoint,
  hasOwnRange,
  isFahrenheit,
  knownState,
  lookOf,
  modeFrom,
  onRing,
  parseStates,
  rampColor,
  readTemp,
  sameState,
  scaleOf,
  statusOf,
  tempParts,
  ticksOf,
  toneOf,
  unitOf,
  valueAtAngle
} from './model'

const state = (s: Partial<ItemState>): ItemState => ({ state: '', type: 'Number', ...s })

describe('reading a stored configuration', () => {
  it('lands anything it does not recognise on the default look', () => {
    expect(lookOf('dial')).toBe('dial')
    expect(lookOf('ring')).toBe('ring')
    expect(lookOf('constructor')).toBe('arc')
    expect(lookOf('toString')).toBe('arc')
    expect(lookOf(42)).toBe('arc')
    expect(lookOf(undefined)).toBe('arc')
  })

  it('falls back to the look a new widget starts with', () => {
    expect(lookOf(undefined)).toBe(DEFAULT_LOOK)
    expect(DEFAULT_LOOK).toBe('arc')
  })

  it('gives every look a floor, an arc and a say on dragging', () => {
    for (const look of ['arc', 'dial', 'disc', 'ring'] as const) {
      expect(LOOK_FLOOR[look]).toBeGreaterThan(0)
      expect(LOOK_ARC[look].sweep).toBeGreaterThan(0)
      expect(LOOK_ARC[look].sweep).toBeLessThanOrEqual(280)
      const gap = 360 - LOOK_ARC[look].sweep
      expect(LOOK_ARC[look].start + LOOK_ARC[look].sweep + gap / 2).toBeCloseTo(450, 6)
    }
    expect(draggable('arc')).toBe(true)
    expect(draggable('dial')).toBe(true)
    expect(draggable('ring')).toBe(false)
  })

  it('asks for a taller phone row when the mode buttons are drawn', () => {
    const bare = floorOf({ currentItem: 'a', setpointItem: 'b' })
    expect(bare).toBe(LOOK_FLOOR.arc)
    expect(floorOf({ currentItem: 'a', setpointItem: 'b', modeItem: 'm' })).toBe(bare + BAR_FLOOR)
    expect(floorOf({ currentItem: 'a', setpointItem: 'b', auxItem: 'x' })).toBe(bare + BAR_FLOOR)
    expect(floorOf({ look: 'ring', fanItem: 'f' })).toBe(LOOK_FLOOR.ring + BAR_FLOOR)
    expect(floorOf({ currentItem: 'a', setpointItem: 'b', modeItem: '' })).toBe(bare)
  })

  it('reads a colour only out of a non-empty string', () => {
    expect(colorOf('#ff8800')).toBe('#ff8800')
    expect(colorOf(' #ff8800 ')).toBe('#ff8800')
    for (const v of ['', '   ', 42, null, undefined, {}]) expect(colorOf(v)).toBeUndefined()
  })

  it('draws a button group only for an item that is set', () => {
    expect(barOf({})).toEqual({ mode: false, fan: false, aux: false, any: false })
    expect(barOf({ modeItem: 'm' })).toMatchObject({ mode: true, any: true })
    expect(barOf({ fanItem: ' ' })).toMatchObject({ fan: false, any: false })
    expect(barOf({ auxItem: 'x', fanItem: 'f' })).toMatchObject({ aux: true, fan: true, mode: false, any: true })
  })
})

describe('temperatures', () => {
  it('reads the number, the unit and the server text off a state', () => {
    expect(readTemp(state({ state: '68.3 °F', displayState: '68 °F', numericState: 68.3, unit: '°F' }))).toEqual({
      value: 68.3,
      unit: '°F',
      text: '68'
    })
    expect(readTemp(state({ state: '21.5', displayState: '21.5 °C', numericState: 21.5 }))).toEqual({
      value: 21.5,
      unit: '°C',
      text: '21.5'
    })
    expect(readTemp(state({ state: '72', numericState: 72 }))).toEqual({ value: 72, unit: undefined, text: '72' })
    expect(readTemp(state({ state: 'NULL' }))).toEqual({ value: undefined, unit: undefined, text: undefined })
    expect(readTemp(undefined)).toEqual({ value: undefined, unit: undefined, text: undefined })
  })

  it('tells Fahrenheit from the unit alone', () => {
    expect(isFahrenheit('°F')).toBe(true)
    expect(isFahrenheit('F')).toBe(true)
    expect(isFahrenheit('°C')).toBe(false)
    expect(isFahrenheit(undefined)).toBe(false)
    expect(isFahrenheit('')).toBe(false)
  })

  it('takes the configured unit first, then the first one an item reports', () => {
    expect(unitOf('K', '°C', '°F')).toBe('K')
    expect(unitOf('', undefined, '°F')).toBe('°F')
    expect(unitOf(undefined, '°C', '°F')).toBe('°C')
    expect(unitOf(42, undefined, undefined)).toBeUndefined()
  })

  it('formats the setpoint to its step and the room to its own precision', () => {
    expect(formatSetpoint(21.5, 0.5)).toBe('21.5')
    expect(formatSetpoint(72, 1)).toBe('72')
    expect(formatSetpoint(undefined, 1)).toBe('-')
    expect(formatSetpoint(NaN, 1)).toBe('-')
    expect(formatCurrent({ value: 68.34, text: '68' }, 1)).toBe('68')
    expect(formatCurrent({ value: 68.34, text: '68.3' }, 1)).toBe('68.3')
    expect(formatCurrent({ value: 19.5, text: '20' }, 0.5)).toBe('19.5')
    expect(formatCurrent({ value: 21.5, text: '21.50' }, 0.5)).toBe('21.50')
    expect(formatCurrent({ value: 68.34 }, 1)).toBe('68')
    expect(formatCurrent({ value: 68.34 }, 0.5)).toBe('68.3')
    expect(formatCurrent({ value: 68 }, 0.1)).toBe('68.0')
    expect(formatCurrent({ value: 68.3, text: 'warm' }, 1)).toBe('warm')
    expect(formatCurrent({}, 1)).toBe('-')
    expect(formatCurrent({ text: '68' }, 1)).toBe('-')
  })

  it('splits a reading into its whole part and its fraction', () => {
    expect(tempParts('69.5')).toEqual({ int: '69', frac: '5' })
    expect(tempParts('21,5')).toEqual({ int: '21', frac: '5' })
    expect(tempParts('-3.25')).toEqual({ int: '-3', frac: '25' })
    expect(tempParts('72')).toEqual({ int: '72' })
    expect(tempParts('-')).toEqual({ int: '-' })
  })

  it('treats a live value within a step of the command as the command confirmed', () => {
    expect(closeSetpoint(72, 72.4, 0.5)).toBe(true)
    expect(closeSetpoint(72, 73, 0.5)).toBe(false)
    expect(closeSetpoint(72, 72.3, 0.1)).toBe(true)
    expect(closeSetpoint(undefined, undefined, 1)).toBe(true)
    expect(closeSetpoint(undefined, 72, 1)).toBe(false)
  })
})

describe('the setpoint scale', () => {
  const declared: Item = { name: 'sp', type: 'Number', state: '20', stateDescription: { minimum: 7, maximum: 35, step: 0.5 } }

  it('takes the widget settings first, then the item, then the unit', () => {
    expect(scaleOf({ min: 60, max: 80, step: 1 }, declared, '°F')).toEqual({ min: 60, max: 80, step: 1 })
    expect(scaleOf({}, declared, '°C')).toEqual({ min: 7, max: 35, step: 0.5 })
    expect(scaleOf({}, undefined, '°C')).toEqual({ min: 10, max: 30, step: 0.5 })
    expect(scaleOf({}, undefined, '°F')).toEqual({ min: 50, max: 90, step: 1 })
    expect(scaleOf({}, undefined, undefined)).toEqual({ min: 10, max: 30, step: 0.5 })
    expect(scaleOf({ step: 1 }, declared, '°C')).toEqual({ min: 7, max: 35, step: 1 })
    expect(scaleOf({ min: 15 }, undefined, '°F')).toEqual({ min: 15, max: 90, step: 1 })
  })

  it('guards the numbers like every scale', () => {
    expect(scaleOf({ min: '', max: 'abc', step: 0 }, undefined, '°C')).toEqual({ min: 10, max: 30, step: 0.5 })
    expect(scaleOf({ min: 25, max: 20 }, undefined, '°C')).toEqual({ min: 25, max: 45, step: 0.5 })
    expect(scaleOf({ step: -1 }, undefined, '°F')).toEqual({ min: 50, max: 90, step: 1 })
    expect(scaleOf({}, { ...declared, stateDescription: { step: 0 } }, '°C')).toEqual({ min: 10, max: 30, step: 0.5 })
  })

  it('knows when the settings decide the whole range', () => {
    expect(hasOwnRange({ min: 10, max: 30, step: 0.5 })).toBe(true)
    expect(hasOwnRange({ min: 10, max: 30 })).toBe(false)
    expect(hasOwnRange({ min: '10', max: '30', step: '1' })).toBe(true)
    expect(hasOwnRange({ min: '', max: 30, step: 1 })).toBe(false)
    expect(hasOwnRange({})).toBe(false)
  })
})

describe('the ring', () => {
  const arc = LOOK_ARC.arc
  const c = numericScale(10, 30, 0.5)

  it('puts a fraction on the arc and a point at an angle', () => {
    expect(angleFor(0, arc)).toBe(135)
    expect(angleFor(1, arc)).toBe(405)
    expect(angleFor(0.5, arc)).toBe(270)
    expect(angleFor(2, arc)).toBe(405)
    expect(angleFor(-1, arc)).toBe(135)
    expect(angleOfPoint(50, 50, 60, 50)).toBe(0)
    expect(angleOfPoint(50, 50, 50, 60)).toBe(90)
    expect(angleOfPoint(50, 50, 40, 50)).toBe(180)
  })

  it('reads the setpoint an angle means, snapped to the step and held in the range', () => {
    expect(valueAtAngle(135, arc, c)).toBe(10)
    expect(valueAtAngle(270, arc, c)).toBe(20)
    expect(valueAtAngle(45, arc, c)).toBe(30)
    expect(valueAtAngle(272, arc, c)).toBe(20)
    expect(valueAtAngle(277, arc, c)).toBe(20.5)
    expect(valueAtAngle(-90, arc, c)).toBe(20)
    expect(valueAtAngle(-135, arc, c)).toBe(valueAtAngle(225, arc, c))
  })

  it('snaps a press in the gap to the nearer end', () => {
    expect(valueAtAngle(60, arc, c)).toBe(30)
    expect(valueAtAngle(120, arc, c)).toBe(10)
    expect(valueAtAngle(89, arc, c)).toBe(30)
    expect(valueAtAngle(91, arc, c)).toBe(10)
  })

  it('takes a press on the band and not on the face, on the looks that can be dragged', () => {
    expect(onRing(1, 270, 'arc')).toBe(true)
    expect(onRing(0.7, 180, 'arc')).toBe(true)
    expect(onRing(0.3, 270, 'arc')).toBe(false)
    expect(onRing(1.3, 270, 'arc')).toBe(false)
    expect(onRing(0.9, 0, 'dial')).toBe(true)
    expect(onRing(0.5, 0, 'disc')).toBe(false)
    expect(onRing(1, 270, 'ring')).toBe(false)
  })

  it('does not take a press in the gap, where the buttons are', () => {
    expect(onRing(0.9, 90, 'arc')).toBe(false)
    expect(onRing(0.9, 60, 'arc')).toBe(false)
    expect(onRing(0.9, 125, 'arc')).toBe(false)
    expect(onRing(0.9, 140, 'arc')).toBe(true)
    expect(onRing(0.9, 40, 'arc')).toBe(true)
    expect(onRing(0.9, 45, 'arc')).toBe(true)
    expect(onRing(0.9, 49, 'arc')).toBe(true)
    expect(onRing(0.9, 131, 'arc')).toBe(true)
    expect(onRing(0.9, 90, 'dial')).toBe(false)
    expect(onRing(0.9, 60, 'dial')).toBe(false)
    expect(onRing(0.9, 140, 'dial')).toBe(true)
    expect(onRing(0.9, -90, 'arc')).toBe(true)
    expect(onRing(0.9, -270, 'arc')).toBe(false)
  })

  it('spreads the ticks with the first and last on the ends of the arc', () => {
    const t = ticksOf(5, arc)
    expect(t).toEqual([135, 202.5, 270, 337.5, 405])
    expect(ticksOf(1, arc)).toEqual([135])
    expect(ticksOf(0, arc)).toEqual([135])
    expect(ticksOf(91, LOOK_ARC.dial)).toHaveLength(91)
    const dial = ticksOf(121, LOOK_ARC.dial)
    expect(dial[0]).toBe(135)
    expect(dial[120]).toBe(405)
  })

  it('colours a temperature by where it sits in the scale', () => {
    expect(rampColor(0)).toBe('color-mix(in srgb, var(--th-mid) 0%, var(--th-cool))')
    expect(rampColor(0.25)).toBe('color-mix(in srgb, var(--th-mid) 50%, var(--th-cool))')
    expect(rampColor(0.5)).toBe('color-mix(in srgb, var(--th-mid) 100%, var(--th-cool))')
    expect(rampColor(0.75)).toBe('color-mix(in srgb, var(--th-heat) 50%, var(--th-mid))')
    expect(rampColor(1)).toBe('color-mix(in srgb, var(--th-heat) 100%, var(--th-mid))')
    expect(rampColor(0.5)).toContain('var(--th-mid) 100%')
    expect(rampColor(0.500001)).toContain('var(--th-heat) 0%')
    expect(rampColor(-2)).toBe(rampColor(0))
    expect(rampColor(9)).toBe(rampColor(1))
    expect(rampColor(NaN)).toBe(rampColor(0))
    expect(rampColor(Infinity)).toBe(rampColor(0))
  })
})

describe('mode, fan, aux and status', () => {
  it('reads a state as known only when it says something', () => {
    expect(knownState('HEAT')).toBe('HEAT')
    for (const v of ['NULL', 'UNDEF', '', undefined, null, 42]) expect(knownState(v)).toBeUndefined()
  })

  it('matches states in either case and as numbers', () => {
    expect(sameState('HEAT', 'heat')).toBe(true)
    expect(sameState('1', '1.0')).toBe(true)
    expect(sameState('on', 'ON')).toBe(true)
    expect(sameState('HEAT', 'COOL')).toBe(false)
    expect(sameState('', '0')).toBe(false)
  })

  it('splits a comma list and drops what is not a string', () => {
    expect(parseStates('heating, HEATING , 1')).toEqual(['heating', 'HEATING', '1'])
    expect(parseStates(' ,, ')).toEqual([])
    expect(parseStates(42)).toEqual([])
    expect(parseStates(undefined)).toEqual([])
  })

  it("carries a default for every command and takes the widget's own over it", () => {
    expect(commands({})).toEqual({ heat: 'HEAT', cool: 'COOL', fanAuto: 'AUTO', fanOn: 'ON', auxOn: 'ON', auxOff: 'OFF' })
    expect(commands({ heatCommand: 'heat', fanOnCommand: '1', auxOffCommand: '' })).toMatchObject({
      heat: 'heat',
      fanOn: '1',
      auxOff: 'OFF'
    })
    expect(DEFAULT_COMMANDS.heat).toBe('HEAT')
  })

  it("names the mode a state means, in the binding's own words", () => {
    expect(modeFrom('HEAT', {})).toBe('heat')
    expect(modeFrom('heat', {})).toBe('heat')
    expect(modeFrom('COOL', {})).toBe('cool')
    expect(modeFrom('OFF', {})).toBe('other')
    expect(modeFrom('NULL', {})).toBe('unknown')
    expect(modeFrom(undefined, {})).toBe('unknown')
    expect(modeFrom('1.0', { heatCommand: '1', coolCommand: '2' })).toBe('heat')
    expect(modeFrom('2', { heatCommand: '1', coolCommand: '2' })).toBe('cool')
  })

  it('reads the fan and the aux the same way', () => {
    expect(fanFrom('AUTO', {})).toBe('auto')
    expect(fanFrom('on', {})).toBe('on')
    expect(fanFrom('CIRCULATE', {})).toBe('other')
    expect(fanFrom(undefined, {})).toBe('unknown')
    expect(auxFrom('ON', {})).toBe(true)
    expect(auxFrom('OFF', {})).toBe(false)
    expect(auxFrom('MAYBE', {})).toBeUndefined()
    expect(auxFrom(undefined, {})).toBeUndefined()
    expect(auxFrom('1', { auxOnCommand: '1', auxOffCommand: '0' })).toBe(true)
  })

  it('reads what the system is doing from the status item', () => {
    expect(activityFrom('heating', {})).toBe('heating')
    expect(activityFrom('COOLING', {})).toBe('cooling')
    expect(activityFrom('1', {})).toBe('heating')
    expect(activityFrom('2', {})).toBe('cooling')
    expect(activityFrom('idle', {})).toBe('idle')
    expect(activityFrom('0', {})).toBe('idle')
    expect(activityFrom(undefined, {})).toBe('unknown')
    expect(activityFrom('warm', { heatingStates: 'warm, hot' })).toBe('heating')
    expect(activityFrom('HEATING', { heatingStates: 'warm' })).toBe('idle')
  })

  it('colours the face by the mode first, then by what the system is doing', () => {
    expect(toneOf('heat', 'cooling')).toBe('heat')
    expect(toneOf('cool', 'unknown')).toBe('cool')
    expect(toneOf('other', 'heating')).toBe('heat')
    expect(toneOf('unknown', 'cooling')).toBe('cool')
    expect(toneOf('other', 'idle')).toBe('neutral')
    expect(toneOf('unknown', 'unknown')).toBe('neutral')
  })

  it('says what the status line says', () => {
    expect(statusOf('heat', 'heating', 'HEAT')).toEqual({ kind: 'heating' })
    expect(statusOf('heat', 'idle', 'HEAT')).toEqual({ kind: 'idle' })
    expect(statusOf('cool', 'unknown', 'COOL')).toEqual({ kind: 'cool' })
    expect(statusOf('other', 'unknown', 'ECO')).toEqual({ kind: 'raw', text: 'ECO' })
    expect(statusOf('unknown', 'unknown', undefined)).toEqual({ kind: 'none' })
    expect(statusOf('unknown', 'unknown', 'NULL')).toEqual({ kind: 'none' })
  })
})
