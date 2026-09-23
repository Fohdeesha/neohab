import { describe, expect, it } from 'vitest'
import { autoUpdateVetoed, contradicts, vetoesAutoUpdate } from './autoupdate'

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

describe('a device answering the opposite of its command', () => {
  it('catches a switch that reports back the state it was told to leave', () => {
    expect(contradicts('OFF', 'ON')).toBe(true)
    expect(contradicts('ON', 'OFF')).toBe(true)
    expect(contradicts('OFF', 'OFF')).toBe(false)
    expect(contradicts('ON', 'ON')).toBe(false)
  })

  it('reads a level the way a switch does, so a dimmer left at 5.88 is still on', () => {
    expect(contradicts('OFF', '5.882352941176470588235294117647059')).toBe(true)
    expect(contradicts('OFF', '0')).toBe(false)
    expect(contradicts('ON', '0')).toBe(true)
    expect(contradicts('ON', '100')).toBe(false)
    expect(contradicts('OFF', '120,100,33')).toBe(true)
    expect(contradicts('OFF', '120,100,0')).toBe(false)
    expect(contradicts('ON', '120,100,0')).toBe(true)
  })

  it('judges a contact the same way', () => {
    expect(contradicts('OPEN', 'CLOSED')).toBe(true)
    expect(contradicts('CLOSED', 'OPEN')).toBe(true)
    expect(contradicts('OPEN', 'OPEN')).toBe(false)
  })

  it('does not treat an empty state as zero, which would read it as off', () => {
    expect(contradicts('ON', '')).toBe(false)
    expect(contradicts('ON', '   ')).toBe(false)
    expect(contradicts('ON', '1,2,')).toBe(false)
  })

  it('says nothing about a device that does not know, or a command that names no end state', () => {
    for (const r of ['NULL', 'UNDEF', 'hello']) expect(contradicts('OFF', r), r).toBe(false)
    for (const c of ['UP', 'DOWN', 'STOP', '50', 'PLAY', 'INCREASE', 'REFRESH', 'scene 2']) {
      expect(contradicts(c, 'ON'), c).toBe(false)
      expect(contradicts(c, 'OFF'), c).toBe(false)
    }
  })

  it('takes the command as typed into a widget, not only as openHAB spells it', () => {
    expect(contradicts('off', 'ON')).toBe(true)
    expect(contradicts(' OFF ', 'ON')).toBe(true)
  })
})
