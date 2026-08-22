import { useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { holdTookGesture } from '../../components/useLongPress'
import { numericValue } from '../common/format'
import { numericScale, rangeControl, stepDecimals } from '../common/itemControl'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useOptimisticValue } from '../common/useOptimisticValue'

interface SliderConfig {
  item: string
  label?: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

function SliderWidget({ config, ctx }: WidgetProps<SliderConfig>) {
  const state = ctx.getItem(config.item)
  // Guarded at the read: an imported `max: "abc"` or a `step: 0` reaches a range input as NaN and
  // makes it inert, and this is the same scale the detail sheet's control is built from.
  const { min, max, step } = numericScale(config.min, config.max, config.step)

  // While dragging, show the local value; after a commit, hold it until the device confirms
  // (or diverges after the settle window) so slow/quantizing devices don't snap the slider back.
  const [drag, setDrag] = useState<number | null>(null)
  const itemValue = numericValue(state) ?? min
  const optimistic = useOptimisticValue(itemValue, (live, sent) => Math.abs(live - sent) <= Math.max(1, step))
  const value = drag ?? optimistic.display

  const commit = (v: number) => {
    setDrag(null)
    // Pressing the track jumps the thumb there before anyone knows whether this is a tap or a
    // hold. Nothing has been sent yet, so a hold that was recognised in the meantime simply ends
    // here: the draft is already back, and the item is left alone.
    if (holdTookGesture()) return
    optimistic.commit(v)
    if (!ctx.editing) {
      void ctx.sendCommand(config.item, String(v)).then((accepted) => !accepted && optimistic.cancel(v))
    }
  }
  const commitOn = useKeyboardCommit(commit)

  return (
    <WidgetFrame label={config.label}>
      <div className="nh-slider">
        <input
          type="range"
          className="nh-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={ctx.editing}
          aria-label={config.label ?? config.item}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={(e) => commitOn.now(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => commitOn.key(e.key, Number((e.target as HTMLInputElement).value))}
        />
        <div className="nh-slider__value">
          {/* The digits the step resolves, like the dial and like this widget's own control in
              the detail sheet: a slider set to a 0.5 step and reading whole numbers is throwing
              away the digit it was configured to resolve. */}
          {value.toFixed(stepDecimals(step))}
          {config.unit ?? ''}
        </div>
      </div>
    </WidgetFrame>
  )
}

export const sliderWidget: WidgetDefinition<SliderConfig> = {
  type: 'slider',
  name: 'Slider',
  description: 'Set a numeric or dimmer item',
  defaultSize: { w: 6, h: 3 },
  hasHeader: true,
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
  canCommand: () => true,
  // The reported bug: a popup that offered 0-100 for a slider set to 2000-6500 K, and commanded
  // whatever that track landed on. It is this widget's scale, wherever the control is drawn.
  controlFor: (c, item) => (item === c.item ? rangeControl(numericScale(c.min, c.max, c.step), c.unit) : undefined),
  Component: SliderWidget,
}
