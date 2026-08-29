/**
 * Where the last-lit brightness of each colour lamp lives on this device.
 *
 * Per device, in localStorage, like the kiosk settings, the theme override and the text size - and
 * deliberately not in a backup, because it is an observation this browser made rather than
 * something anyone configured. See `model/lastLit.ts` for why one number is all that is needed.
 *
 * When it is written matters more than it looks. A fading strip reports a burst of states, and a
 * drag reports one per frame, so writing on every observation would put a localStorage write in
 * the middle of a gesture. Instead the memory is always current and free, and it is only WRITTEN
 * when a lamp goes dark - which is exactly the moment the number starts mattering, since nothing
 * can ask for it until then. A page being hidden or unloaded writes too, so a device that watched
 * a lamp all evening still knows the brightness tomorrow.
 */
import { litOf, noteLit, parseLit, serialiseLit } from '../model/lastLit'

const KEY = 'neohab:lastLit'

let map: Record<string, number> | null = null
/** What is already in storage, so a repeated write costs nothing. */
let written = ''

function load(): Record<string, number> {
  if (map) return map
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // storage unavailable (private mode): the memory still works for this page load
  }
  written = raw ?? ''
  map = parseLit(raw)
  return map
}

function persist(): void {
  if (!map) return
  const next = serialiseLit(map)
  if (next === written) return
  try {
    localStorage.setItem(KEY, next)
    written = next
  } catch {
    // quota or private mode: keep the memory, stop trying to write it
  }
}

/**
 * Armed on first use rather than at import, so the module still loads where there is no window -
 * the unit checks run in Node, and every function here is reachable from them.
 */
let listening = false

function armFlush(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('pagehide', persist)
  // The one a phone can be relied on to fire: a tab going to the background may never get another
  // event before it is discarded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
}

/**
 * Tell the memory what a lamp is showing. Lit values are kept; a dark one is the cue to write,
 * because the brightness before it is now the only copy of a number nothing else holds.
 */
export function noteBrightness(item: string, brightness: number): void {
  const current = load()
  armFlush()
  if (brightness > 0) {
    map = noteLit(current, item, brightness)
    return
  }
  persist()
}

/** The brightness an On button should send, or full when this device has never seen it lit. */
export function lastLitBrightness(item: string): number {
  return litOf(load(), item)
}
