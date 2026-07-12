import { useRef, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { numericValue } from '../common/format'

interface DialConfig {
  item: string
  label?: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

/** Arc geometry: 270° sweep starting at 135° (7:30 position), like a volume knob. */
const START = 135
const SWEEP = 270

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const from = polar(cx, cy, r, fromDeg)
  const to = polar(cx, cy, r, toDeg)
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${from.x} ${from.y} A ${r} ${r} 0 ${large} 1 ${to.x} ${to.y}`
}

/** Dial - a circular touch slider for numeric/dimmer items. Commits on release. */
function DialWidget({ config, ctx }: WidgetProps<DialConfig>) {
  const min = config.min ?? 0
  const max = config.max ?? 100
  const step = config.step ?? 1
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)

  const state = ctx.getItem(config.item)
  const value = drag ?? Math.min(max, Math.max(min, numericValue(state) ?? min))
  const fraction = max > min ? (value - min) / (max - min) : 0

  const valueFromPointer = (e: React.PointerEvent): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
    // normalize into [START, START+SWEEP]
    while (angle < START) angle += 360
    const clamped = Math.min(START + SWEEP, Math.max(START, angle))
    const raw = min + ((clamped - START) / SWEEP) * (max - min)
    const snapped = Math.round(raw / step) * step
    return Math.min(max, Math.max(min, snapped))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (ctx.editing || !config.item) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDrag(valueFromPointer(e))
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag !== null) setDrag(valueFromPointer(e))
  }
  const onPointerUp = () => {
    if (drag === null) return
    const v = drag
    setDrag(null)
    ctx.sendCommand(config.item, String(v))
  }

  const knobAngle = START + fraction * SWEEP
  const knobPos = polar(50, 50, 38, knobAngle)

  return (
    <WidgetFrame label={config.label} center>
      <svg
        ref={svgRef}
        className="nh-dial"
        viewBox="0 0 100 100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        <path className="nh-dial__track" d={arcPath(50, 50, 38, START, START + SWEEP)} />
        {fraction > 0 ? (
          <path className="nh-dial__fill" d={arcPath(50, 50, 38, START, START + Math.max(0.01, fraction * SWEEP))} />
        ) : null}
        <circle className="nh-dial__knob" cx={knobPos.x} cy={knobPos.y} r="6" />
        <text className="nh-dial__value" x="50" y="52" textAnchor="middle">
          {Math.round(value)}
          {config.unit ?? ''}
        </text>
      </svg>
    </WidgetFrame>
  )
}

export const dialWidget: WidgetDefinition<DialConfig> = {
  type: 'dial',
  name: 'Dial',
  description: 'Circular slider for numeric items',
  defaultSize: { w: 3, h: 4 },
  defaultConfig: () => ({ item: '', min: 0, max: 100, step: 1 }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Dimmer', 'Number'] },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'min', type: 'number', label: 'Minimum' },
    { key: 'max', type: 'number', label: 'Maximum' },
    { key: 'step', type: 'number', label: 'Step' },
    { key: 'unit', type: 'text', label: 'Unit suffix' },
  ],
  itemKeys: (c) => [c.item],
  Component: DialWidget,
}
