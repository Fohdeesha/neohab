import type { CustomWidgetDef } from '../model/widgetdef'

const BUNDLED_INDEX = 'gallery/index.json'

export const REMOTE_INDEX = 'https://raw.githubusercontent.com/Fohdeesha/neohab/main/web/public/gallery/index.json'

export interface GalleryEntry {
  id: string
  name: string
  description?: string
  author?: string
  license?: string
  kind?: 'template' | 'js'
  file: string
  remote?: boolean
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

export async function loadRemoteGallery(url: string = REMOTE_INDEX): Promise<GalleryIndex> {
  const index = await fetchIndex(url)
  return { ...index, widgets: index.widgets.map((w) => ({ ...w, remote: true })) }
}

export function entryUrl(entry: GalleryEntry, indexUrl: string): string {
  return new URL(entry.file, new URL(indexUrl, window.location.href)).toString()
}

export async function loadGalleryWidget(entry: GalleryEntry, indexUrl: string): Promise<CustomWidgetDef> {
  const res = await fetch(entryUrl(entry, indexUrl), { cache: 'no-cache' })
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
