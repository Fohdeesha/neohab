import { describe, expect, it } from 'vitest'
import { DISPLAY_SETTLE_MS, settledDisplay } from './settling'

const NOW = 1_000_000

describe('settledDisplay', () => {
  it('shows the live state when nothing was commanded', () => {
    expect(settledDisplay(undefined, '42', NOW)).toBe('42')
    expect(settledDisplay(undefined, undefined, NOW)).toBeUndefined()
  })

  it('shows the commanded value while the window is open, whatever the device reports', () => {
    const pending = { command: '288,55,40', at: NOW }
    for (const live of ['288,55,40', '332.481,74.71900,69.804', '334.286,74.71900,69.804', '323.617,67.62600,54.510']) {
      expect(settledDisplay(pending, live, NOW + 500)).toBe('288,55,40')
    }
  })

  it('keeps the commanded numbers once the device confirms them, past the window', () => {
    const pending = { command: '288,55,40', at: NOW }
    expect(settledDisplay(pending, '287.368,55.88300,40', NOW + DISPLAY_SETTLE_MS + 1)).toBe('288,55,40')
    expect(settledDisplay({ command: '42', at: NOW }, '42.4', NOW + DISPLAY_SETTLE_MS + 1)).toBe('42')
  })

  it('gives way to a live state that still disagrees once the window has closed', () => {
    const pending = { command: '288,55,40', at: NOW }
    expect(settledDisplay(pending, '20,90,100', NOW + DISPLAY_SETTLE_MS + 1)).toBe('20,90,100')
    expect(settledDisplay({ command: '42', at: NOW }, '80', NOW + DISPLAY_SETTLE_MS + 1)).toBe('80')
  })

  it('holds for the whole window and no longer', () => {
    const pending = { command: 'ON', at: NOW }
    expect(settledDisplay(pending, 'OFF', NOW + DISPLAY_SETTLE_MS - 1)).toBe('ON')
    expect(settledDisplay(pending, 'OFF', NOW + DISPLAY_SETTLE_MS)).toBe('OFF')
  })

  it('does not invent a state the device never reported', () => {
    expect(settledDisplay({ command: '42', at: NOW }, undefined, NOW + DISPLAY_SETTLE_MS + 1)).toBeUndefined()
    expect(settledDisplay({ command: '42', at: NOW }, 'NULL', NOW + DISPLAY_SETTLE_MS + 1)).toBe('NULL')
  })
})
