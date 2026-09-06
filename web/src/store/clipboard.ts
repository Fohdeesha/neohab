/**
 * Widget clipboard.
 *
 * Copied widgets live in this in-app store so a copy survives switching between dashboards
 * within neohab (editing is a per-dashboard draft, so the clipboard must sit outside it). On
 * copy the payload is also mirrored to the OS clipboard as JSON, and paste reads whichever
 * source is available, so a widget can also be pasted into a separate browser tab or window.
 *
 * A ClipboardWidget is a widget stripped of its instance id and reduced to type + config +
 * grid rect; ids are minted fresh when it is pasted (see pasteWidgets).
 */
import { create } from 'zustand'
import type { Rect, WidgetInstance } from '../model/dashboard'
import { rectOf } from '../model/layout'

export interface ClipboardWidget {
  type: string
  config: Record<string, unknown>
  rect: Rect
}

/** Tags the OS-clipboard payload so paste ignores unrelated text. */
const CLIP_KIND = 'neohab/widgets'
const CLIP_VERSION = 1

interface ClipboardPayload {
  app: 'neohab'
  kind: typeof CLIP_KIND
  version: number
  widgets: ClipboardWidget[]
}

interface ClipboardState {
  widgets: ClipboardWidget[]
}

export const useClipboardStore = create<ClipboardState>(() => ({ widgets: [] }))

const clone = <T>(v: T): T => structuredClone(v)

/** Reduce a widget instance to a portable clipboard entry (drops the instance id). */
export function toClipboardWidget(widget: WidgetInstance): ClipboardWidget {
  return { type: widget.type, config: clone(widget.config), rect: { ...rectOf(widget) } }
}

/** Serialize widgets to the tagged JSON written to the OS clipboard. */
export function serializeClipboard(widgets: ClipboardWidget[]): string {
  const payload: ClipboardPayload = { app: 'neohab', kind: CLIP_KIND, version: CLIP_VERSION, widgets }
  return JSON.stringify(payload)
}

/** Parse tagged JSON produced by {@link serializeClipboard}; returns null for anything else. */
export function parseClipboard(text: string): ClipboardWidget[] | null {
  if (!text || text.length > 5_000_000) return null
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const p = data as Partial<ClipboardPayload> | null
  if (!p || p.app !== 'neohab' || p.kind !== CLIP_KIND || !Array.isArray(p.widgets)) return null
  const widgets: ClipboardWidget[] = []
  for (const w of p.widgets as unknown[]) {
    const cw = w as Partial<ClipboardWidget> | null
    // `typeof [] === 'object'`, so an array would otherwise pass as a config and be spread into
    // one, giving the pasted widget numeric keys and none of its settings.
    if (!cw || typeof cw.type !== 'string' || !cw.config || typeof cw.config !== 'object' || Array.isArray(cw.config)) return null
    const r = cw.rect as Partial<Rect> | undefined
    // Finite, not merely "a number": JSON has no NaN literal but `1e999` parses to Infinity, and
    // a non-finite size survives every comparison in findFreeSpot and is written to the server.
    if (!r || ![r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    widgets.push({ type: cw.type, config: cw.config as Record<string, unknown>, rect: r as Rect })
  }
  return widgets
}

/** Update only the in-app clipboard. Used by the native `copy`/`cut` events, which write the OS
 * clipboard themselves via the event's clipboardData (the reliable way inside those events). */
export function setInAppClipboard(widgets: ClipboardWidget[]): void {
  useClipboardStore.setState({ widgets: widgets.map(clone) })
}

/**
 * Copy widgets to the clipboard: stored in-app, and best-effort mirrored to the OS clipboard so
 * they can be pasted into another tab or window. The OS write may be blocked (no permission, not
 * focused) - that only forfeits cross-window paste; same-app paste always works from the store.
 * Call this from a real user gesture (button click); inside a `copy` event use clipboardData.
 */
export function setClipboard(widgets: ClipboardWidget[]): void {
  setInAppClipboard(widgets)
  try {
    void navigator.clipboard?.writeText(serializeClipboard(widgets)).catch(() => {})
  } catch {
    /* clipboard API unavailable (insecure context / older browser) */
  }
}

/** The in-app clipboard contents. */
export function getClipboard(): ClipboardWidget[] {
  return useClipboardStore.getState().widgets
}
