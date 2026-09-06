import { describe, expect, it } from 'vitest'
import {
  bridgeRuleFor,
  bridgeUidFor,
  commandForState,
  commandKind,
  commandMatchesState,
  isNeohabRule,
  isScene,
  newSceneUid,
  offCommandFor,
  presetActive,
  presetOffCommands,
  presetFromRule,
  presetSummaryFromRule,
  ruleFromPreset,
  SCENE_UID_PREFIX,
  type Preset,
  type SceneRule
} from './presets'

const scene = (over: Partial<SceneRule> = {}): SceneRule => ({
  uid: 'nh-scene-evening',
  name: 'Evening',
  tags: ['Scene', 'neohab'],
  editable: true,
  configuration: {},
  actions: [
    { id: '1', type: 'core.ItemCommandAction', configuration: { itemName: 'STRIP_1', command: '240,73,100' } },
    { id: '2', type: 'core.ItemCommandAction', configuration: { itemName: 'main_lights_level', command: '64' } }
  ],
  ...over
})

describe('scene recognition', () => {
  it('a rule tagged Scene is a scene, others are not', () => {
    expect(isScene(scene())).toBe(true)
    expect(isScene({ uid: 'x', tags: ['Lighting'] })).toBe(false)
    expect(isScene({ uid: 'x' })).toBe(false)
  })

  it('tags that are not an array do not throw', () => {
    expect(isScene({ uid: 'x', tags: 'Scene' as unknown as string[] })).toBe(false)
    expect(isNeohabRule({ uid: 'x', tags: {} as unknown as string[] })).toBe(false)
  })
})

describe('rule -> preset', () => {
  it('maps actions to lights', () => {
    const p = presetFromRule(scene())
    expect(p.name).toBe('Evening')
    expect(p.lights).toEqual([
      { item: 'STRIP_1', command: '240,73,100' },
      { item: 'main_lights_level', command: '64' }
    ])
    expect(p.managed).toBe(true)
    expect(p.editable).toBe(true)
  })

  it('skips malformed actions instead of throwing', () => {
    const p = presetFromRule(
      scene({
        actions: [
          null,
          { id: '1', type: 'script.ScriptAction', configuration: { script: 'x' } },
          { id: '2', type: 'core.ItemCommandAction' },
          { id: '3', type: 'core.ItemCommandAction', configuration: { itemName: '', command: 'ON' } },
          { id: '4', type: 'core.ItemCommandAction', configuration: { itemName: 'A', command: 0 } }
        ] as unknown as SceneRule['actions']
      })
    )
    expect(p.lights).toEqual([{ item: 'A', command: '0' }])
  })

  it('actions that are not an array yield no lights', () => {
    expect(presetFromRule(scene({ actions: {} as unknown as SceneRule['actions'] })).lights).toEqual([])
  })

  it('a nameless rule falls back to its uid', () => {
    expect(presetSummaryFromRule({ uid: 'nh-scene-x' }).name).toBe('nh-scene-x')
  })

  it('reads the status item and state out of the configuration block', () => {
    const p = presetSummaryFromRule(scene({ configuration: { statusItem: 'House_Lighting_Preset_1', statusState: 'OFF' } }))
    expect(p.statusItem).toBe('House_Lighting_Preset_1')
    expect(p.statusState).toBe('OFF')
  })

  it('a garbage status item is ignored, and the state defaults to ON', () => {
    expect(presetSummaryFromRule(scene({ configuration: { statusItem: 42 } })).statusItem).toBeUndefined()
    expect(presetSummaryFromRule(scene({ configuration: { statusItem: '  ' } })).statusItem).toBeUndefined()
    const p = presetSummaryFromRule(scene({ configuration: { statusItem: 'A', statusState: 'sideways' } }))
    expect(p.statusState).toBe('ON')
  })
})

describe('preset -> rule', () => {
  const preset: Preset = {
    uid: 'nh-scene-movie',
    name: 'Movie night',
    editable: true,
    managed: true,
    statusItem: 'House_Lighting_Preset_1',
    statusState: 'ON',
    lights: [{ item: 'STRIP_1', command: '0,0,10' }]
  }

  it('round-trips through the rule shape', () => {
    const rule = ruleFromPreset(preset)
    expect(rule.tags).toEqual(['Scene', 'neohab', 'neohab:status:House_Lighting_Preset_1:ON'])
    expect(rule.triggers).toEqual([])
    expect(rule.actions).toHaveLength(1)
    expect(presetFromRule(rule)).toEqual({ ...preset, editable: false })
  })

  it('a preset without a status item stores an empty configuration and no status tag', () => {
    const rule = ruleFromPreset({ ...preset, statusItem: undefined, statusState: undefined })
    expect(rule.configuration).toEqual({})
    expect(rule.tags).toEqual(['Scene', 'neohab'])
  })

  it('the status item survives a 4.x summary, which strips the configuration block', () => {
    const rule = ruleFromPreset(preset)
    const summaryShaped = { uid: rule.uid, name: rule.name, tags: rule.tags, editable: true }
    const p = presetSummaryFromRule(summaryShaped)
    expect(p.statusItem).toBe('House_Lighting_Preset_1')
    expect(p.statusState).toBe('ON')
  })

  it('a malformed status tag is ignored', () => {
    expect(presetSummaryFromRule({ uid: 'x', tags: ['Scene', 'neohab:status:'] }).statusItem).toBeUndefined()
    expect(presetSummaryFromRule({ uid: 'x', tags: ['Scene', 'neohab:status:A:SIDEWAYS'] }).statusItem).toBeUndefined()
  })
})

describe('uids', () => {
  it('slugs the name under the scene prefix', () => {
    expect(newSceneUid('Movie Night!', new Set())).toBe(SCENE_UID_PREFIX + 'movie-night')
  })

  it('de-dupes against existing scene uids only', () => {
    const taken = new Set(['nh-scene-movie-night', 'unrelated-rule'])
    expect(newSceneUid('Movie Night', taken)).toBe('nh-scene-movie-night-2')
  })

  it('a name that reduces to nothing falls back', () => {
    expect(newSceneUid('!!!', new Set())).toBe('nh-scene-preset')
  })
})

describe('the wall-switch bridge', () => {
  it('triggers on the status item state and runs the scene', () => {
    const rule = bridgeRuleFor({
      uid: 'nh-scene-evening',
      name: 'Evening',
      editable: true,
      managed: true,
      statusItem: 'House_Lighting_Preset_1',
      statusState: 'ON'
    })
    expect(rule?.uid).toBe(bridgeUidFor('nh-scene-evening'))
    expect(rule?.triggers?.[0].type).toBe('core.ItemStateChangeTrigger')
    expect(rule?.triggers?.[0].configuration).toEqual({ itemName: 'House_Lighting_Preset_1', state: 'ON' })
    expect(rule?.actions?.[0].type).toBe('core.RunRuleAction')
    expect(rule?.actions?.[0].configuration?.ruleUIDs).toEqual(['nh-scene-evening'])
    expect(rule?.tags).not.toContain('Scene')
  })

  it('module ids are unique across the whole rule', () => {
    const rule = bridgeRuleFor({
      uid: 'nh-scene-x',
      name: 'x',
      editable: true,
      managed: true,
      statusItem: 'A',
      statusState: 'ON'
    })
    const ids = [...(rule?.triggers ?? []), ...(rule?.conditions ?? []), ...(rule?.actions ?? [])].map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no status item, no bridge', () => {
    expect(bridgeRuleFor({ uid: 'x', name: 'x', editable: true, managed: true })).toBeNull()
  })
})

describe('state matching', () => {
  it('exact strings match, unknown states never do', () => {
    expect(commandMatchesState('ON', 'ON')).toBe(true)
    expect(commandMatchesState('ON', 'OFF')).toBe(false)
    expect(commandMatchesState('ON', undefined)).toBe(false)
    expect(commandMatchesState('NULL', 'NULL')).toBe(false)
  })

  it('numbers tolerate a point of device rounding', () => {
    expect(commandMatchesState('64', '64.0')).toBe(true)
    expect(commandMatchesState('64', '65')).toBe(true)
    expect(commandMatchesState('64', '66')).toBe(false)
  })

  it('colors are compared as colors, not strings', () => {
    expect(commandMatchesState('240,73,100', '240.0,73.2,99.8')).toBe(true)
    expect(commandMatchesState('240,73,100', '10,73,100')).toBe(false)
    expect(commandMatchesState('120,0,100', '300,0,100')).toBe(true)
  })

  it('presetActive needs every light to hold, and an empty preset is never active', () => {
    const lights = [
      { item: 'a', command: '240,73,100' },
      { item: 'b', command: '64' }
    ]
    const states: Record<string, string> = { a: '240,73,100', b: '64' }
    expect(presetActive(lights, (i) => states[i])).toBe(true)
    expect(presetActive(lights, (i) => (i === 'b' ? '0' : states[i]))).toBe(false)
    expect(presetActive([], () => 'ON')).toBe(false)
  })

  it('switching a preset off uses the right kind of off for each light', () => {
    expect(offCommandFor('288,55,40')).toBe('OFF')
    expect(offCommandFor('64')).toBe('0')
    expect(offCommandFor('22.5')).toBe('0')
    expect(offCommandFor('ON')).toBe('OFF')
    expect(offCommandFor('PLAY')).toBe('OFF')
  })

  it('an off command is built for every light of the preset, and nothing else', () => {
    const lights = [
      { item: 'strip', command: '288,55,40' },
      { item: 'lamp', command: '64' }
    ]
    expect(presetOffCommands(lights)).toEqual([
      { item: 'strip', command: 'OFF' },
      { item: 'lamp', command: '0' }
    ])
    expect(presetOffCommands([])).toEqual([])
    expect(presetOffCommands(undefined as never)).toEqual([])
  })
})

describe('capturing current state', () => {
  it('colors normalise to integer H,S,B with the hue wrapped', () => {
    expect(commandForState('Color', '359.7,78.947,14.902')).toBe('0,79,15')
    expect(commandForState('Color', '25.999,78.947,14.902')).toBe('26,79,15')
  })

  it('numbers keep genuine decimals but lose float noise', () => {
    expect(commandForState('Dimmer', '64.0')).toBe('64')
    expect(commandForState('Number', '22.5')).toBe('22.5')
    expect(commandForState('Number', '22.500000001')).toBe('22.5')
  })

  it('switches and strings pass through', () => {
    expect(commandForState('Switch', 'ON')).toBe('ON')
    expect(commandForState('String', 'movie')).toBe('movie')
  })

  it('unknown states cannot be captured', () => {
    expect(commandForState('Dimmer', 'NULL')).toBeNull()
    expect(commandForState('Color', 'UNDEF')).toBeNull()
    expect(commandForState('Switch', undefined)).toBeNull()
  })
})

describe('editing a stored value', () => {
  it('picks the control from the command shape, not from an item type', () => {
    expect(commandKind('120,50,80')).toBe('color')
    expect(commandKind('ON')).toBe('onoff')
    expect(commandKind('OFF')).toBe('onoff')
    expect(commandKind('64')).toBe('level')
    expect(commandKind('0')).toBe('level')
    expect(commandKind('100')).toBe('level')
    expect(commandKind('movie')).toBe('text')
  })

  it('keeps a text box for numbers a slider would mangle', () => {
    expect(commandKind('22.5')).toBe('text')
    expect(commandKind('350')).toBe('text')
    expect(commandKind('-1')).toBe('text')
  })

  it('survives the shapes a hand-edited scene can hold', () => {
    expect(commandKind('')).toBe('text')
    expect(commandKind(' ')).toBe('text')
    expect(commandKind(undefined as unknown as string)).toBe('text')
    expect(commandKind(42 as unknown as string)).toBe('text')
    expect(commandKind('1,2')).toBe('text')
  })
})
