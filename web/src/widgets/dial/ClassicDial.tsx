import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { holdTookGesture } from '../../components/useLongPress'
import { numericValue } from '../common/format'
import { stepDecimals } from '../common/itemControl'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useLiveCommand } from '../common/useLiveCommand'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { arcPath, polar, START, SWEEP } from './geometry'
import { dialFraction, keyStep, valueAtFraction } from '../common/dialPointer'
import { fractionOf, scaleOf, type DialConfig } from './gauge'

// the arc sits at radius 38 of a 100-unit face; a press has to land on it, not on the reading in the
// middle or the empty gap at the bottom
const RING_IN = 26
const RING_OUT = 50
const ARC_START = START + 90

export function ClassicDial({ config, ctx }: WidgetProps<DialConfig>) {
  const { t } = useTranslation()
  const { min, max, step } = scaleOf(config)
  const decimals = stepDecimals(step)
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const dragFrac = useRef<number | null>(null)

  const state = ctx.getItem(config.item)
  const live = Math.min(max, Math.max(min, numericValue(state) ?? min))
  // through the same hold every other control has: released, the dial stays where it was let go
  const optimistic = useOptimisticValue(live, live, (a, b) => Math.abs(a - b) <= Math.max(step, 0.5), {
    item: config.item || undefined
  })
  const value = drag ?? optimistic.display
  const fraction = fractionOf(value, min, max)
  const interactive = !ctx.editing && !config.readOnly && !!config.item

  const pointer = (e: React.PointerEvent): { frac: number | null; dist: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy) / (Math.min(rect.width, rect.height) / 100)
    const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
    return { frac: dialFraction(angle, ARC_START, SWEEP, dragFrac.current), dist }
  }

  const send = (v: number) => {
    optimistic.commit(v)
    void ctx.sendCommand(config.item, String(v)).then((ok) => !ok && optimistic.cancel(v))
  }

  const liveCmd = useLiveCommand<number>({
    item: config.item,
    config,
    editing: ctx.editing,
    command: String,
    send: (v) => ctx.sendCommand(config.item, String(v)),
    onSend: optimistic.commit,
    onRefused: optimistic.cancel
  })

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return
    // a right-click opens the detail sheet; it must not also set the value under the cursor
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragFrac.current = null
    const at = pointer(e)
    if (at.frac === null || at.dist < RING_IN || at.dist > RING_OUT) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragFrac.current = at.frac
    setDrag(valueAtFraction(at.frac, min, max, step, decimals))
    liveCmd.begin(e)
  }
  // a press is in progress while there is a fraction to drag from; the keyboard's pending value is not one
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragFrac.current === null) return
    const at = pointer(e)
    if (at.frac === null) return
    dragFrac.current = at.frac
    const v = valueAtFraction(at.frac, min, max, step, decimals)
    setDrag(v)
    liveCmd.moved(e)
    liveCmd.stage(v)
  }
  const onPointerUp = () => {
    if (dragFrac.current === null || drag === null) return
    const v = drag
    setDrag(null)
    dragFrac.current = null
    if (liveCmd.end(v)) return
    if (holdTookGesture()) return
    send(v)
  }
  const onPointerCancel = () => {
    liveCmd.cancel()
    setDrag(null)
    dragFrac.current = null
  }

  const keys = useKeyboardCommit((v: number) => {
    setDrag(null)
    send(v)
  })
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return
    const next = keyStep(e.key, value, min, max, step, decimals)
    if (next === null) return
    e.preventDefault()
    setDrag(next)
  }

  const knobAngle = START + fraction * SWEEP
  const knobPos = polar(50, 50, 38, knobAngle)
  const text = value.toFixed(decimals) + (config.unit ?? '')

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
        role={config.readOnly ? 'img' : 'slider'}
        aria-label={config.label || t('Dial')}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        aria-readonly={config.readOnly ? true : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => drag !== null && keys.key(e.key, drag)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}>
        <path className="nh-dial__track" d={arcPath(50, 50, 38, START, START + SWEEP)} />
        {fraction > 0 ? <path className="nh-dial__fill" d={arcPath(50, 50, 38, START, START + Math.max(0.01, fraction * SWEEP))} /> : null}
        {config.readOnly ? null : <circle className="nh-dial__knob" cx={knobPos.x} cy={knobPos.y} r="6" />}
        <text className="nh-dial__value" x="50" y="52" textAnchor="middle">
          {text}
        </text>
      </svg>
    </WidgetFrame>
  )
}
