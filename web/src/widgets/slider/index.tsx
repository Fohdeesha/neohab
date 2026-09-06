/**
 * Slider: one numeric item on a track you drag.
 *
 * Five styles and two orientations, both settings, so a dashboard can carry a plain slider beside
 * a gradient fader without either being a different widget. The plain style is the theme's own
 * range control and is what this widget has always drawn - it keeps the `.nh-slider` markup the
 * detail sheet and the floor plan's popup share, so a theme that restyles the control restyles
 * all three. The other four are built from parts this stylesheet owns.
 *
 * The behaviour is the same whichever style is drawn, and it is the widget's rather than a
 * style's: the press stages a value and the release sends it, a hold recognised in between takes
 * the gesture and sends nothing, arrow keys coalesce into one command, and the value that was
 * sent is held on screen until the device confirms it.
 */
import { useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { holdTookGesture } from '../../components/useLongPress'
import { numericValue } from '../common/format'
import { numericScale, rangeControl } from '../common/itemControl'
import { fractionOf } from '../common/stepping'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { BubbleLook, InsetLook, TrackLook } from './looks'
import type { FaderView } from './looks'
import { boundsOf, orientOf, readingOf, sliderFloor, styleOf, tintedOf } from './model'
import type { SliderConfig, SliderStyle } from './model'

/**
 * Gradient and taper share an arrangement and differ in what the fill is made of. Typed as a
 * Record over the styles, so adding one stops compiling here until it has somewhere to be drawn.
 *
 * Not `LOOKS`: the stepper declares a table of that name whose keys are open (`Record<string,
 * ...>`), and the source scan for bare-index reads is cross-file by identifier, so sharing the
 * name would make this read look like the bug that scan exists to catch.
 */
const STYLE_LOOKS: Record<Exclude<SliderStyle, 'plain'>, ComponentType<{ view: FaderView }>> = {
  gradient: TrackLook,
  taper: TrackLook,
  bubble: BubbleLook,
  inset: InsetLook
}

function SliderWidget({ config, ctx }: WidgetProps<SliderConfig>) {
  const state = ctx.getItem(config.item)
  // Guarded at the read: an imported `max: "abc"` or a `step: 0` reaches a range input as NaN and
  // makes it inert, and this is the same scale the detail sheet's control is built from.
  const scale = numericScale(config.min, config.max, config.step)
  const { min, max, step } = scale
  const style = styleOf(config.style)
  const vertical = orientOf(config.orient) === 'vertical'

  // While dragging, show the local value; after a commit, hold it until the device confirms
  // (or diverges after the settle window) so slow/quantizing devices don't snap the slider back.
  const [drag, setDrag] = useState<number | null>(null)
  const itemValue = numericValue(state) ?? min
  const optimistic = useOptimisticValue(itemValue, itemValue, (live, sent) => Math.abs(live - sent) <= Math.max(1, step))
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

  // The digits the step resolves, like the dial and like this widget's own control in the detail
  // sheet: a slider set to a 0.5 step and reading whole numbers is throwing away the digit it was
  // configured to resolve.
  const reading = readingOf(value, step, config.unit)

  // One input, whichever style places it. A vertical range is the browser's own: `writing-mode`
  // plus `direction: rtl` puts the minimum at the bottom and makes ArrowUp raise the value, which
  // is why the styles need no pointer handling of their own.
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
      onChange={(e) => setDrag(Number(e.target.value))}
      onPointerUp={(e) => commitOn.now(Number((e.target as HTMLInputElement).value))}
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
          // A tile given an accent colour has the style rebuilt in that colour; without one the
          // colours it was drawn in stand.
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
  // A stacked phone row has no other floor: a vertical fader with no travel is not a control, and
  // the bubble's badge rides above the track rather than beside it.
  minPixelHeight: (c) => sliderFloor(styleOf(c.style), orientOf(c.orient)),
  // Every select's default is carried here as well as in its reader: a select whose value
  // resolves to nothing renders blank, and the registry check for that reads this.
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
  // The reported bug: a popup that offered 0-100 for a slider set to 2000-6500 K, and commanded
  // whatever that track landed on. It is this widget's scale, wherever the control is drawn.
  controlFor: (c, item) => (item === c.item ? rangeControl(numericScale(c.min, c.max, c.step), c.unit) : undefined),
  Component: SliderWidget
}
