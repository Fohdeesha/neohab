/**
 * Comparing two configuration states.
 *
 * Pure and free of any i18n or React: the UI decides how to phrase things, this decides what
 * actually differs. Two levels come out of it - one row per component (added / changed / removed)
 * and, inside a changed one, the individual fields that differ with their before and after values.
 *
 * Arrays of objects that carry an `id` (a dashboard's widgets, a chart's series) are matched by
 * that id rather than by position, so moving a widget does not read as "every widget changed".
 */
import { entryCategory, entryName, type SnapshotEntry } from '../model/history'

export type ChangeKind = 'added' | 'changed' | 'removed'

export interface FieldChange {
  /** Dotted path within the component's config, e.g. `widgets[Lamp].config.icon`. */
  path: string
  kind: ChangeKind
  before?: unknown
  after?: unknown
}

export interface ComponentDiff {
  uid: string
  /** `dashboard`, `theme`, `icon`, `settings`, … taken from the uid prefix. */
  category: string
  name: string
  kind: ChangeKind
  fields: FieldChange[]
  /** Set when the component differs in more fields than are listed. */
  truncated: boolean
}

/** Field changes listed for one component before the rest are summarised away. */
export const MAX_FIELDS = 120

/** Longest rendered value before it is shortened for display. */
const MAX_VALUE_CHARS = 120

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = Object.keys(ao)
  if (keys.length !== Object.keys(bo).length) return false
  return keys.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]))
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** An array whose elements are all objects with a usable id - matchable by identity, not position. */
function keyedArray(v: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const el of v) {
    if (!isPlainObject(el)) return null
    const id = el.id
    if (typeof id !== 'string' || id === '' || seen.has(id)) return null
    seen.add(id)
    out.push(el)
  }
  return out
}

/**
 * Label for one element of a keyed array: whatever the reader would recognise it by. A widget
 * carries its name inside its own config, so that is looked at too; an unnamed one keeps its id,
 * which is still an identity rather than a position.
 */
function elementLabel(el: Record<string, unknown>): string {
  const config = isPlainObject(el.config) ? el.config : {}
  for (const candidate of [el.name, el.label, config.label, config.name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return String(el.id)
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key)

/**
 * Collect the differences between two values. Stops adding once `limit` changes are collected;
 * the caller reports that the list was cut short rather than pretending it is complete.
 */
export function diffValues(before: unknown, after: unknown, path: string, out: FieldChange[], limit = MAX_FIELDS): void {
  if (out.length >= limit) return
  if (deepEqual(before, after)) return

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    for (const k of keys) {
      const hasB = Object.prototype.hasOwnProperty.call(before, k)
      const hasA = Object.prototype.hasOwnProperty.call(after, k)
      if (hasB && !hasA) pushChange(out, { path: join(path, k), kind: 'removed', before: before[k] }, limit)
      else if (!hasB && hasA) pushChange(out, { path: join(path, k), kind: 'added', after: after[k] }, limit)
      else diffValues(before[k], after[k], join(path, k), out, limit)
    }
    return
  }

  const keyedBefore = keyedArray(before)
  const keyedAfter = keyedArray(after)
  if (keyedBefore && keyedAfter) {
    const byId = (list: Record<string, unknown>[]) => new Map(list.map((el) => [String(el.id), el]))
    const b = byId(keyedBefore)
    const a = byId(keyedAfter)
    for (const [id, el] of b) {
      const other = a.get(id)
      if (!other) pushChange(out, { path: `${path}[${elementLabel(el)}]`, kind: 'removed', before: el }, limit)
      else diffValues(el, other, `${path}[${elementLabel(other)}]`, out, limit)
    }
    for (const [id, el] of a) {
      if (!b.has(id)) pushChange(out, { path: `${path}[${elementLabel(el)}]`, kind: 'added', after: el }, limit)
    }
    return
  }

  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    for (let i = 0; i < before.length; i++) diffValues(before[i], after[i], `${path}[${i}]`, out, limit)
    return
  }

  pushChange(out, { path: path || '(value)', kind: 'changed', before, after }, limit)
}

function pushChange(out: FieldChange[], change: FieldChange, limit: number): void {
  if (out.length < limit) out.push(change)
}

/** Everything that differs inside one component. */
export function diffEntry(before: SnapshotEntry, after: SnapshotEntry): { fields: FieldChange[]; truncated: boolean } {
  const fields: FieldChange[] = []
  // An image body is stored by hash and never loaded for a comparison: differing hashes are all
  // it takes to know the picture changed, and loading megabytes to say so would be worse.
  if (before.blobHash !== after.blobHash) {
    fields.push({ path: 'image', kind: 'changed', before: before.blobHash, after: after.blobHash })
  }
  if (!deepEqual(before.tags ?? [], after.tags ?? [])) {
    fields.push({ path: 'tags', kind: 'changed', before: before.tags ?? [], after: after.tags ?? [] })
  }
  diffValues(before.config, after.config, '', fields, MAX_FIELDS)
  return { fields, truncated: fields.length >= MAX_FIELDS }
}

/** Compare two configuration states, one row per component that is not identical in both. */
export function diffEntries(before: SnapshotEntry[], after: SnapshotEntry[]): ComponentDiff[] {
  const b = new Map(before.map((e) => [e.uid, e]))
  const a = new Map(after.map((e) => [e.uid, e]))
  const rows: ComponentDiff[] = []

  for (const [uid, entry] of b) {
    const other = a.get(uid)
    if (!other) {
      rows.push({ uid, category: entryCategory(uid), name: entryName(entry), kind: 'removed', fields: [], truncated: false })
      continue
    }
    const { fields, truncated } = diffEntry(entry, other)
    if (fields.length > 0) {
      rows.push({ uid, category: entryCategory(uid), name: entryName(other), kind: 'changed', fields, truncated })
    }
  }
  for (const [uid, entry] of a) {
    if (!b.has(uid)) {
      rows.push({ uid, category: entryCategory(uid), name: entryName(entry), kind: 'added', fields: [], truncated: false })
    }
  }

  // Stable, readable order: by kind then name, so the same comparison always reads the same way.
  const rank: Record<ChangeKind, number> = { changed: 0, added: 1, removed: 2 }
  rows.sort((x, y) => rank[x.kind] - rank[y.kind] || x.name.localeCompare(y.name) || x.uid.localeCompare(y.uid))
  return rows
}

/** Short, safe rendering of a before/after value for the change list. */
export function formatValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'string') return value.length > MAX_VALUE_CHARS ? value.slice(0, MAX_VALUE_CHARS) + '…' : value
  let text: string
  try {
    text = JSON.stringify(value) ?? String(value)
  } catch {
    text = String(value)
  }
  return text.length > MAX_VALUE_CHARS ? text.slice(0, MAX_VALUE_CHARS) + '…' : text
}
