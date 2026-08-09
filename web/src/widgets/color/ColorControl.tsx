/**
 * The color widget's interactive body - hue/saturation/brightness sliders with a live swatch,
 * sending "H,S,B" commands - as a standalone control, so the floor plan's tap popup offers the
 * exact same picker as the widget. All the draft/optimistic behaviour lives here; the widget
 * is a frame around this.
 */
import { useState } from 'react'
import type { WidgetContext } from '../types'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { parseHsb, hsbToCss, sameColor, type Hsb } from '../../model/color'

export function ColorControl({ item, ctx }: { item: string; ctx: WidgetContext }) {
  const state = ctx.getItem(item)
  const [draft, setDraft] = useState<Hsb | null>(null)
  // Between commits, show the last value the user set for as long as the device agrees it is
  // the same color (or is still fading toward it) - raw HSB echoes would otherwise yank the
  // other sliders to unrelated positions right after a drag.
  const optimistic = useOptimisticValue(parseHsb(state?.state), sameColor)
  const hsb = draft ?? optimistic.display

  const update = (patch: Partial<Hsb>) => setDraft({ ...hsb, ...patch })
  const commit = (next: Hsb) => {
    setDraft(null)
    optimistic.commit(next)
    if (!ctx.editing) {
      // The wheel wraps: openHAB's HSBType accepts 0 <= h < 360 and rejects the whole command
      // with a 400 otherwise, so the track's top end (360) has to go out as the same red at 0.
      const h = Math.round(next.h) % 360
      void ctx
        .sendCommand(item, `${h},${Math.round(next.s)},${Math.round(next.b)}`)
        .then((accepted) => !accepted && optimistic.cancel(next))
    }
  }
  const commitOn = useKeyboardCommit(commit)

  // Each track previews what dragging that slider would do at the CURRENT other channels:
  // hue = the full wheel, saturation = gray -> pure color, brightness = black -> full color.
  const trackFor = (key: keyof Hsb): string => {
    if (key === 'h') {
      const stops = [0, 60, 120, 180, 240, 300, 360]
        .map((h) => hsbToCss({ h, s: Math.max(40, hsb.s), b: Math.max(50, hsb.b) }))
        .join(', ')
      return `linear-gradient(to right, ${stops})`
    }
    if (key === 's') {
      return `linear-gradient(to right, ${hsbToCss({ ...hsb, s: 0 })}, ${hsbToCss({ ...hsb, s: 100 })})`
    }
    return `linear-gradient(to right, ${hsbToCss({ ...hsb, b: 0 })}, ${hsbToCss({ ...hsb, b: 100 })})`
  }

  const channel = (key: keyof Hsb, max: number) => (
    <input
      type="range"
      className={'nh-color__track nh-color__' + key}
      style={{ '--nh-track': trackFor(key) } as React.CSSProperties}
      min={0}
      max={max}
      step={1}
      value={Math.round(hsb[key])}
      disabled={ctx.editing}
      aria-label={key}
      onChange={(e) => update({ [key]: Number(e.target.value) })}
      onPointerUp={(e) => commitOn.now({ ...hsb, [key]: Number((e.target as HTMLInputElement).value) })}
      onKeyUp={(e) => commitOn.key(e.key, { ...hsb, [key]: Number((e.target as HTMLInputElement).value) })}
    />
  )

  return (
    <div className="nh-color">
      <div className="nh-color__swatch" style={{ background: hsbToCss(hsb) }} />
      <div className="nh-color__channels">
        {channel('h', 360)}
        {channel('s', 100)}
        {channel('b', 100)}
      </div>
    </div>
  )
}
