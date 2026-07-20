import { useEffect, useMemo, useRef, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useContainerWidth } from '../../components/useContainerWidth'
import { getItemHistory } from '../../api/persistence'
import {
  DEFAULT_MAX_POINTS,
  PERIODS,
  PERIOD_CHIPS,
  decimate,
  effectiveSeries,
  type ChartConfig,
} from './model'
import { chartScheme, seriesColor } from './palette'
import type { ChartHandle, SeriesTable } from './plot'

// ON/OFF-style histories plot as 1/0 (persistence stores them as text). A Map, so a state
// that happens to name an Object.prototype member isn't mistaken for a hit.
const BINARY = new Map([
  ['ON', 1],
  ['OFF', 0],
  ['OPEN', 1],
  ['CLOSED', 0],
])

function parseState(s: string): number | null {
  const b = BINARY.get(s)
  if (b !== undefined) return b
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : null
}

/** Optional numeric config value; imported configs sometimes store numbers as strings. */
function numOpt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/**
 * History chart backed by openHAB persistence: multi-series, gradient fills, crosshair
 * tooltip, legend with series toggling, quick period chips, drag-zoom (double-click resets),
 * threshold lines/bands, and live SSE appending. All uPlot work lives in ./plot, loaded on
 * demand so dashboards without charts don't pay for it.
 */
function ChartWidget({ config, ctx }: WidgetProps<ChartConfig>) {
  const scheme = chartScheme()
  const series = effectiveSeries(config)
  const resolved = series.map((s, i) => ({
    item: s.item,
    label: s.label || s.item,
    color: s.color || seriesColor(i, scheme),
    axis: s.axis === 'y2' ? ('y2' as const) : ('y' as const),
    width: numOpt(s.width) ?? 2,
    fill: numOpt(s.fill) ?? 20,
    mode: s.mode === 'linear' ? ('linear' as const) : s.mode === 'step' ? ('step' as const) : ('smooth' as const),
    points: s.points === true,
  }))
  const thresholds = (config.thresholds ?? [])
    .map((t) => ({
      from: numOpt(t.from),
      to: numOpt(t.to),
      axis: t.axis === 'y2' ? ('y2' as const) : ('y' as const),
      color: t.color || '#d03b3b',
      label: t.label,
    }))
    .filter((t) => t.from !== undefined || t.to !== undefined)

  const [period, setPeriod] = useState(config.period ?? '24h')
  useEffect(() => {
    setPeriod(config.period ?? '24h')
  }, [config.period])

  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [zoomed, setZoomed] = useState(false)
  const [hidden, setHidden] = useState<number[]>([])

  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ChartHandle | null>(null)
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
    )

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

    async function load() {
      const since = new Date(Date.now() - periodMs)
      const results = await Promise.all(
        resolved.map((s) => getItemHistory(s.item, since, config.service || undefined))
      )
      if (disposed) return
      const maxPoints = numOpt(config.maxPoints) ?? DEFAULT_MAX_POINTS
      const tables: SeriesTable[] = results.map((points) => {
        const xs: number[] = []
        const ys: (number | null)[] = []
        for (const pt of points) {
          xs.push(pt.time / 1000)
          ys.push(parseState(pt.state))
        }
        return decimate(xs, ys, maxPoints)
      })
      tablesRef.current = tables
      // A refetch answering after live points arrived would rewind the chart; the live
      // effect re-appends current values because the last-appended memory is cleared.
      lastLiveRef.current.clear()
      if (tables.every((t) => t[0].length === 0)) {
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
          series: resolved.map(({ item: _item, ...rest }) => rest),
          thresholds,
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

    setStatus('loading')
    load().catch(() => {
      if (!disposed) setStatus('error')
    })
    const refreshSec = numOpt(config.refresh) && numOpt(config.refresh)! > 0 ? numOpt(config.refresh)! : 300
    const timer = setInterval(() => {
      if (!zoomedRef.current) void load().catch(() => {})
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey, optionsKey, period, config.service, config.refresh])

  // Live appending: WidgetHost re-renders on subscribed item changes; coalesce into one
  // appended row per 500ms so a fading dimmer doesn't spam one point per SSE frame.
  const liveKey =
    config.live === false ? '' : JSON.stringify(resolved.map((s) => ctx.getItem(s.item)?.state))
  useEffect(() => {
    if (config.live === false || status !== 'ready') return
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
      for (const t of tables) {
        let drop = 0
        while (drop < t[0].length && t[0][drop] < cutoff) drop++
        if (drop > 0) {
          t[0].splice(0, drop)
          t[1].splice(0, drop)
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
  const showLegend = config.legend !== false && resolved.length >= 2
  const label = config.label ?? (resolved.length === 1 ? resolved[0].label : undefined)

  // With a header and enough width, the chips sit beside the name instead of stacking above
  // the plot (measured live: the threshold leaves the label room to ellipsize gracefully).
  const wrapRef = useRef<HTMLDivElement>(null)
  const wrapWidth = useContainerWidth(wrapRef)
  const chipsNode = showChips ? (
    <div className="nh-chart__chips">
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          className={'nh-chart__chip' + (c === period ? ' nh-chart__chip--on' : '')}
          onClick={() => setPeriod(c)}
        >
          {c}
        </button>
      ))}
      {zoomed ? (
        <button
          type="button"
          className="nh-chart__chip nh-chart__chip--reset"
          onClick={() => handleRef.current?.resetZoom()}
        >
          reset zoom
        </button>
      ) : null}
    </div>
  ) : null
  const chipsInline = chipsNode !== null && !!label && wrapWidth >= 480

  return (
    <WidgetFrame label={label} aside={chipsInline ? chipsNode : undefined}>
      <div className="nh-chartwrap" ref={wrapRef}>
        {chipsInline ? null : chipsNode}
        <div className="nh-chart" ref={hostRef}>
          {status !== 'ready' ? (
            <span className="nh-chart__status">
              {status === 'loading'
                ? 'Loading history…'
                : status === 'empty'
                  ? resolved.length === 0
                    ? 'No series configured'
                    : 'No history data'
                  : 'Could not load history'}
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

const y2InUse = (c: Record<string, unknown>) =>
  effectiveSeries(c as ChartConfig).some((s) => s.axis === 'y2')
const yInUse = (c: Record<string, unknown>) =>
  effectiveSeries(c as ChartConfig).some((s) => s.axis !== 'y2')

export const chartWidget: WidgetDefinition<ChartConfig> = {
  type: 'chart',
  name: 'Chart',
  description: 'History graph from persistence',
  defaultSize: { w: 6, h: 5 },
  minPixelHeight: 180,
  defaultConfig: () => ({
    series: [],
    period: '24h',
    refresh: 300,
    legend: true,
    picker: true,
    live: true,
    thresholds: [],
    maxPoints: DEFAULT_MAX_POINTS,
  }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'series', type: 'chartseries', label: 'Series' },
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
      key: 'legend',
      type: 'boolean',
      label: 'Legend',
      hint: 'Shown when the chart has two or more series; clicking an entry hides its series.',
    },
    {
      key: 'live',
      type: 'boolean',
      label: 'Live updates',
      hint: 'Append item changes as they happen, between history refreshes.',
    },
    { key: 'thresholds', type: 'chartthresholds', label: 'Thresholds' },
    { key: 'yMin', type: 'number', label: 'Y axis min', showIf: yInUse },
    { key: 'yMax', type: 'number', label: 'Y axis max', showIf: yInUse },
    { key: 'y2Min', type: 'number', label: 'Right Y axis min', showIf: y2InUse },
    { key: 'y2Max', type: 'number', label: 'Right Y axis max', showIf: y2InUse },
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
    config.live === false ? [] : [...new Set(effectiveSeries(config).map((s) => s.item))],
  Component: ChartWidget,
}
