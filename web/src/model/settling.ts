import { commandMatchesState } from './presets'

// longer than any fade measured here (1.1s on a DMX strip)
export const DISPLAY_SETTLE_MS = 3000

export interface Settling {
  command: string
  at: number
}

export function settledDisplay(pending: Settling | undefined, live: string | undefined, now: number): string | undefined {
  if (!pending) return live
  if (now - pending.at < DISPLAY_SETTLE_MS) return pending.command
  return commandMatchesState(pending.command, live) ? pending.command : live
}
