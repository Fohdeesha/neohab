/**
 * The small controls a popup puts in front of one item.
 *
 * Shared because two surfaces ask for them: the floor plan's tap-a-light popup and the widget
 * detail sheet. WHICH one to draw is decided elsewhere - see `itemControl.ts`, where the widget
 * itself answers - and these draw it. A Color item gets the colour widget's own picker (see
 * ColorControl); these three cover the rest. Kept behaviourally identical to the slider widget -
 * drag, optimistic display, coalesced keyboard stepping - because a control that behaves subtly
 * differently depending on which popup it is in is worse than no popup.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { holdTookGesture } from '../../components/useLongPress'
import type { WidgetContext } from '../types'
import { isOn, numericValue } from './format'
import { stepDecimals, type ItemChoice } from './itemControl'
import { stateMatches } from './stateIcon'
import { useKeyboardCommit } from './useKeyboardCommit'
import { useOptimisticValue } from './useOptimisticValue'

/**
 * A slider over the range the widget works in - 0 to 100 in whole steps when nobody said
 * otherwise, which is what a plan's light wants. Same drag/commit/optimistic behaviour as the
 * slider widget, sized for a popup.
 */
export function RangeControl({
  item,
  ctx,
  min = 0,
  max = 100,
  step = 1,
  unit
}: {
  item: string
  ctx: WidgetContext
  min?: number
  max?: number
  step?: number
  unit?: string
}) {
  const state = ctx.getItem(item)
  const [drag, setDrag] = useState<number | null>(null)
  const itemValue = numericValue(state) ?? min
  const optimistic = useOptimisticValue(itemValue, itemValue, (live, sent) => Math.abs(live - sent) <= Math.max(1, step))
  const value = drag ?? optimistic.display

  const commit = (v: number) => {
    setDrag(null)
    // See the slider widget: a press stages, a release sends, and a hold recognised in between
    // takes the gesture - so this one sends nothing and the draft is already back.
    if (holdTookGesture()) return
    optimistic.commit(v)
    if (!ctx.editing) {
      void ctx.sendCommand(item, String(v)).then((accepted) => !accepted && optimistic.cancel(v))
    }
  }
  const commitOn = useKeyboardCommit(commit)

  return (
    <div className="nh-slider">
      <input
        type="range"
        className="nh-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={item}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={(e) => commitOn.now(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commitOn.key(e.key, Number((e.target as HTMLInputElement).value))}
      />
      <div className="nh-slider__value">
        {value.toFixed(stepDecimals(step))}
        {unit ?? ''}
      </div>
    </div>
  )
}

/** Two buttons sending whatever this widget calls on and off - not always ON and OFF. */
export function SwitchControl({ item, ctx, on = 'ON', off = 'OFF' }: { item: string; ctx: WidgetContext; on?: string; off?: string }) {
  const { t } = useTranslation()
  const state = ctx.getItem(item)
  // Two ways to be on, because a switch widget can be bound to more than a Switch item. Either
  // the state IS the on command (numerically tolerant, so "100" matches a server's "100.0"), or
  // the item reads as on the way the switch widget itself reads it - a dimmer at 60 is on, even
  // though 60 is not the command this button sends.
  const currentlyOn = stateMatches(on, state?.state) || isOn(state)
  const send = (cmd: string) => {
    if (!ctx.editing) void ctx.sendCommand(item, cmd)
  }
  return (
    <div className="nh-quickbtns">
      <button type="button" className={'nh-btn' + (currentlyOn ? ' nh-btn--primary' : '')} onClick={() => send(on)}>
        {t('On')}
      </button>
      <button type="button" className={'nh-btn' + (!currentlyOn ? ' nh-btn--primary' : '')} onClick={() => send(off)}>
        {t('Off')}
      </button>
    </div>
  )
}

/**
 * A button per command: a rollershutter's up/stop/down, a player's transport, a selection's own
 * choices, an item's declared command options. The one currently in effect is highlighted.
 */
export function ChoiceControl({ item, ctx, choices }: { item: string; ctx: WidgetContext; choices: ItemChoice[] }) {
  const { t } = useTranslation()
  const state = ctx.getItem(item)?.state
  return (
    <div className="nh-quickbtns">
      {choices.map((choice, i) => (
        <button
          // The index too: a hand-written choice list can name the same command twice, and two
          // children with one key is a React warning and a render nobody can predict.
          key={i + '|' + choice.command}
          type="button"
          className={'nh-btn' + (stateMatches(choice.command, state) ? ' nh-btn--primary' : '')}
          onClick={() => {
            if (!ctx.editing) void ctx.sendCommand(item, choice.command)
          }}>
          {/* A key is our own vocabulary and is translated; a label came out of stored
              configuration and is shown exactly as it was written. */}
          {choice.labelKey ? t(choice.labelKey) : (choice.label ?? choice.command)}
        </button>
      ))}
    </div>
  )
}
