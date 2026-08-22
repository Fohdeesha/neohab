import { useRef, useState } from 'react'
import type { WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { holdTookGesture } from '../../components/useLongPress'
import { numericValue } from '../common/format'
import { stepDecimals } from '../common/itemControl'
import { arcPath, polar, START, SWEEP } from './geometry'
import { scaleOf, type DialConfig } from './gauge'

/** Dial - a circular touch slider for numeric/dimmer items. Commits on release. */
export function ClassicDial({ config, ctx }: WidgetProps<DialConfig>) {
  // Guarded at the read (see scaleOf): a cleared or nonsensical step made the snap divide by
  // zero, and a min or max that is not a number rendered the whole dial as NaN.
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
    // normalize into [START, START+SWEEP]
    while (angle < START) angle += 360
    const clamped = Math.min(START + SWEEP, Math.max(START, angle))
    const raw = min + ((clamped - START) / SWEEP) * (max - min)
    // round to the step's own precision before clamping, or a 0.1 step sends 72.30000000000001
    const snapped = Number((Math.round(raw / step) * step).toFixed(decimals))
    return Math.min(max, Math.max(min, snapped))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (ctx.editing || config.readOnly || !config.item) return
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
    // A press stages the value under the finger and this release sends it - unless a hold was
    // recognised first, in which case the press was the gesture and the dial keeps its value.
    if (holdTookGesture()) return
    void ctx.sendCommand(config.item, String(v))
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
      center
    >
      <svg
        ref={svgRef}
        className={'nh-dial' + (config.readOnly ? ' nh-dial--readonly' : '')}
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
        {config.readOnly ? null : <circle className="nh-dial__knob" cx={knobPos.x} cy={knobPos.y} r="6" />}
        <text className="nh-dial__value" x="50" y="52" textAnchor="middle">
          {value.toFixed(decimals)}
          {config.unit ?? ''}
        </text>
      </svg>
    </WidgetFrame>
  )
}
