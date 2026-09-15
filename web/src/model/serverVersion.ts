/**
 * What this openHAB can do, worked out from the version it reports.
 *
 * Three things the app uses arrived after openHAB 3, and on an older server each fails in a way
 * retrying cannot fix: the log websocket is not registered, `/rest/tags` 404s, and a signed-out
 * request for the rules summary is refused. Asking the version first turns those from a silent
 * failure into something a person can be told.
 *
 * An unreadable or unrecognised version counts as capable, so a server we cannot identify behaves
 * exactly as it did before rather than losing features on a guess.
 */

export interface ServerVersion {
  major: number
  minor: number
  raw: string
}

export function parseServerVersion(raw: unknown): ServerVersion | null {
  if (typeof raw !== 'string') return null
  const m = /^\s*(\d+)(?:\.(\d+))?/.exec(raw)
  if (!m) return null
  const major = Number(m[1])
  const minor = m[2] === undefined ? 0 : Number(m[2])
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null
  return { major, minor, raw: raw.trim() }
}

export function atLeast(v: ServerVersion | null, major: number, minor = 0): boolean {
  if (!v) return true
  return v.major > major || (v.major === major && v.minor >= minor)
}

/** The log websocket (`/ws/logs`) is openHAB 4.1 and newer. */
export function hasLogSocket(v: ServerVersion | null): boolean {
  return atLeast(v, 4, 1)
}

/** `/rest/tags`, which is what lets a user's own semantic tags classify, is openHAB 4.0 and newer. */
export function hasSemanticTagsApi(v: ServerVersion | null): boolean {
  return atLeast(v, 4, 0)
}

/**
 * A signed-out viewer may read the rules summary from openHAB 4.0. Before that it needs admin, so
 * floor plan presets are listed for an administrator and not on an unauthenticated wall panel.
 */
export function hasAnonymousRuleSummary(v: ServerVersion | null): boolean {
  return atLeast(v, 4, 0)
}

export type ServerGap = 'logSocket' | 'semanticTags' | 'anonymousPresets'

/** Everything this server cannot do, for the one place that reports it honestly. */
export function serverGaps(v: ServerVersion | null): ServerGap[] {
  const gaps: ServerGap[] = []
  if (!hasLogSocket(v)) gaps.push('logSocket')
  if (!hasSemanticTagsApi(v)) gaps.push('semanticTags')
  if (!hasAnonymousRuleSummary(v)) gaps.push('anonymousPresets')
  return gaps
}
