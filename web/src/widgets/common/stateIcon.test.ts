import { describe, expect, it } from 'vitest'
import { resolveStateIcon, stateMatches, type StateIconConfig } from './stateIcon'

describe('stateMatches', () => {
  /**
   * HABPanel toggle semantics: active exactly when the raw state EQUALS the command. An
   * isOn()-style heuristic inverts an imported button at an intermediate rollershutter position,
   * which is how a half-stopped garage door ended up sending "open" when it meant "close".
   */
  it('is exact, but tolerant of how a number was written', () => {
    expect(stateMatches('ON', 'ON')).toBe(true)
    expect(stateMatches('100', '100.0')).toBe(true)
    expect(stateMatches(100, '100')).toBe(true)
    expect(stateMatches('50', '100')).toBe(false)
    expect(stateMatches('ON', 'OFF')).toBe(false)
  })

  it('never matches on nothing', () => {
    expect(stateMatches(undefined, 'ON')).toBe(false)
    expect(stateMatches('ON', undefined)).toBe(false)
    expect(stateMatches('', '')).toBe(true) // identical strings still match
    expect(stateMatches('  ', 'ON')).toBe(false)
  })
})

describe('resolveStateIcon', () => {
  const base: StateIconConfig = { icon: 'mdi:bulb', iconActive: 'mdi:bulb-on', iconColor: '#888', iconColorActive: '#ff0' }

  it('falls back through rule, active slot, base slot', () => {
    expect(resolveStateIcon(base, false, 'OFF')).toEqual({ icon: 'mdi:bulb', color: '#888' })
    expect(resolveStateIcon(base, true, 'ON')).toEqual({ icon: 'mdi:bulb-on', color: '#ff0' })
    expect(resolveStateIcon({}, true)).toEqual({ icon: undefined, color: undefined })
  })

  it('lets the first matching per-state rule win', () => {
    const c: StateIconConfig = { ...base, stateIcons: [{ state: 'OPEN', icon: 'mdi:door-open', color: '#0f0' }] }
    expect(resolveStateIcon(c, false, 'OPEN')).toEqual({ icon: 'mdi:door-open', color: '#0f0' })
    expect(resolveStateIcon(c, false, 'CLOSED').icon).toBe('mdi:bulb')
  })

  it('matches an inclusive numeric range, negatives included', () => {
    const c: StateIconConfig = {
      stateIcons: [
        { state: '1-49', icon: 'dim' },
        { state: '50-100', icon: 'bright' }
      ]
    }
    expect(resolveStateIcon(c, false, '1').icon).toBe('dim')
    expect(resolveStateIcon(c, false, '49').icon).toBe('dim')
    expect(resolveStateIcon(c, false, '50').icon).toBe('bright')
    expect(resolveStateIcon(c, false, '0').icon).toBeUndefined()

    const cold: StateIconConfig = { stateIcons: [{ state: '-10-10', icon: 'mild' }] }
    expect(resolveStateIcon(cold, false, '-5').icon).toBe('mild')
    expect(resolveStateIcon(cold, false, '-11').icon).toBeUndefined()
  })

  it('lets a rule fill in only what it sets, the rest falling through', () => {
    const c: StateIconConfig = { ...base, stateIcons: [{ state: 'ON', color: '#f00' }] }
    // only the colour was given, so the icon still comes from the active slot
    expect(resolveStateIcon(c, true, 'ON')).toEqual({ icon: 'mdi:bulb-on', color: '#f00' })
  })

  it('survives a rules list that is not a list, or holds junk', () => {
    expect(resolveStateIcon({ stateIcons: 42 as never, icon: 'x' }, false, 'ON').icon).toBe('x')
    expect(resolveStateIcon({ stateIcons: [null as never], icon: 'x' }, false, 'ON').icon).toBe('x')
    expect(resolveStateIcon({ stateIcons: [{ state: '' }], icon: 'x' }, false, 'ON').icon).toBe('x')
  })
})
