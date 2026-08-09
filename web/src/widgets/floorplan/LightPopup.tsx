/**
 * Tap-a-light popup: the control for one light, over the plan. A Color item gets the exact
 * same picker as the color widget; dimmers a slider; switches two plain buttons. The room
 * follows live - this IS controlling the light, the same as any widget would.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetContext } from '../types'
import { ColorControl } from '../color/ColorControl'
import { numericValue } from '../common/format'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { stateKind, type FloorplanLight } from './model'

export function LightPopup({
  light,
  ctx,
  onClose,
}: {
  light: FloorplanLight
  ctx: WidgetContext
  onClose: () => void
}) {
  const { t } = useTranslation()
  const state = ctx.getItem(light.item)
  const kind = stateKind(state?.state)

  return (
    // The scrim closes on click, not pointerdown, so it stays under the pointer for the whole
    // gesture and nothing beneath it sees any part of the dismissing tap.
    <div className="nh-fplan__scrim" onClick={onClose}>
      <div className="nh-fplan__popup" role="dialog" aria-label={light.label ?? light.item} onClick={(e) => e.stopPropagation()}>
        <div className="nh-fplan__popuphead">
          <span className="nh-fplan__popupname">{light.label ?? light.item}</span>
          <button type="button" className="nh-iconbtn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </div>
        {kind === 'color' ? (
          <ColorControl item={light.item} ctx={ctx} />
        ) : kind === 'level' ? (
          <DimmerControl item={light.item} ctx={ctx} />
        ) : kind === 'onoff' ? (
          <SwitchControl item={light.item} ctx={ctx} />
        ) : (
          <p className="nh-fplan__popupstate">{state?.displayState ?? state?.state ?? t('No state yet')}</p>
        )}
      </div>
    </div>
  )
}

/** Same drag/commit/optimistic behaviour as the slider widget, sized for a popup. */
function DimmerControl({ item, ctx }: { item: string; ctx: WidgetContext }) {
  const state = ctx.getItem(item)
  const [drag, setDrag] = useState<number | null>(null)
  const itemValue = numericValue(state) ?? 0
  const optimistic = useOptimisticValue(itemValue, (live, sent) => Math.abs(live - sent) <= 1)
  const value = drag ?? optimistic.display

  const commit = (v: number) => {
    setDrag(null)
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
        min={0}
        max={100}
        step={1}
        value={value}
        aria-label={item}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={(e) => commitOn.now(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commitOn.key(e.key, Number((e.target as HTMLInputElement).value))}
      />
      <div className="nh-slider__value">{Math.round(value)}</div>
    </div>
  )
}

function SwitchControl({ item, ctx }: { item: string; ctx: WidgetContext }) {
  const { t } = useTranslation()
  const on = ctx.getItem(item)?.state === 'ON'
  const send = (cmd: 'ON' | 'OFF') => {
    if (!ctx.editing) void ctx.sendCommand(item, cmd)
  }
  return (
    <div className="nh-fplan__onoff">
      <button type="button" className={'nh-btn' + (on ? ' nh-btn--primary' : '')} onClick={() => send('ON')}>
        {t('On')}
      </button>
      <button type="button" className={'nh-btn' + (!on ? ' nh-btn--primary' : '')} onClick={() => send('OFF')}>
        {t('Off')}
      </button>
    </div>
  )
}
