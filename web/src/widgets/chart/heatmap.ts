import { HEATMAP_COLS, HEATMAP_ROWS, type HeatmapData } from './aggregate'

export interface HeatmapParams {
  host: HTMLElement
  weekdays: string[]
  formatValue: (value: number) => string
  title: string
}

export interface HeatmapHandle {
  setData(data: HeatmapData): void
  destroy(): void
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim()
  return v || fallback
}

function rgb(color: string): [number, number, number] {
  const hex = color.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)]
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)]
  const fn = /^rgba?\(([^)]+)\)$/i.exec(hex)
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).map(Number)
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) return [parts[0], parts[1], parts[2]]
  }
  return [128, 128, 128]
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`

export function createHeatmap(p: HeatmapParams): HeatmapHandle {
  const canvas = document.createElement('canvas')
  canvas.className = 'nh-heatmap__canvas'
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', p.title)
  p.host.appendChild(canvas)

  const tip = document.createElement('div')
  tip.className = 'nh-chart__tt'
  p.host.appendChild(tip)

  let data: HeatmapData | null = null
  let geom = { left: 0, top: 0, cellW: 0, cellH: 0 }

  const draw = () => {
    const ctx = canvas.getContext('2d')
    if (!ctx || !data) return
    const dpr = window.devicePixelRatio || 1
    const cssW = p.host.clientWidth
    const cssH = p.host.clientHeight
    if (cssW <= 0 || cssH <= 0) return
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = cssW + 'px'
    canvas.style.height = cssH + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const text = cssVar('--nh-text-dim', '#888')
    const empty = rgb(cssVar('--nh-surface-2', '#333'))
    const hot = rgb(cssVar('--nh-primary', '#e35a2b'))
    const font = '10px system-ui, sans-serif'
    ctx.font = font

    const labelW = Math.min(38, Math.max(...p.weekdays.map((w) => ctx.measureText(w).width)) + 8)
    const axisH = 14
    const scaleH = 16
    const left = labelW
    const top = 2
    const gridW = Math.max(1, cssW - left - 4)
    const gridH = Math.max(1, cssH - top - axisH - scaleH)
    const cellW = gridW / HEATMAP_COLS
    const cellH = gridH / HEATMAP_ROWS
    geom = { left, top, cellW, cellH }

    const span = data.max - data.min
    for (let row = 0; row < HEATMAP_ROWS; row++) {
      for (let col = 0; col < HEATMAP_COLS; col++) {
        const v = data.cells[row]?.[col] ?? null
        const x = left + col * cellW
        const y = top + row * cellH
        if (v === null) {
          ctx.fillStyle = mix(empty, empty, 0)
          ctx.globalAlpha = 0.35
        } else {
          ctx.globalAlpha = 1
          ctx.fillStyle = mix(empty, hot, span > 0 ? (v - data.min) / span : 1)
        }
        ctx.fillRect(x + 0.5, y + 0.5, Math.max(0.5, cellW - 1), Math.max(0.5, cellH - 1))
      }
    }
    ctx.globalAlpha = 1

    ctx.fillStyle = text
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    for (let row = 0; row < HEATMAP_ROWS; row++) {
      if (cellH >= 10) ctx.fillText(p.weekdays[row] ?? '', left - 4, top + row * cellH + cellH / 2)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const step = cellW >= 18 ? 1 : cellW >= 9 ? 3 : 6
    for (let col = 0; col < HEATMAP_COLS; col += step) {
      ctx.fillText(String(col), left + col * cellW + cellW / 2, top + gridH + 2)
    }

    const scaleY = top + gridH + axisH + 2
    const scaleW = Math.min(120, gridW / 2)
    for (let i = 0; i < scaleW; i++) {
      ctx.fillStyle = mix(empty, hot, i / Math.max(1, scaleW - 1))
      ctx.fillRect(left + i, scaleY, 1, 8)
    }
    ctx.fillStyle = text
    ctx.textAlign = 'left'
    ctx.fillText(p.formatValue(data.min), left + scaleW + 6, scaleY)
    ctx.textAlign = 'right'
    ctx.fillText(p.formatValue(data.max), left + gridW, scaleY)
  }

  const onMove = (e: PointerEvent) => {
    if (!data) return
    const rect = canvas.getBoundingClientRect()
    const col = Math.floor((e.clientX - rect.left - geom.left) / geom.cellW)
    const row = Math.floor((e.clientY - rect.top - geom.top) / geom.cellH)
    const v = row >= 0 && row < HEATMAP_ROWS && col >= 0 && col < HEATMAP_COLS ? data.cells[row][col] : null
    if (v === null) {
      tip.classList.remove('nh-chart__tt--show')
      return
    }
    tip.textContent = `${p.weekdays[row] ?? ''} ${String(col).padStart(2, '0')}:00 · ${p.formatValue(v)}`
    tip.classList.add('nh-chart__tt--show')
    const hostRect = p.host.getBoundingClientRect()
    let x = e.clientX - hostRect.left + 12
    if (x + tip.offsetWidth > hostRect.width - 4) x = Math.max(4, hostRect.width - tip.offsetWidth - 4)
    let y = e.clientY - hostRect.top + 12
    if (y + tip.offsetHeight > hostRect.height - 4) y = Math.max(4, hostRect.height - tip.offsetHeight - 4)
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }
  const onLeave = () => tip.classList.remove('nh-chart__tt--show')
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  const ro = new ResizeObserver(() => draw())
  ro.observe(p.host)

  return {
    setData(next: HeatmapData) {
      data = next
      draw()
    },
    destroy() {
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.remove()
      tip.remove()
    }
  }
}
