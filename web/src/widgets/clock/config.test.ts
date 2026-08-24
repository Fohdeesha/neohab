import { describe, expect, it } from 'vitest'
import { clockSource } from './config'
import { clockWidget } from './index'

describe('which clock a tile follows', () => {
  it('is the openHAB server unless something says otherwise', () => {
    // The DEFAULT, which is what a new clock gets and what a config written before the setting
    // existed resolves to once the definition defaults are merged under it. On a home network
    // the server is the NTP-driven one of the two, and a wall panel whose own clock has drifted
    // is exactly what this widget should not show.
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
