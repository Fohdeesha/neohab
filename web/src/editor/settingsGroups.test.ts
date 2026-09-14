import { describe, expect, it } from 'vitest'
import type { SettingField } from '../widgets/types'
import { groupFields } from './settingsGroups'

const text = (key: string): SettingField => ({ key, type: 'text', label: key })
const section = (label: string): SettingField => ({ key: 'sec-' + label, type: 'section', label })

describe('grouping a widget’s settings', () => {
  it('leaves an ungrouped schema as one unlabelled run', () => {
    const groups = groupFields([text('a'), text('b')])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBeNull()
    expect(groups[0].fields.map((f) => f.key)).toEqual(['a', 'b'])
  })

  it('starts a group at each marker and keeps the order', () => {
    const groups = groupFields([text('a'), section('Appearance'), text('b'), section('Tile'), text('c'), text('d')])
    expect(groups.map((g) => g.label)).toEqual([null, 'Appearance', 'Tile'])
    expect(groups.map((g) => g.fields.map((f) => f.key))).toEqual([['a'], ['b'], ['c', 'd']])
  })

  it('drops the leading run when the schema opens with a marker', () => {
    const groups = groupFields([section('Appearance'), text('a')])
    expect(groups.map((g) => g.label)).toEqual(['Appearance'])
  })

  it('drops a group whose every field was filtered out', () => {
    // what the panel hands it once showIf has run: the marker survives, its fields do not
    const groups = groupFields([text('a'), section('Appearance'), section('Tile'), text('b')])
    expect(groups.map((g) => g.label)).toEqual([null, 'Tile'])
  })

  it('answers an empty schema with no groups at all', () => {
    expect(groupFields([])).toEqual([])
    expect(groupFields([section('Appearance')])).toEqual([])
  })
})
