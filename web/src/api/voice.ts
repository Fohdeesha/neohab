import { api } from './client'

/**
 * Send a text command to the server's default human-language interpreter.
 * Resolves with the interpreter's answer; a text the interpreter cannot handle raises an
 * ApiError whose message carries the interpreter's own explanation (HTTP 400).
 */
export function interpretText(text: string): Promise<string> {
  return api.post<string>('/rest/voice/interpreters', text, { text: true })
}
