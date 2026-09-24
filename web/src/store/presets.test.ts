import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PresetSummary } from '../model/presets'

const sent: [string, string][] = []
const ran: string[] = []
const notes: string[] = []
let runFails = false

vi.mock('../api/rules', () => ({
  createOrUpdateRule: vi.fn(),
  createRule: vi.fn(),
  deleteRule: vi.fn(),
  getRule: vi.fn(),
  listRuleSummaries: vi.fn(async () => []),
  listRulesFull: vi.fn(async () => []),
  runRule: vi.fn(async (uid: string) => {
    if (runFails) throw new Error('the rule engine is not running')
    ran.push(uid)
  }),
  upsertRule: vi.fn()
}))
vi.mock('../api/items', () => ({ getItem: vi.fn(async () => Promise.reject(new Error('not on the server'))) }))
vi.mock('../widgets/common/command', () => ({
  commandItem: vi.fn(async (item: string, command: string) => {
    sent.push([item, command])
    return true
  })
}))
vi.mock('./notify', () => ({ notify: (text: string) => notes.push(text) }))

const noopEvents = { addEventListener: () => {}, removeEventListener: () => {} }
vi.stubGlobal('document', { ...noopEvents, documentElement: {}, visibilityState: 'visible' })
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
vi.stubGlobal('window', { ...noopEvents, location: { hash: '', search: '', pathname: '/', origin: 'http://x', href: 'http://x/' } })

const { activatePreset, deactivatePreset, usePresetsStore } = await import('./presets')
const { useCatalogStore } = await import('./catalog')
const { useItemsStore } = await import('./items')

const preset = (over: Partial<PresetSummary> = {}): PresetSummary => ({
  uid: 'nh-scene-evening',
  name: 'Evening',
  editable: true,
  managed: true,
  lightItems: ['Lamp', 'Dim', 'Blind', 'Temp', 'Hall'],
  ...over
})

describe('switching a preset off', () => {
  beforeEach(() => {
    sent.length = 0
    ran.length = 0
    notes.length = 0
    usePresetsStore.setState({ full: Object.create(null), bridged: [] })
    useCatalogStore.setState({
      loaded: true,
      items: [
        { name: 'Lamp', type: 'Switch' },
        { name: 'Dim', type: 'Dimmer' },
        { name: 'Blind', type: 'Rollershutter' },
        { name: 'Temp', type: 'Number' },
        { name: 'Hall', type: 'Group', groupType: 'Color' }
      ] as never
    })
  })

  it('sends OFF to the lights and leaves blinds, numbers and anything unknown alone', async () => {
    expect(await deactivatePreset(preset({ lightItems: ['Lamp', 'Dim', 'Blind', 'Temp', 'Hall', 'Gone'] }))).toBe(true)
    expect(sent).toEqual([
      ['Lamp', 'OFF'],
      ['Dim', 'OFF'],
      ['Hall', 'OFF']
    ])
  })

  it('puts a linked wall switch to its other state, so the chip goes out and the next tap works', async () => {
    usePresetsStore.setState({ bridged: ['nh-scene-evening'] })
    await deactivatePreset(preset({ statusItem: 'Wall', statusState: 'ON', lightItems: ['Lamp'] }))
    expect(sent).toEqual([
      ['Lamp', 'OFF'],
      ['Wall', 'OFF']
    ])
  })

  it('says so when nothing in it is a light, and sends nothing', async () => {
    expect(await deactivatePreset(preset({ lightItems: ['Blind', 'Temp'] }))).toBe(true)
    expect(sent).toEqual([])
    expect(notes).toHaveLength(1)
  })

  it('reports that it cannot tell when the preset names no items, so the caller can run it instead', async () => {
    expect(await deactivatePreset(preset({ lightItems: undefined }))).toBe(false)
    expect(sent).toEqual([])
  })
})

describe('activating a preset', () => {
  beforeEach(() => {
    sent.length = 0
    ran.length = 0
    notes.length = 0
    runFails = false
    usePresetsStore.setState({ full: Object.create(null), bridged: ['nh-scene-evening'] })
  })

  it('flips the linked wall switch, which runs the scene through its bridge', async () => {
    useItemsStore.setState({ states: Object.assign(Object.create(null), { Wall: { state: 'OFF' } }) })
    expect(await activatePreset(preset({ statusItem: 'Wall', statusState: 'ON' }))).toBe(true)
    expect(sent).toEqual([['Wall', 'ON']])
    expect(ran).toEqual([])
  })

  it('runs the scene itself when the switch is already on, since a bridge only fires on a change', async () => {
    useItemsStore.setState({ states: Object.assign(Object.create(null), { Wall: { state: 'ON' } }) })
    expect(await activatePreset(preset({ statusItem: 'Wall', statusState: 'ON' }))).toBe(true)
    expect(sent).toEqual([])
    expect(ran).toEqual(['nh-scene-evening'])
  })

  it('says why when the scene cannot be run', async () => {
    runFails = true
    expect(await activatePreset(preset())).toBe(false)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('Evening')
  })
})
