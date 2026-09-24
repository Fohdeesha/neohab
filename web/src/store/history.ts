import { create } from 'zustand'
import { addComponent, deleteComponent, listComponents, updateComponent } from '../api/components'
import {
  deleteDataComponent,
  deleteIndexComponent,
  getDataComponent,
  listDataComponents,
  listIndexComponents,
  putDataComponent,
  putIndexComponent
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
  MAX_HISTORY_LIMIT,
  SNAPSHOT_COMPONENT,
  SNAPSHOT_PREFIX,
  SUMMARY_NAMES,
  mergeIndexes,
  shouldCapture,
  toEntry,
  unusedBlobs,
  withBlob,
  type HistoryIndex,
  type RawComponent,
  type Snapshot,
  type SnapshotEntry,
  type SnapshotMeta,
  type StoredBlob
} from '../model/history'
import { loadConfig, onBeforeConfigWrite, useConfigStore } from './config'
import { exclusive } from './bulk'
import { notify } from './notify'
import { errorText } from '../api/errors'

interface HistoryState {
  index: HistoryIndex | null
  indexStored: boolean
  loading: boolean
  busy: boolean
  error: string | null
}

export const useHistoryStore = create<HistoryState>(() => ({
  index: null,
  indexStored: false,
  loading: false,
  busy: false,
  error: null
}))

// a count rather than a flag: a capture ending in the middle of a restore must not re-enable Restore
let busyCount = 0

function enterBusy(): void {
  busyCount++
  useHistoryStore.setState({ busy: true })
}

function leaveBusy(): void {
  busyCount = Math.max(0, busyCount - 1)
  useHistoryStore.setState({ busy: busyCount > 0 })
}

async function writeIndex(index: HistoryIndex): Promise<void> {
  await putIndexComponent(indexComponent(index), useHistoryStore.getState().indexStored)
  useHistoryStore.setState({ index, indexStored: true })
}

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
    // private mode - the only cost is an extra restore point after a reload
  }
}

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const subtle = globalThis.crypto?.subtle
  if (subtle) return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)))
  return toHex(sha256(bytes))
}

const indexComponent = (index: HistoryIndex): UIComponent<HistoryIndex> => ({
  uid: INDEX_UID,
  component: INDEX_COMPONENT,
  config: index
})

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

  const metas: SnapshotMeta[] = snapshots.map((s, i) => {
    const older = snapshots[i + 1]
    const rows = older ? diffEntries(older.components ?? [], s.components ?? []) : []
    return {
      id: s.id,
      createdAt: s.createdAt,
      label: s.label,
      summary: { count: rows.length, names: rows.slice(0, SUMMARY_NAMES).map((r) => r.name) },
      entries: (s.components ?? []).length,
      blobs: blobHashesOf(s.components ?? [])
    }
  })
  const index: HistoryIndex = { version: HISTORY_VERSION, snapshots: metas, blobs }
  if (metas.length > 0 || blobs.length > 0) {
    try {
      await putIndexComponent(indexComponent(index), false)
      useHistoryStore.setState({ indexStored: true })
    } catch {
      // not signed in - the next capture writes it
    }
  }
  return index
}

const blobHashesOf = (entries: SnapshotEntry[]): string[] => [
  ...new Set(entries.map((e) => e.blobHash).filter((h): h is string => typeof h === 'string'))
]

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
      error: errorText(err)
    })
  }
}

function historyLimits(): { limit: number; windowMin: number } {
  const s = useConfigStore.getState().settings
  return {
    limit: clampLimit(s.historyLimit ?? DEFAULT_HISTORY_LIMIT),
    windowMin: clampWindow(s.historyWindowMin ?? DEFAULT_HISTORY_WINDOW_MIN)
  }
}

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

// the index as it is now: this tab's copy merged with what another admin tab may have written since
async function currentIndex(): Promise<HistoryIndex> {
  const mine = useHistoryStore.getState().index ?? (await readIndex())
  const stored = await readStoredIndex().catch(() => null)
  return stored ? mergeIndexes(mine, stored) : mine
}

// writes `index` minus what the limit drops, then deletes the dropped points and any image body no point
// still uses
async function settle(index: HistoryIndex, limit: number): Promise<HistoryIndex> {
  const { keep, drop } = applyRetention(index.snapshots, limit)
  if (keep.length === 0) {
    await clearHistory(index)
    return emptyIndex()
  }
  let next: HistoryIndex = { version: HISTORY_VERSION, snapshots: keep, blobs: index.blobs }
  await writeIndex(next)

  for (const gone of drop) {
    await deleteDataComponent(SNAPSHOT_PREFIX + gone.id).catch(() => undefined)
    snapshotCache.delete(gone.id)
  }

  const orphans = unusedBlobs(next)
  if (orphans.length > 0) {
    const removed = new Set<string>()
    for (const hash of orphans) {
      try {
        await deleteDataComponent(BLOB_PREFIX + hash)
        removed.add(hash)
      } catch {
        // retried on the next capture
      }
    }
    if (removed.size > 0) {
      next = { ...next, blobs: next.blobs.filter((h) => !removed.has(h)) }
      await writeIndex(next)
    }
  }
  return next
}

// captures and everything else that rewrites the index run one at a time, or two would each write an
// index computed from its own read
let captureChain: Promise<unknown> = Promise.resolve()

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = captureChain.then(fn, fn)
  captureChain = run.catch(() => undefined)
  return run
}

export function captureSnapshot(force = false): Promise<boolean> {
  return serial(() => runCapture(force))
}

/** Applies the current limit now, rather than at the next change. */
export function pruneHistory(): Promise<void> {
  return serial(async () => {
    const index = await currentIndex()
    if (index.snapshots.length === 0 && index.blobs.length === 0) return
    await settle(index, historyLimits().limit)
  })
}

export function deleteSnapshot(id: string): Promise<void> {
  return serial(async () => {
    const index = await currentIndex()
    await settle({ ...index, snapshots: index.snapshots.filter((s) => s.id !== id) }, MAX_HISTORY_LIMIT)
    await deleteDataComponent(SNAPSHOT_PREFIX + id).catch(() => undefined)
    snapshotCache.delete(id)
  })
}

async function runCapture(force = false): Promise<boolean> {
  const { limit, windowMin } = historyLimits()
  if (!historyEnabled(limit)) {
    // off: nothing new is recorded, the unnamed points go, and the named ones stay until deleted
    const known = useHistoryStore.getState().index ?? (await readStoredIndex())
    if (known && (known.snapshots?.length > 0 || known.blobs?.length > 0)) await settle(known, 0)
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
      now: Date.now()
    })
  ) {
    useHistoryStore.setState({ index })
    markWrite()
    return false
  }

  enterBusy()
  try {
    const { entries, bodies } = await captureEntries()

    const known = new Set(index.blobs)
    for (const [hash, body] of bodies) {
      if (known.has(hash)) continue
      const blob: StoredBlob = { version: HISTORY_VERSION, hash, dataUri: body, bytes: body.length }
      await putDataComponent<StoredBlob>({ uid: BLOB_PREFIX + hash, component: BLOB_COMPONENT, config: blob }, false)
      known.add(hash)
    }

    const previous = index.snapshots[0] ? await getSnapshot(index.snapshots[0].id) : null
    const rows = previous ? diffEntries(previous.components, entries) : []

    const id = String(Date.now())
    const createdAt = new Date().toISOString()
    const meta: SnapshotMeta = {
      id,
      createdAt,
      summary: { count: rows.length, names: rows.slice(0, SUMMARY_NAMES).map((r) => r.name) },
      entries: entries.length,
      blobs: blobHashesOf(entries)
    }
    const snapshot: Snapshot = { ...meta, version: HISTORY_VERSION, components: entries }

    // the snapshot goes first: an index naming one that was never written is a broken row
    await putDataComponent<Snapshot>({ uid: SNAPSHOT_PREFIX + id, component: SNAPSHOT_COMPONENT, config: snapshot }, false)
    cacheSnapshot(snapshot)

    // re-read before overwriting - a second admin tab has its own copy of the index
    const stored = (await readStoredIndex().catch(() => null)) ?? index
    const combined = mergeIndexes({ version: HISTORY_VERSION, snapshots: [meta, ...index.snapshots], blobs: [...known] }, stored)
    await settle(combined, limit)
    markWrite()
    return true
  } finally {
    leaveBusy()
  }
}

export function installHistoryHook(): void {
  onBeforeConfigWrite(async (kind) => {
    try {
      await captureSnapshot(kind === 'bulk')
    } catch (err) {
      notify(
        i18n.t('Saved, but no restore point could be recorded: {{error}}', {
          error: errorText(err)
        })
      )
    }
  })
}

export interface RestoreResult {
  restored: number
  removed: number
  skipped: string[]
}

export function restoreSnapshot(id: string): Promise<RestoreResult> {
  return exclusive(() => runRestore(id))
}

async function runRestore(id: string): Promise<RestoreResult> {
  enterBusy()
  let wrote = false
  try {
    const snapshot = await getSnapshot(id)
    if (!snapshot) throw new Error(i18n.t('That restore point is no longer stored on the server.'))

    await captureSnapshot(true)

    const target: UIComponent[] = []
    const skipped: string[] = []
    for (const entry of snapshot.components) {
      let ready = entry
      if (entry.blobHash) {
        const blob = await getDataComponent<StoredBlob>(BLOB_PREFIX + entry.blobHash)
        const dataUri = blob?.config?.dataUri
        if (typeof dataUri !== 'string') {
          skipped.push(entry.uid)
          continue
        }
        ready = withBlob(entry, dataUri)
      }
      const component: UIComponent = {
        uid: ready.uid,
        component: ready.component,
        config: ready.config
      }
      if (ready.tags) component.tags = ready.tags
      target.push(component)
    }

    const existing = await listComponents()
    const have = new Set(existing.map((c) => c.uid))
    wrote = true
    for (const component of target) {
      if (have.has(component.uid)) await updateComponent(component)
      else await addComponent(component)
      have.add(component.uid)
    }

    const keep = new Set([...target.map((c) => c.uid), ...skipped])
    let removed = 0
    for (const component of existing) {
      if (keep.has(component.uid)) continue
      await deleteComponent(component.uid)
      removed++
    }

    markWrite()
    return { restored: target.length, removed, skipped }
  } finally {
    // after a failure halfway too: the screen has to show what the server now holds
    if (wrote) await loadConfig()
    leaveBusy()
  }
}

export function renameSnapshot(id: string, label: string): Promise<void> {
  return serial(async () => {
    // merged with the stored index first, or a point another tab added meanwhile would be written out of it
    const index = await currentIndex()
    const trimmed = label.trim()
    const snapshots = index.snapshots.map((s) => (s.id === id ? { ...s, label: trimmed || undefined } : s))
    await writeIndex({ ...index, snapshots })

    const snapshot = await getSnapshot(id)
    if (snapshot) {
      const updated: Snapshot = { ...snapshot, label: trimmed || undefined }
      cacheSnapshot(updated)
      await putDataComponent<Snapshot>({ uid: SNAPSHOT_PREFIX + id, component: SNAPSHOT_COMPONENT, config: updated }, true)
    }
  })
}

export async function currentEntries(): Promise<SnapshotEntry[]> {
  const { entries } = await captureEntries()
  return entries
}
