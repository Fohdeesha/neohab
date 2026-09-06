/**
 * Configuration version history: the stored shapes.
 *
 * A snapshot is a complete copy of the `neohab:config` namespace at one moment, kept in its own
 * `neohab:history` namespace so it never bloats the configuration file openHAB rewrites on every
 * save, never travels inside a backup export, and survives an import that replaces everything.
 *
 * Snapshots are taken *before* a change, so the newest one is the state you had just before the
 * most recent editing session - which is what "put it back" means. Nothing here duplicates the
 * live configuration: that is already on the server.
 *
 * Uploaded images (icons, backgrounds - up to megabytes each) are not copied into every snapshot.
 * Their bodies are stored once under `blob:<sha256>` and referenced by hash, so twenty-five
 * snapshots of a configuration with one 5 MB background cost about 5 MB, not 125.
 */

export const HISTORY_VERSION = 1

export const INDEX_UID = 'index'
export const SNAPSHOT_PREFIX = 'snap:'
export const BLOB_PREFIX = 'blob:'

export const INDEX_COMPONENT = 'neohab:historyindex'
export const SNAPSHOT_COMPONENT = 'neohab:snapshot'
export const BLOB_COMPONENT = 'neohab:historyblob'

/** Snapshots kept when the user has not chosen otherwise. */
export const DEFAULT_HISTORY_LIMIT = 25
export const MAX_HISTORY_LIMIT = 200
/** Minutes of quiet before the next configuration write starts a new restore point. */
export const DEFAULT_HISTORY_WINDOW_MIN = 5
export const MAX_HISTORY_WINDOW_MIN = 1440

/** Names listed on a history row before it collapses into "and N more". */
export const SUMMARY_NAMES = 3

/**
 * One component as captured in a snapshot: the parts that are ours. `props` and `timestamp` are
 * added by openHAB on every read and would otherwise show up as differences on every comparison.
 */
export interface SnapshotEntry {
  uid: string
  component: string
  config: Record<string, unknown>
  tags?: string[]
  /**
   * Set when the component carried an image body (`config.dataUri`). The body lives in
   * `blob:<hash>` and `config` here holds everything except it.
   */
  blobHash?: string
}

/** What changed to arrive at a snapshot, as shown on its row in the list. */
export interface ChangeSummary {
  /** Components added, changed or removed. 0 for the very first snapshot. */
  count: number
  /** Up to SUMMARY_NAMES display names, for the row's second line. */
  names: string[]
}

/** A snapshot as listed: everything the list needs, without loading the configuration itself. */
export interface SnapshotMeta {
  id: string
  /** ISO timestamp from the device that captured it (openHAB's own is not a parseable format). */
  createdAt: string
  /** User-typed name, shown instead of the date when present. */
  label?: string
  summary: ChangeSummary
  /** Number of components in the snapshot. */
  entries: number
  /** Image hashes this snapshot references, so unused blobs can be collected from the index alone. */
  blobs?: string[]
}

export interface Snapshot extends SnapshotMeta {
  version: number
  entries: number
  components: SnapshotEntry[]
}

/**
 * The one component every read starts from. Listing the namespace instead would download every
 * stored image body along with it, so the index carries all the list needs and nothing else.
 */
export interface HistoryIndex {
  version: number
  /** Newest first. */
  snapshots: SnapshotMeta[]
  /** Every blob hash currently stored, so collection needs no listing either. */
  blobs: string[]
}

export const emptyIndex = (): HistoryIndex => ({ version: HISTORY_VERSION, snapshots: [], blobs: [] })

export interface StoredBlob {
  version: number
  hash: string
  dataUri: string
  bytes: number
}

/* --------------------------------- capture helpers --------------------------------- */

/** A component as it comes back from openHAB, before the server's own fields are dropped. */
export interface RawComponent {
  uid: string
  component: string
  config?: Record<string, unknown>
  tags?: string[]
  [k: string]: unknown
}

/** The image body a component carries, if any. */
export function blobBody(config: Record<string, unknown>): string | null {
  const uri = config.dataUri
  return typeof uri === 'string' && uri.length > 0 ? uri : null
}

/**
 * Strip a component down to what is ours to version. openHAB adds `props` and a `timestamp` on
 * every read; keeping them would make every component look changed whenever it was rewritten.
 */
export function toEntry(c: RawComponent): SnapshotEntry {
  const entry: SnapshotEntry = {
    uid: c.uid,
    component: c.component,
    config: (c.config ?? {}) as Record<string, unknown>
  }
  if (Array.isArray(c.tags) && c.tags.length > 0) entry.tags = c.tags
  return entry
}

/** Split an entry's image body out for hash-shared storage. Returns the body, or null. */
export function extractBlob(entry: SnapshotEntry): string | null {
  const body = blobBody(entry.config)
  if (body === null) return null
  const config = { ...entry.config }
  delete config.dataUri
  entry.config = config
  return body
}

/** Put a hash-shared image body back on an entry, ready to write to the configuration. */
export function withBlob(entry: SnapshotEntry, dataUri: string): SnapshotEntry {
  return { ...entry, config: { ...entry.config, dataUri }, blobHash: undefined }
}

/* ---------------------------------- naming / sizing ---------------------------------- */

/** Human name for a component, for change lists and history rows. */
export function entryName(entry: SnapshotEntry): string {
  const c = entry.config
  const name = c.name
  if (typeof name === 'string' && name.trim()) return name
  const id = c.id
  if (typeof id === 'string' && id.trim()) return id
  return entry.uid
}

/** Broad kind of a component, from its uid prefix - used for grouping and icons in the UI. */
export function entryCategory(uid: string): string {
  const colon = uid.indexOf(':')
  return colon > 0 ? uid.slice(0, colon) : uid
}

/** Whether a limit value turns history off entirely. */
export function historyEnabled(limit: number): boolean {
  return limit > 0
}

/** Clamp a user-entered retention count to something storable. */
export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_LIMIT
  return Math.max(0, Math.min(MAX_HISTORY_LIMIT, Math.round(value)))
}

/** Clamp a user-entered coalescing window (minutes). */
export function clampWindow(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_WINDOW_MIN
  return Math.max(0, Math.min(MAX_HISTORY_WINDOW_MIN, Math.round(value)))
}

/**
 * Whether a configuration write should start a new restore point.
 *
 * A restore point marks the state before an editing session, so writes that follow one another
 * closely belong to the same point: only a gap longer than the window starts a new one. That way
 * an afternoon of tweaking leaves one entry to go back to rather than consuming the whole list.
 */
export function shouldCapture(opts: {
  limit: number
  windowMin: number
  /** When this device last saw a configuration write, or null if it has not seen one. */
  lastWriteAt: number | null
  /** Whether any snapshot exists yet. */
  haveSnapshots: boolean
  now: number
}): boolean {
  if (!historyEnabled(opts.limit)) return false
  if (!opts.haveSnapshots) return true
  if (opts.lastWriteAt === null) return true
  return opts.now - opts.lastWriteAt >= opts.windowMin * 60_000
}

/**
 * Retention: keep the newest `limit`, and report which snapshot ids fall off so their components
 * can be deleted. The list is newest-first.
 */
export function applyRetention(snapshots: SnapshotMeta[], limit: number): { keep: SnapshotMeta[]; drop: SnapshotMeta[] } {
  if (limit <= 0) return { keep: [], drop: snapshots }
  return { keep: snapshots.slice(0, limit), drop: snapshots.slice(limit) }
}

/** Blob hashes no remaining snapshot references, so they can be deleted. */
/**
 * Two views of the history, reconciled.
 *
 * A capture reads the index, writes its `snap:` component, then writes the index back. Anything
 * another writer added in between - a second tab, a second save whose capture overlapped - was
 * computed from the same stale read, so the later write dropped the earlier one's row while its
 * component stayed on the server named by nothing. Retention only prunes what the index lists, so
 * the orphan was never reclaimed; three of them were found on the live server.
 *
 * Ours wins on a tie because our copy is the one we just built. Newest first, which is the order
 * retention and the UI both assume.
 */
export function mergeIndexes(mine: HistoryIndex, theirs: HistoryIndex): HistoryIndex {
  const snapshots = new Map<string, SnapshotMeta>()
  for (const meta of theirs?.snapshots ?? []) if (meta?.id) snapshots.set(meta.id, meta)
  for (const meta of mine?.snapshots ?? []) if (meta?.id) snapshots.set(meta.id, meta)
  return {
    version: HISTORY_VERSION,
    // Ids are `String(Date.now())`, so a numeric sort is chronological. Falls back to comparing
    // as text for anything that is not a number, which keeps the order stable either way.
    snapshots: [...snapshots.values()].sort((a, b) => Number(b.id) - Number(a.id) || b.id.localeCompare(a.id)),
    blobs: [...new Set([...(mine?.blobs ?? []), ...(theirs?.blobs ?? [])])]
  }
}

export function unusedBlobs(index: HistoryIndex): string[] {
  const referenced = new Set<string>()
  for (const s of index.snapshots) for (const h of s.blobs ?? []) referenced.add(h)
  return index.blobs.filter((h) => !referenced.has(h))
}
