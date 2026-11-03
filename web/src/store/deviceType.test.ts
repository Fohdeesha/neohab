import { describe, expect, it } from 'vitest'
import { deviceTypeFrom } from './deviceType'

describe('the device type kept on this device', () => {
  it('is one of the three surfaces, or nothing', () => {
    expect(deviceTypeFrom('phone')).toBe('phone')
    expect(deviceTypeFrom('tablet')).toBe('tablet')
    expect(deviceTypeFrom('desktop')).toBe('desktop')
    for (const stored of [null, '', 'Tablet', 'tv', 'constructor', 5, {}]) expect(deviceTypeFrom(stored)).toBeNull()
  })
})
