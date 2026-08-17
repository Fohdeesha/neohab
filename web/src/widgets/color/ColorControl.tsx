/**
 * The color widget's interactive body - the sliders bound to an item, sending "H,S,B" commands -
 * as a standalone control, so the floor plan's tap popup offers the exact same picker as the
 * widget. All the draft/optimistic behaviour lives here; the sliders themselves are
 * ColorSliders, which the preset editor uses too.
 */
import { useState } from 'react'
import type { WidgetContext } from '../types'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { parseHsb, sameColor, type Hsb } from '../../model/color'
import { ColorSliders } from './ColorSliders'

export function ColorControl({ item, ctx }: { item: string; ctx: WidgetContext }) {
  const state = ctx.getItem(item)
  const [draft, setDraft] = useState<Hsb | null>(null)
  // Between commits, show the last value the user set for as long as the device agrees it is
  // the same color (or is still fading toward it) - raw HSB echoes would otherwise yank the
  // other sliders to unrelated positions right after a drag.
  const optimistic = useOptimisticValue(parseHsb(state?.state), sameColor)
  const hsb = draft ?? optimistic.display

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

  return (
    <ColorSliders hsb={hsb} disabled={ctx.editing} onInput={setDraft} onCommit={commitOn.now} onKeyCommit={commitOn.key} />
  )
}
