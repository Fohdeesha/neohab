import { describe, expect, it } from 'vitest'
import type { UIComponent } from '../api/types'
import {
  buildPartialBundle,
  collectDependencies,
  looksPartial,
  PARTIAL_FORMAT_VERSION,
  partialFileName,
  planPartialImport,
  referencedUids,
  resolvePartialImport,
  validatePartialBundle,
  type PartialBundle
} from './partial'

const c = (uid: string, config: Record<string, unknown>, component = 'neohab:dashboard'): UIComponent =>
  ({ uid, component, config }) as UIComponent

const dashboard = (id: string, widgets: unknown[] = [], extra: Record<string, unknown> = {}) =>
  c(`dashboard:${id}`, { version: 1, id, name: id, columns: 12, rowHeight: 'match', widgets, ...extra })

const widgetdef = (id: string, template = '<p>hi</p>') => c(`widgetdef:${id}`, { version: 1, id, name: id, template }, 'neohab:widgetdef')

const icon = (id: string) => c(`icon:${id}`, { version: 1, id, name: id, dataUri: 'data:,x' }, 'neohab:icon')

let seq = 0
const newId = () => `w-test${++seq}`

describe('reference collection', () => {
  it('finds widget definitions, icons and backgrounds wherever they appear', () => {
    const d = dashboard(
      'kitchen',
      [
        { id: 'w1', type: 'template', config: { customwidget: 'gauge' } },
        { id: 'w2', type: 'button', config: { icon: 'custom:bulb', stateIcons: [{ state: 'ON', icon: 'custom:lit' }] } }
      ],
      { background: 'bg:hall' }
    )
    expect(referencedUids(d)).toEqual(new Set(['widgetdef:gauge', 'icon:bulb', 'icon:lit', 'background:hall']))
  })

  it('ignores bundled icon references, which are not components', () => {
    const d = dashboard('x', [{ id: 'w', type: 'button', config: { icon: 'mdi:lightbulb' } }])
    expect(referencedUids(d).size).toBe(0)
  })

  it('follows dependencies transitively and reports the ones that are missing', () => {
    const primary = dashboard('kitchen', [{ id: 'w', type: 'template', config: { customwidget: 'gauge' } }])
    const def = c(
      'widgetdef:gauge',
      { version: 1, id: 'gauge', name: 'g', template: '<i></i>', settings: [{ id: 'a', default: 'custom:dial' }] },
      'neohab:widgetdef'
    )
    const { components, missing } = collectDependencies(primary, [primary, def])
    expect(components.map((x) => x.uid)).toEqual(['widgetdef:gauge'])
    expect(missing).toEqual(['icon:dial'])
  })
})

describe('validation', () => {
  const bundle = (over: Partial<PartialBundle> = {}): unknown => ({
    manifest: {
      app: 'neohab',
      formatVersion: PARTIAL_FORMAT_VERSION,
      exportedAt: 'now',
      kind: 'dashboard',
      primary: 'dashboard:k'
    },
    components: [dashboard('k')],
    ...over
  })

  it('accepts a file this version wrote', () => {
    expect(validatePartialBundle(bundle())).toBeNull()
  })

  it('refuses a file carrying anything but the component kinds it may carry', () => {
    const bad = bundle({ components: [dashboard('k'), c('settings', { theme: 'evil' }, 'neohab:settings')] }) as PartialBundle
    expect(validatePartialBundle(bad)).toMatch(/may not carry/)
  })

  it('refuses a file whose kind and primary disagree', () => {
    const bad = bundle({
      manifest: { app: 'neohab', formatVersion: PARTIAL_FORMAT_VERSION, exportedAt: 'n', kind: 'theme', primary: 'dashboard:k' }
    }) as PartialBundle
    expect(validatePartialBundle(bad)).toMatch(/but describes/)
  })

  it('refuses versions, kinds and shapes it does not know', () => {
    expect(validatePartialBundle(bundle({ manifest: { ...(bundle() as PartialBundle).manifest, formatVersion: 99 } }))).toMatch(/version/)
    expect(validatePartialBundle(bundle({ components: [] }))).toMatch(/no components/)
    expect(validatePartialBundle({ manifest: { app: 'other' } })).toMatch(/Not a neohab file/)
    expect(validatePartialBundle(null)).toMatch(/Not a neohab file/)
  })

  it('distinguishes a partial file from a whole-configuration backup', () => {
    expect(looksPartial(bundle())).toBe(true)
    expect(looksPartial({ manifest: { app: 'neohab', formatVersion: 1, exportedAt: 'n' }, components: [] })).toBe(false)
  })

  it('makes a file name with no path in it, from any id', () => {
    expect(partialFileName('dashboard', 'Kitchen / Living')).toBe('neohab-dashboard-Kitchen-Living.json')
    for (const id of ['../../etc', 'a\\b', 'a/b', '', '   ']) {
      const name = partialFileName('theme', id)
      expect(name, id).not.toMatch(/[/\\]/)
      expect(name.startsWith('neohab-theme-') || name === 'neohab-theme-theme.json', id).toBe(true)
      expect(name.endsWith('.json'), id).toBe(true)
    }
  })
})

describe('import planning', () => {
  it('tells new from unchanged from conflicting', () => {
    const existing = [dashboard('k'), widgetdef('gauge')]
    const incoming: PartialBundle = {
      manifest: { app: 'neohab', formatVersion: 2, exportedAt: 'n', kind: 'dashboard', primary: 'dashboard:k' },
      components: [dashboard('k', [{ id: 'w', type: 'label', config: {} }]), widgetdef('gauge'), icon('bulb')]
    }
    const plan = planPartialImport(incoming, existing)
    expect(plan.primary.status).toBe('conflict')
    expect(plan.dependencies.find((d) => d.uid === 'widgetdef:gauge')!.status).toBe('identical')
    expect(plan.dependencies.find((d) => d.uid === 'icon:bulb')!.status).toBe('new')
  })
})

describe('import resolution', () => {
  const bundleOf = (components: UIComponent[], primary: string): PartialBundle => ({
    manifest: { app: 'neohab', formatVersion: 2, exportedAt: 'n', kind: 'dashboard', primary },
    components
  })

  it('copy mode touches nothing that is already there', () => {
    const existing = [dashboard('kitchen', [{ id: 'old', type: 'label', config: {} }])]
    const incoming = bundleOf([dashboard('kitchen', [{ id: 'new', type: 'clock', config: {} }])], 'dashboard:kitchen')
    const out = resolvePartialImport(incoming, existing, 'copy', newId)
    expect(out.primaryUid).toBe('dashboard:kitchen-2')
    expect(out.components.map((x) => x.uid)).toEqual(['dashboard:kitchen-2'])
    expect(out.renamed).toEqual([['dashboard:kitchen', 'dashboard:kitchen-2']])
  })

  it('reuses an unchanged dependency instead of accumulating copies of it', () => {
    const existing = [widgetdef('gauge')]
    const incoming = bundleOf(
      [dashboard('k', [{ id: 'w', type: 'template', config: { customwidget: 'gauge' } }]), widgetdef('gauge')],
      'dashboard:k'
    )
    const out = resolvePartialImport(incoming, existing, 'copy', newId)
    expect(out.reused).toContain('widgetdef:gauge')
    expect(out.components.map((x) => x.uid)).toEqual(['dashboard:k'])
  })

  it('copies a dependency that a renamed one points at, so nothing is left orphaned', () => {
    const existing = [widgetdef('gauge'), c('icon:bulb', { version: 1, id: 'bulb', name: 'b', dataUri: 'data:,DIFFERENT' }, 'neohab:icon')]
    const defWithIcon = c(
      'widgetdef:gauge',
      { version: 1, id: 'gauge', name: 'gauge', template: '<p>hi</p>', settings: [{ id: 's', default: 'custom:bulb' }] },
      'neohab:widgetdef'
    )
    const incoming = bundleOf(
      [dashboard('fresh', [{ id: 'w', type: 'template', config: { customwidget: 'gauge' } }]), defWithIcon, icon('bulb')],
      'dashboard:fresh'
    )
    const out = resolvePartialImport(incoming, existing, 'copy', newId)
    const renamed = Object.fromEntries(out.renamed)
    expect(renamed['icon:bulb']).toBe('icon:bulb-2')
    expect(renamed['widgetdef:gauge']).toBe('widgetdef:gauge-2')
    const def = out.components.find((x) => x.uid === 'widgetdef:gauge-2')!
    expect(JSON.stringify(def.config)).toContain('custom:bulb-2')
  })

  it('gives a copied dashboard fresh widget ids, and keeps its stack order pointing at them', () => {
    const incoming = bundleOf(
      [
        dashboard(
          'k',
          [
            { id: 'w1', type: 'label', config: {} },
            { id: 'w2', type: 'clock', config: {} }
          ],
          { stackOrder: ['w2', 'w1'] }
        )
      ],
      'dashboard:k'
    )
    const out = resolvePartialImport(incoming, [dashboard('k')], 'copy', newId)
    const config = out.components[0].config as { widgets: { id: string }[]; stackOrder: string[] }
    const ids = config.widgets.map((x) => x.id)
    expect(ids).not.toContain('w1')
    expect(new Set(config.stackOrder)).toEqual(new Set(ids))
    expect(config.stackOrder[0]).toBe(ids[1])
  })

  it('overwrite mode writes under the original uids and skips what is unchanged', () => {
    const existing = [dashboard('k'), widgetdef('gauge')]
    const incoming = bundleOf([dashboard('k', [{ id: 'w', type: 'label', config: {} }]), widgetdef('gauge')], 'dashboard:k')
    const out = resolvePartialImport(incoming, existing, 'overwrite', newId)
    expect(out.primaryUid).toBe('dashboard:k')
    expect(out.components.map((x) => x.uid)).toEqual(['dashboard:k'])
    expect(out.renamed).toEqual([])
  })
})

describe('building a bundle', () => {
  it('carries the primary first, then its dependencies', () => {
    const all = [
      dashboard('k', [{ id: 'w', type: 'template', config: { customwidget: 'gauge', icon: 'custom:bulb' } }]),
      widgetdef('gauge'),
      icon('bulb')
    ]
    const out = buildPartialBundle('dashboard', 'k', all, 'now')!
    expect(out.bundle.components.map((x) => x.uid)).toEqual(['dashboard:k', 'widgetdef:gauge', 'icon:bulb'])
    expect(out.missing).toEqual([])
  })

  it('answers null for something that is not there', () => {
    expect(buildPartialBundle('dashboard', 'gone', [], 'now')).toBeNull()
  })
})
