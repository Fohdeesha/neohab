import { create } from 'zustand'
import type { Rect, WidgetInstance } from '../model/dashboard'
import { rectOf, sanitizeRect } from '../model/layout'
import { normaliseWidgetConfig } from '../model/normalise'
import { migrateConfig, SCHEMA_VERSIONS } from '../model/schema'

export interface ClipboardWidget {
  type: string
  config: Record<string, unknown>
  rect: Rect
}

const CLIP_KIND = 'neohab/widgets'
const CLIP_VERSION = 1
// far more than any dashboard holds, and each one is fitted into the layout on paste
const MAX_PASTE = 500

interface ClipboardPayload {
  app: 'neohab'
  kind: typeof CLIP_KIND
  version: number
  // the dashboard schema the widgets were written in; text from another tab can be an older build's
  schema?: number
  widgets: ClipboardWidget[]
}

interface ClipboardState {
  widgets: ClipboardWidget[]
}

export const useClipboardStore = create<ClipboardState>(() => ({ widgets: [] }))

const clone = <T>(v: T): T => structuredClone(v)

export function toClipboardWidget(widget: WidgetInstance): ClipboardWidget {
  return { type: widget.type, config: clone(widget.config), rect: { ...rectOf(widget) } }
}

export function serializeClipboard(widgets: ClipboardWidget[]): string {
  const payload: ClipboardPayload = { app: 'neohab', kind: CLIP_KIND, version: CLIP_VERSION, schema: SCHEMA_VERSIONS.dashboard, widgets }
  return JSON.stringify(payload)
}

export function parseClipboard(text: string): ClipboardWidget[] | null {
  if (!text || text.length > 5_000_000) return null
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const p = data as Partial<ClipboardPayload> | null
  if (!p || p.app !== 'neohab' || p.kind !== CLIP_KIND || !Array.isArray(p.widgets) || p.widgets.length > MAX_PASTE) return null
  const widgets: ClipboardWidget[] = []
  for (const w of p.widgets as unknown[]) {
    const cw = w as Partial<ClipboardWidget> | null
    if (!cw || typeof cw.type !== 'string' || !cw.config || typeof cw.config !== 'object' || Array.isArray(cw.config)) return null
    const r = cw.rect as Partial<Rect> | undefined
    if (!r || ![r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    widgets.push({ type: cw.type, config: cw.config as Record<string, unknown>, rect: r as Rect })
  }
  // the same migrations a stored dashboard goes through, so an older build's switch arrives as a button;
  // no schema means a build from before it was written down, which is where a stored dashboard starts too
  const migrated = migrateConfig('dashboard', { version: p.schema, widgets })
  if (migrated.status !== 'ok') return null
  return (migrated.config.widgets as ClipboardWidget[]).map((w) => ({
    type: w.type,
    config: normaliseWidgetConfig(w.config),
    rect: sanitizeRect(w.rect)
  }))
}

export function setInAppClipboard(widgets: ClipboardWidget[]): void {
  useClipboardStore.setState({ widgets: widgets.map(clone) })
}

export function setClipboard(widgets: ClipboardWidget[]): void {
  setInAppClipboard(widgets)
  try {
    void navigator.clipboard?.writeText(serializeClipboard(widgets)).catch(() => {})
  } catch {
    // clipboard API unavailable (insecure context / older browser)
  }
}

export function getClipboard(): ClipboardWidget[] {
  return useClipboardStore.getState().widgets
}
