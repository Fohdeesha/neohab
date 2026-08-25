import { describe, expect, it } from 'vitest'
import { named } from './config'

/*
 * The name of a dashboard, theme, widget definition or icon is drawn on nearly every screen at
 * once: the home tiles, the sidebar, the settings lists. React refuses to render an object as a
 * child, so a single stored name that is not a string takes all of them out together - and then
 * there is no working screen left to fix it from, which is a different order of problem from one
 * widget or one screen failing.
 */
describe('named', () => {
  it('leaves a normal config exactly as it is', () => {
    const config = { version: 1, id: 'kitchen', name: 'Kitchen' }
    expect(named(config)).toBe(config)
  })

  it('leaves a config with no name alone, which is what the settings component is', () => {
    const config = { version: 1, theme: 'dark' }
    expect(named(config)).toBe(config)
  })

  it('coerces a name that is not a string, so every screen can still draw it', () => {
    expect(named({ id: 'a', name: { not: 'a string' } }).name).toBe('[object Object]')
    expect(named({ id: 'a', name: 42 }).name).toBe('42')
    expect(named({ id: 'a', name: null }).name).toBe('null')
    expect(named({ id: 'a', name: ['x'] }).name).toBe('x')
  })

  it('does not touch anything else while coercing', () => {
    const out = named({ version: 1, id: 'a', name: 7, widgets: [{ id: 'w' }] })
    expect(out.version).toBe(1)
    expect(out.id).toBe('a')
    expect(out.widgets).toEqual([{ id: 'w' }])
  })

  it('answers with something usable for a config that is not an object at all', () => {
    expect(() => named(undefined as unknown as Record<string, unknown>)).not.toThrow()
  })
})
