import { api } from './client'

export function interpretText(text: string): Promise<string> {
  return api.post<string>('/rest/voice/interpreters', text, { text: true })
}
