/**
 * Floor plan model: stored-config guards, the object-fit math the glow layer is anchored to,
 * and what each item state glows as. Stored lights come from imports and hand edits, so the
 * hostile shapes are the point.
 */
import { describe, expect, it } from 'vitest'
import {
  containRect,
  DEFAULT_GLOW_SIZE,
  glowCss,
  glowFor,
  glowScaleOf,
  lightsOf,
  planStyleOf,
  stateKind,
  type FloorplanConfig,
} from './model'

describe('lightsOf', () => {
  it('reads well-formed lights and fills defaults', () => {
    const lights = lightsOf({
      lights: [
        { id: 'a', item: 'STRIP_1', x: 10, y: 20 },
        { id: 'b', item: 'PAR_1', x: 90, y: 80, label: 'Par', size: 30 },
      ],
    })
    expect(lights).toHaveLength(2)
    expect(lights[0]).toEqual({ id: 'a', item: 'STRIP_1', x: 10, y: 20, label: undefined, size: undefined })
    expect(lights[1].size).toBe(30)
  })

  it('drops entries without an item, without throwing on garbage', () => {
    const cfg = {
      lights: [null, 42, 'x', {}, { item: '' }, { item: 'OK' }],
    } as unknown as FloorplanConfig
    const lights = lightsOf(cfg)
    expect(lights).toHaveLength(1)
    expect(lights[0].item).toBe('OK')
    // missing position centers rather than NaNs
    expect(lights[0].x).toBe(50)
    expect(lights[0].y).toBe(50)
  })

  it('a lights value that is not an array yields none', () => {
    expect(lightsOf({ lights: {} as unknown as FloorplanConfig['lights'] })).toEqual([])
    expect(lightsOf({})).toEqual([])
  })

  it('clamps positions onto the plan and sizes into sanity, coercing stored strings', () => {
    const cfg = {
      lights: [{ item: 'A', x: '150', y: -20, size: '900' }],
    } as unknown as FloorplanConfig
    const [l] = lightsOf(cfg)
    expect(l.x).toBe(100)
    expect(l.y).toBe(0)
    expect(l.size).toBe(80)
  })

  it('an entry without an id gets a stable derived one', () => {
    const twice = () => lightsOf({ lights: [{ item: 'A', x: 1, y: 1 } as never] })
    expect(twice()[0].id).toBe(twice()[0].id)
  })
})

describe('config guards', () => {
  it('glow scale clamps and defaults', () => {
    expect(glowScaleOf({})).toBe(1)
    expect(glowScaleOf({ glowScale: 200 })).toBe(2)
    expect(glowScaleOf({ glowScale: 1 })).toBe(0.25)
    expect(glowScaleOf({ glowScale: 'wide' as unknown as number })).toBe(1)
  })

  it('plan style falls back to blueprint on anything unknown', () => {
    expect(planStyleOf({})).toBe('blueprint')
    expect(planStyleOf({ planStyle: 'ink' })).toBe('ink')
    expect(planStyleOf({ planStyle: 'sideways' as never })).toBe('blueprint')
  })

  it('the default glow size is a sane percent', () => {
    expect(DEFAULT_GLOW_SIZE).toBeGreaterThan(4)
    expect(DEFAULT_GLOW_SIZE).toBeLessThan(80)
  })
})

describe('containRect', () => {
  it('a wide image in a square box letterboxes top and bottom', () => {
    const r = containRect(100, 100, 200, 100)
    expect(r).toEqual({ left: 0, top: 25, width: 100, height: 50 })
  })

  it('a tall image in a wide box letterboxes left and right', () => {
    const r = containRect(300, 100, 50, 100)
    expect(r).toEqual({ left: 125, top: 0, width: 50, height: 100 })
  })

  it('matching aspect fills the box exactly', () => {
    expect(containRect(200, 100, 400, 200)).toEqual({ left: 0, top: 0, width: 200, height: 100 })
  })

  it('degenerate inputs give an empty rect, never NaN', () => {
    for (const r of [containRect(0, 100, 10, 10), containRect(100, 100, 0, 10), containRect(100, -5, 10, 10)]) {
      expect(r).toEqual({ left: 0, top: 0, width: 0, height: 0 })
    }
  })
})

describe('stateKind', () => {
  it('decides from the state shape, never from a type name', () => {
    // the SSE tracker's `type` is the STATE class (HSB/Percent/OnOff), which is why the
    // popup must not dispatch on item-type names - the shape is what is actually there
    expect(stateKind('120,50,80')).toBe('color')
    expect(stateKind('64')).toBe('level')
    expect(stateKind('64.5')).toBe('level')
    expect(stateKind('ON')).toBe('onoff')
    expect(stateKind('OFF')).toBe('onoff')
    expect(stateKind('playing')).toBe('other')
    expect(stateKind('NULL')).toBe('none')
    expect(stateKind('UNDEF')).toBe('none')
    expect(stateKind(undefined)).toBe('none')
    expect(stateKind('1,2')).toBe('other')
  })
})

describe('glowFor', () => {
  it('color states glow in their color, intensity from brightness', () => {
    const g = glowFor('120,100,50')
    expect(g).not.toBeNull()
    expect(g?.intensity).toBe(0.5)
    // green-ish regardless of the dim state (identity comes from hue at boosted brightness)
    expect(g && g.rgb[1]).toBeGreaterThan(g!.rgb[0])
  })

  it('a color at brightness 0 keeps its marker but casts nothing', () => {
    expect(glowFor('120,100,0')?.intensity).toBe(0)
  })

  it('dimmers and switches glow warm white', () => {
    expect(glowFor('64')?.intensity).toBe(0.64)
    expect(glowFor('ON')?.intensity).toBe(1)
    expect(glowFor('OFF')?.intensity).toBe(0)
  })

  it('unknown states cast nothing at all', () => {
    expect(glowFor(undefined)).toBeNull()
    expect(glowFor('NULL')).toBeNull()
    expect(glowFor('UNDEF')).toBeNull()
    expect(glowFor('playing')).toBeNull()
  })

  it('out-of-range numbers clamp instead of overglowing', () => {
    expect(glowFor('250')?.intensity).toBe(1)
    expect(glowFor('-10')?.intensity).toBe(0)
  })
})

describe('glowCss', () => {
  it('builds a radial gradient in the glow color', () => {
    const css = glowCss({ rgb: [255, 0, 0], intensity: 1 })
    expect(css).toContain('radial-gradient')
    expect(css).toContain('rgba(255, 0, 0')
    expect(css).toContain('0.850')
  })

  it('zero intensity paints fully transparent stops', () => {
    const css = glowCss({ rgb: [255, 0, 0], intensity: 0 })
    expect(css).not.toContain('0.850')
    expect(css).toContain('rgba(255, 0, 0, 0.000) 0%')
  })
})
