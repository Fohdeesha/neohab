import { useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { numericValue } from '../common/format'
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
  const min = config.min ?? 0
  const max = config.max ?? 100
  const step = config.step ?? 1

  // While dragging, show the local value; after a commit, hold it until the device confirms
  // (or diverges after the settle window) so slow/quantizing devices don't snap the slider back.
  const [drag, setDrag] = useState<number | null>(null)
  const itemValue = numericValue(state) ?? min
  const optimistic = useOptimisticValue(itemValue, (live, sent) => Math.abs(live - sent) <= Math.max(1, step))
  const value = drag ?? optimistic.display

  const commit = (v: number) => {
    setDrag(null)
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
          {Math.round(value)}
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
  Component: SliderWidget,
}
