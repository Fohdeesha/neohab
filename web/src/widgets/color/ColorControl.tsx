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
  const optimistic = useOptimisticValue(parseHsb(state?.state), state?.state ?? '', sameColor)
  const hsb = draft ?? optimistic.display

  const liveB = parseHsb(state?.state).b
  useEffect(() => {
    if (state?.state) noteBrightness(item, liveB)
  }, [item, liveB, state?.state])

  const hsbCommand = (v: Hsb) => `${Math.round(v.h) % 360},${Math.round(v.s)},${Math.round(v.b)}`

  const send = (next: Hsb, command: string) => {
    optimistic.commit(next)
    void ctx.sendCommand(item, command).then((accepted) => !accepted && optimistic.cancel(next))
  }

  const commit = (next: Hsb) => {
    setDraft(null)
    if (holdTookGesture()) return
    if (!ctx.editing) send(next, hsbCommand(next))
    else optimistic.commit(next)
  }
  const commitOn = useKeyboardCommit(commit)

  const off = Math.round(hsb.b) === 0

  const press = (wanted: 'on' | 'off') => {
    if (ctx.editing || holdTookGesture()) return
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
