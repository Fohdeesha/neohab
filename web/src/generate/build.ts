/**
 * Turning clusters into dashboards.
 *
 * Two stages on purpose. `buildPlan` decides what each item would become and is what the
 * preview shows and edits; `buildDashboards` lays the approved plan out on the grid. Nothing
 * here touches the server or the store, so a plan can be inspected, changed and rebuilt freely.
 */
import type { Item } from '../api/types'
import type { Dashboard, Rect, WidgetInstance } from '../model/dashboard'
import { MODEL_VERSION, newWidgetId, slugifyDashboardId } from '../model/dashboard'
import {
  configFor,
  isReadOnlyPoint,
  prettyLabel,
  sizeFor,
  suggestWidget,
  widgetChoices,
  type SuggestNote,
} from './mapping'
import { classify, type TagIndex } from './semantics'
import { clusterPrefix, type Cluster, type SourceKind } from './sources'

/** Columns for a generated dashboard; the model's own default, and what the sizes assume. */
export const GENERATED_COLUMNS = 12

export interface PlanWidget {
  /** Stable key for React lists and for toggling this row in the preview. */
  key: string
  item: Item
  label: string
  /** The widget type, which the preview may override. */
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

/** An item that cannot become a widget at all, and why - reported rather than dropped silently. */
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
          // Carried separately from the suggestion so an override to a dial still knows the model
          // called this point read-only, and renders a gauge rather than a control.
          readOnly: isReadOnlyPoint(item, sem),
          include: true,
        })
      }
      if (widgets.length > 0) sections.push({ name: section.name, widgets })
    }
    if (sections.length > 0) planned.push({ id: cluster.id, name: cluster.name, icon: cluster.icon, sections, include: true })
  }
  return { clusters: planned, skipped }
}

/** The config a plan row currently implies, rebuilt whenever its type is overridden. */
export function configForPlanWidget(widget: PlanWidget): Record<string, unknown> {
  return configFor(widget.type, widget.item, { label: widget.label, icon: widget.icon, readOnly: widget.readOnly })
}

/** How many widgets the plan would create right now. */
export function countPlanned(plan: GeneratePlan): number {
  return plan.clusters
    .filter((c) => c.include)
    .reduce((n, c) => n + c.sections.reduce((m, s) => m + s.widgets.filter((w) => w.include).length, 0), 0)
}

export type OutputMode = 'each' | 'single'

export interface BuildOptions {
  mode: OutputMode
  /** Dashboard name in `single` mode; ignored in `each`, where clusters name themselves. */
  name: string
  /** Dashboard ids already taken, so generated ids never collide with existing ones. */
  existingIds: Set<string>
  columns?: number
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Pack one section's widgets into the grid, first free spot wins, scanning top to bottom and
 * left to right from `startY`.
 *
 * First-fit rather than a plain shelf: widget heights differ, and a shelf leaves dead space under
 * every short widget sharing a row with a tall one. Never looking above `startY` is what keeps a
 * section's widgets together instead of scattering them into earlier gaps. Returns the row below
 * everything placed, so the next section starts clear of this one.
 */
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
    layout: { lg: { x: 0, y, w: columns, h: 1 } },
  }
}

/** Build the dashboards a plan describes. Only included clusters and widgets are laid out. */
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
      // Tallest first, keeping the order of equal-height widgets: big controls anchor the top of
      // the section and the shorter ones fill in around them.
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
          layout: { lg: rects[i] },
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
    // Cluster headers only earn their row when there is more than one cluster to tell apart.
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
      widgets: [],
    }
    emit(dashboard, cluster, 0, false)
    return dashboard
  })
}
