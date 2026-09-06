/**
 * The color widget's interactive body - the sliders bound to an item, sending "H,S,B" commands -
 * as a standalone control, so the floor plan's tap popup offers the exact same picker as the
 * widget. All the draft/optimistic behaviour lives here; the sliders themselves are
 * ColorSliders, which the preset editor uses too.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { holdTookGesture } from '../../components/useLongPress'
import type { WidgetContext } from '../types'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { parseHsb, sameColor, type Hsb } from '../../model/color'
import { lastLitBrightness, noteBrightness } from '../../store/lastLit'
import { ColorSliders } from './ColorSliders'

export function ColorControl({ item, ctx, power = false }: { item: string; ctx: WidgetContext; power?: boolean }) {
  const { t } = useTranslation()
  const state = ctx.getItem(item)
  const [draft, setDraft] = useState<Hsb | null>(null)
  // Between commits, show the last value the user set for as long as the device agrees it is
  // the same color (or is still fading toward it) - raw HSB echoes would otherwise yank the
  // other sliders to unrelated positions right after a drag.
  // The raw state is the identity of the parsed colour: parseHsb builds a fresh object each
  // render, so it cannot be compared with the one before it.
  const optimistic = useOptimisticValue(parseHsb(state?.state), state?.state ?? '', sameColor)
  const hsb = draft ?? optimistic.display

  // What the ITEM says, not what this control is showing: an optimistic value is what we hope the
  // lamp will do, and the memory is meant to hold what it actually did. Recorded whether or not
  // this picker offers the buttons, so any device that has seen the lamp lit can restore it -
  // including one that did not switch it off.
  const liveB = parseHsb(state?.state).b
  useEffect(() => {
    if (state?.state) noteBrightness(item, liveB)
  }, [item, liveB, state?.state])

  /**
   * The wheel wraps: openHAB's HSBType accepts 0 <= h < 360 and rejects the whole command with a
   * 400 otherwise, so the track's top end (360) has to go out as the same red at 0.
   */
  const hsbCommand = (v: Hsb) => `${Math.round(v.h) % 360},${Math.round(v.s)},${Math.round(v.b)}`

  const send = (next: Hsb, command: string) => {
    optimistic.commit(next)
    void ctx.sendCommand(item, command).then((accepted) => !accepted && optimistic.cancel(next))
  }

  const commit = (next: Hsb) => {
    setDraft(null)
    // See the slider widget: a hold recognised during the press takes the gesture, so the release
    // sends nothing and the draft is already back where it was.
    if (holdTookGesture()) return
    if (!ctx.editing) send(next, hsbCommand(next))
    else optimistic.commit(next)
  }
  const commitOn = useKeyboardCommit(commit)

  // Rounded the way the brightness slider rounds, so "off" on screen means the same thing in both.
  const off = Math.round(hsb.b) === 0

  /**
   * OFF rather than "0,0,0", and it is the whole reason no openHAB item is needed to remember
   * anything. A Color item maps OFF onto `H,S,0` and ON onto `H,S,100` (ColorItem.setState, and
   * measured on 4.3.7 and 5.2.1), so the lamp's colour survives being switched off for free and
   * every other UI still shows what it will come back to. Only the brightness is lost, and that is
   * the one number this device remembers - see `model/lastLit.ts`.
   */
  const press = (wanted: 'on' | 'off') => {
    // A hold over a button is swallowed as a click by the cell above, but not in the detail sheet,
    // which is a portal and is not inside that cell at all - so the release of the hold that
    // OPENED the sheet can land on a button that has just rendered under the finger.
    if (ctx.editing || holdTookGesture()) return
    // On restores the remembered brightness only from dark. On a lamp that is already lit it
    // re-asserts what is on screen, because "on" means on: reaching for it to make sure, and
    // having the lamp drop to some brightness from an hour ago, would be the worse surprise.
    const b = wanted === 'off' ? 0 : off ? lastLitBrightness(item) : hsb.b
    const next = { ...hsb, b }
    send(next, wanted === 'off' ? 'OFF' : hsbCommand(next))
  }

  const button = (wanted: 'on' | 'off', active: boolean) => (
    <button
      type="button"
      className={'nh-color__pbtn' + (active ? ' nh-color__pbtn--active' : '')}
      disabled={ctx.editing}
      aria-pressed={active}
      onClick={() => press(wanted)}>
      {t(wanted === 'off' ? 'Off' : 'On')}
    </button>
  )

  return (
    <ColorSliders
      hsb={hsb}
      disabled={ctx.editing}
      onInput={setDraft}
      onCommit={commitOn.now}
      onKeyCommit={commitOn.key}
      aside={
        power ? (
          <>
            {button('off', off)}
            {button('on', !off)}
          </>
        ) : undefined
      }
    />
  )
}
