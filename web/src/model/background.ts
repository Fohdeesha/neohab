/**
 * Uploaded background images, stored as `background:<id>` components (config
 * `{version, id, dataUri, bytes}`) so they live in the openHAB configuration and travel with
 * backups - a wall panel does not depend on some external URL staying reachable.
 *
 * A background reference (on a dashboard or in the global settings) is either a plain URL or
 * `bg:<id>` pointing at one of these components.
 */
export interface CustomBackground {
  version: number
  id: string
  dataUri: string
  bytes: number
}

export const BG_REF_PREFIX = 'bg:'

export function isUploadedBackground(ref: string): boolean {
  return ref.startsWith(BG_REF_PREFIX)
}

/** Resolve a background reference to something usable in CSS url(), or undefined. */
export function resolveBackgroundRef(
  ref: string | undefined,
  uploads: CustomBackground[]
): string | undefined {
  if (!ref) return undefined
  if (isUploadedBackground(ref)) {
    return uploads.find((b) => b.id === ref.slice(BG_REF_PREFIX.length))?.dataUri
  }
  return ref
}

export function newBackgroundId(): string {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/**
 * Every uploaded-background id referenced anywhere inside a stored value.
 *
 * A reference is not always a field somebody thought of: the global setting and a dashboard's
 * own background are top-level, but a widget's config can name one too (a floor plan's plan
 * image), and so can a custom widget definition's setting defaults. Anything deciding which
 * uploads are still in use must walk the whole tree, or it deletes an image that is - which is
 * exactly what happened to floor plans until 1.10. Whitespace is tolerated so the collector
 * errs towards keeping an image rather than dropping one.
 */
export function collectBackgroundRefs(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const v = value.trim()
    if (isUploadedBackground(v)) into.add(v.slice(BG_REF_PREFIX.length))
    return into
  }
  if (Array.isArray(value)) {
    for (const v of value) collectBackgroundRefs(v, into)
    return into
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectBackgroundRefs(v, into)
  }
  return into
}
