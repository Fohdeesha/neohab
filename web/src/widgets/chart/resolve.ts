/**
 * Turning a stored chart configuration into the concrete values the renderers need: colours
 * filled in from the palette, numbers coerced (imported configs store them as strings), defaults
 * applied. Pure, and shared by the chart widget and the full-screen chart view so both draw the
 * same chart from the same configuration.
 */
import { AGGREGATE_FUNCTIONS, isCategorical, type AggregateFunction, type GroupBy } from './aggregate'
import { effectiveSeries, effectiveThresholds, type ChartConfig, type ChartThreshold } from './model'
import { chartScheme, seriesColor } from './palette'

export interface ResolvedSeries {
  item: string
  label: string
  color: string
  axis: 'y' | 'y2'
  width: number
  fill: number
  mode: 'smooth' | 'linear' | 'step'
  points: boolean
  kind: 'line' | 'bar'
  aggregate: AggregateFunction
}

export interface ResolvedThreshold {
  from?: number
  to?: number
  axis: 'y' | 'y2'
  color: string
  label?: string
}

export interface ResolvedChart {
  series: ResolvedSeries[]
  thresholds: ResolvedThreshold[]
  groupBy: GroupBy
  grouped: boolean
  categorical: boolean
  /** Heatmap mode, and there is a series to draw one from. */
  heatmap: boolean
  yMin?: number
  yMax?: number
  y2Min?: number
  y2Max?: number
  maxPoints?: number
  service?: string
}

/** Optional numeric config value; imported configs sometimes store numbers as strings. */
export function numOpt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function resolveChart(config: ChartConfig): ResolvedChart {
  const scheme = chartScheme()
  const series = effectiveSeries(config).map((s, i) => ({
    item: s.item,
    label: s.label || s.item,
    color: s.color || seriesColor(i, scheme),
    axis: s.axis === 'y2' ? ('y2' as const) : ('y' as const),
    width: numOpt(s.width) ?? 2,
    fill: numOpt(s.fill) ?? 20,
    mode: s.mode === 'linear' ? ('linear' as const) : s.mode === 'step' ? ('step' as const) : ('smooth' as const),
    points: s.points === true,
    kind: s.kind === 'bar' ? ('bar' as const) : ('line' as const),
    aggregate: (AGGREGATE_FUNCTIONS.includes(s.aggregate as AggregateFunction) ? s.aggregate : 'average') as AggregateFunction
  }))
  const thresholds = effectiveThresholds(config)
    .map((th: ChartThreshold) => ({
      from: numOpt(th.from),
      to: numOpt(th.to),
      axis: th.axis === 'y2' ? ('y2' as const) : ('y' as const),
      color: th.color || '#d03b3b',
      label: th.label
    }))
    .filter((th) => th.from !== undefined || th.to !== undefined)
  const groupBy: GroupBy = (config.groupBy as GroupBy) ?? 'none'
  return {
    series,
    thresholds,
    groupBy,
    grouped: groupBy !== 'none',
    categorical: isCategorical(groupBy),
    heatmap: config.mode === 'heatmap' && series.length > 0,
    yMin: numOpt(config.yMin),
    yMax: numOpt(config.yMax),
    y2Min: numOpt(config.y2Min),
    y2Max: numOpt(config.y2Max),
    maxPoints: numOpt(config.maxPoints),
    service: config.service || undefined
  }
}

/** Series without the fields only the loader needs - exactly what the plot takes. */
export function plotSeries(series: ResolvedSeries[]) {
  return series.map(({ item: _item, aggregate: _aggregate, ...rest }) => rest)
}
