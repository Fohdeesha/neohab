import { describe, expect, it } from 'vitest'
import { kindOf, migrateConfig, MIGRATIONS, SCHEMA_VERSIONS, versionOf, type ComponentKind, type Migration } from './schema'

/**
 * The migration runner has no production migrations yet, which is exactly the state in which a
 * mechanism quietly rots. So the runner is driven here with steps of its own - a table that
 * takes a fictional kind from version 1 to 4 - and the ordering, the partial chain and the
 * refusal are all exercised against it. When the first real migration is written it drops into
 * a list whose behaviour is already pinned.
 */
const table = (steps: Migration[]): Record<ComponentKind, Migration[]> => ({
  dashboard: steps,
  theme: [],
  widgetdef: [],
  icon: [],
  background: [],
  settings: []
})

/** A world where dashboards are at `v` and everything else is still at 1. */
const versions = (v: number): Record<ComponentKind, number> => ({
  dashboard: v,
  theme: 1,
  widgetdef: 1,
  icon: 1,
  background: 1,
  settings: 1
})

/** Records the order steps ran in, so a chain applied backwards cannot pass. */
const trail = (): { steps: Migration[]; seen: string[] } => {
  const seen: string[] = []
  const step =
    (name: string): Migration =>
    (c) => {
      seen.push(name)
      return { ...c, [name]: true }
    }
  return { steps: [step('one'), step('two'), step('three')], seen }
}

describe('the version a config claims', () => {
  it('reads a plain number', () => {
    expect(versionOf({ version: 3 })).toBe(3)
  })

  it('reads Gson’s float echo as the whole number it is', () => {
    // openHAB serialises through Gson, which writes every number as 1.0
    expect(versionOf({ version: 1.0 })).toBe(1)
    expect(versionOf({ version: 2.0 })).toBe(2)
  })

  it('reads a quoted version, which a hand edit produces', () => {
    expect(versionOf({ version: '2' })).toBe(2)
  })

  it('treats anything unreadable as version 1, never as newer', () => {
    // Guessing "newer" on malformed input would lock someone out of their own dashboards.
    expect(versionOf({})).toBe(1)
    expect(versionOf({ version: null })).toBe(1)
    expect(versionOf({ version: 'tomorrow' })).toBe(1)
    expect(versionOf({ version: NaN })).toBe(1)
    expect(versionOf({ version: Infinity })).toBe(1)
    expect(versionOf({ version: -5 })).toBe(1)
    expect(versionOf({ version: 0 })).toBe(1)
    expect(versionOf(null)).toBe(1)
    expect(versionOf('dashboard')).toBe(1)
    expect(versionOf(undefined)).toBe(1)
  })
})

describe('which kind a uid names', () => {
  it('names each of the six', () => {
    expect(kindOf('dashboard:kitchen')).toBe('dashboard')
    expect(kindOf('theme:mine')).toBe('theme')
    expect(kindOf('widgetdef:clock')).toBe('widgetdef')
    expect(kindOf('icon:bulb')).toBe('icon')
    expect(kindOf('background:plan')).toBe('background')
    expect(kindOf('settings')).toBe('settings')
  })

  it('does not claim a uid that is not ours', () => {
    expect(kindOf('snap:12345')).toBeNull()
    expect(kindOf('index')).toBeNull()
    expect(kindOf('')).toBeNull()
  })
})

describe('migrating forward', () => {
  it('does nothing when the config is already current', () => {
    const result = migrateConfig('dashboard', { version: 1, name: 'Kitchen' })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.migrated).toBe(false)
    expect(result.config.name).toBe('Kitchen')
  })

  it('runs the whole chain in order when the config is at the very bottom', () => {
    const { steps, seen } = trail()
    const result = migrateConfig('dashboard', { version: 1, keep: 'me' }, table(steps), versions(4))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    // Order matters: a chain applied backwards would still touch every step.
    expect(seen).toEqual(['one', 'two', 'three'])
    expect(result.config).toMatchObject({ keep: 'me', one: true, two: true, three: true, version: 4 })
    expect(result.migrated).toBe(true)
    expect(result.from).toBe(1)
  })

  it('starts partway when the config is partway', () => {
    const { steps, seen } = trail()
    const result = migrateConfig('dashboard', { version: 3 }, table(steps), versions(4))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(seen).toEqual(['three'])
    expect(result.config.version).toBe(4)
  })

  it('does not mutate what it was given', () => {
    const { steps } = trail()
    const original = { version: 1, keep: 'me' }
    migrateConfig('dashboard', original, table(steps), versions(4))
    expect(original).toEqual({ version: 1, keep: 'me' })
  })

  it('still advances the version across a gap with no step for it', () => {
    // A kind that gained a version without needing a data change must not stall halfway.
    const result = migrateConfig('dashboard', { version: 1 }, table([]), versions(3))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.config.version).toBe(3)
  })

  it('migrates a config that has no version field at all', () => {
    const { steps, seen } = trail()
    const result = migrateConfig('dashboard', { name: 'hand written' }, table(steps), versions(2))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(seen).toEqual(['one'])
    expect(result.config).toMatchObject({ name: 'hand written', version: 2 })
  })
})

describe('refusing a config from the future', () => {
  it('refuses rather than guessing', () => {
    const result = migrateConfig('dashboard', { version: 2, name: 'Kitchen' })
    expect(result.status).toBe('future')
    if (result.status !== 'future') return
    expect(result.from).toBe(2)
    expect(result.expected).toBe(SCHEMA_VERSIONS.dashboard)
  })

  it('refuses per kind, so one component cannot condemn the others', () => {
    expect(migrateConfig('theme', { version: 9 }).status).toBe('future')
    expect(migrateConfig('dashboard', { version: 1 }).status).toBe('ok')
  })
})

describe('the table and the declared versions agree', () => {
  // A migration added without bumping the version would never run; a version bumped without a
  // migration would silently skip a step. Neither is visible by reading either file alone.
  it('has exactly one step per version above the first, for every kind', () => {
    for (const kind of Object.keys(SCHEMA_VERSIONS) as ComponentKind[]) {
      expect(`${kind}: ${MIGRATIONS[kind].length}`).toBe(`${kind}: ${SCHEMA_VERSIONS[kind] - 1}`)
    }
  })

  it('covers every kind in both tables', () => {
    expect(Object.keys(MIGRATIONS).sort()).toEqual(Object.keys(SCHEMA_VERSIONS).sort())
  })
})
