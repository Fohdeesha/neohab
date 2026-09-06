import type { Item } from '../api/types'
import type { Dashboard, Rect, WidgetInstance } from '../model/dashboard'
import { MODEL_VERSION, newWidgetId, slugifyDashboardId } from '../model/dashboard'
import { configFor, isReadOnlyPoint, prettyLabel, sizeFor, suggestWidget, widgetChoices, type SuggestNote } from './mapping'
import { classify, type TagIndex } from './semantics'
import { clusterPrefix, type Cluster, type SourceKind } from './sources'

export const GENERATED_COLUMNS = 12

export interface PlanWidget {
  key: string
  item: Item
  label: string
  type: string
  suggested: string
  choices: string[]
  note?: SuggestNote
  icon?: string
  readOnly: boolean
  include: boolean
}

export interface PlanSection {
  name?: string
  widgets: PlanWidget[]
}

export interface PlanCluster {
  id: string
  name: string
  icon?: string
  sections: PlanSection[]
  include: boolean
}

export interface PlanSkip {
  item: string
  reason: 'container' | 'image'
}

export interface GeneratePlan {
  clusters: PlanCluster[]
  skipped: PlanSkip[]
}

export function buildPlan(clusters: Cluster[], items: Item[], index: TagIndex, source: SourceKind): GeneratePlan {
  const byName = new Map(items.map((i) => [i.name, i]))
  const skipped: PlanSkip[] = []
  const planned: PlanCluster[] = []

  for (const cluster of clusters) {
    const prefix = clusterPrefix(source, cluster)
    const sections: PlanSection[] = []
    for (const section of cluster.sections) {
      const widgets: PlanWidget[] = []
      for (const name of section.items) {
        const item = byName.get(name)
        if (!item) continue
        const sem = classify(item, index)
        const label = prettyLabel(item, prefix)
        const suggestion = suggestWidget(item, sem, label, section.equipmentTag)
        if (!suggestion) {
          skipped.push({ item: name, reason: item.type === 'Image' ? 'image' : 'container' })
          continue
        }
        widgets.push({
          key: cluster.id + '/' + name,
          item,
          label,
          type: suggestion.type,
          suggested: suggestion.type,
          choices: widgetChoices(item, suggestion.type),
          note: suggestion.note,
          icon: suggestion.config.icon as string | undefined,
          readOnly: isReadOnlyPoint(item, sem),
          include: true
        })
      }
      if (widgets.length > 0) sections.push({ name: section.name, widgets })
    }
    if (sections.length > 0) planned.push({ id: cluster.id, name: cluster.name, icon: cluster.icon, sections, include: true })
  }
  return { clusters: planned, skipped }
}

export function configForPlanWidget(widget: PlanWidget): Record<string, unknown> {
  return configFor(widget.type, widget.item, { label: widget.label, icon: widget.icon, readOnly: widget.readOnly })
}

export function countPlanned(plan: GeneratePlan): number {
  return plan.clusters
    .filter((c) => c.include)
    .reduce((n, c) => n + c.sections.reduce((m, s) => m + s.widgets.filter((w) => w.include).length, 0), 0)
}

export type OutputMode = 'each' | 'single'

export interface BuildOptions {
  mode: OutputMode
  name: string
  existingIds: Set<string>
  columns?: number
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// first fit, never scanning above startY, so a section's widgets stay together instead of filling earlier gaps
function packSection(sizes: { w: number; h: number }[], columns: number, startY: number): { rects: Rect[]; bottom: number } {
  const rects: Rect[] = []
  let bottom = startY
  for (const size of sizes) {
    const w = Math.max(1, Math.min(size.w, columns))
    const h = Math.max(1, size.h)
    let placed: Rect | null = null
    for (let y = startY; !placed; y++) {
      for (let x = 0; x <= columns - w; x++) {
        const candidate = { x, y, w, h }
        if (!rects.some((r) => overlaps(candidate, r))) {
          placed = candidate
          break
        }
      }
    }
    rects.push(placed)
    bottom = Math.max(bottom, placed.y + placed.h)
  }
  return { rects, bottom }
}

function headerWidget(text: string, columns: number, y: number, fontSize: number): WidgetInstance {
  return {
    id: newWidgetId(),
    type: 'label',
    config: { text, fontSize },
    layout: { lg: { x: 0, y, w: columns, h: 1 } }
  }
}

export function buildDashboards(plan: GeneratePlan, opts: BuildOptions): Dashboard[] {
  const columns = opts.columns ?? GENERATED_COLUMNS
  const taken = new Set(opts.existingIds)
  const clusters = plan.clusters.filter((c) => c.include && c.sections.some((s) => s.widgets.some((w) => w.include)))
  if (clusters.length === 0) return []

  const emit = (dashboard: Dashboard, cluster: PlanCluster, startY: number, showClusterHeader: boolean): number => {
    let y = startY
    if (showClusterHeader) {
      dashboard.widgets.push(headerWidget(cluster.name, columns, y, 26))
      y += 1
    }
    for (const section of cluster.sections) {
      const widgets = section.widgets.filter((w) => w.include)
      if (widgets.length === 0) continue
      if (section.name) {
        dashboard.widgets.push(headerWidget(section.name, columns, y, 18))
        y += 1
      }
      const ordered = widgets
        .map((widget, i) => ({ widget, i }))
        .sort((a, b) => sizeFor(b.widget.type).h - sizeFor(a.widget.type).h || a.i - b.i)
        .map((entry) => entry.widget)
      const { rects, bottom } = packSection(
        ordered.map((w) => sizeFor(w.type)),
        columns,
        y
      )
      ordered.forEach((widget, i) => {
        dashboard.widgets.push({
          id: newWidgetId(),
          type: widget.type,
          config: configForPlanWidget(widget),
          layout: { lg: rects[i] }
        })
      })
      y = bottom
    }
    return y
  }

  if (opts.mode === 'single') {
    const name = opts.name.trim() || clusters[0].name
    const id = slugifyDashboardId(name, taken)
    taken.add(id)
    const dashboard: Dashboard = { version: MODEL_VERSION, id, name, columns, rowHeight: 'match', widgets: [] }
    let y = 0
    const withHeaders = clusters.length > 1
    for (const cluster of clusters) y = emit(dashboard, cluster, y, withHeaders)
    return [dashboard]
  }

  return clusters.map((cluster) => {
    const id = slugifyDashboardId(cluster.name, taken)
    taken.add(id)
    const dashboard: Dashboard = {
      version: MODEL_VERSION,
      id,
      name: cluster.name,
      ...(cluster.icon ? { icon: cluster.icon } : {}),
      columns,
      rowHeight: 'match',
      widgets: []
    }
    emit(dashboard, cluster, 0, false)
    return dashboard
  })
}
