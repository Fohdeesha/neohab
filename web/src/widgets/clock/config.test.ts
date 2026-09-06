import { describe, expect, it } from 'vitest'
import { clockSource } from './config'
import { clockWidget } from './index'

describe('which clock a tile follows', () => {
  it('is the openHAB server unless something says otherwise', () => {
    expect(clockWidget.defaultConfig().timeSource).toBe('server')
    expect(clockSource({ ...clockWidget.defaultConfig() })).toBe('server')
  })

  it('is this device when the widget asks for it', () => {
    expect(clockSource({ ...clockWidget.defaultConfig(), timeSource: 'device' })).toBe('device')
  })

  it('and for anything else stored, which cannot fail while a request can', () => {
    for (const stored of ['SERVER', 'openhab', '', 0, null, undefined, {}]) {
      expect(clockSource({ timeSource: stored }), String(stored)).toBe('device')
    }
  })
})
