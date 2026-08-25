import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useContainerWidth } from '../../components/useContainerWidth'
import { getItemHistory } from '../../api/persistence'
import { classifyHistoryError } from '../../model/persistence'
import { PersistenceNotice, usePersistenceAdvice } from '../common/HistoryStatus'
import { PERIOD_CHIPS, PERIOD_IDS, chipPeriods, periodMs } from '../chart/model'
import { chartScheme, seriesColor } from '../chart/palette'
import { stateMatches } from '../common/stateIcon'
import {
  autoRefreshSeconds,
  effectiveColorMaps,
  effectiveTimelineSeries,
  partitionHistory,
  thinBands,
  type TimelineBand,
  type TimelineConfig,
} from './model'

/** Minimum painted width (%) for the current band, so a state change is visible instantly. */
const MIN_CURRENT_PCT = 0.4
/** Bands per row are capped by absorbing runs shorter than period/this into their predecessor. */
const THIN_DIVISOR = 1500

/**
 * How many live-appended bands a row may hold before it is thinned. Far above any item a person
 * would put on a timeline; the point is that a fast-changing one cannot grow without limit.
 */
const LIVE_BAND_CAP = 600

/** Chip selection per widget instance; survives the run/edit remount. Session-scoped. */
const periodMemory = new Map<string, string>()

/** Optional numeric config value; imported configs sometimes store numbers as strings. */
function numOpt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function fmtTick(ms: number, spanMs: number): string {
  const d = new Date(ms)
  if (spanMs <= 48 * 3600e3) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtRange(band: TimelineBand, spanMs: number): string {
  return `${fmtTick(band.start, spanMs)} - ${fmtTick(band.end, spanMs)}`
}

/**
 * Timeline: one row of colored state bands per item over a picked window, fed by openHAB
 * persistence (fetched with boundary so the state at the window start is known) and extended
 * live from SSE between refetches. Colors come from explicit state->color rows first, then
 * automatically from the chart palette (stable: unmapped states are assigned alphabetically).
 */
function TimelineWidget({ config, ctx }: WidgetProps<TimelineConfig>) {
  const { t } = useTranslation()
  const scheme = chartScheme()
  const series = effectiveTimelineSeries(config)
  const seriesKey = JSON.stringify(series)

  const [period, setPeriodState] = useState(() => periodMemory.get(ctx.widgetId) ?? config.period ?? '24h')
  const setPeriod = (p: string) => {
    periodMemory.set(ctx.widgetId, p)
    setPeriodState(p)
  }
  // Follow a *change* to the configured default without clobbering the remembered chip on mount.
  const configPeriodRef = useRef(config.period)
  useEffect(() => {
    if (configPeriodRef.current === config.period) return
    configPeriodRef.current = config.period
    periodMemory.set(ctx.widgetId, config.period ?? '24h')
    setPeriodState(config.period ?? '24h')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.period])

  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error' | 'nopersistence'>('loading')
  // Asked only once the fetch has failed that way - an ordinary dashboard never probes an
  // admin-only endpoint it has no use for.
  const advice = usePersistenceAdvice(status === 'nopersistence')
  const [rows, setRows] = useState<TimelineBand[][]>([])
  const [info, setInfo] = useState<string | null>(null)
  // advancing "now": the last band's right edge and the axis follow the clock between fetches
  const [nowTick, setNowTick] = useState(() => Date.now())

  const windowMs = periodMs(period)
  const windowStart = nowTick - windowMs

  useEffect(() => {
    let disposed = false
    setInfo(null)

    // Abort in the cleanup so a dashboard left behind is not still downloading its history.
    // Uncancelled fetches compete for the browser's six-per-origin sockets - the same budget
    // api/tabLink.ts exists to conserve - and a rapid run of period chips would otherwise leave
    // every earlier window running to completion.
    const ctrl = new AbortController()

    async function load() {
      const now = Date.now()
      const since = new Date(now - windowMs)
      const results = await Promise.all(
        series.map((s) =>
          getItemHistory(s.item, since, {
            serviceId: config.service || undefined,
            boundary: true,
            signal: ctrl.signal,
          })
        )
      )
      if (disposed) return
      const partitioned = results.map((points) =>
        thinBands(partitionHistory(points, now - windowMs, now), windowMs / THIN_DIVISOR)
      )
      setRows(partitioned)
      setNowTick(now)
      setStatus(partitioned.some((r) => r.length > 0) ? 'ready' : 'empty')
    }

    if (series.length === 0) {
      setStatus('empty')
      setRows([])
      return
    }
    setStatus('loading')
    load().catch((err: unknown) => {
      if (!disposed) setStatus(classifyHistoryError(err))
    })

    const refreshSec = numOpt(config.refresh) && numOpt(config.refresh)! > 0 ? numOpt(config.refresh)! : autoRefreshSeconds(windowMs)
    const refetch = setInterval(() => void load().catch(() => {}), refreshSec * 1000)
    const tick = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => {
      disposed = true
      ctrl.abort()
      clearInterval(refetch)
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey, period, config.service, config.refresh])

  // Live extension: when a subscribed item's state stops matching its last band, a new band
  // starts now. The next refetch reconciles with what persistence actually recorded. The
  // window's "now" advances with it so the fresh band sits at the right edge immediately.
  const liveKey = JSON.stringify(series.map((s) => ctx.getItem(s.item)?.state))
  useEffect(() => {
    if (status !== 'ready') return
    const now = Date.now()
    // Decided here rather than inside the updater below: React makes no promise about WHEN an
    // updater runs, so a flag set inside one can still be false when it is read. The updater
    // stays the thing that writes, so the rows themselves are never computed from a stale read.
    const appended = rows.some((bands, i) => {
      const st = ctx.getItem(series[i]?.item ?? '')?.state
      if (st === undefined || st === 'NULL' || st === 'UNDEF' || st === '') return false
      const last = bands[bands.length - 1]
      return !(last && (last.state === st || stateMatches(last.state, st)))
    })
    setRows((prev) => {
      let changed = false
      const next = prev.map((bands, i) => {
        const st = ctx.getItem(series[i]?.item ?? '')?.state
        if (st === undefined || st === 'NULL' || st === 'UNDEF' || st === '') return bands
        const last = bands[bands.length - 1]
        // numeric-tolerant: a live '64' continues a persisted '64.0' band, it is the same state
        if (last && (last.state === st || stateMatches(last.state, st))) return bands
        changed = true
        const closed = last ? [...bands.slice(0, -1), { ...last, end: now }] : bands
        // Bounded, but only once it needs bounding. Between refetches this appends one band per
        // state change and nothing reconciled them, so a fast-changing item accumulated a refresh
        // interval's worth of DOM nodes - and for a long window that interval is 900 seconds.
        //
        // Thinning on EVERY append does not work, and the reason is worth keeping: `thinBands`
        // exempts the last band because it is the current state, so a short one survives the
        // fetch - and appending makes it eligible, so it is absorbed just as the new one arrives.
        // The row's count then never moves. Measured: 3 bands, append, thin, 3 bands.
        //
        // Above the cap the row is past anything a person could read anyway, so thinning it is
        // free; below it, nothing is touched and a state change always starts a visible band.
        const grown = [...closed, { state: st, start: now, end: now }]
        return grown.length > LIVE_BAND_CAP ? thinBands(grown, windowMs / THIN_DIVISOR) : grown
      })
      return changed ? next : prev
    })
    // Only when something actually moved. Called unconditionally, every state event on every
    // subscribed item re-rendered the widget for a tick value that had not changed.
    if (appended) setNowTick(now)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, status, seriesKey])

  /**
   * Color per state: explicit rows first (numeric-tolerant), then stable palette slots for
   * the rest (assigned alphabetically over numerically-canonicalized states, so '64' and
   * '64.0' share one color and one slot).
   */
  // Depending on the colour rows rather than the whole config: this recomputes over every band
  // on the chart, and any other setting changing must not drag it along.
  const colorMaps = config.colorMaps
  const colorFor = useMemo(() => {
    const canon = (s: string) => {
      const n = Number(s)
      return Number.isFinite(n) ? String(n) : s
    }
    const maps = effectiveColorMaps({ colorMaps })
    const unmapped = [...new Set(rows.flat().map((b) => canon(b.state)))]
      .filter((s) => !maps.some((m) => stateMatches(m.state, s)))
      .sort()
    return (state: string): string => {
      const explicit = maps.find((m) => stateMatches(m.state, state))
      if (explicit) return explicit.color
      return seriesColor(unmapped.indexOf(canon(state)), scheme)
    }
  }, [colorMaps, rows, scheme])

  const chips = useMemo(
    () => chipPeriods(config.periods, config.period, period),
    [config.periods, config.period, period]
  )

  const showChips = config.picker !== false && chips.length > 0
  const label = config.label ?? (series.length === 1 ? series[0].label || series[0].item : undefined)

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
    </div>
  ) : null
  const chipsInline = chipsNode !== null && !!label && wrapWidth >= 480

  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => windowStart + f * windowMs)

  return (
    <WidgetFrame label={label} aside={chipsInline ? chipsNode : undefined}>
      <div className="nh-tlwrap" ref={wrapRef}>
        {chipsInline ? null : chipsNode}
        {status === 'ready' ? (
          <div className="nh-tl">
            {series.map((s, i) => (
              <div className="nh-tl__row" key={s.item + i}>
                <span className="nh-tl__name" title={s.label || s.item}>
                  {s.label || s.item}
                </span>
                <div className="nh-tl__track">
                  {(rows[i] ?? []).map((b, j, arr) => {
                    let left = Math.max(0, ((b.start - windowStart) / windowMs) * 100)
                    // slight overpaint so fractional-pixel gaps between adjacent bands can't
                    // show the track through as seams (the next band paints over the overlap)
                    let right = Math.min(100, ((b.end - windowStart) / windowMs) * 100 + 0.06)
                    // The current (still-running) state paints at least a sliver at "now" -
                    // a fresh live band is start==end and would otherwise be invisible until
                    // the next window tick.
                    if (j === arr.length - 1 && right > 100 - 0.01) {
                      left = Math.min(left, 100 - MIN_CURRENT_PCT)
                      right = 100
                    }
                    if (right <= left) return null
                    return (
                      <button
                        key={j}
                        type="button"
                        tabIndex={-1} // a dense row would otherwise be hundreds of tab stops
                        className="nh-tl__band"
                        style={{ left: left + '%', width: right - left + '%', background: colorFor(b.state) }}
                        title={`${s.label || s.item}: ${b.state} (${fmtRange(b, windowMs)})`}
                        onClick={() => setInfo(`${s.label || s.item} · ${b.state} · ${fmtRange(b, windowMs)}`)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="nh-tl__axis">
              {ticks.map((tms, i) => (
                <span key={i}>{fmtTick(tms, windowMs)}</span>
              ))}
            </div>
            {info ? <div className="nh-tl__info">{info}</div> : null}
          </div>
        ) : (
          <div className="nh-tl nh-tl--status">
            <span className="nh-chart__status">
              {status === 'loading' ? (
                t('Loading history…')
              ) : status === 'empty' ? (
                series.length === 0 ? (
                  t('No items configured')
                ) : (
                  t('No history data')
                )
              ) : status === 'nopersistence' ? (
                <PersistenceNotice advice={advice} />
              ) : (
                t('Could not load history')
              )}
            </span>
          </div>
        )}
      </div>
    </WidgetFrame>
  )
}

export const timelineWidget: WidgetDefinition<TimelineConfig> = {
  type: 'timeline',
  name: 'Timeline',
  description: 'State history as colored bands',
  defaultSize: { w: 6, h: 4 },
  minPixelHeight: 100,
  hasHeader: true,
  defaultConfig: () => ({ series: [], colorMaps: [], period: '24h', picker: true }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'series', type: 'timelineseries', label: 'Items' },
    { key: 'colorMaps', type: 'statecolors', label: 'State colors' },
    {
      key: 'period',
      type: 'select',
      label: 'Default period',
      options: PERIOD_IDS.map((p) => ({ value: p, label: p })),
    },
    { key: 'picker', type: 'boolean', label: 'Period selector' },
    {
      key: 'periods',
      type: 'multiselect',
      label: 'Ranges offered',
      options: PERIOD_IDS.map((p) => ({ value: p, label: p })),
      defaultValue: PERIOD_CHIPS,
      showIf: (c) => c.picker !== false,
      hint: 'Which chips the period selector shows. The default period and the range on screen are always reachable.',
    },
    { key: 'service', type: 'text', label: 'Persistence service (optional)' },
    {
      key: 'refresh',
      type: 'number',
      label: 'Refresh (seconds)',
      min: 10,
      hint: 'Empty = automatic, based on the period. Live item changes appear immediately either way.',
    },
  ],
  itemKeys: (config) => [...new Set(effectiveTimelineSeries(config).map((s) => s.item))],
  canCommand: () => false,
  Component: TimelineWidget,
}
