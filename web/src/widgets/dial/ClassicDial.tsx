import { useRef, useState } from 'react'
import type { WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { holdTookGesture } from '../../components/useLongPress'
import { numericValue } from '../common/format'
import { stepDecimals } from '../common/itemControl'
import { useLiveCommand } from '../common/useLiveCommand'
import { arcPath, polar, START, SWEEP } from './geometry'
import { scaleOf, type DialConfig } from './gauge'

export function ClassicDial({ config, ctx }: WidgetProps<DialConfig>) {
  const { min, max, step } = scaleOf(config)
  const decimals = stepDecimals(step)
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
    while (angle < START) angle += 360
    const clamped = Math.min(START + SWEEP, Math.max(START, angle))
    const raw = min + ((clamped - START) / SWEEP) * (max - min)
    const snapped = Number((Math.round(raw / step) * step).toFixed(decimals))
    return Math.min(max, Math.max(min, snapped))
  }

  const live = useLiveCommand<number>({
    item: config.item,
    config,
    editing: ctx.editing,
    command: String,
    send: (v) => ctx.sendCommand(config.item, String(v))
  })

  const onPointerDown = (e: React.PointerEvent) => {
    if (ctx.editing || config.readOnly || !config.item) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDrag(valueFromPointer(e))
    live.begin(e)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null) return
    const v = valueFromPointer(e)
    setDrag(v)
    live.moved(e)
    live.stage(v)
  }
  const onPointerUp = () => {
    if (drag === null) return
    const v = drag
    setDrag(null)
    if (live.end(v)) return
    if (holdTookGesture()) return
    void ctx.sendCommand(config.item, String(v))
  }
  const onPointerCancel = () => {
    live.cancel()
    setDrag(null)
  }

  const knobAngle = START + fraction * SWEEP
  const knobPos = polar(50, 50, 38, knobAngle)

  return (
    <WidgetFrame
      label={config.label}
      icon={config.icon}
      iconSize={config.iconSize}
      iconState={state?.state}
      iconColor={config.iconColor}
      center>
      <svg
        ref={svgRef}
        className={'nh-dial' + (config.readOnly ? ' nh-dial--readonly' : '')}
        viewBox="0 0 100 100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}>
        <path className="nh-dial__track" d={arcPath(50, 50, 38, START, START + SWEEP)} />
        {fraction > 0 ? <path className="nh-dial__fill" d={arcPath(50, 50, 38, START, START + Math.max(0.01, fraction * SWEEP))} /> : null}
        {config.readOnly ? null : <circle className="nh-dial__knob" cx={knobPos.x} cy={knobPos.y} r="6" />}
        <text className="nh-dial__value" x="50" y="52" textAnchor="middle">
          {value.toFixed(decimals)}
          {config.unit ?? ''}
        </text>
      </svg>
    </WidgetFrame>
  )
}
