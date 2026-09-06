import { describe, expect, it } from 'vitest'
import type { SemanticTag } from '../api/tags'
import type { Item } from '../api/types'
import { buildTagIndex, classify, hasSemanticModel, labelFromTagName } from './semantics'

const item = (name: string, tags?: string[], over: Partial<Item> = {}): Item =>
  ({ name, type: 'Switch', state: 'OFF', tags, ...over }) as Item

const tag = (uid: string, name?: string, label?: string): SemanticTag => ({ uid, name: name ?? uid.split('_').pop(), label }) as SemanticTag

const DEFAULTS = buildTagIndex()

describe('the tag index', () => {
  it('falls back to the bundled hierarchy when the server has no /rest/tags', () => {
    expect(DEFAULTS.get('Kitchen')).toMatchObject({ root: 'Location', name: 'Kitchen' })
    expect(DEFAULTS.get('Lightbulb')).toMatchObject({ root: 'Equipment' })
    expect(DEFAULTS.get('Measurement')).toMatchObject({ root: 'Point' })
    expect(DEFAULTS.get('Temperature')).toMatchObject({ root: 'Property' })
  })

  it('resolves a tag by its short name and by its fully qualified id, both of which openHAB accepts', () => {
    expect(DEFAULTS.get('Location_Indoor_Room_Kitchen')).toMatchObject({ name: 'Kitchen', root: 'Location' })
    expect(DEFAULTS.get('Kitchen')).toEqual(DEFAULTS.get('Location_Indoor_Room_Kitchen'))
  })

  it('prefers the server’s list so user-defined tags classify too', () => {
    const index = buildTagIndex([tag('Location_Indoor_Room_Sauna'), tag('Equipment_HeatPump')])
    expect(index.get('Sauna')).toMatchObject({ root: 'Location' })
    expect(index.get('HeatPump')).toMatchObject({ root: 'Equipment' })
    expect(index.get('Kitchen')).toBeUndefined()
  })

  it('uses the server’s label when it gives one, and derives a readable one when it does not', () => {
    const index = buildTagIndex([tag('Location_Indoor_Room_LivingRoom', 'LivingRoom', 'Lounge')])
    expect(index.get('LivingRoom')?.label).toBe('Lounge')
    expect(DEFAULTS.get('LivingRoom')?.label).toBe('Living Room')
  })

  it('ignores a tag whose root is not one of the four', () => {
    const index = buildTagIndex([tag('Nonsense_Thing'), tag('Location_Indoor_Room_Kitchen')])
    expect(index.get('Thing')).toBeUndefined()
    expect(index.get('Kitchen')).toBeDefined()
  })

  it('keeps the first definition when a custom tag reuses a stock short name', () => {
    const index = buildTagIndex([tag('Location_Indoor_Room_Kitchen'), tag('Equipment_Kitchen', 'Kitchen')])
    expect(index.get('Kitchen')?.root).toBe('Location')
    expect(index.get('Equipment_Kitchen')?.root).toBe('Equipment')
  })

  it('reads a name with digits and acronyms without mangling it', () => {
    expect(labelFromTagName('FirstFloor')).toBe('First Floor')
    expect(labelFromTagName('CO2')).toBe('CO2')
    expect(labelFromTagName('Kitchen')).toBe('Kitchen')
  })
})

describe('classifying an item', () => {
  it('lets the first non-Property tag decide, as core does', () => {
    expect(classify(item('i', ['Kitchen']), DEFAULTS)).toMatchObject({ kind: 'location' })
    expect(classify(item('i', ['Lightbulb']), DEFAULTS)).toMatchObject({ kind: 'equipment' })
    expect(classify(item('i', ['Measurement']), DEFAULTS)).toMatchObject({ kind: 'point' })
  })

  it('keeps the point and property alongside a structural tag', () => {
    const sem = classify(item('i', ['Lightbulb', 'Control', 'Light']), DEFAULTS)
    expect(sem.kind).toBe('equipment')
    expect(sem.tag?.name).toBe('Lightbulb')
    expect(sem.point?.name).toBe('Control')
    expect(sem.property?.name).toBe('Light')
  })

  it('still calls a Property-only item a point, controllable unless its state is read-only', () => {
    expect(classify(item('i', ['Temperature']), DEFAULTS)).toMatchObject({
      kind: 'point',
      point: { name: 'Control' }
    })
    const readOnly = item('i', ['Temperature'], { stateDescription: { readOnly: true } })
    expect(classify(readOnly, DEFAULTS)).toMatchObject({ kind: 'point', point: { name: 'Measurement' } })
  })

  it('classifies an untagged item as nothing at all', () => {
    expect(classify(item('i'), DEFAULTS)).toEqual({ kind: null })
    expect(classify(item('i', []), DEFAULTS)).toEqual({ kind: null })
  })

  it('ignores tags it does not recognise', () => {
    expect(classify(item('i', ['Belongs_To_Nobody', 'Kitchen']), DEFAULTS)).toMatchObject({ kind: 'location' })
    expect(classify(item('i', ['Belongs_To_Nobody']), DEFAULTS)).toEqual({ kind: null })
  })

  it('takes the first of several tags of the same root, not the last', () => {
    const sem = classify(item('i', ['Kitchen', 'Bedroom']), DEFAULTS)
    expect(sem.tag?.name).toBe('Kitchen')
  })
})

describe('detecting a model at all', () => {
  it('is true only when something is a location or equipment', () => {
    expect(hasSemanticModel([item('a', ['Kitchen'])], DEFAULTS)).toBe(true)
    expect(hasSemanticModel([item('a', ['Lightbulb'])], DEFAULTS)).toBe(true)
    expect(hasSemanticModel([item('a', ['Measurement']), item('b', ['Temperature'])], DEFAULTS)).toBe(false)
    expect(hasSemanticModel([item('a')], DEFAULTS)).toBe(false)
    expect(hasSemanticModel([], DEFAULTS)).toBe(false)
  })
})
