import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { holdTookGesture } from '../../components/useLongPress'
import type { WidgetContext } from '../types'
import { useKeyboardCommit } from '../common/useKeyboardCommit'
import { useLiveCommand } from '../common/useLiveCommand'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { parseHsb, sameColor, type Hsb } from '../../model/color'
import { STEADY_MS } from '../../model/steady'
import { lastLitBrightness, noteBrightness } from '../../store/lastLit'
import { useDragEndedAt, useIsDragging } from '../../store/dragging'
import { ColorSliders } from './ColorSliders'

const hsbCommand = (v: Hsb) => `${Math.round(v.h) % 360},${Math.round(v.s)},${Math.round(v.b)}`

export function ColorControl({
  item,
  ctx,
  power = false,
  config
}: {
  item: string
  ctx: WidgetContext
  power?: boolean
  config?: { liveDrag?: unknown }
}) {
  const { t } = useTranslation()
  const state = ctx.getItem(item)
  const [draft, setDraft] = useState<Hsb | null>(null)
  const optimistic = useOptimisticValue(parseHsb(state?.state), state?.state ?? '', sameColor, { item })
  const hsb = draft ?? optimistic.display

  // the brightness On brings back is the last one the lamp was seen lit at. A drag passes through every
  // level on the way, and the device is still echoing for a moment after it ends, so neither counts.
  const dragging = useIsDragging(item)
  const endedAt = useDragEndedAt(item)
  const liveB = parseHsb(state?.state).b
  useEffect(() => {
    if (!state?.state || dragging) return
    const wait = (endedAt ?? 0) + STEADY_MS - Date.now()
    if (wait <= 0) {
      noteBrightness(item, liveB)
      return
    }
    const timer = setTimeout(() => noteBrightness(item, liveB), wait)
    return () => clearTimeout(timer)
  }, [item, liveB, state?.state, dragging, endedAt])

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
  const live = useLiveCommand<Hsb>({
    item,
    config,
    editing: ctx.editing,
    command: hsbCommand,
    send: (v) => ctx.sendCommand(item, hsbCommand(v)),
    onSend: optimistic.commit,
    onRefused: optimistic.cancel
  })

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
      onInput={(next) => {
        setDraft(next)
        live.stage(next)
      }}
      onCommit={(next) => {
        if (live.end(next)) setDraft(null)
        else commitOn.now(next)
      }}
      onKeyCommit={commitOn.key}
      onPointerDown={live.begin}
      onPointerMove={live.moved}
      onPointerCancel={() => {
        live.cancel()
        setDraft(null)
      }}
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
