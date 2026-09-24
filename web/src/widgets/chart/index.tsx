import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useContainerWidth } from '../../components/useContainerWidth'
import { categoryLabels } from './aggregate'
import { DEFAULT_MAX_POINTS, PERIOD_CHIPS, PERIOD_IDS, chipPeriods, effectiveSeries, periodMs, type ChartConfig } from './model'
import { loadChartData, loadHeatmapData, parseState, type SeriesTable } from './data'
import { formatChartValue, numOpt, plotSeries, resolveChart } from './resolve'
import { intervalMs } from '../../model/interval'
import { appLocale } from '../../i18n'
import { navigate, useRoute } from '../../app/router'
import { classifyHistoryError } from '../../model/persistence'
import { PersistenceNotice, usePersistenceAdvice } from '../common/HistoryStatus'
import type { ChartHandle } from './plot'
import type { HeatmapHandle } from './heatmap'

const periodMemory = new Map<string, string>()

function ChartWidget({ config, ctx }: WidgetProps<ChartConfig>) {
  const { t } = useTranslation()
  const route = useRoute()
  const { series: resolved, thresholds, groupBy, grouped, categorical, heatmap } = resolveChart(config)

  const [period, setPeriodState] = useState(() => periodMemory.get(ctx.widgetId) ?? config.period ?? '24h')
  const setPeriod = (p: string) => {
    periodMemory.set(ctx.widgetId, p)
    setPeriodState(p)
  }
  const configPeriodRef = useRef(config.period)
  useEffect(() => {
    if (configPeriodRef.current === config.period) return
    configPeriodRef.current = config.period
    periodMemory.set(ctx.widgetId, config.period ?? '24h')
    setPeriodState(config.period ?? '24h')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.period])

  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error' | 'nopersistence'>('loading')
  const [zoomed, setZoomed] = useState(false)
  const [hidden, setHidden] = useState<number[]>([])
  const advice = usePersistenceAdvice(status === 'nopersistence')

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
  const liveRef = useRef(false)

  const seriesKey = JSON.stringify(resolved)
  const optionsKey =
    JSON.stringify(thresholds) +
    '|' +
    [numOpt(config.yMin), numOpt(config.yMax), numOpt(config.y2Min), numOpt(config.y2Max), numOpt(config.maxPoints)].join(',') +
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

    const windowMs = periodMs(period)

    const fmtValue = (i: number, v: number): string => formatChartValue(v, ctxRef.current.getItem(resolved[i]?.item ?? '')?.unit)

    async function loadHeatmap() {
      const to = Date.now() / 1000
      const matrix = await loadHeatmapData({
        item: resolved[0].item,
        aggregate: resolved[0].aggregate,
        from: to - windowMs / 1000,
        to,
        service: config.service || undefined,
        signal: ctrl.signal
      })
      if (disposed) return
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
          weekdays: categoryLabels('dayOfWeek', appLocale()),
          formatValue: (v) => fmtValue(0, v),
          title: t('Heatmap of {{name}} by hour and weekday', { name: resolved[0].label })
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
        from: to - windowMs / 1000,
        to,
        groupBy,
        service: config.service || undefined,
        maxPoints: numOpt(config.maxPoints) ?? DEFAULT_MAX_POINTS,
        signal: ctrl.signal
      })
      if (disposed) return
      tablesRef.current = tables
      lastLiveRef.current.clear()
      // persistence may not have stored the latest change yet (an everyMinute strategy, rrd4j), and a
      // refresh would otherwise drop the tail the live updates drew until the item changed again
      if (liveRef.current) {
        const nowS = Date.now() / 1000
        tables.forEach((tbl, i) => {
          const st = ctxRef.current.getItem(resolved[i].item)
          const v = st ? parseState(st.state) : null
          if (v === null) return
          lastLiveRef.current.set(i, v)
          if (tbl[1][tbl[1].length - 1] !== v) {
            tbl[0].push(nowS)
            tbl[1].push(v)
          }
        })
      }
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
          categoryLabels: categorical ? categoryLabels(groupBy, appLocale()) : undefined,
          locale: appLocale(),
          ariaLabel: t('Chart of {{names}}', { names: resolved.map((s) => s.label).join(', ') }),
          yMin: numOpt(config.yMin),
          yMax: numOpt(config.yMax),
          y2Min: numOpt(config.y2Min),
          y2Max: numOpt(config.y2Max),
          formatValue: fmtValue,
          onZoom: (z) => {
            zoomedRef.current = z
            if (disposed) return
            setZoomed(z)
            if (!z) void load().catch(() => {})
          }
        })
        for (const i of hiddenRef.current) handleRef.current.setSeriesVisible(i, false)
      }
      handleRef.current.setData(tables)
      setStatus('ready')
    }

    const ctrl = new AbortController()
    const run = () => (heatmap ? loadHeatmap() : load())
    setStatus('loading')
    run().catch((err: unknown) => {
      if (!disposed) setStatus(classifyHistoryError(err))
    })
    const timer = setInterval(
      () => {
        if (!zoomedRef.current) void run().catch(() => {})
      },
      intervalMs(config.refresh, { unit: 's', min: 10, max: 86_400, fallback: 300 })
    )

    return () => {
      disposed = true
      ctrl.abort()
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

  const liveTracked = config.live !== false && !grouped && !heatmap
  liveRef.current = liveTracked
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
      const cutoff = nowS - periodMs(period) / 1000
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
    handleRef.current?.setSeriesVisible(i, wasHidden)
    setHidden(next)
  }

  const chips = useMemo(() => chipPeriods(config.periods, config.period, period), [config.periods, config.period, period])

  const showChips = config.picker !== false && chips.length > 0
  const showLegend = config.legend !== false && resolved.length >= 2 && !heatmap
  // WidgetHost takes the name away for "not at all"; the series' own name must not stand in for it
  const label = config.labelMode === 'none' ? undefined : (config.label ?? (resolved.length === 1 ? resolved[0].label : undefined))
  const onDashboard = route.name === 'dashboard' ? route.id : null
  const canExpand = config.expand !== false && !ctx.editing && onDashboard !== null

  const wrapRef = useRef<HTMLDivElement>(null)
  const wrapWidth = useContainerWidth(wrapRef)
  const expandNode = canExpand ? (
    <button
      type="button"
      className="nh-chart__expand"
      aria-label={t('Open this chart full screen')}
      title={t('Open full screen, with calendar navigation')}
      onClick={() => navigate({ name: 'chart', dashboard: onDashboard ?? '', widget: ctx.widgetId })}>
      ⤢
    </button>
  ) : null
  const chipsNode =
    showChips || zoomed ? (
      <div className="nh-chart__chips">
        {showChips
          ? chips.map((c) => (
              <button
                key={c}
                type="button"
                className={'nh-chart__chip' + (c === period ? ' nh-chart__chip--on' : '')}
                onClick={() => setPeriod(c)}>
                {c}
              </button>
            ))
          : null}
        {zoomed ? (
          <button type="button" className="nh-chart__chip nh-chart__chip--reset" onClick={() => handleRef.current?.resetZoom()}>
            {t('reset zoom')}
          </button>
        ) : null}
      </div>
    ) : null
  // a named chart already draws a header row, so the expand button rides there and costs nothing:
  // a short tile then spends its whole body on the plot rather than on a row holding one button
  const chipsInline = chipsNode !== null && !!label && wrapWidth >= 480
  const headerTools =
    label && (chipsInline || expandNode) ? (
      <div className="nh-chart__tools">
        {chipsInline ? chipsNode : null}
        {expandNode}
      </div>
    ) : null
  const bodyTools =
    !label && (chipsNode || expandNode) ? (
      <div className="nh-chart__tools">
        {chipsNode}
        {expandNode}
      </div>
    ) : null

  return (
    <WidgetFrame label={label} aside={headerTools ?? undefined}>
      <div className="nh-chartwrap" ref={wrapRef}>
        {bodyTools}
        {label && !chipsInline ? chipsNode : null}
        <div className={'nh-chart' + (heatmap ? ' nh-heatmap' : '')} ref={hostRef}>
          {status !== 'ready' ? (
            <span className="nh-chart__status">
              {status === 'loading' ? (
                t('Loading history…')
              ) : status === 'empty' ? (
                resolved.length === 0 ? (
                  t('No series configured')
                ) : (
                  t('No history data')
                )
              ) : status === 'nopersistence' ? (
                <PersistenceNotice advice={advice} />
              ) : (
                t('Could not load history')
              )}
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
                onClick={() => toggleSeries(i)}>
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
    expand: true
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
        { value: 'heatmap', label: 'Heatmap (hour by weekday)' }
      ],
      hint: 'A heatmap shows the first series only, colored by its aggregate for each hour of each weekday.'
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
        { value: 'monthOfYear', label: 'Month of year' }
      ],
      showIf: isPlot,
      hint: 'Buckets the history before plotting. Each series reduces its bucket with its own function (set per series above). Live updates pause while grouping, since a raw reading cannot be added to a finished bucket.'
    },
    {
      key: 'period',
      type: 'select',
      label: 'Default period',
      options: PERIOD_IDS.map((p) => ({ value: p, label: p }))
    },
    { key: 'sec-ranges', type: 'section', label: 'Ranges' },
    {
      key: 'picker',
      type: 'boolean',
      label: 'Period selector',
      hint: 'Quick range chips on the widget. Dragging on the chart zooms in; double-click resets.'
    },
    {
      key: 'periods',
      type: 'multiselect',
      label: 'Ranges offered',
      options: PERIOD_IDS.map((p) => ({ value: p, label: p })),
      defaultValue: PERIOD_CHIPS,
      showIf: (c) => c.picker !== false,
      hint: 'Which chips the period selector shows. The default period and the range on screen are always reachable.'
    },
    {
      key: 'expand',
      type: 'boolean',
      label: 'Full-screen button',
      hint: 'Adds ⤢ to the chart, opening it full screen with calendar navigation (a day, week, month or year at a time).'
    },
    { key: 'sec-axes-and-legend', type: 'section', label: 'Axes and legend' },
    {
      key: 'legend',
      type: 'boolean',
      label: 'Legend',
      hint: 'Shown when the chart has two or more series; clicking an entry hides its series.',
      showIf: isPlot
    },
    { key: 'thresholds', type: 'chartthresholds', label: 'Thresholds', showIf: isPlot },
    { key: 'yMin', type: 'number', label: 'Y axis min', showIf: (c) => isPlot(c) && yInUse(c) },
    { key: 'yMax', type: 'number', label: 'Y axis max', showIf: (c) => isPlot(c) && yInUse(c) },
    { key: 'y2Min', type: 'number', label: 'Right Y axis min', showIf: (c) => isPlot(c) && y2InUse(c) },
    { key: 'y2Max', type: 'number', label: 'Right Y axis max', showIf: (c) => isPlot(c) && y2InUse(c) },
    { key: 'sec-data', type: 'section', label: 'Data' },
    {
      key: 'live',
      type: 'boolean',
      label: 'Live updates',
      hint: 'Append item changes as they happen, between history refreshes.',
      showIf: (c) => isPlot(c) && !isGrouped(c)
    },
    { key: 'service', type: 'text', label: 'Persistence service (optional)' },
    { key: 'refresh', type: 'number', label: 'Refresh (seconds)', min: 10 },
    {
      key: 'maxPoints',
      type: 'number',
      label: 'Max points per series',
      min: 0,
      hint: 'Long histories are averaged down to about this many points. 0 = unlimited.'
    }
  ],
  itemKeys: (config) =>
    config.live === false || (config.groupBy !== undefined && config.groupBy !== 'none') || config.mode === 'heatmap'
      ? []
      : [...new Set(effectiveSeries(config).map((s) => s.item))],
  canCommand: () => false,
  Component: ChartWidget
}
