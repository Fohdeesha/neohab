import { api } from './client'

/** A semantic tag as returned by `GET /rest/tags`. */
export interface SemanticTag {
  /** Fully qualified id, e.g. `Location_Indoor_Room_Kitchen`. The root segment is its kind. */
  uid: string
  /** Last segment of the uid, e.g. `Kitchen`. Items may carry either this or the full uid. */
  name: string
  label?: string
  synonyms?: string[]
  editable?: boolean
}

/**
 * The server's semantic tag hierarchy, including any tags the user added themselves. Older
 * servers have no such endpoint; callers fall back to the bundled default hierarchy.
 */
export function getSemanticTags(signal?: AbortSignal): Promise<SemanticTag[]> {
  return api.get<SemanticTag[]>('/rest/tags', { signal })
}
