import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { holdTookGesture } from '../../components/useLongPress'
import type { WidgetContext } from '../types'
import { isOn, numericValue } from './format'
import { stepDecimals, type ItemChoice } from './itemControl'
import { stateMatches } from './stateIcon'
import { useKeyboardCommit } from './useKeyboardCommit'
import { useLiveCommand } from './useLiveCommand'
import { useOptimisticValue } from './useOptimisticValue'

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
  const optimistic = useOptimisticValue(itemValue, itemValue, (live, sent) => Math.abs(live - sent) <= Math.max(1, step), { item })
  const value = drag ?? optimistic.display

  const commit = (v: number) => {
    setDrag(null)
    if (holdTookGesture()) return
    optimistic.commit(v)
    if (!ctx.editing) {
      void ctx.sendCommand(item, String(v)).then((accepted) => !accepted && optimistic.cancel(v))
    }
  }
  const commitOn = useKeyboardCommit(commit)
  // no config of its own, so this one follows the shared setting
  const live = useLiveCommand<number>({
    item,
    editing: ctx.editing,
    command: String,
    send: (v) => ctx.sendCommand(item, String(v)),
    onSend: optimistic.commit,
    onRefused: optimistic.cancel
  })
  const release = (v: number) => {
    if (live.end(v)) setDrag(null)
    else commitOn.now(v)
  }

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
      <div className="nh-slider__value">
        {value.toFixed(stepDecimals(step))}
        {unit ?? ''}
      </div>
    </div>
  )
}

export function SwitchControl({ item, ctx, on = 'ON', off = 'OFF' }: { item: string; ctx: WidgetContext; on?: string; off?: string }) {
  const { t } = useTranslation()
  const state = ctx.getItem(item)
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

export function ChoiceControl({ item, ctx, choices }: { item: string; ctx: WidgetContext; choices: ItemChoice[] }) {
  const { t } = useTranslation()
  const state = ctx.getItem(item)?.state
  return (
    <div className="nh-quickbtns">
      {choices.map((choice, i) => (
        <button
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
