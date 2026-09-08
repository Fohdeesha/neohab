import { describe, expect, it } from 'vitest'
import type { Item } from '../api/types'
import {
  baseType,
  configFor,
  equipmentIcon,
  isReadOnlyPoint,
  locationIcon,
  pointIcon,
  prettyLabel,
  sizeFor,
  suggestWidget,
  titleCase,
  widgetChoices
} from './mapping'
import type { Semantics } from './semantics'

const item = (over: Partial<Item> & { name: string }): Item => ({ type: 'Switch', state: 'OFF', ...over }) as Item

const NO_SEM: Semantics = { kind: null }
const point = (name: string): Semantics => ({ kind: 'point', point: { name, root: 'Point', label: name } })
const withProperty = (property: string): Semantics => ({
  kind: 'point',
  point: { name: 'Measurement', root: 'Point', label: 'Measurement' },
  property: { name: property, root: 'Property', label: property }
})

const PROTO_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

describe('base type', () => {
  it.each([
    ['Switch', 'Switch'],
    ['Number:Temperature', 'Number'],
    ['Number:Dimensionless', 'Number'],
    ['Dimmer', 'Dimmer']
  ])('reduces %s to %s', (type, expected) => {
    expect(baseType(item({ name: 'i', type }))).toBe(expected)
  })

  it('takes a typed group’s member type, since that is what a widget would drive', () => {
    expect(baseType(item({ name: 'g', type: 'Group', groupType: 'Switch' }))).toBe('Switch')
    expect(baseType(item({ name: 'g', type: 'Group', groupType: 'Number:Temperature' }))).toBe('Number')
  })

  it('gives an untyped group no usable type', () => {
    expect(baseType(item({ name: 'g', type: 'Group' }))).toBe('')
  })
})

describe('read-only points', () => {
  it('believes the item’s own state description first', () => {
    expect(isReadOnlyPoint(item({ name: 'i', stateDescription: { readOnly: true } }), NO_SEM)).toBe(true)
  })

  it.each(['Measurement', 'Status', 'Alarm'])('treats a %s point as read-only', (p) => {
    expect(isReadOnlyPoint(item({ name: 'i' }), point(p))).toBe(true)
  })

  it.each(['Control', 'Setpoint'])('leaves a %s point controllable', (p) => {
    expect(isReadOnlyPoint(item({ name: 'i' }), point(p))).toBe(false)
  })
})

describe('suggesting a widget', () => {
  it.each([
    ['Switch', 'button'],
    ['Color', 'color'],
    ['Dimmer', 'slider'],
    ['Rollershutter', 'rollershutter'],
    ['Player', 'player'],
    ['DateTime', 'value'],
    ['Location', 'value'],
    ['Contact', 'value']
  ])('gives a %s item a %s', (type, expected) => {
    expect(suggestWidget(item({ name: 'i', type }), NO_SEM, 'I')?.type).toBe(expected)
  })

  it('makes a Switch tagged as a Status point an indicator, not a dead control', () => {
    const s = suggestWidget(item({ name: 'i', type: 'Switch' }), point('Status'), 'I')
    expect(s).toMatchObject({ type: 'value', note: 'readonly' })
  })

  it('says why a settable number got a value instead of a slider', () => {
    const s = suggestWidget(item({ name: 'i', type: 'Number' }), point('Setpoint'), 'I')
    expect(s).toMatchObject({ type: 'value', note: 'norange' })
  })

  it('gives a number a slider once the item declares its own range', () => {
    const withRange = item({ name: 'i', type: 'Number', stateDescription: { minimum: 5, maximum: 35, step: 0.5 } })
    const s = suggestWidget(withRange, point('Setpoint'), 'I')
    expect(s?.type).toBe('slider')
    expect(s?.config).toMatchObject({ min: 5, max: 35, step: 0.5 })
    expect(s?.note).toBeUndefined()
  })

  it('offers a selection only when a settable String declares at least two options', () => {
    const opts = (n: number) =>
      item({
        name: 'i',
        type: 'String',
        commandDescription: { commandOptions: Array.from({ length: n }, (_, k) => ({ command: `C${k}`, label: `L${k}` })) }
      })
    expect(suggestWidget(opts(2), point('Control'), 'I')?.type).toBe('selection')
    expect(suggestWidget(opts(1), point('Control'), 'I')?.type).toBe('value')
    expect(suggestWidget(opts(3), point('Status'), 'I')?.type).toBe('value')
  })

  it('places nothing for a container group or an image, rather than an empty widget', () => {
    expect(suggestWidget(item({ name: 'g', type: 'Group' }), NO_SEM, 'G')).toBeNull()
    expect(suggestWidget(item({ name: 'p', type: 'Image' }), NO_SEM, 'P')).toBeNull()
  })

  it('still places a typed group, which does have a value of its own', () => {
    expect(suggestWidget(item({ name: 'g', type: 'Group', groupType: 'Switch' }), NO_SEM, 'G')?.type).toBe('button')
  })

  it('marks a read-only dial as a gauge when the type is overridden to one', () => {
    const cfg = configFor('dial', item({ name: 'i', type: 'Number' }), { label: 'I', readOnly: true })
    expect(cfg.readOnly).toBe(true)
    expect(configFor('dial', item({ name: 'i', type: 'Number' }), { label: 'I' }).readOnly).toBeUndefined()
  })
})

describe('widget configuration', () => {
  it('binds every offered type to the item', () => {
    const i = item({ name: 'Kitchen_Light', type: 'Switch' })
    for (const type of ['button', 'slider', 'dial', 'value', 'selection', 'color', 'rollershutter', 'player']) {
      expect(configFor(type, i, { label: 'L' }).item, type).toBe('Kitchen_Light')
    }
    for (const type of ['chart', 'timeline']) {
      expect(configFor(type, i, { label: 'L' }).series).toEqual([{ item: 'Kitchen_Light' }])
    }
  })

  it('gives an item whose value says it is on the toggle look and the above-zero rule', () => {
    for (const type of ['Switch', 'Dimmer', 'Color']) {
      const cfg = configFor('button', item({ name: 'i', type }), { label: 'L' })
      expect(cfg, type).toMatchObject({ style: 'switch', nonZeroIsOn: true, toggle: true, command: 'ON', commandAlt: 'OFF' })
    }
    for (const type of ['Number', 'String', 'Contact']) {
      const cfg = configFor('button', item({ name: 'i', type }), { label: 'L' })
      expect(cfg, type).toMatchObject({ toggle: true, command: 'ON', commandAlt: 'OFF' })
      expect(cfg, type).not.toHaveProperty('style')
      expect(cfg, type).not.toHaveProperty('nonZeroIsOn')
    }
  })

  it('never writes an icon onto a widget that has no icon setting', () => {
    for (const type of ['color', 'rollershutter', 'player', 'chart', 'timeline']) {
      expect(configFor(type, item({ name: 'i' }), { label: 'L', icon: 'mdi:bulb' }), type).not.toHaveProperty('icon')
    }
    for (const type of ['button', 'value', 'selection']) {
      expect(configFor(type, item({ name: 'i' }), { label: 'L', icon: 'mdi:bulb' }).icon, type).toBe('mdi:bulb')
    }
  })

  it('falls back to a percentage range only where that is the safe assumption', () => {
    expect(configFor('slider', item({ name: 'i', type: 'Dimmer' }), { label: 'L' })).toMatchObject({
      min: 0,
      max: 100,
      step: 1
    })
  })

  it('ignores a nonsensical declared range rather than building an inverted slider', () => {
    const backwards = item({ name: 'i', type: 'Number', stateDescription: { minimum: 50, maximum: 10 } })
    expect(configFor('slider', backwards, { label: 'L' })).toMatchObject({ min: 0, max: 100 })
    const zeroStep = item({ name: 'i', type: 'Number', stateDescription: { minimum: 0, maximum: 10, step: 0 } })
    expect(configFor('slider', zeroStep, { label: 'L' }).step).toBe(1)
  })

  it('builds selection lines from command options, labelled', () => {
    const i = item({
      name: 'i',
      type: 'String',
      commandDescription: { commandOptions: [{ command: 'HDMI1', label: 'Apple TV' }, { command: 'HDMI2' }] }
    })
    expect(configFor('selection', i, { label: 'L' }).choices).toBe('HDMI1=Apple TV\nHDMI2=HDMI2')
  })
})

describe('the type override list', () => {
  it('puts the suggestion first and never repeats it', () => {
    const choices = widgetChoices(item({ name: 'i', type: 'Dimmer' }), 'slider')
    expect(choices[0]).toBe('slider')
    expect(new Set(choices).size).toBe(choices.length)
  })

  it('offers only types that can drive the item', () => {
    expect(widgetChoices(item({ name: 'i', type: 'Player' }), 'player')).not.toContain('slider')
    expect(widgetChoices(item({ name: 'i', type: 'Switch' }), 'button')).not.toContain('color')
  })

  it('always offers at least the suggestion for an unfamiliar type', () => {
    const choices = widgetChoices(item({ name: 'i', type: 'Rollershutter' }), 'rollershutter')
    expect(choices).toContain('rollershutter')
  })
})

describe('labels', () => {
  it('prefers the item’s own label', () => {
    expect(prettyLabel(item({ name: 'kitchen_main_light', label: '  Main Light  ' }))).toBe('Main Light')
  })

  it('makes an item name presentable when there is no label', () => {
    expect(prettyLabel(item({ name: 'kitchen_main_lights_level' }))).toBe('Kitchen Main Lights Level')
  })

  it('drops the cluster’s own prefix so a Kitchen dashboard does not repeat itself', () => {
    expect(prettyLabel(item({ name: 'kitchen_main_lights_level' }), 'kitchen')).toBe('Main Lights Level')
    expect(prettyLabel(item({ name: 'Kitchen_Fan' }), 'kitchen')).toBe('Fan')
  })

  it('never strips the prefix down to nothing', () => {
    expect(prettyLabel(item({ name: 'kitchen' }), 'kitchen')).toBe('Kitchen')
  })

  it('does not treat the prefix as a pattern', () => {
    expect(prettyLabel(item({ name: 'a.b_thing' }), 'a.b')).toBe('Thing')
    expect(prettyLabel(item({ name: 'axb_thing' }), 'a.b')).toBe('Axb Thing')
  })

  it.each([
    ['living_room_lamp', 'Living Room Lamp'],
    ['LivingRoomLamp', 'Living Room Lamp'],
    ['UPS1_load', 'UPS1 Load'],
    ['hvac-mode', 'Hvac Mode'],
    ['PDU1', 'PDU1']
  ])('title-cases %s', (raw, expected) => {
    expect(titleCase(raw)).toBe(expected)
  })
})

describe('icons', () => {
  it('uses the point’s property before the equipment it belongs to', () => {
    expect(pointIcon(withProperty('Temperature'), 'Boiler')).toBe('mdi:thermometer')
    expect(pointIcon(point('Measurement'), 'Boiler')).toBe('mdi:water-boiler')
    expect(pointIcon(NO_SEM, undefined)).toBeUndefined()
  })

  it('names a real icon for locations and equipment', () => {
    expect(locationIcon('Kitchen')).toBe('mdi:countertop')
    expect(equipmentIcon('Lightbulb')).toBe('mdi:lightbulb')
    expect(locationIcon(undefined)).toBeUndefined()
    expect(equipmentIcon('NotATag')).toBeUndefined()
  })
})

describe('names that collide with Object.prototype', () => {
  it.each(PROTO_KEYS)('does not turn a tag named %s into an icon', (name) => {
    for (const icon of [locationIcon(name), equipmentIcon(name)]) {
      expect(icon === undefined || /^mdi:[a-z0-9-]+$/.test(icon), `${name} -> ${icon}`).toBe(true)
    }
  })

  it.each(PROTO_KEYS)('gives a widget type of %s a usable size', (type) => {
    const size = sizeFor(type)
    expect(Number.isFinite(size.w) && Number.isFinite(size.h), `${type} -> ${JSON.stringify(size)}`).toBe(true)
    expect(size.w).toBeGreaterThan(0)
    expect(size.h).toBeGreaterThan(0)
  })

  it.each(PROTO_KEYS)('returns a real list of choices for an item typed %s', (type) => {
    const choices = widgetChoices(item({ name: 'i', type }), 'value')
    expect(Array.isArray(choices), `${type} -> ${typeof choices}`).toBe(true)
    expect(choices).toContain('value')
  })

  it.each(PROTO_KEYS)('suggests something storable for an item typed %s', (type) => {
    const s = suggestWidget(item({ name: 'i', type }), NO_SEM, 'I')
    if (s) expect(typeof s.type).toBe('string')
  })

  it('gives a property named constructor no icon rather than a stringified function', () => {
    expect(pointIcon(withProperty('constructor'))).toBeUndefined()
  })
})
