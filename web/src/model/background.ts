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
