export const HISTORY_VERSION = 1

export const INDEX_UID = 'index'
export const SNAPSHOT_PREFIX = 'snap:'
export const BLOB_PREFIX = 'blob:'

export const INDEX_COMPONENT = 'neohab:historyindex'
export const SNAPSHOT_COMPONENT = 'neohab:snapshot'
export const BLOB_COMPONENT = 'neohab:historyblob'

export const DEFAULT_HISTORY_LIMIT = 25
export const MAX_HISTORY_LIMIT = 200
export const DEFAULT_HISTORY_WINDOW_MIN = 5
export const MAX_HISTORY_WINDOW_MIN = 1440

export const SUMMARY_NAMES = 3

export interface SnapshotEntry {
  uid: string
  component: string
  config: Record<string, unknown>
  tags?: string[]
  blobHash?: string
}

export interface ChangeSummary {
  count: number
  names: string[]
}

export interface SnapshotMeta {
  id: string
  createdAt: string
  label?: string
  summary: ChangeSummary
  entries: number
  blobs?: string[]
}

export interface Snapshot extends SnapshotMeta {
  version: number
  entries: number
  components: SnapshotEntry[]
}

export interface HistoryIndex {
  version: number
  snapshots: SnapshotMeta[]
  blobs: string[]
}

export const emptyIndex = (): HistoryIndex => ({ version: HISTORY_VERSION, snapshots: [], blobs: [] })

export interface StoredBlob {
  version: number
  hash: string
  dataUri: string
  bytes: number
}

export interface RawComponent {
  uid: string
  component: string
  config?: Record<string, unknown>
  tags?: string[]
  [k: string]: unknown
}

export function blobBody(config: Record<string, unknown>): string | null {
  const uri = config.dataUri
  return typeof uri === 'string' && uri.length > 0 ? uri : null
}

export function toEntry(c: RawComponent): SnapshotEntry {
  const entry: SnapshotEntry = {
    uid: c.uid,
    component: c.component,
    config: (c.config ?? {}) as Record<string, unknown>
  }
  if (Array.isArray(c.tags) && c.tags.length > 0) entry.tags = c.tags
  return entry
}

export function extractBlob(entry: SnapshotEntry): string | null {
  const body = blobBody(entry.config)
  if (body === null) return null
  const config = { ...entry.config }
  delete config.dataUri
  entry.config = config
  return body
}

export function withBlob(entry: SnapshotEntry, dataUri: string): SnapshotEntry {
  return { ...entry, config: { ...entry.config, dataUri }, blobHash: undefined }
}

export function entryName(entry: SnapshotEntry): string {
  const c = entry.config
  const name = c.name
  if (typeof name === 'string' && name.trim()) return name
  const id = c.id
  if (typeof id === 'string' && id.trim()) return id
  return entry.uid
}

export function entryCategory(uid: string): string {
  const colon = uid.indexOf(':')
  return colon > 0 ? uid.slice(0, colon) : uid
}

export function historyEnabled(limit: number): boolean {
  return limit > 0
}

export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT
  return Math.max(0, Math.min(MAX_HISTORY_LIMIT, Math.round(value)))
}

export function clampWindow(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_WINDOW_MIN
  return Math.max(0, Math.min(MAX_HISTORY_WINDOW_MIN, Math.round(value)))
}

export function shouldCapture(opts: {
  limit: number
  windowMin: number
  lastWriteAt: number | null
  haveSnapshots: boolean
  now: number
}): boolean {
  if (!historyEnabled(opts.limit)) return false
  if (!opts.haveSnapshots) return true
  if (opts.lastWriteAt === null) return true
  return opts.now - opts.lastWriteAt >= opts.windowMin * 60_000
}

export function applyRetention(snapshots: SnapshotMeta[], limit: number): { keep: SnapshotMeta[]; drop: SnapshotMeta[] } {
  if (limit <= 0) return { keep: [], drop: snapshots }
  return { keep: snapshots.slice(0, limit), drop: snapshots.slice(limit) }
}

export function mergeIndexes(mine: HistoryIndex, theirs: HistoryIndex): HistoryIndex {
  const snapshots = new Map<string, SnapshotMeta>()
  for (const meta of theirs?.snapshots ?? []) if (meta?.id) snapshots.set(meta.id, meta)
  for (const meta of mine?.snapshots ?? []) if (meta?.id) snapshots.set(meta.id, meta)
  return {
    version: HISTORY_VERSION,
    snapshots: [...snapshots.values()].sort((a, b) => Number(b.id) - Number(a.id) || b.id.localeCompare(a.id)),
    blobs: [...new Set([...(mine?.blobs ?? []), ...(theirs?.blobs ?? [])])]
  }
}

export function unusedBlobs(index: HistoryIndex): string[] {
  const referenced = new Set<string>()
  for (const s of index.snapshots) for (const h of s.blobs ?? []) referenced.add(h)
  return index.blobs.filter((h) => !referenced.has(h))
}
