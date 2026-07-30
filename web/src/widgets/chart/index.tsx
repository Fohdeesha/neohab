import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useContainerWidth } from '../../components/useContainerWidth'
import { categoryLabels, heatmapMatrix } from './aggregate'
import { DEFAULT_MAX_POINTS, PERIODS, PERIOD_CHIPS, effectiveSeries, type ChartConfig } from './model'
import { loadChartData, parseState, type SeriesTable } from './data'
import { numOpt, plotSeries, resolveChart } from './resolve'
import { navigate, useRoute } from '../../app/router'
import type { ChartHandle } from './plot'
import type { HeatmapHandle } from './heatmap'

/** Chip selection per widget instance; survives the run/edit remount. Session-scoped. */
const periodMemory = new Map<string, string>()

/**
 * History chart backed by openHAB persistence: multi-series, gradient fills, crosshair tooltip,
 * legend with series toggling, quick period chips, drag-zoom (double-click resets), threshold
 * lines/bands, and live SSE appending. It can also group the history into buckets (per hour/day,
 * or by hour of day / day of week) with a per-series aggregate function, and show an
 * hour-by-weekday heatmap instead of a plot. All uPlot and canvas work lives in ./plot and
 * ./heatmap, loaded on demand so dashboards without charts don't pay for it.
 */
function ChartWidget({ config, ctx }: WidgetProps<ChartConfig>) {
  const { t } = useTranslation()
  const route = useRoute()
  const { series: resolved, thresholds, groupBy, grouped, categorical, heatmap } = resolveChart(config)

  // The picked period outlives this component: entering/leaving edit mode remounts the whole
  // widget tree, and losing the chip selection there means you can't tweak a chart while
  // looking at the range you care about. Session-scoped, keyed by widget instance id.
  const [period, setPeriodState] = useState(() => periodMemory.get(ctx.widgetId) ?? config.period ?? '24h')
  const setPeriod = (p: string) => {
    periodMemory.set(ctx.widgetId, p)
    setPeriodState(p)
  }
  // Follow a *change* to the configured default (the settings panel edits it live); the mount
  // run must not clobber the remembered chip with the default.
  const configPeriodRef = useRef(config.period)
  useEffect(() => {
    if (configPeriodRef.current === config.period) return
    configPeriodRef.current = config.period
    periodMemory.set(ctx.widgetId, config.period ?? '24h')
    setPeriodState(config.period ?? '24h')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.period])

  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [zoomed, setZoomed] = useState(false)
  const [hidden, setHidden] = useState<number[]>([])

  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ChartHandle | null>(null)
  const heatRef = useRef<HeatmapHandle | null>(null)
  const tablesRef = useRef<SeriesTable[]>([])
  const zoomedRef = useRef(false)
  const hiddenRef = useRef<number[]>([])
  const lastLiveRef = useRef(new Map<number, number>())
  const pendingRef = useRef(new Map<number, number>())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Rebuild triggers: anything that changes chart topology or styling.
  const seriesKey = JSON.stringify(resolved)
  const optionsKey =
    JSON.stringify(thresholds) +
    '|' +
    [numOpt(config.yMin), numOpt(config.yMax), numOpt(config.y2Min), numOpt(config.y2Max), numOpt(config.maxPoints)].join(
      ','
    ) +
    '|' +
    groupBy +
    '|' +
    (heatmap ? 'heat' : 'plot')

  useEffect(() => {
    if (resolved.length === 0) {
      setStatus('empty')
      return
    }
    let disposed = false
    zoomedRef.current = false
    setZoomed(false)
    lastLiveRef.current.clear()
    pendingRef.current.clear()

    const periodMs = PERIODS[period] ?? PERIODS['24h']

    const fmtValue = (i: number, v: number): string => {
      const unit = ctxRef.current.getItem(resolved[i]?.item ?? '')?.unit
      const abs = Math.abs(v)
      const dec = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
      let out = v.toFixed(dec)
      if (dec > 0) out = out.replace(/\.?0+$/, '')
      return unit ? out + ' ' + unit : out
    }

    /** Hour-by-weekday matrix of the first series - a different picture, not a different plot. */
    async function loadHeatmap() {
      const to = Date.now() / 1000
      const from = to - periodMs / 1000
      const [table] = await loadChartData({
        items: [resolved[0].item],
        aggregates: [resolved[0].aggregate],
        from,
        to,
        groupBy: 'none',
        service: config.service || undefined,
        maxPoints: 0, // the matrix does the reducing; decimating first would blur the cells
      })
      if (disposed) return
      const matrix = heatmapMatrix(table[0], table[1], to, resolved[0].aggregate)
      if (matrix.cells.flat().every((c) => c === null)) {
        heatRef.current?.destroy()
        heatRef.current = null
        setStatus('empty')
        return
      }
      const hm = await import('./heatmap')
      if (disposed || !hostRef.current) return
      if (!heatRef.current) {
        heatRef.current = hm.createHeatmap({
          host: hostRef.current,
          weekdays: categoryLabels('dayOfWeek'),
          formatValue: (v) => fmtValue(0, v),
          title: t('Heatmap of {{name}} by hour and weekday', { name: resolved[0].label }),
        })
      }
      heatRef.current.setData(matrix)
      setStatus('ready')
    }

    async function load() {
      const to = Date.now() / 1000
      const tables = await loadChartData({
        items: resolved.map((s) => s.item),
        aggregates: resolved.map((s) => s.aggregate),
        from: to - periodMs / 1000,
        to,
        groupBy,
        service: config.service || undefined,
        maxPoints: numOpt(config.maxPoints) ?? DEFAULT_MAX_POINTS,
      })
      if (disposed) return
      tablesRef.current = tables
      // A refetch answering after live points arrived would rewind the chart; the live
      // effect re-appends current values because the last-appended memory is cleared.
      lastLiveRef.current.clear()
      if (tables.every((tbl) => tbl[0].length === 0)) {
        handleRef.current?.destroy()
        handleRef.current = null
        setStatus('empty')
        return
      }
      const plot = await import('./plot')
      if (disposed || !hostRef.current) return
      if (!handleRef.current) {
        handleRef.current = plot.createChart({
          host: hostRef.current,
          series: plotSeries(resolved),
          thresholds,
          xMode: categorical ? 'category' : 'time',
          categoryLabels: categorical ? categoryLabels(groupBy) : undefined,
          yMin: numOpt(config.yMin),
          yMax: numOpt(config.yMax),
          y2Min: numOpt(config.y2Min),
          y2Max: numOpt(config.y2Max),
          formatValue: fmtValue,
          onZoom: (z) => {
            zoomedRef.current = z
            if (disposed) return
            setZoomed(z)
            // leaving zoom: catch up on everything skipped while zoomed
            if (!z) void load().catch(() => {})
          },
        })
        for (const i of hiddenRef.current) handleRef.current.setSeriesVisible(i, false)
      }
      handleRef.current.setData(tables)
      setStatus('ready')
    }

    const run = () => (heatmap ? loadHeatmap() : load())
    setStatus('loading')
    run().catch(() => {
      if (!disposed) setStatus('error')
    })
    const refreshSec = numOpt(config.refresh) && numOpt(config.refresh)! > 0 ? numOpt(config.refresh)! : 300
    const timer = setInterval(() => {
      if (!zoomedRef.current) void run().catch(() => {})
    }, refreshSec * 1000)

    return () => {
      disposed = true
      clearInterval(timer)
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      handleRef.current?.destroy()
      handleRef.current = null
      heatRef.current?.destroy()
      heatRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey, optionsKey, period, config.service, config.refresh])

  // Live appending: WidgetHost re-renders on subscribed item changes; coalesce into one
  // appended row per 500ms so a fading dimmer doesn't spam one point per SSE frame.
  // Only for ungrouped plots: pushing a raw reading into an aggregated bucket, or into a
  // category, would misstate the aggregate until the next refetch.
  const liveTracked = config.live !== false && !grouped && !heatmap
  const liveKey = liveTracked ? JSON.stringify(resolved.map((s) => ctx.getItem(s.item)?.state)) : ''
  useEffect(() => {
    if (!liveTracked || status !== 'ready') return
    for (let i = 0; i < resolved.length; i++) {
      const st = ctx.getItem(resolved[i].item)
      if (!st) continue
      const v = parseState(st.state)
      if (v === null) continue
      if (lastLiveRef.current.get(i) === v) continue
      pendingRef.current.set(i, v)
    }
    if (pendingRef.current.size === 0 || flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      const tables = tablesRef.current
      if (zoomedRef.current || !handleRef.current || tables.length !== resolved.length) {
        pendingRef.current.clear()
        return
      }
      const nowS = Date.now() / 1000
      const cutoff = nowS - (PERIODS[period] ?? PERIODS['24h']) / 1000
      for (const [i, v] of pendingRef.current) {
        lastLiveRef.current.set(i, v)
        tables[i][0].push(nowS)
        tables[i][1].push(v)
      }
      pendingRef.current.clear()
      for (const tbl of tables) {
        let drop = 0
        while (drop < tbl[0].length && tbl[0][drop] < cutoff) drop++
        if (drop > 0) {
          tbl[0].splice(0, drop)
          tbl[1].splice(0, drop)
        }
      }
      handleRef.current.setData(tables)
    }, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, status, seriesKey, period])

  const toggleSeries = (i: number) => {
    const wasHidden = hiddenRef.current.includes(i)
    const next = wasHidden ? hiddenRef.current.filter((x) => x !== i) : [...hiddenRef.current, i]
    hiddenRef.current = next
    // show again exactly when it was hidden before this click
    handleRef.current?.setSeriesVisible(i, wasHidden)
    setHidden(next)
  }

  const chips = useMemo(() => {
    const set = new Set(PERIOD_CHIPS)
    set.add(config.period ?? '24h')
    set.add(period)
    return [...set].filter((c) => PERIODS[c] !== undefined).sort((a, b) => PERIODS[a] - PERIODS[b])
  }, [config.period, period])

  const showChips = config.picker !== false
  const showLegend = config.legend !== false && resolved.length >= 2 && !heatmap
  const label = config.label ?? (resolved.length === 1 ? resolved[0].label : undefined)
  // The route is where the dashboard id comes from: a widget knows nothing about its dashboard,
  // and this button only exists while one is on screen in run mode.
  const onDashboard = route.name === 'dashboard' ? route.id : null
  const canExpand = config.expand !== false && !ctx.editing && onDashboard !== null

  // With a header and enough width, the chips sit beside the name instead of stacking above
  // the plot (measured live: the threshold leaves the label room to ellipsize gracefully).
  const wrapRef = useRef<HTMLDivElement>(null)
  const wrapWidth = useContainerWidth(wrapRef)
  const expandNode = canExpand ? (
    <button
      type="button"
      className="nh-chart__expand"
      aria-label={t('Open this chart full screen')}
      title={t('Open full screen, with calendar navigation')}
      onClick={() => navigate({ name: 'chart', dashboard: onDashboard ?? '', widget: ctx.widgetId })}
    >
      ⤢
    </button>
  ) : null
  // The chip row and the full-screen button are separate: turning the period selector off must
  // leave no chip row behind (and the button has a toggle of its own).
  const chipsNode =
    showChips || zoomed ? (
      <div className="nh-chart__chips">
        {showChips
          ? chips.map((c) => (
              <button
                key={c}
                type="button"
                className={'nh-chart__chip' + (c === period ? ' nh-chart__chip--on' : '')}
                onClick={() => setPeriod(c)}
              >
                {c}
              </button>
            ))
          : null}
        {zoomed ? (
          <button
            type="button"
            className="nh-chart__chip nh-chart__chip--reset"
            onClick={() => handleRef.current?.resetZoom()}
          >
            {t('reset zoom')}
          </button>
        ) : null}
      </div>
    ) : null
  const toolsNode =
    chipsNode || expandNode ? (
      <div className="nh-chart__tools">
        {chipsNode}
        {expandNode}
      </div>
    ) : null
  const chipsInline = toolsNode !== null && !!label && wrapWidth >= 480

  return (
    <WidgetFrame label={label} aside={chipsInline ? toolsNode : undefined}>
      <div className="nh-chartwrap" ref={wrapRef}>
        {chipsInline ? null : toolsNode}
        <div className={'nh-chart' + (heatmap ? ' nh-heatmap' : '')} ref={hostRef}>
          {status !== 'ready' ? (
            <span className="nh-chart__status">
              {status === 'loading'
                ? t('Loading history…')
                : status === 'empty'
                  ? resolved.length === 0
                    ? t('No series configured')
                    : t('No history data')
                  : t('Could not load history')}
            </span>
          ) : null}
        </div>
        {showLegend ? (
          <div className="nh-chart__legend">
            {resolved.map((s, i) => (
              <button
                key={i}
                type="button"
                className={'nh-chart__key' + (hidden.includes(i) ? ' nh-chart__key--off' : '')}
                onClick={() => toggleSeries(i)}
              >
                <span className="nh-chart__dot" style={{ background: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </WidgetFrame>
  )
}

const y2InUse = (c: Record<string, unknown>) => effectiveSeries(c as ChartConfig).some((s) => s.axis === 'y2')
const yInUse = (c: Record<string, unknown>) => effectiveSeries(c as ChartConfig).some((s) => s.axis !== 'y2')
const isPlot = (c: Record<string, unknown>) => (c as ChartConfig).mode !== 'heatmap'
const isGrouped = (c: Record<string, unknown>) => {
  const g = (c as ChartConfig).groupBy
  return g !== undefined && g !== 'none'
}

export const chartWidget: WidgetDefinition<ChartConfig> = {
  type: 'chart',
  name: 'Chart',
  description: 'History graph from persistence',
  defaultSize: { w: 6, h: 5 },
  minPixelHeight: 180,
  hasHeader: true,
  defaultConfig: () => ({
    series: [],
    period: '24h',
    refresh: 300,
    legend: true,
    picker: true,
    live: true,
    thresholds: [],
    maxPoints: DEFAULT_MAX_POINTS,
    groupBy: 'none',
    mode: 'series',
    expand: true,
  }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'series', type: 'chartseries', label: 'Series' },
    {
      key: 'mode',
      type: 'select',
      label: 'Chart type',
      options: [
        { value: 'series', label: 'Time series' },
        { value: 'heatmap', label: 'Heatmap (hour by weekday)' },
      ],
      hint: 'A heatmap shows the first series only, coloured by its aggregate for each hour of each weekday.',
    },
    {
      key: 'groupBy',
      type: 'select',
      label: 'Group by',
      options: [
        { value: 'none', label: 'Nothing (raw history)' },
        { value: 'hour', label: 'Hour' },
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'hourOfDay', label: 'Hour of day' },
        { value: 'dayOfWeek', label: 'Day of week' },
        { value: 'monthOfYear', label: 'Month of year' },
      ],
      showIf: isPlot,
      hint: 'Buckets the history before plotting. Each series reduces its bucket with its own function (set per series above). Live updates pause while grouping, since a raw reading cannot be added to a finished bucket.',
    },
    {
      key: 'period',
      type: 'select',
      label: 'Default period',
      options: Object.keys(PERIODS).map((p) => ({ value: p, label: p })),
    },
    {
      key: 'picker',
      type: 'boolean',
      label: 'Period selector',
      hint: 'Quick range chips on the widget. Dragging on the chart zooms in; double-click resets.',
    },
    {
      key: 'expand',
      type: 'boolean',
      label: 'Full-screen button',
      hint: 'Adds ⤢ to the chart, opening it full screen with calendar navigation (a day, week, month or year at a time).',
    },
    {
      key: 'legend',
      type: 'boolean',
      label: 'Legend',
      hint: 'Shown when the chart has two or more series; clicking an entry hides its series.',
      showIf: isPlot,
    },
    {
      key: 'live',
      type: 'boolean',
      label: 'Live updates',
      hint: 'Append item changes as they happen, between history refreshes.',
      showIf: (c) => isPlot(c) && !isGrouped(c),
    },
    { key: 'thresholds', type: 'chartthresholds', label: 'Thresholds', showIf: isPlot },
    { key: 'yMin', type: 'number', label: 'Y axis min', showIf: (c) => isPlot(c) && yInUse(c) },
    { key: 'yMax', type: 'number', label: 'Y axis max', showIf: (c) => isPlot(c) && yInUse(c) },
    { key: 'y2Min', type: 'number', label: 'Right Y axis min', showIf: (c) => isPlot(c) && y2InUse(c) },
    { key: 'y2Max', type: 'number', label: 'Right Y axis max', showIf: (c) => isPlot(c) && y2InUse(c) },
    { key: 'service', type: 'text', label: 'Persistence service (optional)' },
    { key: 'refresh', type: 'number', label: 'Refresh (seconds)', min: 10 },
    {
      key: 'maxPoints',
      type: 'number',
      label: 'Max points per series',
      min: 0,
      hint: 'Long histories are averaged down to about this many points. 0 = unlimited.',
    },
  ],
  itemKeys: (config) =>
    config.live === false || (config.groupBy !== undefined && config.groupBy !== 'none') || config.mode === 'heatmap'
      ? []
      : [...new Set(effectiveSeries(config).map((s) => s.item))],
  Component: ChartWidget,
}
