/**
 * Widget gallery: ready-made custom widgets you can install with one tap.
 *
 * The catalogue ships **inside the add-on** (`web/public/gallery/`), which is deliberate: it works
 * on a wall panel with no internet, needs no cross-origin permission, and does not depend on any
 * repository being reachable or public. An optional remote catalogue can be fetched on request -
 * only when the user asks, so an unreachable one is an answer rather than console noise.
 *
 * Why not the community forum directly: community.openhab.org answers browsers with
 * `Access-Control-Allow-Origin: https://www.openhab.org`, so a page served by openHAB cannot read
 * it at all (this is exactly why HABPanel needed a server-side proxy). Forum widgets are therefore
 * linked, never redistributed - their posts carry no licence we could honour.
 */
import type { CustomWidgetDef } from '../model/widgetdef'

/** Where the bundled catalogue lives, relative to the app (so it works under /neohab/ and in dev). */
const BUNDLED_INDEX = 'gallery/index.json'

/**
 * The published catalogue, used only when the user asks for it. Reachable once the repository is
 * public; until then this simply reports that it could not be loaded.
 */
export const REMOTE_INDEX = 'https://raw.githubusercontent.com/Fohdeesha/neohab/main/web/public/gallery/index.json'

export interface GalleryEntry {
  id: string
  name: string
  description?: string
  author?: string
  license?: string
  kind?: 'template' | 'js'
  /** Widget file, relative to the catalogue's own URL. */
  file: string
  /** Set for entries that came from a remote catalogue, so the UI can say where they are from. */
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
  const widgets = v.widgets.filter(
    (w) => w && typeof w.id === 'string' && typeof w.name === 'string' && typeof w.file === 'string'
  )
  return { formatVersion: 1, name: typeof v.name === 'string' ? v.name : undefined, widgets }
}

async function fetchIndex(url: string): Promise<GalleryIndex> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${res.status}`)
  const index = validIndex(await res.json())
  if (!index) throw new Error('unreadable catalogue')
  return index
}

/** The catalogue that ships with this add-on. */
export function loadBundledGallery(): Promise<GalleryIndex> {
  return fetchIndex(BUNDLED_INDEX)
}

/** A remote catalogue, its entries marked so the UI can distinguish them. */
export async function loadRemoteGallery(url: string = REMOTE_INDEX): Promise<GalleryIndex> {
  const index = await fetchIndex(url)
  return { ...index, widgets: index.widgets.map((w) => ({ ...w, remote: true })) }
}

/** Resolve an entry's `file` against the catalogue it came from. */
export function entryUrl(entry: GalleryEntry, indexUrl: string): string {
  return new URL(entry.file, new URL(indexUrl, window.location.href)).toString()
}

/**
 * Fetch and validate one gallery widget. The result is a widget definition ready to store; the id
 * always comes from the catalogue entry rather than the file, so a file cannot install itself
 * under a name the user did not see.
 */
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
    source: 'gallery',
  }
}
