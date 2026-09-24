import { parseColor } from '../../themes/contrast'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { axesFit, axisRoom, axisWidthFor } from './model'

export interface PlotSeries {
  label: string
  color: string
  axis: 'y' | 'y2'
  width: number
  fill: number
  mode: 'smooth' | 'linear' | 'step'
  points: boolean
  kind?: 'line' | 'bar'
}

export interface PlotThreshold {
  from?: number
  to?: number
  axis: 'y' | 'y2'
  color: string
  label?: string
}

export interface PlotParams {
  host: HTMLElement
  series: PlotSeries[]
  thresholds: PlotThreshold[]
  xMode?: 'time' | 'category'
  categoryLabels?: string[]
  yMin?: number
  yMax?: number
  y2Min?: number
  y2Max?: number
  formatValue: (seriesIndex: number, value: number) => string
  onZoom: (zoomed: boolean) => void
  // the app's language: uPlot's own time labels are fixed English ("9/23", "3pm")
  locale: string
  // the canvas says nothing to a screen reader on its own
  ariaLabel: string
}

const DAY = 86_400

/**
 * Time-axis labels in the app's language, laid out the way uPlot's own are: the unit the ticks step by
 * on the first line, and the next coarser unit under it on the first tick and wherever it changes.
 */
export function timeAxisValues(splits: number[], incr: number, locale: string): string[] {
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts)
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  if (incr < DAY) {
    const time = incr < 60 ? fmt({ hour: 'numeric', minute: '2-digit', second: '2-digit' }) : fmt({ hour: 'numeric', minute: '2-digit' })
    const date = fmt({ month: 'short', day: 'numeric' })
    let prev = ''
    return splits.map((s) => {
      const d = new Date(s * 1000)
      const key = dayKey(d)
      const out = key !== prev ? time.format(d) + '\n' + date.format(d) : time.format(d)
      prev = key
      return out
    })
  }
  if (incr < 28 * DAY) {
    const date = fmt({ month: 'short', day: 'numeric' })
    const year = fmt({ year: 'numeric' })
    let prev = -1
    return splits.map((s) => {
      const d = new Date(s * 1000)
      const out = d.getFullYear() !== prev ? date.format(d) + '\n' + year.format(d) : date.format(d)
      prev = d.getFullYear()
      return out
    })
  }
  if (incr < 365 * DAY) {
    const month = fmt({ month: 'short' })
    const year = fmt({ year: 'numeric' })
    let prev = -1
    return splits.map((s) => {
      const d = new Date(s * 1000)
      const out = d.getFullYear() !== prev ? month.format(d) + '\n' + year.format(d) : month.format(d)
      prev = d.getFullYear()
      return out
    })
  }
  const year = fmt({ year: 'numeric' })
  return splits.map((s) => year.format(new Date(s * 1000)))
}

export type SeriesTable = [number[], (number | null)[]]

export interface ChartHandle {
  setData(tables: SeriesTable[]): void
  setSeriesVisible(seriesIndex: number, show: boolean): void
  resetZoom(): void
  destroy(): void
}

function cssVar(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim()
}

function alpha(color: string, a: number): string {
  const c = parseColor(color)
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` : color
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

export function createChart(p: PlotParams): ChartHandle {
  const host = p.host
  const theme = { dim: cssVar('--nh-text-dim'), grid: cssVar('--nh-border') }
  // the axis and the labels on the plot are text a person reads, so they take the tile's own size, which
  // already carries the dashboard, device and per-widget text scales. Sampled at mount like the colours
  // above: a text-size change lands on the next rebuild.
  const fontPx = Math.max(9, Math.round(parseFloat(getComputedStyle(host).fontSize) || 16))
  const plotFont = `${fontPx}px system-ui, sans-serif`
  const hasY = p.series.some((s) => s.axis === 'y')
  const hasY2 = p.series.some((s) => s.axis === 'y2')
  const scaleFor = (axis: 'y' | 'y2'): 'y' | 'y2' => (axis === 'y2' ? (hasY2 ? 'y2' : 'y') : hasY ? 'y' : 'y2')

  const category = p.xMode === 'category'
  const labels = p.categoryLabels ?? []
  const paths = {
    smooth: uPlot.paths.spline!(),
    linear: uPlot.paths.linear!(),
    step: uPlot.paths.stepped!({ align: 1 }),
    bar: uPlot.paths.bars!({ size: [0.85, 60] })
  }
  const categoryLabel = (v: number): string => labels[Math.round(v)] ?? String(v)

  const gradient =
    (color: string, peak: number): uPlot.Series.Fill =>
    (u) => {
      const g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height)
      g.addColorStop(0, alpha(color, peak))
      g.addColorStop(1, alpha(color, 0))
      return g
    }

  const range =
    (min?: number, max?: number): uPlot.Scale.Range =>
    (_u, dataMin, dataMax) => {
      const lo = dataMin ?? 0
      const hi = dataMax ?? lo + 1
      const padded = uPlot.rangeNum(lo, hi === lo ? lo + 1 : hi, 0.1, true)
      return [min ?? padded[0], max ?? padded[1]]
    }

  const axisStyle = {
    stroke: theme.dim,
    grid: { stroke: theme.grid, width: 1 },
    ticks: { stroke: theme.grid, width: 1 },
    font: plotFont
  }

  const tt = document.createElement('div')
  tt.className = 'nh-chart__tt'
  host.appendChild(tt)
  const timeFmt = new Intl.DateTimeFormat(p.locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  const hideTooltip = () => tt.classList.remove('nh-chart__tt--show')

  const onSetCursor = (u: uPlot) => {
    const idx = u.cursor.idx
    const left = u.cursor.left ?? -1
    const top = u.cursor.top ?? -1
    if (idx == null || left < 0) return hideTooltip()
    const x = u.data[0][idx]
    if (x === undefined) return hideTooltip()
    let rows = ''
    for (let i = 1; i < u.series.length; i++) {
      if (u.series[i].show === false) continue
      const v = u.data[i][idx]
      if (v == null) continue
      const s = p.series[i - 1]
      rows +=
        `<div class="nh-chart__tt-row"><span class="nh-chart__dot" style="background:${esc(s.color)}"></span>` +
        `<span class="nh-chart__tt-name">${esc(s.label)}</span>` +
        `<span class="nh-chart__tt-val">${esc(p.formatValue(i - 1, v))}</span></div>`
    }
    if (!rows) return hideTooltip()
    const header = category ? categoryLabel(x) : timeFmt.format(new Date(x * 1000))
    tt.innerHTML = `<div class="nh-chart__tt-time">${esc(header)}</div>` + rows
    tt.classList.add('nh-chart__tt--show')
    const overRect = u.over.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    const baseX = overRect.left - hostRect.left
    const baseY = overRect.top - hostRect.top
    let lx = baseX + left + 14
    if (lx + tt.offsetWidth > hostRect.width - 4) lx = baseX + left - tt.offsetWidth - 14
    if (lx < 4) lx = 4
    let ly = baseY + top + 14
    if (ly + tt.offsetHeight > hostRect.height - 4) ly = Math.max(4, hostRect.height - tt.offsetHeight - 4)
    tt.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`
  }

  const drawThresholds = (u: uPlot) => {
    if (p.thresholds.length === 0) return
    const ctx = u.ctx
    const pxr = uPlot.pxRatio
    const { left, top, width, height } = u.bbox
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, width, height)
    ctx.clip()
    for (const t of p.thresholds) {
      const scale = scaleFor(t.axis)
      if (t.from !== undefined && t.to !== undefined) {
        const yA = u.valToPos(Math.max(t.from, t.to), scale, true)
        const yB = u.valToPos(Math.min(t.from, t.to), scale, true)
        ctx.fillStyle = alpha(t.color, 0.14)
        ctx.fillRect(left, yA, width, yB - yA)
        if (t.label) {
          ctx.fillStyle = t.color
          ctx.font = `${Math.round(fontPx * pxr)}px system-ui, sans-serif`
          ctx.textAlign = 'right'
          ctx.textBaseline = 'top'
          ctx.fillText(t.label, left + width - 6 * pxr, yA + 3 * pxr)
        }
      } else {
        const val = t.from ?? t.to
        if (val === undefined) continue
        const y = u.valToPos(val, scale, true)
        ctx.strokeStyle = t.color
        ctx.lineWidth = 1.5 * pxr
        ctx.setLineDash([6 * pxr, 5 * pxr])
        ctx.beginPath()
        ctx.moveTo(left, y)
        ctx.lineTo(left + width, y)
        ctx.stroke()
        ctx.setLineDash([])
        if (t.label) {
          ctx.fillStyle = t.color
          ctx.font = `${Math.round(fontPx * pxr)}px system-ui, sans-serif`
          ctx.textAlign = 'right'
          ctx.textBaseline = 'bottom'
          ctx.fillText(t.label, left + width - 6 * pxr, y - 3 * pxr)
        }
      }
    }
    ctx.restore()
  }

  let zoomed = false
  const onSetScale = (u: uPlot, key: string) => {
    if (key !== 'x') return
    const d = u.data[0]
    if (!d || d.length === 0) return
    const span = d[d.length - 1] - d[0]
    const eps = Math.max(1, span * 0.001)
    const min = u.scales.x.min ?? d[0]
    const max = u.scales.x.max ?? d[d.length - 1]
    const z = min > d[0] + eps || max < d[d.length - 1] - eps
    if (z !== zoomed) {
      zoomed = z
      p.onZoom(z)
    }
  }

  const fit = axesFit(host.clientWidth, host.clientHeight, fontPx)

  // uPlot's flat 50px is sized for its own 12px font; ours is the tile's, and a two-line time label
  // at 16px runs off the bottom of the canvas. Both sizes grow with the text and never shrink.
  const widestLine = (u: uPlot, values: unknown[]): number => {
    const ctx = u.ctx
    const prev = ctx.font
    ctx.font = `${Math.round(fontPx * uPlot.pxRatio)}px system-ui, sans-serif`
    let widest = 0
    for (const v of values) for (const line of String(v).split('\n')) widest = Math.max(widest, ctx.measureText(line).width)
    ctx.font = prev
    return widest / uPlot.pxRatio
  }
  let xLabelWidth = 0
  const xSize: uPlot.Axis.Size = (u, values) => {
    const lines = values && values.length > 0 ? Math.max(...values.map((v) => String(v).split('\n').length)) : 1
    xLabelWidth = values && values.length > 0 ? widestLine(u, values) : 0
    return axisRoom(fontPx, lines)
  }
  const ySize: uPlot.Axis.Size = (u, values) => (!values || values.length === 0 ? axisWidthFor(0) : axisWidthFor(widestLine(u, values)))

  // uPlot pads a side that carries no axis by a third of its default axis size, so the edge label of
  // the perpendicular axis is not cut in half. That 17px is a constant sized for its own 12px font,
  // and on a tile short enough to have lost its x-axis it is 40% of what is left - so there, pad by
  // what the font actually needs. Every chart that still draws an x-axis keeps uPlot's own number.
  const padY: uPlot.PaddingSide = (_u, side, sides) => {
    const [hasTop, hasRgt, hasBtm, hasLft] = sides
    if (!hasLft && !hasRgt) return 0
    if (side === 0 ? hasTop : hasBtm) return 0
    return hasBtm ? 17 : Math.ceil(fontPx * 0.7)
  }
  // the same allowance on a side with no y axis, for the x axis's edge label: 17px fits uPlot's own "2pm"
  // and not "2:00 PM" in the app's language, so there it is half the widest label actually drawn
  const padX: uPlot.PaddingSide = (_u, side, sides) => {
    const [hasTop, hasRgt, hasBtm, hasLft] = sides
    if (!hasTop && !hasBtm) return 0
    if (side === 1 ? hasRgt : hasLft) return 0
    return Math.max(17, Math.ceil(xLabelWidth / 2) + 1)
  }

  const opts: uPlot.Options = {
    width: host.clientWidth,
    height: host.clientHeight,
    legend: { show: false },
    padding: [padY, padX, padY, padX],
    cursor: {
      y: false,
      drag: { x: true, y: false },
      focus: { prox: 24 },
      points: { size: 7 }
    },
    focus: { alpha: 0.35 },
    scales: {
      x: { time: !category },
      ...(hasY ? { y: { range: range(p.yMin, p.yMax) } } : {}),
      ...(hasY2 ? { y2: { range: range(p.y2Min, p.y2Max) } } : {})
    },
    axes: [
      {
        ...axisStyle,
        show: fit.x,
        size: xSize,
        ...(category
          ? {
              splits: (_u: uPlot, _ax: number, min: number, max: number) => {
                const out: number[] = []
                for (let v = Math.ceil(min); v <= Math.floor(max); v++) out.push(v)
                return out
              },
              values: (_u: uPlot, splits: number[]) => splits.map(categoryLabel)
            }
          : {
              values: (_u: uPlot, splits: number[], _ax: number, _space: number, incr: number) => timeAxisValues(splits, incr, p.locale)
            })
      },
      ...(hasY ? [{ ...axisStyle, scale: 'y', show: fit.y, size: ySize } as uPlot.Axis] : []),
      ...(hasY2 ? [{ ...axisStyle, scale: 'y2', side: 1, show: fit.y, size: ySize, grid: { show: !hasY } } as uPlot.Axis] : [])
    ],
    series: [
      {},
      ...p.series.map((s): uPlot.Series => ({
        label: s.label,
        scale: s.axis,
        stroke: s.color,
        width: s.width,
        spanGaps: true,
        paths: s.kind === 'bar' ? paths.bar : paths[s.mode],
        points: { show: s.points, size: 6, stroke: s.color, fill: s.color },
        fill:
          s.kind === 'bar'
            ? alpha(s.color, Math.min(1, (s.fill > 0 ? s.fill : 70) / 100))
            : s.fill > 0
              ? gradient(s.color, Math.min(1, s.fill / 100))
              : undefined
      }))
    ],
    hooks: {
      setCursor: [onSetCursor],
      setScale: [(u, key) => onSetScale(u, key)],
      drawAxes: [drawThresholds]
    }
  }

  const empty = [[], ...p.series.map(() => [])] as unknown as uPlot.AlignedData
  const u = new uPlot(opts, empty, host)
  u.root.setAttribute('role', 'img')
  u.root.setAttribute('aria-label', p.ariaLabel)

  const resizeObserver = new ResizeObserver(() => {
    if (host.clientWidth <= 0) return
    // read on every resize: uPlot reads `show` when it lays the axes out, so a tile that grows past
    // the threshold gets its axis back
    const want = axesFit(host.clientWidth, host.clientHeight, fontPx)
    u.axes.forEach((ax, i) => {
      ax.show = i === 0 ? want.x : want.y
    })
    u.setSize({ width: host.clientWidth, height: host.clientHeight })
  })
  resizeObserver.observe(host)

  return {
    setData(tables: SeriesTable[]) {
      const joined = uPlot.join(tables.map((t) => [t[0], t[1]] as uPlot.AlignedData))
      u.setData(joined)
    },
    setSeriesVisible(seriesIndex: number, show: boolean) {
      u.setSeries(seriesIndex + 1, { show })
    },
    resetZoom() {
      const d = u.data[0]
      if (d && d.length > 0) u.setScale('x', { min: d[0], max: d[d.length - 1] })
    },
    destroy() {
      resizeObserver.disconnect()
      hideTooltip()
      tt.remove()
      u.destroy()
    }
  }
}
