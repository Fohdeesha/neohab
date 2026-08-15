import { describe, expect, it } from 'vitest'
import { SETTLE_MS, settledDisplay } from './settling'

const NOW = 1_000_000

describe('settledDisplay', () => {
  it('shows the live state when nothing was commanded', () => {
    expect(settledDisplay(undefined, '42', NOW)).toBe('42')
    expect(settledDisplay(undefined, undefined, NOW)).toBeUndefined()
  })

  it('shows the commanded value while the window is open, whatever the device reports', () => {
    const pending = { command: '288,55,40', at: NOW }
    // the real echo sequence one DMX strip produced, in order
    for (const live of ['288,55,40', '332.481,74.71900,69.804', '334.286,74.71900,69.804', '323.617,67.62600,54.510']) {
      expect(settledDisplay(pending, live, NOW + 500)).toBe('288,55,40')
    }
  })

  it('keeps the commanded numbers once the device confirms them, past the window', () => {
    const pending = { command: '288,55,40', at: NOW }
    // the value the strip actually settled at - a shade off, and the same color
    expect(settledDisplay(pending, '287.368,55.88300,40', NOW + SETTLE_MS + 1)).toBe('288,55,40')
    expect(settledDisplay({ command: '42', at: NOW }, '42.4', NOW + SETTLE_MS + 1)).toBe('42')
  })

  it('gives way to a live state that still disagrees once the window has closed', () => {
    const pending = { command: '288,55,40', at: NOW }
    expect(settledDisplay(pending, '20,90,100', NOW + SETTLE_MS + 1)).toBe('20,90,100')
    expect(settledDisplay({ command: '42', at: NOW }, '80', NOW + SETTLE_MS + 1)).toBe('80')
  })

  it('holds for the whole window and no longer', () => {
    const pending = { command: 'ON', at: NOW }
    expect(settledDisplay(pending, 'OFF', NOW + SETTLE_MS - 1)).toBe('ON')
    expect(settledDisplay(pending, 'OFF', NOW + SETTLE_MS)).toBe('OFF')
  })

  it('does not invent a state the device never reported', () => {
    // an unknown item past the window is unknown, not the value we asked for
    expect(settledDisplay({ command: '42', at: NOW }, undefined, NOW + SETTLE_MS + 1)).toBeUndefined()
    expect(settledDisplay({ command: '42', at: NOW }, 'NULL', NOW + SETTLE_MS + 1)).toBe('NULL')
  })
})
