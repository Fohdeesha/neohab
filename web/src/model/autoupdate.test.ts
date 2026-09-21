import { describe, expect, it } from 'vitest'
import { autoUpdateVetoed, vetoesAutoUpdate } from './autoupdate'

describe('the autoupdate veto', () => {
  it('reads the value the way core does, which is Boolean.parseBoolean', () => {
    // parseBoolean answers true for the string "true" alone, so everything else is a veto - matching
    // only 'false' would miss the ways people actually write it
    expect(vetoesAutoUpdate('false')).toBe(true)
    expect(vetoesAutoUpdate('no')).toBe(true)
    expect(vetoesAutoUpdate('0')).toBe(true)
    expect(vetoesAutoUpdate('off')).toBe(true)
    expect(vetoesAutoUpdate('FALSE')).toBe(true)
  })

  it('is not a veto when the value says true, in any case core would accept', () => {
    expect(vetoesAutoUpdate('true')).toBe(false)
    expect(vetoesAutoUpdate('TRUE')).toBe(false)
    expect(vetoesAutoUpdate('True')).toBe(false)
    expect(vetoesAutoUpdate(' true ')).toBe(false)
  })

  it('treats a blank or missing value as no opinion, because core skips the override entirely', () => {
    for (const v of ['', '   ', undefined, null, 42, {}, []]) expect(vetoesAutoUpdate(v), String(v)).toBe(false)
  })

  it('reads the metadata shape the REST API hands back', () => {
    expect(autoUpdateVetoed({ autoupdate: { value: 'false' } })).toBe(true)
    expect(autoUpdateVetoed({ autoupdate: { value: 'true' } })).toBe(false)
    expect(autoUpdateVetoed({ autoupdate: {} })).toBe(false)
  })

  it('survives every shape a stored or hand-edited metadata block can be', () => {
    for (const m of [undefined, null, 'false', 42, [], { autoupdate: 'false' }, { autoupdate: null }, {}]) {
      expect(autoUpdateVetoed(m), JSON.stringify(m)).toBe(false)
    }
  })

  it('is not confused by an item called constructor, which openHAB accepts as a name', () => {
    // the metadata object comes off the wire, so it carries whatever the server sent
    expect(autoUpdateVetoed({ constructor: { value: 'false' } })).toBe(false)
    expect(autoUpdateVetoed(Object.create(null) as Record<string, unknown>)).toBe(false)
  })
})
