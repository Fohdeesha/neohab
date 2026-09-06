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

// captures run one at a time, or two would each write an index computed from its own read
let captureChain: Promise<unknown> = Promise.resolve()

export function captureSnapshot(force = false): Promise<boolean> {
  const run = captureChain.then(
    () => runCapture(force),
    () => runCapture(force)
  )
  captureChain = run.catch(() => undefined)
  return run
}

async function runCapture(force = false): Promise<boolean> {
  const { limit, windowMin } = historyLimits()
  if (!historyEnabled(limit)) {
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
      now: Date.now()
    })
  ) {
    useHistoryStore.setState({ index })
    markWrite()
    return false
  }

  // hand the flag back rather than forcing it off, or a capture taken as the first step of a restore re-enables
  // Restore mid-flight
  const wasBusy = useHistoryStore.getState().busy
  useHistoryStore.setState({ busy: true })
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
    const { keep, drop } = applyRetention(combined.snapshots, limit)
    let next: HistoryIndex = { version: HISTORY_VERSION, snapshots: keep, blobs: combined.blobs }
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
    markWrite()
    return true
  } finally {
    useHistoryStore.setState({ busy: wasBusy })
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

let restoreInFlight = false

export async function restoreSnapshot(id: string): Promise<RestoreResult> {
  if (restoreInFlight) throw new Error(i18n.t('A restore is already running on this device.'))
  restoreInFlight = true
  useHistoryStore.setState({ busy: true })
  try {
    const snapshot = await getSnapshot(id)
    if (!snapshot) throw new Error('That restore point is no longer stored on the server.')

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
    for (const component of target) {
      if (have.has(component.uid)) await updateComponent(component)
      else await addComponent(component)
    }

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

export async function renameSnapshot(id: string, label: string): Promise<void> {
  const index = useHistoryStore.getState().index
  if (!index) return
  const trimmed = label.trim()
  const snapshots = index.snapshots.map((s) => (s.id === id ? { ...s, label: trimmed || undefined } : s))
  const next: HistoryIndex = { ...index, snapshots }
  await writeIndex(next)

  const snapshot = await getSnapshot(id)
  if (snapshot) {
    const updated: Snapshot = { ...snapshot, label: trimmed || undefined }
    cacheSnapshot(updated)
    await putDataComponent<Snapshot>({ uid: SNAPSHOT_PREFIX + id, component: SNAPSHOT_COMPONENT, config: updated }, true)
  }
}

export async function currentEntries(): Promise<SnapshotEntry[]> {
  const { entries } = await captureEntries()
  return entries
}
