import { api } from './client'

export interface SemanticTag {
  uid: string
  name: string
  label?: string
  synonyms?: string[]
  editable?: boolean
}

export function getSemanticTags(signal?: AbortSignal): Promise<SemanticTag[]> {
  return api.get<SemanticTag[]>('/rest/tags', { signal })
}
