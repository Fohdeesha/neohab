/**
 * Configuration version history.
 *
 * A snapshot is taken *before* a configuration write, so what the list offers is the state you
 * had just before an editing session - which is what going back means. Writes that follow one
 * another closely belong to the same session and reuse the point already taken, so an afternoon
 * of tweaking leaves one entry to return to instead of consuming the whole list.
 *
 * Storage is split across two namespaces of its own (see api/history.ts for why): `neohab:history`
 * holds the `index` alone - everything the list needs - and `neohab:historydata` holds `snap:<id>`,
 * the configuration itself, and `blob:<sha256>`, the uploaded images shared between every snapshot
 * that contains them.
 */
import { create } from 'zustand'
import { addComponent, deleteComponent, listComponents, updateComponent } from '../api/components'
import {
  deleteDataComponent,
  deleteIndexComponent,
  getDataComponent,
  listDataComponents,
  listIndexComponents,
  putDataComponent,
  putIndexComponent,
} from '../api/history'
import { sha256 } from '../api/sha256'
import type { UIComponent } from '../api/types'
import { diffEntries } from '../history/diff'
import i18n from '../i18n'
import {
  applyRetention,
  BLOB_COMPONENT,
  BLOB_PREFIX,
  clampLimit,
  clampWindow,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_WINDOW_MIN,
  emptyIndex,
  extractBlob,
  historyEnabled,
  HISTORY_VERSION,
  INDEX_COMPONENT,
  INDEX_UID,
  SNAPSHOT_COMPONENT,
  SNAPSHOT_PREFIX,
  SUMMARY_NAMES,
  shouldCapture,
  toEntry,
  unusedBlobs,
  withBlob,
  type HistoryIndex,
  type RawComponent,
  type Snapshot,
  type SnapshotEntry,
  type SnapshotMeta,
  type StoredBlob,
} from '../model/history'
import { loadConfig, onBeforeConfigWrite, useConfigStore } from './config'
import { notify } from './notify'

interface HistoryState {
  index: HistoryIndex | null
  /**
   * Whether the index component is on the server. Holding an index in memory is not the same
   * thing - it may never have been written, or have just been deleted - and updating a component
   * that is not there answers 404, which the browser logs as an error whether or not the code
   * expected it. Same reasoning as the configuration store's `serverUids`.
   */
  indexStored: boolean
  loading: boolean
  /** A capture or restore is in flight. */
  busy: boolean
  error: string | null
}

export const useHistoryStore = create<HistoryState>(() => ({
  index: null,
  indexStored: false,
  loading: false,
  busy: false,
  error: null,
}))

/** Write the index, then remember that it exists so the next write updates rather than probes. */
async function writeIndex(index: HistoryIndex): Promise<void> {
  await putIndexComponent(indexComponent(index), useHistoryStore.getState().indexStored)
  useHistoryStore.setState({ index, indexStored: true })
}

/** When this device last saw a configuration write, shared across its tabs. */
const LAST_WRITE_KEY = 'neohab:lastConfigWrite'

function lastWriteAt(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_WRITE_KEY)
    const n = raw === null ? NaN : Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function markWrite(): void {
  try {
    window.localStorage.setItem(LAST_WRITE_KEY, String(Date.now()))
  } catch {
    /* private mode - the only cost is an extra restore point after a reload */
  }
}

/* ------------------------------------- hashing ------------------------------------- */

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * SHA-256 of a string. `crypto.subtle` exists only in a secure context, and an openHAB served
 * over plain HTTP on a LAN is not one, so the bundled implementation carries those installs.
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const subtle = globalThis.crypto?.subtle
  if (subtle) return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)))
  return toHex(sha256(bytes))
}

/* ---------------------------------- reading history ---------------------------------- */

const indexComponent = (index: HistoryIndex): UIComponent<HistoryIndex> => ({
  uid: INDEX_UID,
  component: INDEX_COMPONENT,
  config: index,
})

/** Snapshots already fetched, so switching between comparisons does not refetch them. */
const snapshotCache = new Map<string, Snapshot>()
const CACHE_MAX = 6

function cacheSnapshot(snapshot: Snapshot): Snapshot {
  snapshotCache.set(snapshot.id, snapshot)
  while (snapshotCache.size > CACHE_MAX) {
    const oldest = snapshotCache.keys().next().value
    if (oldest === undefined) break
    snapshotCache.delete(oldest)
  }
  return snapshot
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const cached = snapshotCache.get(id)
  if (cached) return cached
  const component = await getDataComponent<Snapshot>(SNAPSHOT_PREFIX + id)
  if (!component) return null
  return cacheSnapshot(component.config)
}

/**
 * Rebuild the index from the stored snapshots. Only reached when the index is missing - normally
 * because nothing has ever been captured, occasionally because a write was interrupted or two
 * administrators captured at the same moment and one index write lost the race. Listing pulls
 * every stored image with it, which is exactly why the index exists and this stays a repair path.
 */
async function rebuildIndex(): Promise<HistoryIndex> {
  const all = (await listDataComponents()) as unknown as RawComponent[]
  const snapshots: Snapshot[] = []
  const blobs: string[] = []
  for (const c of all) {
    if (c.uid.startsWith(SNAPSHOT_PREFIX) && c.config) snapshots.push(c.config as unknown as Snapshot)
    else if (c.uid.startsWith(BLOB_PREFIX)) blobs.push(c.uid.slice(BLOB_PREFIX.length))
  }
  snapshots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  for (const s of snapshots) cacheSnapshot(s)

  // Summaries describe the step that produced each snapshot, so each is compared with the one
  // before it; the oldest has nothing before it and is the starting point.
  const metas: SnapshotMeta[] = snapshots.map((s, i) => {
    const older = snapshots[i + 1]
    const rows = older ? diffEntries(older.components ?? [], s.components ?? []) : []
    return {
      id: s.id,
      createdAt: s.createdAt,
      label: s.label,
      summary: { count: rows.length, names: rows.slice(0, SUMMARY_NAMES).map((r) => r.name) },
      entries: (s.components ?? []).length,
      blobs: blobHashesOf(s.components ?? []),
    }
  })
  const index: HistoryIndex = { version: HISTORY_VERSION, snapshots: metas, blobs }
  if (metas.length > 0 || blobs.length > 0) {
    // Best effort: a viewer without admin rights can still read a rebuilt index in memory.
    try {
      await putIndexComponent(indexComponent(index), false)
      useHistoryStore.setState({ indexStored: true })
    } catch {
      /* not signed in - the next capture writes it */
    }
  }
  return index
}

const blobHashesOf = (entries: SnapshotEntry[]): string[] => [
  ...new Set(entries.map((e) => e.blobHash).filter((h): h is string => typeof h === 'string')),
]

/**
 * The stored index, or null when there is none. Listing rather than fetching `index` by uid is
 * deliberate: the index namespace holds only this one component, so a listing is as cheap as a
 * fetch, and it answers "not there yet" with an empty list instead of a 404 the browser would
 * log as an error on every fresh install.
 */
async function readStoredIndex(): Promise<HistoryIndex | null> {
  const components = await listIndexComponents()
  const found = components.find((c) => c.uid === INDEX_UID)
  const config = found?.config as unknown as HistoryIndex | undefined
  if (!(config && Array.isArray(config.snapshots))) return null
  useHistoryStore.setState({ indexStored: true })
  return { ...emptyIndex(), ...config }
}

async function readIndex(): Promise<HistoryIndex> {
  return (await readStoredIndex()) ?? (await rebuildIndex())
}

export async function loadHistory(): Promise<void> {
  useHistoryStore.setState({ loading: true, error: null })
  try {
    const index = await readIndex()
    useHistoryStore.setState({ index, loading: false })
  } catch (err) {
    useHistoryStore.setState({
      index: emptyIndex(),
      loading: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/* ------------------------------------ capturing ------------------------------------ */

function historyLimits(): { limit: number; windowMin: number } {
  const s = useConfigStore.getState().settings
  return {
    limit: clampLimit(s.historyLimit ?? DEFAULT_HISTORY_LIMIT),
    windowMin: clampWindow(s.historyWindowMin ?? DEFAULT_HISTORY_WINDOW_MIN),
  }
}

/** The current configuration, in the shape a snapshot stores, with image bodies split out. */
async function captureEntries(): Promise<{ entries: SnapshotEntry[]; bodies: Map<string, string> }> {
  const raw = (await listComponents()) as unknown as RawComponent[]
  const entries = raw.map(toEntry)
  const bodies = new Map<string, string>()
  for (const entry of entries) {
    const body = extractBlob(entry)
    if (body === null) continue
    const hash = await sha256Hex(body)
    entry.blobHash = hash
    bodies.set(hash, body)
  }
  return { entries, bodies }
}

/**
 * Take a restore point for the configuration as it is right now, unless one already covers this
 * editing session. Returns whether a snapshot was written.
 *
 * Throws if the history could not be written. The write hook below turns that into a notice
 * rather than a failed save; a restore surfaces it directly. A failed capture deliberately does
 * not count as this session's write, so the next save tries again instead of staying uncovered
 * for the rest of the window.
 */
/**
 * Delete everything the history has stored, including the index itself, so turning the feature
 * off actually frees the space rather than leaving it parked on the server.
 */
async function clearHistory(index: HistoryIndex): Promise<void> {
  for (const snapshot of index.snapshots) {
    await deleteDataComponent(SNAPSHOT_PREFIX + snapshot.id).catch(() => undefined)
    snapshotCache.delete(snapshot.id)
  }
  for (const hash of index.blobs) {
    await deleteDataComponent(BLOB_PREFIX + hash).catch(() => undefined)
  }
  await deleteIndexComponent(INDEX_UID).catch(() => undefined)
  useHistoryStore.setState({ index: emptyIndex(), indexStored: false })
}

export async function captureSnapshot(force = false): Promise<boolean> {
  const { limit, windowMin } = historyLimits()
  if (!historyEnabled(limit)) {
    // Turned off: stop capturing, and clear what is already stored. The index is read straight
    // from the server rather than rebuilt, so an install with history off never pays for a
    // namespace listing; once it is known to be empty, later writes cost nothing at all.
    const known = useHistoryStore.getState().index ?? (await readStoredIndex())
    if (known && (known.snapshots?.length > 0 || known.blobs?.length > 0)) await clearHistory(known)
    else useHistoryStore.setState({ index: emptyIndex() })
    markWrite()
    return false
  }

  let index = useHistoryStore.getState().index
  if (!index) index = await readIndex()

  if (
    !force &&
    !shouldCapture({
      limit,
      windowMin,
      lastWriteAt: lastWriteAt(),
      haveSnapshots: index.snapshots.length > 0,
      now: Date.now(),
    })
  ) {
    useHistoryStore.setState({ index })
    markWrite()
    return false
  }

  // Hand the flag back to whoever held it rather than forcing it off: a capture taken as the
  // first step of a restore would otherwise clear `busy` while the restore was still writing,
  // and `busy` is what disables the Restore button.
  const wasBusy = useHistoryStore.getState().busy
  useHistoryStore.setState({ busy: true })
  try {
    const { entries, bodies } = await captureEntries()

    // Store image bodies the history does not have yet. Shared by hash, so a snapshot of a
    // configuration with a 5 MB background costs 5 MB once, not once per snapshot.
    const known = new Set(index.blobs)
    for (const [hash, body] of bodies) {
      if (known.has(hash)) continue
      const blob: StoredBlob = { version: HISTORY_VERSION, hash, dataUri: body, bytes: body.length }
      await putDataComponent<StoredBlob>(
        { uid: BLOB_PREFIX + hash, component: BLOB_COMPONENT, config: blob },
        false
      )
      known.add(hash)
    }

    // What changed to reach this state, measured against the point before it.
    const previous = index.snapshots[0] ? await getSnapshot(index.snapshots[0].id) : null
    const rows = previous ? diffEntries(previous.components, entries) : []

    const id = String(Date.now())
    const createdAt = new Date().toISOString()
    const meta: SnapshotMeta = {
      id,
      createdAt,
      summary: { count: rows.length, names: rows.slice(0, SUMMARY_NAMES).map((r) => r.name) },
      entries: entries.length,
      blobs: blobHashesOf(entries),
    }
    const snapshot: Snapshot = { ...meta, version: HISTORY_VERSION, components: entries }

    // The snapshot itself goes first: an index that named a snapshot which was never written
    // would be a broken row, while a snapshot the index does not name is invisible and is picked
    // up by the rebuild.
    await putDataComponent<Snapshot>(
      { uid: SNAPSHOT_PREFIX + id, component: SNAPSHOT_COMPONENT, config: snapshot },
      false
    )
    cacheSnapshot(snapshot)

    const { keep, drop } = applyRetention([meta, ...index.snapshots], limit)
    let next: HistoryIndex = { version: HISTORY_VERSION, snapshots: keep, blobs: [...known] }
    await writeIndex(next)

    for (const gone of drop) {
      await deleteDataComponent(SNAPSHOT_PREFIX + gone.id).catch(() => undefined)
      snapshotCache.delete(gone.id)
    }

    // Images no remaining snapshot references. A hash stays listed until its component is really
    // gone, so a failed delete is retried by the next capture instead of leaking silently.
    const orphans = unusedBlobs(next)
    if (orphans.length > 0) {
      const removed = new Set<string>()
      for (const hash of orphans) {
        try {
          await deleteDataComponent(BLOB_PREFIX + hash)
          removed.add(hash)
        } catch {
          /* retried on the next capture */
        }
      }
      if (removed.size > 0) {
        next = { ...next, blobs: next.blobs.filter((h) => !removed.has(h)) }
        await writeIndex(next)
      }
    }
    markWrite()
    return true
  } finally {
    useHistoryStore.setState({ busy: wasBusy })
  }
}

/**
 * Installed on the configuration store so every write is preceded by a restore point. Kept as a
 * registration rather than an import from config.ts, so the dependency runs one way only.
 *
 * A failed capture must never fail the save it was protecting - the user's change still goes
 * through, and the notice says the safety net did not.
 */
export function installHistoryHook(): void {
  onBeforeConfigWrite(async (kind) => {
    try {
      await captureSnapshot(kind === 'bulk')
    } catch (err) {
      notify(
        i18n.t('Saved, but no restore point could be recorded: {{error}}', {
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }
  })
}

/* ------------------------------------- restoring ------------------------------------- */

export interface RestoreResult {
  /** Components written back. */
  restored: number
  /** Components deleted because the snapshot did not contain them. */
  removed: number
  /** Components left untouched because their stored image body is missing. */
  skipped: string[]
}

/**
 * A restore is a long sequence of writes and deletes, so a second one starting while the first is
 * mid-flight would compute its delete list from a half-restored configuration - and capture that
 * half-restored state as a restore point. The disabled button is what normally prevents it; this
 * makes it impossible rather than merely unlikely.
 */
let restoreInFlight = false

/**
 * Put the whole configuration back to a snapshot.
 *
 * The current state is captured first, so a restore is itself undoable. Components are written
 * before anything is deleted: an interrupted restore then leaves a superset that can simply be
 * restored again, rather than a configuration with pieces missing - the same reasoning as the
 * backup importer.
 */
export async function restoreSnapshot(id: string): Promise<RestoreResult> {
  if (restoreInFlight) throw new Error(i18n.t('A restore is already running on this device.'))
  restoreInFlight = true
  useHistoryStore.setState({ busy: true })
  try {
    const snapshot = await getSnapshot(id)
    if (!snapshot) throw new Error('That restore point is no longer stored on the server.')

    // Undo path for the restore itself, taken before anything is touched.
    await captureSnapshot(true)

    const target: UIComponent[] = []
    const skipped: string[] = []
    for (const entry of snapshot.components) {
      let ready = entry
      if (entry.blobHash) {
        const blob = await getDataComponent<StoredBlob>(BLOB_PREFIX + entry.blobHash)
        const dataUri = blob?.config?.dataUri
        if (typeof dataUri !== 'string') {
          // Its image is gone, so it cannot be put back faithfully. Leaving what is on the
          // server alone beats writing a component whose picture is missing.
          skipped.push(entry.uid)
          continue
        }
        ready = withBlob(entry, dataUri)
      }
      const component: UIComponent = {
        uid: ready.uid,
        component: ready.component,
        config: ready.config,
      }
      if (ready.tags) component.tags = ready.tags
      target.push(component)
    }

    const existing = await listComponents()
    const have = new Set(existing.map((c) => c.uid))
    for (const component of target) {
      if (have.has(component.uid)) await updateComponent(component)
      else await addComponent(component)
    }

    // Anything the snapshot did not contain goes, except components skipped above: those are
    // still meant to exist, just not rewritable.
    const keep = new Set([...target.map((c) => c.uid), ...skipped])
    let removed = 0
    for (const component of existing) {
      if (keep.has(component.uid)) continue
      await deleteComponent(component.uid)
      removed++
    }

    await loadConfig()
    markWrite()
    return { restored: target.length, removed, skipped }
  } finally {
    restoreInFlight = false
    useHistoryStore.setState({ busy: false })
  }
}

/* -------------------------------------- renaming -------------------------------------- */

/** Give a restore point a name of its own, or clear it back to its date. */
export async function renameSnapshot(id: string, label: string): Promise<void> {
  const index = useHistoryStore.getState().index
  if (!index) return
  const trimmed = label.trim()
  const snapshots = index.snapshots.map((s) => (s.id === id ? { ...s, label: trimmed || undefined } : s))
  const next: HistoryIndex = { ...index, snapshots }
  await writeIndex(next)

  // The snapshot keeps its own copy so a rebuilt index does not lose the name.
  const snapshot = await getSnapshot(id)
  if (snapshot) {
    const updated: Snapshot = { ...snapshot, label: trimmed || undefined }
    cacheSnapshot(updated)
    await putDataComponent<Snapshot>(
      { uid: SNAPSHOT_PREFIX + id, component: SNAPSHOT_COMPONENT, config: updated },
      true
    )
  }
}

/* ------------------------------ comparing with the present ------------------------------ */

/** The live configuration in snapshot form, for comparing a restore point with what is there now. */
export async function currentEntries(): Promise<SnapshotEntry[]> {
  const { entries } = await captureEntries()
  return entries
}
