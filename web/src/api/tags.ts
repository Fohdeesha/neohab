import { api } from './client'
import { getRootInfo } from './items'
import { hasSemanticTagsApi, parseServerVersion } from '../model/serverVersion'

export interface SemanticTag {
  uid: string
  name: string
  label?: string
  synonyms?: string[]
  editable?: boolean
}

/**
 * The server's semantic tags, or null where it has none to give.
 *
 * `/rest/tags` is openHAB 4.0 and newer, and asking an older server only puts a 404 in the console.
 * Null rather than an empty array, because `buildTagIndex([])` is an index with nothing in it while
 * `buildTagIndex()` is the bundled hierarchy, which is what an old server should fall back to.
 */
export function getSemanticTags(signal?: AbortSignal): Promise<SemanticTag[] | null> {
  return getRootInfo(signal).then((info) => {
    const version = parseServerVersion(info.runtimeInfo?.version ?? info.version)
    if (!hasSemanticTagsApi(version)) return null
    return api.get<SemanticTag[]>('/rest/tags', { signal })
  })
}
