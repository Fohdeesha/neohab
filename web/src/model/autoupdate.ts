/**
 * Which items openHAB has promised NOT to update when you command them.
 *
 * core's AutoUpdateManager reads the metadata with `Boolean.parseBoolean`, so only "true" (any case)
 * allows the update and "no", "0" and "off" veto it just as "false" does. A blank value is skipped,
 * which leaves whatever the channels recommend, so blank is not a veto.
 *
 * A veto stops openHAB guessing a state from the command. It does not stop the device answering:
 * its answer arrives as a state update, and one that confirms the state the item already had is not
 * a change, so the states tracker never carries it.
 */
export function vetoesAutoUpdate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return false
  return trimmed.toLowerCase() !== 'true'
}

/** the metadata as the REST API hands it back, which is untrusted like anything else stored */
export function autoUpdateVetoed(metadata: unknown): boolean {
  if (metadata === null || typeof metadata !== 'object') return false
  const entry = (metadata as Record<string, unknown>).autoupdate
  if (entry === null || typeof entry !== 'object') return false
  return vetoesAutoUpdate((entry as Record<string, unknown>).value)
}

// on or off as a state reads it: a dimmer at 5.88 and a colour with any brightness are both on
function readsOn(state: string): boolean | undefined {
  const s = state.trim()
  if (s === 'ON') return true
  if (s === 'OFF') return false
  const parts = s.split(',')
  const level = parts.length === 3 ? parts[2].trim() : s
  // Number('') is 0, which would read an empty state as off
  if (level === '') return undefined
  const n = Number(level)
  return Number.isFinite(n) ? n > 0 : undefined
}

/**
 * Whether a device's answer says the opposite of the command it was sent. Only commands that name
 * the state they should end in are judged: UP, DOWN, a percentage or PLAY say nothing a single
 * answer could contradict, and NULL or UNDEF is a device that does not know, not one that refused.
 */
export function contradicts(command: string, reported: string): boolean {
  const c = command.trim().toUpperCase()
  const r = reported.trim()
  if (c === 'OPEN') return r === 'CLOSED'
  if (c === 'CLOSED') return r === 'OPEN'
  if (c !== 'ON' && c !== 'OFF') return false
  const on = readsOn(r)
  if (on === undefined) return false
  return c === 'ON' ? !on : on
}
