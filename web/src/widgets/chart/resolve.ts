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
  heatmap: boolean
  yMin?: number
  yMax?: number
  y2Min?: number
  y2Max?: number
  maxPoints?: number
  service?: string
}

export function numOpt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

const GROUPINGS: GroupBy[] = ['none', 'hour', 'day', 'week', 'month', 'hourOfDay', 'dayOfWeek', 'monthOfYear']

// a colour reaches uPlot's canvas and a CSS background, and a stored one can be anything
const colorOr = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() !== '' ? v : fallback)

// the chart widget and its full-screen page print a value the same way
export function formatChartValue(v: number, unit: string | undefined): string {
  const abs = Math.abs(v)
  const dec = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  let out = v.toFixed(dec)
  if (dec > 0) out = out.replace(/\.?0+$/, '')
  return unit ? out + ' ' + unit : out
}

export function resolveChart(config: ChartConfig): ResolvedChart {
  const scheme = chartScheme()
  const series = effectiveSeries(config).map((s, i) => ({
    item: s.item,
    label: typeof s.label === 'string' && s.label ? s.label : s.item,
    color: colorOr(s.color, seriesColor(i, scheme)),
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
      color: colorOr(th.color, '#d03b3b'),
      label: typeof th.label === 'string' ? th.label : undefined
    }))
    .filter((th) => th.from !== undefined || th.to !== undefined)
  const groupBy: GroupBy = GROUPINGS.includes(config.groupBy as GroupBy) ? (config.groupBy as GroupBy) : 'none'
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

export function plotSeries(series: ResolvedSeries[]) {
  return series.map(({ item: _item, aggregate: _aggregate, ...rest }) => rest)
}
