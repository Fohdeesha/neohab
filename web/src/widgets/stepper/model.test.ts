import { describe, expect, it } from 'vitest'
import { numericScale } from '../common/itemControl'
import {
  LOOK_FLOOR,
  arrowsOf,
  atLimit,
  choiceIndex,
  closeEnough,
  finishOf,
  formatNumber,
  fractionOf,
  glyphFor,
  itemChoices,
  lookOf,
  modeOf,
  positionOf,
  positionsIn,
  sameCommand,
  snapToStep,
  stepIndex,
  stepNumber,
  valueDecimals,
  wrapOf
} from './model'
import { stepperWidget } from './index'

const pct = numericScale(0, 100, 1)
const temp = numericScale(16, 30, 0.5)

describe('reading a stored configuration', () => {
  it('lands anything it does not recognise on the default', () => {
    expect(lookOf('stack')).toBe('stack')
    expect(lookOf('carousel')).toBe('carousel')
    expect(lookOf('constructor')).toBe('spinner')
    expect(lookOf('toString')).toBe('spinner')
    expect(lookOf(42)).toBe('spinner')
    expect(lookOf(undefined)).toBe('spinner')
    expect(arrowsOf('triangle')).toBe('triangle')
    expect(arrowsOf('hasOwnProperty')).toBe('auto')
    expect(finishOf('plain')).toBe('plain')
    expect(finishOf('__proto__')).toBe('glow')
    expect(modeOf('list')).toBe('list')
    expect(modeOf('valueOf')).toBe('number')
  })

  it('falls back to the same look, finish, arrows and value kind a new widget starts with', () => {
    const d = stepperWidget.defaultConfig()
    expect(lookOf(undefined)).toBe(d.look)
    expect(finishOf(undefined)).toBe(d.finish)
    expect(arrowsOf(undefined)).toBe(d.arrows)
    expect(modeOf(undefined)).toBe(d.mode)
    expect(d.look).toBe('spinner')
    expect(d.finish).toBe('glow')
  })

  it('wraps only on a stored true, which is what the checkbox writes', () => {
    expect(wrapOf(true)).toBe(true)
    for (const v of [false, 'true', 1, null, undefined, {}]) expect(wrapOf(v)).toBe(false)
  })

  it('gives every look a floor', () => {
    for (const look of ['stack', 'pair', 'spinner', 'split', 'carousel', 'range'] as const) {
      expect(LOOK_FLOOR[look]).toBeGreaterThan(0)
    }
    expect(LOOK_FLOOR.stack).toBeGreaterThan(LOOK_FLOOR.spinner)
  })
})

describe('stepping a number', () => {
  it('moves one step and snaps to the digits the step resolves', () => {
    expect(stepNumber(72.1, 1, numericScale(0, 100, 0.2))).toBe(72.3)
    expect(stepNumber(0.1, 1, numericScale(0, 1, 0.2))).toBe(0.3)
    expect(stepNumber(50, -1, pct)).toBe(49)
    expect(stepNumber(21.5, 1, temp)).toBe(22)
  })

  it('holds inside the range', () => {
    expect(stepNumber(99.5, 1, pct)).toBe(100)
    expect(stepNumber(100, 1, pct)).toBe(100)
    expect(stepNumber(0.5, -1, pct)).toBe(0)
    expect(stepNumber(150, -1, pct)).toBe(100)
  })

  it('starts an unknown value at the minimum, pressed either way', () => {
    expect(stepNumber(undefined, 1, temp)).toBe(16)
    expect(stepNumber(undefined, -1, temp)).toBe(16)
    expect(stepNumber(NaN, 1, temp)).toBe(16)
  })

  it('knows when a press has nowhere to go', () => {
    expect(atLimit(100, 1, pct)).toBe(true)
    expect(atLimit(0, -1, pct)).toBe(true)
    expect(atLimit(50, 1, pct)).toBe(false)
    expect(atLimit(50, -1, pct)).toBe(false)
    expect(atLimit(150, 1, pct)).toBe(true)
    expect(atLimit(undefined, 1, pct)).toBe(false)
    expect(atLimit(undefined, -1, pct)).toBe(false)
  })

  it("snaps to the step's decimals and no more", () => {
    expect(snapToStep(72.30000000000001, 0.1)).toBe(72.3)
    expect(snapToStep(72.34, 1)).toBe(72)
    expect(snapToStep(72.34, 5)).toBe(72)
  })

  it('formats the reading to the step, and a dash for nothing', () => {
    expect(formatNumber(72, 0.5)).toBe('72.0')
    expect(formatNumber(72.25, 0.25)).toBe('72.25')
    expect(formatNumber(72, 1)).toBe('72')
    expect(formatNumber(undefined, 1)).toBe('-')
    expect(formatNumber(NaN, 1)).toBe('-')
  })

  it('never rounds away precision the item itself reports', () => {
    // the step says how precise a press is; an item holding 3.6 under a step of 1 still holds 3.6
    expect(formatNumber(3.6, 1)).toBe('3.6')
    expect(formatNumber(21.5, 1)).toBe('21.5')
    expect(formatNumber(4, 1)).toBe('4')
    // the step still wins where it is the finer of the two
    expect(formatNumber(21.5, 0.25)).toBe('21.50')
    // float noise must not claim seventeen decimals
    expect(formatNumber(0.1 + 0.2, 1)).toBe('0.3')
    expect(valueDecimals(3.6)).toBe(1)
    expect(valueDecimals(4)).toBe(0)
    expect(valueDecimals(0.1 + 0.2)).toBe(1)
    expect(valueDecimals(1.23456)).toBe(3)
  })

  it('places a value in its range for the bar', () => {
    expect(fractionOf(50, pct)).toBe(0.5)
    expect(fractionOf(23, temp)).toBe(0.5)
    expect(fractionOf(undefined, pct)).toBe(0)
    expect(fractionOf(200, pct)).toBe(1)
    expect(fractionOf(-5, pct)).toBe(0)
  })

  it('counts the positions a range holds, for the dots', () => {
    const fan = numericScale(1, 5, 1)
    expect(positionsIn(fan)).toBe(5)
    expect(positionOf(3, fan)).toBe(2)
    expect(positionOf(1, fan)).toBe(0)
    expect(positionOf(undefined, fan)).toBe(-1)
    expect(positionsIn(pct)).toBe(101)
  })
})

describe('stepping a list', () => {
  const inputs = [
    { command: 'HDMI1', label: 'Apple TV' },
    { command: 'HDMI2', label: 'Xbox' },
    { command: 'TV', label: 'Aerial' }
  ]

  it('finds the current choice, tolerating a numeric echo', () => {
    expect(choiceIndex('HDMI2', inputs)).toBe(1)
    expect(choiceIndex('64.0', [{ command: '64', label: 'On' }])).toBe(0)
    expect(
      choiceIndex('1.0', [
        { command: '0', label: 'a' },
        { command: '1', label: 'b' }
      ])
    ).toBe(1)
    expect(choiceIndex('nope', inputs)).toBe(-1)
    expect(choiceIndex(undefined, inputs)).toBe(-1)
    expect(choiceIndex(null, inputs)).toBe(-1)
  })

  it('never reads the empty string as zero', () => {
    expect(sameCommand('', '0')).toBe(false)
    expect(sameCommand('0', '')).toBe(false)
    expect(sameCommand('', '')).toBe(true)
    expect(sameCommand('64', '64.0')).toBe(true)
    expect(sameCommand('ON', 'on')).toBe(false)
  })

  it('stops at the ends unless told to wrap', () => {
    expect(stepIndex(1, 1, 3, false)).toBe(2)
    expect(stepIndex(2, 1, 3, false)).toBe(2)
    expect(stepIndex(2, 1, 3, true)).toBe(0)
    expect(stepIndex(0, -1, 3, false)).toBe(0)
    expect(stepIndex(0, -1, 3, true)).toBe(2)
  })

  it('starts an unknown position at the first entry, and an empty list nowhere', () => {
    expect(stepIndex(-1, 1, 3, false)).toBe(0)
    expect(stepIndex(-1, -1, 3, true)).toBe(0)
    expect(stepIndex(0, 1, 0, false)).toBe(-1)
    expect(stepIndex(-1, 1, 0, true)).toBe(-1)
  })

  it('reads a list off the item, commands first, then states', () => {
    const item = {
      name: 'x',
      type: 'String',
      state: 'A',
      commandDescription: { commandOptions: [{ command: 'A', label: 'Alpha' }, { command: 'B' }] },
      stateDescription: { options: [{ value: 'S', label: 'State' }] }
    }
    expect(itemChoices(item)).toEqual([
      { command: 'A', label: 'Alpha' },
      { command: 'B', label: 'B' }
    ])
    expect(itemChoices({ ...item, commandDescription: undefined })).toEqual([{ command: 'S', label: 'State' }])
    expect(itemChoices(undefined)).toEqual([])
  })

  it('drops server entries that are not what they claim', () => {
    const junk = {
      name: 'x',
      type: 'String',
      state: 'A',
      commandDescription: { commandOptions: [null, { command: 7 }, { command: 'ok', label: '' }] as never }
    }
    expect(itemChoices(junk)).toEqual([{ command: 'ok', label: 'ok' }])
  })
})

describe('the glyph on a button', () => {
  it('picks plus and minus for a number and chevrons for a list when automatic', () => {
    expect(glyphFor('auto', 'number', 'vertical', 1)).toEqual({ shape: 'plusminus', dir: 'plus' })
    expect(glyphFor('auto', 'number', 'horizontal', -1)).toEqual({ shape: 'plusminus', dir: 'minus' })
    expect(glyphFor('auto', 'list', 'vertical', 1)).toEqual({ shape: 'chevron', dir: 'up' })
    expect(glyphFor('auto', 'list', 'horizontal', 1)).toEqual({ shape: 'chevron', dir: 'right' })
    expect(glyphFor('auto', 'list', 'horizontal', -1)).toEqual({ shape: 'chevron', dir: 'left' })
  })

  it("points a chosen shape along the look's axis", () => {
    expect(glyphFor('triangle', 'number', 'vertical', -1)).toEqual({ shape: 'triangle', dir: 'down' })
    expect(glyphFor('arrow', 'list', 'horizontal', 1)).toEqual({ shape: 'arrow', dir: 'right' })
    expect(glyphFor('chevron', 'number', 'horizontal', -1)).toEqual({ shape: 'chevron', dir: 'left' })
    expect(glyphFor('plusminus', 'list', 'horizontal', 1)).toEqual({ shape: 'plusminus', dir: 'plus' })
  })
})

describe('what counts as the device confirming a value', () => {
  it('takes a number within a step as the same value', () => {
    expect(closeEnough('69', '70', 'number', 1)).toBe(true)
    expect(closeEnough('66', '70', 'number', 1)).toBe(false)
    expect(closeEnough('72.5', '72.5', 'number', 0.5)).toBe(true)
    expect(closeEnough('71.5', '72.5', 'number', 0.5)).toBe(false)
    expect(closeEnough('72.4', '72.1', 'number', 0.1)).toBe(true)
  })

  it('takes a list entry only as itself', () => {
    expect(closeEnough('HDMI1', 'HDMI1', 'list', 1)).toBe(true)
    expect(closeEnough('HDMI1', 'HDMI2', 'list', 1)).toBe(false)
    expect(closeEnough('1.0', '1', 'list', 1)).toBe(true)
  })

  it('treats nothing-known as its own value', () => {
    expect(closeEnough(null, null, 'number', 1)).toBe(true)
    expect(closeEnough(null, '5', 'number', 1)).toBe(false)
    expect(closeEnough('5', null, 'list', 1)).toBe(false)
    expect(closeEnough('abc', 'abc', 'number', 1)).toBe(true)
    expect(closeEnough('abc', '5', 'number', 1)).toBe(false)
  })
})
