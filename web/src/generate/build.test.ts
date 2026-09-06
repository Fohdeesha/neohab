import { describe, expect, it } from 'vitest'
import type { Item } from '../api/types'
import type { Rect } from '../model/dashboard'
import { buildDashboards, buildPlan, countPlanned, GENERATED_COLUMNS } from './build'
import { buildTagIndex } from './semantics'
import { groupClusters, pickedCluster, prefixClusters, semanticClusters, surveySources } from './sources'

const item = (name: string, over: Partial<Item> = {}): Item => ({ name, type: 'Switch', state: 'OFF', ...over }) as Item

const INDEX = buildTagIndex()

const MODELLED: Item[] = [
  item('gKitchen', { type: 'Group', label: 'Kitchen', tags: ['Kitchen'] }),
  item('gCeiling', { type: 'Group', tags: ['Lightbulb'], groupNames: ['gKitchen'] }),
  item('Kitchen_Ceiling_Switch', { type: 'Switch', tags: ['Control', 'Light'], groupNames: ['gCeiling'] }),
  item('Kitchen_Ceiling_Level', { type: 'Dimmer', tags: ['Control', 'Light'], groupNames: ['gCeiling'] }),
  item('Kitchen_Temp', { type: 'Number', tags: ['Measurement', 'Temperature'], groupNames: ['gKitchen'] })
]

const plan = (items: Item[], clusters = prefixClusters(items), source: 'prefix' | 'semantic' | 'group' | 'pick' = 'prefix') =>
  buildPlan(clusters, items, INDEX, source)

const build = (
  items: Item[],
  clusters = prefixClusters(items),
  mode: 'each' | 'single' = 'each',
  source: 'prefix' | 'semantic' | 'group' | 'pick' = 'prefix'
) => buildDashboards(plan(items, clusters, source), { mode, name: 'Generated', existingIds: new Set() })

const rects = (widgets: { layout: { lg?: Rect } }[]): Rect[] =>
  widgets.map((w) => {
    if (!w.layout.lg) throw new Error('generated widget has no desktop rect')
    return w.layout.lg
  })
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('finding clusters', () => {
  it('clusters by name prefix, case-insensitively, which is the source that works with no model', () => {
    const items = [item('studio_volume'), item('Studio_Power'), item('STUDIO_mode'), item('hall_light')]
    const clusters = prefixClusters(items)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].sections[0].items).toHaveLength(3)
  })

  it('names a prefix cluster by the spelling most items use', () => {
    const items = [item('studio_a'), item('studio_b'), item('Studio_c')]
    expect(prefixClusters(items)[0].name).toBe('Studio')
  })

  it('ignores a prefix only one item uses', () => {
    expect(prefixClusters([item('lonely_thing'), item('a_1'), item('a_2')]).map((c) => c.name)).toEqual(['A'])
  })

  it('builds a location per model location, with a section per piece of equipment', () => {
    const clusters = semanticClusters(MODELLED, INDEX)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].name).toBe('Kitchen')
    const sectionSizes = clusters[0].sections.map((s) => s.items.length).sort()
    expect(sectionSizes).toEqual([1, 2])
    expect(clusters[0].count).toBe(3)
  })

  it('finds nothing semantic on a server with no model, rather than inventing one', () => {
    expect(semanticClusters([item('a'), item('b')], INDEX)).toEqual([])
  })

  it('clusters by group membership, largest first', () => {
    const items = [
      item('gBig', { type: 'Group' }),
      item('gSmall', { type: 'Group' }),
      item('a', { groupNames: ['gBig'] }),
      item('b', { groupNames: ['gBig'] }),
      item('c', { groupNames: ['gSmall'] })
    ]
    expect(groupClusters(items, INDEX).map((c) => c.count)).toEqual([2, 1])
  })

  it('reports what each source found, so the wizard can offer the ones that exist', () => {
    const survey = surveySources(MODELLED, INDEX)
    expect(survey.semantic).toHaveLength(1)
    expect(survey.placeable).toBe(3) // the two container groups are not placeable
  })

  it('takes hand-picked items as one cluster in the order given', () => {
    const c = pickedCluster(['b', 'a'], 'My picks')
    expect(c.sections[0].items).toEqual(['b', 'a'])
    expect(c.count).toBe(2)
  })
})

describe('the reviewable plan', () => {
  it('reports an item that cannot become a widget instead of dropping it', () => {
    const items = [item('a'), item('grp', { type: 'Group' }), item('pic', { type: 'Image' })]
    const p = plan(items, [pickedCluster(['a', 'grp', 'pic'], 'Picks')], 'pick')
    expect(p.skipped).toEqual(
      expect.arrayContaining([
        { item: 'grp', reason: 'container' },
        { item: 'pic', reason: 'image' }
      ])
    )
    expect(p.clusters[0].sections[0].widgets.map((w) => w.item.name)).toEqual(['a'])
  })

  it('never offers a container or an image as a widget from any source', () => {
    const items = [item('room_a'), item('room_b'), item('room_grp', { type: 'Group' }), item('room_pic', { type: 'Image' })]
    const names = plan(items).clusters.flatMap((c) => c.sections.flatMap((s) => s.widgets.map((w) => w.item.name)))
    expect(names).toEqual(['room_a', 'room_b'])
  })

  it('strips the cluster prefix from labels only for the prefix source', () => {
    const items = [item('kitchen_fan'), item('kitchen_light')]
    expect(plan(items).clusters[0].sections[0].widgets.map((w) => w.label)).toEqual(['Fan', 'Light'])
    const picked = plan(items, [pickedCluster(['kitchen_fan'], 'Picks')], 'pick')
    expect(picked.clusters[0].sections[0].widgets[0].label).toBe('Kitchen Fan')
  })

  it('carries read-onlyness separately so a type override still knows the model’s verdict', () => {
    const items = [
      item('room_a', { type: 'Number', tags: ['Measurement', 'Temperature'] }),
      item('room_b', { type: 'Number', tags: ['Measurement', 'Temperature'] })
    ]
    const widget = plan(items).clusters[0].sections[0].widgets[0]
    expect(widget.readOnly).toBe(true)
    expect(widget.type).toBe('value')
    expect(widget.choices).toContain('dial')
  })

  it('counts only what is still included', () => {
    const items = [item('room_a'), item('room_b'), item('room_c')]
    const p = plan(items)
    expect(countPlanned(p)).toBe(3)
    p.clusters[0].sections[0].widgets[0].include = false
    expect(countPlanned(p)).toBe(2)
    p.clusters[0].include = false
    expect(countPlanned(p)).toBe(0)
  })

  it('drops a cluster whose items all turned out unplaceable', () => {
    const items = [item('room_x', { type: 'Group' }), item('room_y', { type: 'Image' })]
    expect(plan(items).clusters).toEqual([])
  })
})

describe('building dashboards', () => {
  const many = Array.from({ length: 18 }, (_, i) => item(`room_i${i}`, { type: ['Switch', 'Dimmer', 'Number', 'Color', 'Player'][i % 5] }))

  it('lays every widget out inside the grid, with no two overlapping', () => {
    const dashboards = build(many)
    expect(dashboards).toHaveLength(1)
    const rs = rects(dashboards[0].widgets)
    expect(rs.length).toBeGreaterThan(0)
    for (const r of rs) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(GENERATED_COLUMNS)
    }
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        expect(overlaps(rs[i], rs[j]), `${JSON.stringify(rs[i])} vs ${JSON.stringify(rs[j])}`).toBe(false)
      }
    }
  })

  it('produces a dashboard indistinguishable from a hand-made one', () => {
    const d = build(many)[0]
    expect(d).toMatchObject({ version: 1, columns: GENERATED_COLUMNS, rowHeight: 'match' })
    expect(new Set(d.widgets.map((w) => w.id)).size).toBe(d.widgets.length)
  })

  it('never takes an id a dashboard already has', () => {
    const p = plan([item('kitchen_a'), item('kitchen_b')])
    const dashboards = buildDashboards(p, { mode: 'each', name: '', existingIds: new Set(['kitchen']) })
    expect(dashboards[0].id).not.toBe('kitchen')
    expect(dashboards[0].name).toBe('Kitchen')
  })

  it('gives each cluster its own dashboard in "each" mode', () => {
    const items = [item('hall_a'), item('hall_b'), item('shed_a'), item('shed_b')]
    expect(
      build(items)
        .map((d) => d.name)
        .sort()
    ).toEqual(['Hall', 'Shed'])
  })

  it('puts every cluster on one dashboard in "single" mode, under headings', () => {
    const items = [item('hall_a'), item('hall_b'), item('shed_a'), item('shed_b')]
    const dashboards = build(items, prefixClusters(items), 'single')
    expect(dashboards).toHaveLength(1)
    const headings = dashboards[0].widgets.filter((w) => w.type === 'label')
    expect(headings.map((h) => h.config.text).sort()).toEqual(['Hall', 'Shed'])
    for (const h of headings) expect(h.layout.lg?.w).toBe(GENERATED_COLUMNS)
  })

  it('spends no row on a heading when there is only one cluster to name', () => {
    const items = [item('hall_a'), item('hall_b')]
    const dashboards = build(items, prefixClusters(items), 'single')
    expect(dashboards[0].widgets.some((w) => w.type === 'label')).toBe(false)
  })

  it('builds nothing at all when everything has been excluded', () => {
    const p = plan([item('room_a'), item('room_b')])
    for (const c of p.clusters) c.include = false
    expect(buildDashboards(p, { mode: 'each', name: '', existingIds: new Set() })).toEqual([])
  })

  it('creates exactly what the review said it would', () => {
    const p = plan(many)
    p.clusters[0].sections[0].widgets[0].include = false
    const expected = countPlanned(p)
    const dashboards = buildDashboards(p, { mode: 'each', name: '', existingIds: new Set() })
    const nonHeading = dashboards.flatMap((d) => d.widgets).filter((w) => w.type !== 'label')
    expect(nonHeading).toHaveLength(expected)
  })

  it('keeps a section’s widgets together rather than scattering them into earlier gaps', () => {
    const items = [item('room_big', { type: 'Color' }), item('room_a'), item('room_b')]
    const d = build(items)[0]
    const maxBottom = Math.max(...rects(d.widgets).map((r) => r.y + r.h))
    expect(maxBottom).toBeLessThanOrEqual(6)
  })

  it('narrows a widget that will not fit a narrow grid instead of overflowing it', () => {
    const p = plan([item('room_a', { type: 'Number' }), item('room_b', { type: 'Number' })])
    const dashboards = buildDashboards(p, { mode: 'each', name: '', existingIds: new Set(), columns: 2 })
    for (const r of rects(dashboards[0].widgets)) {
      expect(r.x + r.w).toBeLessThanOrEqual(2)
    }
  })
})
