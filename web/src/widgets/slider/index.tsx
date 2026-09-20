import { useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { holdTookGesture } from '../../components/useLongPress'
import { numericValue } from '../common/format'
import { numericScale, rangeControl } from '../common/itemControl'
import { fractionOf } from '../common/stepping'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useLiveCommand } from '../common/useLiveCommand'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { BubbleLook, InsetLook, TrackLook } from './looks'
import type { FaderView } from './looks'
import { boundsOf, orientOf, readingOf, sliderFloor, styleOf, tintedOf } from './model'
import type { SliderConfig, SliderStyle } from './model'

const STYLE_LOOKS: Record<Exclude<SliderStyle, 'plain'>, ComponentType<{ view: FaderView }>> = {
  gradient: TrackLook,
  taper: TrackLook,
  bubble: BubbleLook,
  inset: InsetLook
}

function SliderWidget({ config, ctx }: WidgetProps<SliderConfig>) {
  const state = ctx.getItem(config.item)
  const scale = numericScale(config.min, config.max, config.step)
  const { min, max, step } = scale
  const style = styleOf(config.style)
  const vertical = orientOf(config.orient) === 'vertical'

  const [drag, setDrag] = useState<number | null>(null)
  const itemValue = numericValue(state) ?? min
  const optimistic = useOptimisticValue(itemValue, itemValue, (live, sent) => Math.abs(live - sent) <= Math.max(1, step), {
    item: config.item
  })
  const value = drag ?? optimistic.display

  const commit = (v: number) => {
    setDrag(null)
    if (holdTookGesture()) return
    optimistic.commit(v)
    if (!ctx.editing) {
      void ctx.sendCommand(config.item, String(v)).then((accepted) => !accepted && optimistic.cancel(v))
    }
  }
  const commitOn = useKeyboardCommit(commit)
  const live = useLiveCommand<number>({
    item: config.item,
    config,
    editing: ctx.editing,
    command: String,
    send: (v) => ctx.sendCommand(config.item, String(v)),
    onSend: optimistic.commit,
    onRefused: optimistic.cancel
  })
  const release = (v: number) => {
    if (live.end(v)) setDrag(null)
    else commitOn.now(v)
  }

  const reading = readingOf(value, step, config.unit)

  const input = (
    <input
      type="range"
      className={style === 'plain' ? 'nh-slider__input' : 'nh-fader__input'}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={ctx.editing}
      aria-label={config.label ?? config.item}
      onChange={(e) => {
        const n = Number(e.target.value)
        setDrag(n)
        live.stage(n)
      }}
      onPointerDown={live.begin}
      onPointerMove={live.moved}
      onPointerUp={(e) => release(Number((e.target as HTMLInputElement).value))}
      onPointerCancel={() => {
        live.cancel()
        setDrag(null)
      }}
      onKeyUp={(e) => commitOn.key(e.key, Number((e.target as HTMLInputElement).value))}
    />
  )

  if (style === 'plain') {
    return (
      <WidgetFrame label={config.label}>
        <div className={'nh-slider' + (vertical ? ' nh-slider--v' : '')}>
          {input}
          <div className="nh-slider__value">{reading}</div>
        </div>
      </WidgetFrame>
    )
  }

  const view: FaderView = { fraction: fractionOf(value, scale), reading, bounds: boundsOf(scale), input }
  const Look = STYLE_LOOKS[style]
  return (
    <WidgetFrame label={config.label}>
      <div
        className={
          'nh-fader nh-fader--' +
          style +
          (vertical ? ' nh-fader--v' : ' nh-fader--h') +
          (tintedOf(config.accentColor) ? ' nh-fader--tinted' : '')
        }
        style={{ '--fd-f': String(view.fraction) } as CSSProperties}>
        <Look view={view} />
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
  liveDrag: true,
  minPixelHeight: (c) => sliderFloor(styleOf(c.style), orientOf(c.orient)),
  defaultConfig: () => ({ item: '', style: 'gradient', orient: 'horizontal', min: 0, max: 100, step: 1 }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Dimmer', 'Number'] },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'style',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'gradient', label: 'Gradient' },
        { value: 'taper', label: 'Wedge' },
        { value: 'inset', label: 'Inset rail' },
        { value: 'bubble', label: 'Bubble' },
        { value: 'plain', label: 'Plain' }
      ],
      hint: "Plain follows the theme. The others keep their own look in any theme, in the tile's accent color where one is set."
    },
    {
      key: 'orient',
      type: 'select',
      label: 'Orientation',
      options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' }
      ]
    },
    { key: 'min', type: 'number', label: 'Minimum' },
    { key: 'max', type: 'number', label: 'Maximum' },
    { key: 'step', type: 'number', label: 'Step' },
    { key: 'unit', type: 'text', label: 'Unit suffix' }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  controlFor: (c, item) => (item === c.item ? rangeControl(numericScale(c.min, c.max, c.step), c.unit) : undefined),
  Component: SliderWidget
}
