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
  axisTick,
  effectiveColorMaps,
  effectiveTimelineSeries,
  partitionHistory,
  thinBands,
  type TimelineBand,
  type TimelineConfig
} from './model'

const MIN_CURRENT_PCT = 0.4
const THIN_DIVISOR = 1500

const LIVE_BAND_CAP = 600

const periodMemory = new Map<string, string>()

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
  const configPeriodRef = useRef(config.period)
  useEffect(() => {
    if (configPeriodRef.current === config.period) return
    configPeriodRef.current = config.period
    periodMemory.set(ctx.widgetId, config.period ?? '24h')
    setPeriodState(config.period ?? '24h')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.period])

  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error' | 'nopersistence'>('loading')
  const advice = usePersistenceAdvice(status === 'nopersistence')
  const [rows, setRows] = useState<TimelineBand[][]>([])
  const [info, setInfo] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const windowMs = periodMs(period)
  const windowStart = nowTick - windowMs

  useEffect(() => {
    let disposed = false
    setInfo(null)

    const ctrl = new AbortController()

    async function load() {
      const now = Date.now()
      const since = new Date(now - windowMs)
      const results = await Promise.all(
        series.map((s) =>
          getItemHistory(s.item, since, {
            serviceId: config.service || undefined,
            boundary: true,
            signal: ctrl.signal
          })
        )
      )
      if (disposed) return
      const partitioned = results.map((points) => thinBands(partitionHistory(points, now - windowMs, now), windowMs / THIN_DIVISOR))
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

  const liveKey = JSON.stringify(series.map((s) => ctx.getItem(s.item)?.state))
  useEffect(() => {
    if (status !== 'ready') return
    const now = Date.now()
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
        if (last && (last.state === st || stateMatches(last.state, st))) return bands
        changed = true
        const closed = last ? [...bands.slice(0, -1), { ...last, end: now }] : bands
        const grown = [...closed, { state: st, start: now, end: now }]
        return grown.length > LIVE_BAND_CAP ? thinBands(grown, windowMs / THIN_DIVISOR) : grown
      })
      return changed ? next : prev
    })
    if (appended) setNowTick(now)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, status, seriesKey])

  const colorMaps = config.colorMaps
  const colorFor = useMemo(() => {
    const canon = (s: string) => {
      const n = Number(s)
      return Number.isFinite(n) ? String(n) : s
    }
    const maps = effectiveColorMaps({ colorMaps })
    const unmapped = [...new Set(rows.flat().map((b) => canon(b.state)))].filter((s) => !maps.some((m) => stateMatches(m.state, s))).sort()
    return (state: string): string => {
      const explicit = maps.find((m) => stateMatches(m.state, state))
      if (explicit) return explicit.color
      return seriesColor(unmapped.indexOf(canon(state)), scheme)
    }
  }, [colorMaps, rows, scheme])

  const chips = useMemo(() => chipPeriods(config.periods, config.period, period), [config.periods, config.period, period])

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
          onClick={() => setPeriod(c)}>
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
                    let right = Math.min(100, ((b.end - windowStart) / windowMs) * 100 + 0.06)
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
                <span key={i}>{axisTick(tms, windowMs)}</span>
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
      options: PERIOD_IDS.map((p) => ({ value: p, label: p }))
    },
    { key: 'picker', type: 'boolean', label: 'Period selector' },
    {
      key: 'periods',
      type: 'multiselect',
      label: 'Ranges offered',
      options: PERIOD_IDS.map((p) => ({ value: p, label: p })),
      defaultValue: PERIOD_CHIPS,
      showIf: (c) => c.picker !== false,
      hint: 'Which chips the period selector shows. The default period and the range on screen are always reachable.'
    },
    { key: 'service', type: 'text', label: 'Persistence service (optional)' },
    {
      key: 'refresh',
      type: 'number',
      label: 'Refresh (seconds)',
      min: 10,
      hint: 'Empty = automatic, based on the period. Live item changes appear immediately either way.'
    }
  ],
  itemKeys: (config) => [...new Set(effectiveTimelineSeries(config).map((s) => s.item))],
  canCommand: () => false,
  Component: TimelineWidget
}
