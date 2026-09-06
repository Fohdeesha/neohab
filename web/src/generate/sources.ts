import type { Item } from '../api/types'
import { classify, type TagIndex } from './semantics'
import { equipmentIcon, locationIcon, titleCase } from './mapping'

export type SourceKind = 'semantic' | 'group' | 'prefix' | 'pick'

export interface ClusterSection {
  name?: string
  equipmentTag?: string
  items: string[]
}

export interface Cluster {
  id: string
  name: string
  icon?: string
  sections: ClusterSection[]
  count: number
}

const cluster = (id: string, name: string, sections: ClusterSection[], icon?: string): Cluster => ({
  id,
  name,
  icon,
  sections: sections.filter((s) => s.items.length > 0),
  count: sections.reduce((n, s) => n + s.items.length, 0)
})

function isPlaceable(item: Item): boolean {
  return !(item.type === 'Group' && !item.groupType) && item.type !== 'Image'
}

export function semanticClusters(items: Item[], index: TagIndex): Cluster[] {
  const byName = new Map(items.map((i) => [i.name, i]))
  const kindOf = new Map(items.map((i) => [i.name, classify(i, index)]))

  const findAncestor = (item: Item, want: 'location' | 'equipment'): Item | undefined => {
    const seen = new Set<string>([item.name])
    let frontier = item.groupNames ?? []
    while (frontier.length > 0) {
      const next: string[] = []
      for (const parentName of frontier) {
        if (seen.has(parentName)) continue
        seen.add(parentName)
        const parent = byName.get(parentName)
        if (!parent) continue
        if (kindOf.get(parentName)?.kind === want) return parent
        next.push(...(parent.groupNames ?? []))
      }
      frontier = next
    }
    return undefined
  }

  const locations = items.filter((i) => kindOf.get(i.name)?.kind === 'location')
  if (locations.length === 0) return []

  const buckets = new Map<string, Map<string, string[]>>()
  for (const loc of locations) buckets.set(loc.name, new Map())

  for (const item of items) {
    const sem = kindOf.get(item.name)
    if (!sem || sem.kind === 'location') continue
    if (!isPlaceable(item)) continue
    const isEquipment = sem.kind === 'equipment'
    const equipment = isEquipment ? item : findAncestor(item, 'equipment')
    const location = findAncestor(equipment ?? item, 'location') ?? findAncestor(item, 'location')
    if (!location) continue
    const bucket = buckets.get(location.name)
    if (!bucket) continue
    const key = equipment?.name ?? ''
    const list = bucket.get(key)
    if (list) list.push(item.name)
    else bucket.set(key, [item.name])
  }

  const out: Cluster[] = []
  for (const loc of locations) {
    const bucket = buckets.get(loc.name)
    if (!bucket || bucket.size === 0) continue
    const sections: ClusterSection[] = []
    const ordered = (names: string[], self?: string): string[] =>
      [...names].sort((a, b) => (a === self ? -1 : b === self ? 1 : nameOf(byName, a).localeCompare(nameOf(byName, b))))
    const direct = bucket.get('')
    if (direct) sections.push({ items: ordered(direct) })
    const equipmentKeys = [...bucket.keys()].filter((k) => k !== '').sort((a, b) => nameOf(byName, a).localeCompare(nameOf(byName, b)))
    for (const key of equipmentKeys) {
      const equipment = byName.get(key)
      sections.push({
        name: equipment ? displayName(equipment) : titleCase(key),
        equipmentTag: equipment ? kindOf.get(key)?.tag?.name : undefined,
        items: ordered(bucket.get(key) ?? [], key)
      })
    }
    out.push(cluster(loc.name, displayName(loc), sections, locationIcon(kindOf.get(loc.name)?.tag?.name)))
  }
  return out.filter((c) => c.count > 0).sort((a, b) => a.name.localeCompare(b.name))
}

const nameOf = (byName: Map<string, Item>, key: string): string => displayName(byName.get(key)) || key

function displayName(item?: Item): string {
  if (!item) return ''
  return item.label?.trim() || titleCase(item.name)
}

export function groupClusters(items: Item[], index: TagIndex): Cluster[] {
  const groups = items.filter((i) => i.type === 'Group')
  if (groups.length === 0) return []
  const members = new Map<string, string[]>()
  for (const item of items) {
    if (!isPlaceable(item)) continue
    for (const parent of item.groupNames ?? []) {
      const list = members.get(parent)
      if (list) list.push(item.name)
      else members.set(parent, [item.name])
    }
  }
  return groups
    .map((group) => {
      const sem = classify(group, index)
      const icon = sem.kind === 'location' ? locationIcon(sem.tag?.name) : equipmentIcon(sem.tag?.name)
      return cluster(group.name, displayName(group), [{ items: members.get(group.name) ?? [] }], icon)
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

const MIN_PREFIX_CLUSTER = 2

export function prefixClusters(items: Item[]): Cluster[] {
  const buckets = new Map<string, { display: Map<string, number>; items: string[] }>()
  for (const item of items) {
    if (!isPlaceable(item)) continue
    const first = item.name.split(/[_\-\s]/)[0]
    if (!first) continue
    const key = first.toLowerCase()
    const bucket = buckets.get(key) ?? { display: new Map<string, number>(), items: [] }
    bucket.items.push(item.name)
    bucket.display.set(first, (bucket.display.get(first) ?? 0) + 1)
    buckets.set(key, bucket)
  }
  return [...buckets.entries()]
    .filter(([, b]) => b.items.length >= MIN_PREFIX_CLUSTER)
    .map(([key, b]) => {
      const spelling = [...b.display.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]))[0][0]
      return cluster(key, titleCase(spelling), [{ items: b.items }])
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function clusterPrefix(source: SourceKind, cluster: Cluster): string | undefined {
  return source === 'prefix' ? cluster.id : undefined
}

export function pickedCluster(names: string[], name: string): Cluster {
  return cluster('picked', name, [{ items: names }])
}

export function surveySources(items: Item[], index: TagIndex) {
  const semantic = semanticClusters(items, index)
  const groups = groupClusters(items, index)
  const prefixes = prefixClusters(items)
  return {
    semantic,
    groups,
    prefixes,
    placeable: items.filter(isPlaceable).length
  }
}
