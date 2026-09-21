/**
 * Which items openHAB has promised NOT to update when you command them.
 *
 * `autoupdate` item metadata is read by core's AutoUpdateManager like this:
 *
 *     boolean override = Boolean.parseBoolean(metadata.getValue());
 *     if (override) autoUpdate = REQUIRED; else autoUpdate = DONT;
 *     ...
 *     case DONT: // "Won't update item as it was vetoed." - no prediction, no state update
 *
 * Two things follow, and both matter here. `Boolean.parseBoolean` answers true for the string
 * "true" alone (ignoring case), so `autoupdate="no"`, `"0"` and `"off"` all mean DON'T just as
 * `"false"` does - matching `=== 'false'` would miss them. And a blank value is skipped entirely,
 * leaving whatever the channels recommend, so blank is not a veto.
 *
 * Verified against a live 4.3.11 server: five OFF commands to an `autoupdate="false"` Switch
 * produced an ItemCommandEvent each and nothing else - no ItemStatePredictedEvent, no
 * ItemStateChangedEvent - so a control reading the state alone can never move.
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
