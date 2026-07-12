import { useEffect, useRef, useState } from 'react'
import type uPlot from 'uplot'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { getItemHistory } from '../../api/persistence'

interface ChartConfig {
  item: string
  label?: string
  period?: string
  /** Persistence service id; empty = server default. */
  service?: string
  /** Refresh interval in seconds. */
  refresh?: number
}

const PERIODS: Record<string, number> = {
  '1h': 3600e3,
  '4h': 4 * 3600e3,
  '12h': 12 * 3600e3,
  '24h': 24 * 3600e3,
  '7d': 7 * 86400e3,
  '30d': 30 * 86400e3,
}

function cssVar(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim()
}

/**
 * History line chart backed by openHAB persistence. The chart library (uPlot) is loaded on
 * demand so dashboards without charts don't pay for it.
 */
function ChartWidget({ config, ctx }: WidgetProps<ChartConfig>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  // ctx is unused (charts read history, not live state) but kept for contract uniformity.
  void ctx

  useEffect(() => {
    if (!config.item) {
      setStatus('empty')
      return
    }
    let disposed = false
    let timer: ReturnType<typeof setInterval> | null = null
    let resizeObserver: ResizeObserver | null = null

    async function load() {
      const periodMs = PERIODS[config.period ?? '24h'] ?? PERIODS['24h']
      const points = await getItemHistory(config.item, new Date(Date.now() - periodMs), config.service || undefined)
      if (disposed) return
      const xs: number[] = []
      const ys: (number | null)[] = []
      // ON/OFF-style histories plot as 1/0 (persistence stores them as text)
      const BINARY: Record<string, number> = { ON: 1, OFF: 0, OPEN: 1, CLOSED: 0 }
      for (const p of points) {
        const v = p.state in BINARY ? BINARY[p.state] : parseFloat(p.state)
        xs.push(p.time / 1000)
        ys.push(Number.isFinite(v) ? v : null)
      }
      if (xs.length === 0) {
        chartRef.current?.destroy()
        chartRef.current = null
        setStatus('empty')
        return
      }

      const { default: UPlotCtor } = await import('uplot')
      await import('uplot/dist/uPlot.min.css')
      if (disposed || !hostRef.current) return

      const data: [number[], (number | null)[]] = [xs, ys]
      if (chartRef.current) {
        chartRef.current.setData(data)
      } else {
        const host = hostRef.current
        const axisStyle = {
          stroke: cssVar('--nh-text-dim'),
          grid: { stroke: cssVar('--nh-border'), width: 1 },
          ticks: { stroke: cssVar('--nh-border'), width: 1 },
        }
        chartRef.current = new UPlotCtor(
          {
            width: host.clientWidth,
            height: host.clientHeight,
            legend: { show: false },
            cursor: { y: false },
            series: [{}, { stroke: cssVar('--nh-primary'), width: 2, points: { show: false } }],
            axes: [axisStyle, axisStyle],
          },
          data,
          host
        )
        resizeObserver = new ResizeObserver(() => {
          if (chartRef.current && host.clientWidth > 0) {
            chartRef.current.setSize({ width: host.clientWidth, height: host.clientHeight })
          }
        })
        resizeObserver.observe(host)
      }
      setStatus('ready')
    }

    setStatus('loading')
    load().catch(() => {
      if (!disposed) setStatus('error')
    })
    const refreshSec = config.refresh && config.refresh > 0 ? config.refresh : 300
    timer = setInterval(() => void load().catch(() => {}), refreshSec * 1000)

    return () => {
      disposed = true
      if (timer) clearInterval(timer)
      resizeObserver?.disconnect()
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [config.item, config.period, config.service, config.refresh])

  return (
    <WidgetFrame label={config.label ?? config.item}>
      <div className="nh-chart" ref={hostRef}>
        {status !== 'ready' ? (
          <span className="nh-chart__status">
            {status === 'loading' ? 'Loading history…' : status === 'empty' ? 'No history data' : 'Could not load history'}
          </span>
        ) : null}
      </div>
    </WidgetFrame>
  )
}

export const chartWidget: WidgetDefinition<ChartConfig> = {
  type: 'chart',
  name: 'Chart',
  description: 'History graph from persistence',
  defaultSize: { w: 6, h: 5 },
  defaultConfig: () => ({ item: '', period: '24h', refresh: 300 }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Number', 'Dimmer', 'Switch'] },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'period',
      type: 'select',
      label: 'Period',
      options: Object.keys(PERIODS).map((p) => ({ value: p, label: p })),
    },
    { key: 'service', type: 'text', label: 'Persistence service (optional)' },
    { key: 'refresh', type: 'number', label: 'Refresh (seconds)', min: 10 },
  ],
  itemKeys: () => [],
  Component: ChartWidget,
}
