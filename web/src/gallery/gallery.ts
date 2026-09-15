import type { CustomWidgetDef } from '../model/widgetdef'

// the catalogue ships in the add-on and is deliberately the only source: a widget carries a template or a
// script that the app then runs, so fetching one from anywhere but this jar would be running code from a
// server the user doesn't control
const BUNDLED_INDEX = 'gallery/index.json'

export interface GalleryEntry {
  id: string
  name: string
  description?: string
  author?: string
  license?: string
  kind?: 'template' | 'js'
  file: string
}

export interface GalleryIndex {
  formatVersion: number
  name?: string
  widgets: GalleryEntry[]
}

function validIndex(value: unknown): GalleryIndex | null {
  const v = value as GalleryIndex | null
  if (!v || typeof v !== 'object' || !Array.isArray(v.widgets)) return null
  if (v.formatVersion !== 1) return null
  const widgets = v.widgets.filter((w) => w && typeof w.id === 'string' && typeof w.name === 'string' && typeof w.file === 'string')
  return { formatVersion: 1, name: typeof v.name === 'string' ? v.name : undefined, widgets }
}

async function fetchIndex(url: string): Promise<GalleryIndex> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${res.status}`)
  const index = validIndex(await res.json())
  if (!index) throw new Error('unreadable catalogue')
  return index
}

export function loadBundledGallery(): Promise<GalleryIndex> {
  return fetchIndex(BUNDLED_INDEX)
}

export function entryUrl(entry: GalleryEntry): string {
  return new URL(entry.file, new URL(BUNDLED_INDEX, window.location.href)).toString()
}

export async function loadGalleryWidget(entry: GalleryEntry): Promise<CustomWidgetDef> {
  const res = await fetch(entryUrl(entry), { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${res.status}`)
  const raw = (await res.json()) as Partial<CustomWidgetDef>
  const kind = raw.kind === 'js' ? 'js' : 'template'
  if (kind === 'template' && typeof raw.template !== 'string') throw new Error('no template')
  if (kind === 'js' && typeof raw.script !== 'string') throw new Error('no script')
  return {
    version: 1,
    id: entry.id,
    name: entry.name || raw.name || entry.id,
    kind,
    template: kind === 'template' ? raw.template : undefined,
    script: kind === 'js' ? raw.script : undefined,
    settings: Array.isArray(raw.settings) ? raw.settings : [],
    source: 'gallery'
  }
}
