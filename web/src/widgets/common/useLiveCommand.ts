import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { LiveCommand, liveDragOn } from '../../model/liveCommand'
import { cancelActiveHold, holdTookGesture } from '../../components/useLongPress'
import { markDragging, unmarkDragging } from '../../store/dragging'
import { useConfigStore } from '../../store/config'

export interface LiveCommandOptions<T> {
  item: string
  // the widget's own setting, where it has one; a control with no config of its own follows the shared one
  config?: { liveDrag?: unknown }
  editing?: boolean
  command: (v: T) => string
  send: (v: T) => Promise<boolean>
  onSend?: (v: T) => void
  onRefused?: (v: T) => void
}

export interface LiveCommandHandlers<T> {
  begin: (e: ReactPointerEvent) => void
  moved: (e: ReactPointerEvent) => void
  stage: (v: T) => void
  // true when the press was live: the release value is sent from here, so the caller must not send again
  end: (v: T) => boolean
  cancel: () => void
}

// The one place that decides WHEN a dragging control sends, as useOptimisticValue is the one place that
// decides what it shows. The model does the arming and the throttling; this wires it to the hold, the
// settings and the dragging store.
export function useLiveCommand<T>(opts: LiveCommandOptions<T>): LiveCommandHandlers<T> {
  const sharedOn = useConfigStore((s) => s.settings.liveDrag !== false)
  const enabled = !opts.editing && liveDragOn(opts.config, { liveDrag: sharedOn })
  const latest = useRef({ opts, enabled })
  latest.current = { opts, enabled }

  const model = useRef<LiveCommand<T> | null>(null)
  model.current ??= new LiveCommand<T>(() => {
    const o = latest.current.opts
    return {
      command: o.command,
      send: o.send,
      onSend: o.onSend,
      onRefused: o.onRefused,
      onArm: () => markDragging(o.item),
      onRelease: () => unmarkDragging(o.item),
      holdTaken: holdTookGesture,
      cancelHold: cancelActiveHold
    }
  })
  const m = model.current
  useEffect(() => () => m.cancel(), [m])

  return {
    begin: (e) => {
      if (!latest.current.enabled) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      m.begin(e.clientX, e.clientY)
    },
    moved: (e) => m.moved(e.clientX, e.clientY),
    stage: (v) => {
      m.stage(v)
      if (m.isLive) markDragging(latest.current.opts.item)
    },
    end: (v) => m.end(v),
    cancel: () => m.cancel()
  }
}
