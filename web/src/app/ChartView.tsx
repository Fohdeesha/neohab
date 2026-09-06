/**
 * One chart, full screen, with calendar navigation.
 *
 * A dashboard cell is the wrong place to step through months: there is no room for the controls,
 * and the point of stepping is looking closely. This view takes a chart widget's own configuration
 * (series, aggregation, thresholds, axes) and renders it over a window you choose - a rolling
 * range like the widget's, or an aligned day/week/month/year you can walk backwards and forwards.
 *
 * Deliberately not live-updating: a fixed calendar window that quietly grew would be a different
 * window from the one named at the top. The rolling ranges refetch when you pick them.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '../store/config'
import { navigate } from './router'
import {
  calendarLabel,
  calendarWindow,
  categoryLabels,
  heatmapMatrix,
  windowIsCurrent,
  type CalendarUnit
} from '../widgets/chart/aggregate'
import { loadChartData } from '../widgets/chart/data'
import { DEFAULT_MAX_POINTS, PERIOD_CHIPS, periodMs, type ChartConfig } from '../widgets/chart/model'
import { plotSeries, resolveChart } from '../widgets/chart/resolve'
import type { ChartHandle } from '../widgets/chart/plot'
import type { HeatmapHandle } from '../widgets/chart/heatmap'
import { useShallow } from 'zustand/react/shallow'
import { useItemsStore } from '../store/items'

const UNITS: CalendarUnit[] = ['day', 'week', 'month', 'year']

export function ChartView({ dashboardId, widgetId }: { dashboardId: string; widgetId: string }) {
  const { t } = useTranslation()
  const dashboards = useConfigStore((s) => s.dashboards)
  const loaded = useConfigStore((s) => s.loaded)
  const dashboard = dashboards.find((d) => d.id === dashboardId)
  const widget = dashboard?.widgets.find((w) => w.id === widgetId)
  const config = (widget?.config ?? {}) as ChartConfig

  /** 'rolling' uses one of the period chips; the calendar units use an aligned window. */
  const [unit, setUnit] = useState<CalendarUnit | 'rolling'>('rolling')
  const [offset, setOffset] = useState(0)
  const [period, setPeriod] = useState(config.period ?? '24h')
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const hostRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<ChartHandle | null>(null)
  const heatRef = useRef<HeatmapHandle | null>(null)

  const isChart = widget?.type === 'chart'
  const resolved = resolveChart(config)
  // Only the units, and only for the series on screen: subscribing to the whole state map
  // re-rendered this view on every item change in the installation, to read a handful of strings.
  const units = useItemsStore(useShallow((s) => resolved.series.map((series) => s.states[series.item]?.unit)))

  const nowMs = Date.now()
  const window =
    unit === 'rolling' ? { from: nowMs / 1000 - periodMs(period) / 1000, to: nowMs / 1000 } : calendarWindow(unit, offset, nowMs)
  // Only the *choice* goes in the dependency list: a rolling window recomputed on every render
  // would refetch forever.
  const windowKey = unit === 'rolling' ? `rolling:${period}` : `${unit}:${offset}`
  const seriesKey = JSON.stringify(resolved)

  useEffect(() => {
    if (!isChart || resolved.series.length === 0) {
      setStatus('empty')
      return
    }
    let disposed = false
    const fmtValue = (i: number, v: number): string => {
      const unitLabel = units[i]
      const abs = Math.abs(v)
      const dec = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
      let out = v.toFixed(dec)
      if (dec > 0) out = out.replace(/\.?0+$/, '')
      return unitLabel ? out + ' ' + unitLabel : out
    }

    // Abort in the cleanup so a dashboard left behind is not still downloading its history.
    // Uncancelled fetches compete for the browser's six-per-origin sockets - the same budget
    // api/tabLink.ts exists to conserve - and a rapid run of period chips would otherwise leave
    // every earlier window running to completion.
    const ctrl = new AbortController()

    async function run() {
      const tables = await loadChartData({
        items: resolved.series.map((s) => s.item),
        aggregates: resolved.series.map((s) => s.aggregate),
        from: window.from,
        to: window.to,
        groupBy: resolved.heatmap ? 'none' : resolved.groupBy,
        service: resolved.service,
        maxPoints: resolved.heatmap ? 0 : (resolved.maxPoints ?? DEFAULT_MAX_POINTS),
        signal: ctrl.signal
      })
      if (disposed || !hostRef.current) return

      if (resolved.heatmap) {
        const matrix = heatmapMatrix(tables[0][0], tables[0][1], window.to, resolved.series[0].aggregate)
        if (matrix.cells.flat().every((c) => c === null)) {
          setStatus('empty')
          return
        }
        const hm = await import('../widgets/chart/heatmap')
        if (disposed || !hostRef.current) return
        if (!heatRef.current) {
          heatRef.current = hm.createHeatmap({
            host: hostRef.current,
            weekdays: categoryLabels('dayOfWeek'),
            formatValue: (v) => fmtValue(0, v),
            title: t('Heatmap of {{name}} by hour and weekday', { name: resolved.series[0].label })
          })
        }
        heatRef.current.setData(matrix)
        setStatus('ready')
        return
      }

      if (tables.every((tbl) => tbl[0].length === 0)) {
        setStatus('empty')
        return
      }
      const plot = await import('../widgets/chart/plot')
      if (disposed || !hostRef.current) return
      if (!plotRef.current) {
        plotRef.current = plot.createChart({
          host: hostRef.current,
          series: plotSeries(resolved.series),
          thresholds: resolved.thresholds,
          xMode: resolved.categorical ? 'category' : 'time',
          categoryLabels: resolved.categorical ? categoryLabels(resolved.groupBy) : undefined,
          yMin: resolved.yMin,
          yMax: resolved.yMax,
          y2Min: resolved.y2Min,
          y2Max: resolved.y2Max,
          formatValue: fmtValue,
          onZoom: () => {
            /* zooming inside the window is uPlot's own; nothing to refetch */
          }
        })
      }
      plotRef.current.setData(tables)
      setStatus('ready')
    }

    setStatus('loading')
    run().catch(() => {
      if (!disposed) setStatus('error')
    })
    return () => {
      disposed = true
      ctrl.abort()
      plotRef.current?.destroy()
      plotRef.current = null
      heatRef.current?.destroy()
      heatRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey, seriesKey, isChart])

  const back = () => navigate({ name: 'dashboard', id: dashboardId })

  if (!loaded) {
    return (
      <div className="nh-dash">
        <p className="nh-dash__empty">{t('Loading…')}</p>
      </div>
    )
  }
  if (!isChart) {
    return (
      <div className="nh-dash">
        <header className="nh-dash__bar">
          <button className="nh-iconbtn" onClick={back} aria-label={t('Back')} title={t('Back')}>
            ‹
          </button>
          <span className="nh-dash__title">{t('Chart')}</span>
        </header>
        <p className="nh-dash__empty">{t('That chart is no longer on this dashboard.')}</p>
      </div>
    )
  }

  const title = config.label || resolved.series[0]?.label || t('Chart')
  const atPresent = unit === 'rolling' || windowIsCurrent(window, nowMs)

  return (
    <div className="nh-dash nh-chartview">
      <header className="nh-dash__bar">
        <button className="nh-iconbtn" onClick={back} aria-label={t('Back')} title={t('Back to the dashboard')}>
          ‹
        </button>
        <span className="nh-dash__title">{title}</span>
        <span className="nh-dash__spacer" />
        <div className="nh-chartview__units">
          <button
            type="button"
            className={'nh-chip' + (unit === 'rolling' ? ' nh-chip--on' : '')}
            onClick={() => {
              setUnit('rolling')
              setOffset(0)
            }}>
            {t('Rolling')}
          </button>
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              className={'nh-chip' + (unit === u ? ' nh-chip--on' : '')}
              onClick={() => {
                setUnit(u)
                setOffset(0)
              }}>
              {u === 'day' ? t('Day') : u === 'week' ? t('Week') : u === 'month' ? t('Month') : t('Year')}
            </button>
          ))}
        </div>
      </header>

      <div className="nh-chartview__nav">
        {unit === 'rolling' ? (
          <div className="nh-chart__chips">
            {PERIOD_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className={'nh-chart__chip' + (c === period ? ' nh-chart__chip--on' : '')}
                onClick={() => setPeriod(c)}>
                {c}
              </button>
            ))}
          </div>
        ) : (
          <>
            <button
              type="button"
              className="nh-iconbtn"
              aria-label={t('Previous')}
              title={t('Previous')}
              onClick={() => setOffset(offset - 1)}>
              ◀
            </button>
            <span className="nh-chartview__label">{calendarLabel(unit, window)}</span>
            <button
              type="button"
              className="nh-iconbtn"
              aria-label={t('Next')}
              title={t('Next')}
              disabled={atPresent}
              onClick={() => setOffset(offset + 1)}>
              ▶
            </button>
            {offset !== 0 ? (
              <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setOffset(0)}>
                {t('Now')}
              </button>
            ) : null}
          </>
        )}
      </div>

      <div className="nh-chartview__plot">
        <div className={'nh-chart' + (resolved.heatmap ? ' nh-heatmap' : '')} ref={hostRef}>
          {status !== 'ready' ? (
            <span className="nh-chart__status">
              {status === 'loading' ? t('Loading history…') : status === 'empty' ? t('No history data') : t('Could not load history')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
