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

export function resolveBackgroundRef(ref: string | undefined, uploads: CustomBackground[]): string | undefined {
  if (!ref) return undefined
  if (isUploadedBackground(ref)) {
    return uploads.find((b) => b.id === ref.slice(BG_REF_PREFIX.length))?.dataUri
  }
  return ref
}

export function newBackgroundId(): string {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// walks the whole stored tree: a reference is not always a field somebody thought of, which is how a floor
// plan's image got collected once
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
