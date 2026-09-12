import { describe, expect, it } from 'vitest'
import type { ItemState } from '../../api/types'
import { buttonFloor, commandFor, drawsFace, fillsTile, finishOf, isActive, styleOf, toggleCommands } from './model'

const state = (s: string): ItemState => ({ state: s }) as ItemState

describe('which style a stored config asks for', () => {
  it('is a plain button unless the config says otherwise', () => {
    expect(styleOf('switch')).toBe('switch')
    expect(styleOf('card')).toBe('card')
    expect(styleOf('button')).toBe('button')
    expect(styleOf(undefined)).toBe('button')
  })

  it('falls back to a button for anything a person could put there by hand', () => {
    for (const junk of ['Switch', 'SWITCH', '', 0, 1, null, {}, [], true, 'constructor']) {
      expect(styleOf(junk), JSON.stringify(junk)).toBe('button')
    }
  })

  it('draws a face for every style but the switch', () => {
    expect(drawsFace('button')).toBe(true)
    expect(drawsFace('card')).toBe(true)
    expect(drawsFace(undefined)).toBe(true)
    expect(drawsFace('switch')).toBe(false)
  })

  it('asks for more room for a card, which stacks a chip over a name and a caption', () => {
    expect(buttonFloor({ style: 'card' })).toBeGreaterThan(0)
    expect(buttonFloor({ style: 'button' })).toBe(0)
    expect(buttonFloor({ style: 'switch' })).toBe(0)
    expect(buttonFloor({})).toBe(0)
  })
})

describe('which finish a stored config asks for', () => {
  it('is plain unless the config names one', () => {
    for (const f of ['solid', 'glass', 'glow', 'edge', 'outline', 'sheen', 'bare', 'plain']) {
      expect(finishOf(f), f).toBe(f)
    }
    expect(finishOf(undefined)).toBe('plain')
  })

  it('falls back to plain for anything a person could put there by hand', () => {
    for (const junk of ['Solid', 'SOLID', '', 0, null, {}, [], true, 'constructor', 'toString']) {
      expect(finishOf(junk), JSON.stringify(junk)).toBe('plain')
    }
  })

  it('leaves the tile alone for plain, and fills it for a finish someone picked', () => {
    expect(fillsTile({})).toBe(false)
    expect(fillsTile({ finish: 'plain' })).toBe(false)
    expect(fillsTile({ finish: 'glass' })).toBe(true)
    expect(fillsTile({ style: 'card', finish: 'edge' })).toBe(true)
    // a switch draws a track, not a face, so there is nothing to fill
    expect(fillsTile({ style: 'switch', finish: 'solid' })).toBe(false)
  })
})

describe('what a press sends', () => {
  it('sends the command every time until it is told to toggle', () => {
    const plain = { command: 'PLAY', commandAlt: 'STOP' }
    expect(commandFor(plain, false)).toBe('PLAY')
    expect(commandFor(plain, true)).toBe('PLAY')
    expect(commandFor({ ...plain, toggle: true }, false)).toBe('PLAY')
    expect(commandFor({ ...plain, toggle: true }, true)).toBe('STOP')
  })

  it('keeps sending the one command when a toggling tile has no alternate', () => {
    expect(commandFor({ command: 'ON', toggle: true }, true)).toBe('ON')
    expect(commandFor({ command: 'ON', commandAlt: '', toggle: true }, true)).toBe('ON')
  })

  it('does the same whichever style is drawing it', () => {
    const config = { command: 'OPEN', commandAlt: 'CLOSE', toggle: true }
    for (const style of ['button', 'card', 'switch']) {
      expect(commandFor({ ...config, style }, false), style).toBe('OPEN')
      expect(commandFor({ ...config, style }, true), style).toBe('CLOSE')
    }
  })

  it('offers no alternate until the tile is toggling', () => {
    expect(toggleCommands({ command: 'A', commandAlt: 'B' })).toEqual({ on: 'A', off: undefined })
    expect(toggleCommands({ command: 'A', commandAlt: 'B', toggle: true })).toEqual({ on: 'A', off: 'B' })
  })

  it('reads a command a hand edit left as a number', () => {
    expect(toggleCommands({ command: 100, commandAlt: 0, toggle: true })).toEqual({ on: '100', off: '0' })
    expect(toggleCommands({ command: {}, commandAlt: [], toggle: true })).toEqual({ on: '', off: undefined })
  })
})

describe('when a tile shows itself as on', () => {
  it('says nothing at all until it is asked to reflect state', () => {
    expect(isActive({ command: 'ON' }, state('ON'))).toBe(false)
    expect(isActive({ command: 'ON', toggle: true }, state('ON'))).toBe(true)
  })

  it('matches the command exactly, which is what HABPanel does', () => {
    const cfg = { command: '100', toggle: true }
    expect(isActive(cfg, state('100'))).toBe(true)
    // the server echoes a number back with a decimal part
    expect(isActive(cfg, state('100.0'))).toBe(true)
    expect(isActive(cfg, state('50'))).toBe(false)
    expect(isActive(cfg, state('ON'))).toBe(false)
  })

  it('is off with no state at all, and with a command nothing could match', () => {
    expect(isActive({ command: 'ON', toggle: true }, undefined)).toBe(false)
    expect(isActive({ command: '', toggle: true }, state('ON'))).toBe(false)
    expect(isActive({ command: {}, toggle: true }, state('ON'))).toBe(false)
  })

  it('reads the same way in either style: the look decides nothing', () => {
    for (const style of ['button', 'card', 'switch']) {
      expect(isActive({ style, command: 'ON', toggle: true }, state('50')), style).toBe(false)
      expect(isActive({ style, command: 'ON', toggle: true, nonZeroIsOn: true }, state('50')), style).toBe(true)
    }
  })
})

describe('counting any value above zero as on', () => {
  const on = { command: 'ON', toggle: true, nonZeroIsOn: true }

  it('takes a dimmer part way up as on, and zero as off', () => {
    expect(isActive(on, state('50'))).toBe(true)
    expect(isActive(on, state('0'))).toBe(false)
    expect(isActive(on, state('ON'))).toBe(true)
    expect(isActive(on, state('OFF'))).toBe(false)
  })

  it('reads a color by its brightness, the last of the three', () => {
    expect(isActive(on, state('120,50,40'))).toBe(true)
    expect(isActive(on, state('120,50,0'))).toBe(false)
  })

  it('still matches the command exactly on top, so a String item works', () => {
    const named = { command: 'PLAYING', commandAlt: 'STOPPED', toggle: true, nonZeroIsOn: true }
    expect(isActive(named, state('PLAYING'))).toBe(true)
    expect(isActive(named, state('STOPPED'))).toBe(false)
  })

  it('does nothing at all while the tile is not toggling', () => {
    expect(isActive({ command: 'ON', nonZeroIsOn: true }, state('50'))).toBe(false)
  })

  it('is off with no state at all', () => {
    expect(isActive(on, undefined)).toBe(false)
  })

  it('takes only a real true, so a stored string cannot switch it on by accident', () => {
    for (const junk of ['true', 1, 'yes', {}, null]) {
      expect(isActive({ command: 'ON', toggle: true, nonZeroIsOn: junk }, state('50')), JSON.stringify(junk)).toBe(false)
    }
  })
})
