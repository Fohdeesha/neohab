import { create } from 'zustand'
import { ReportStream } from '../api/reports'
import i18n from '../i18n'
import { contradicts } from '../model/autoupdate'
import { emptyMap, mergeMap } from '../model/lookup'
import { notify } from './notify'

// time for a device to finish a fade or a slow report before its answer is taken as final
const JUDGE_MS = 4000
// a device that has said nothing by then is not going to; its hold stays, only the listening stops
const QUIET_MS = 60_000
const LINGER_MS = 30_000

/**
 * What was asked of an item whose `autoupdate` is vetoed, until its device answers.
 *
 * openHAB guesses no state for such a command, so without this a toggle keeps showing the old state
 * and choosing the same command every press. The hold shows what was asked for, marked unconfirmed,
 * and the device's first answer ends it - whether that answer changes the state or only confirms
 * the one the item already had. A device that never answers keeps the hold: nothing will arrive
 * that it could be hiding.
 *
 * Built through emptyMap/mergeMap because the keys are item names, and openHAB accepts
 * `constructor` and `__proto__` as item names.
 */
interface UnconfirmedState {
  asked: Record<string, string>
}

export const useUnconfirmedStore = create<UnconfirmedState>(() => ({ asked: emptyMap<string>() }))

interface Pending {
  command: string
  reported?: string
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, Pending>()
const reports = new ReportStream(onReport)
let idleTimer: ReturnType<typeof setTimeout> | null = null

// the items store imports this module, so it hands its reader over instead of being imported back
let currentState: (item: string) => string | undefined = () => undefined
export function readStatesFrom(read: (item: string) => string | undefined): void {
  currentState = read
}

/** called before the command goes out, so an answer that beats the POST's own response still counts */
export async function expectAnswer(item: string, command: string): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  const before = pending.get(item)
  if (before) clearTimeout(before.timer)
  const p: Pending = { command, timer: setTimeout(() => settle(item, p), QUIET_MS) }
  pending.set(item, p)
  useUnconfirmedStore.setState((s) => ({ asked: mergeMap(s.asked, { [item]: command }) }))
  await reports.listen(pending.keys())
}

/** the command never reached the server, so there is nothing to wait for */
export function withdraw(item: string, command: string): void {
  const p = pending.get(item)
  if (p?.command !== command) return
  settle(item, p)
  if (useUnconfirmedStore.getState().asked[item] === command) clearUnconfirmed([item])
}

function onReport(item: string, value: string): void {
  const p = pending.get(item)
  if (!p) return
  const first = p.reported === undefined
  p.reported = value
  // a change reaches the items store and clears the hold there; an answer that changes nothing never
  // will, and clearing a changing one here would show the old state until the change lands
  if (currentState(item) === value) clearUnconfirmed([item])
  if (first) {
    clearTimeout(p.timer)
    p.timer = setTimeout(() => settle(item, p), JUDGE_MS)
  }
}

function settle(item: string, p: Pending): void {
  if (pending.get(item) !== p) return
  clearTimeout(p.timer)
  pending.delete(item)
  if (p.reported !== undefined && contradicts(p.command, p.reported)) {
    notify(i18n.t('Sent {{command}} to {{item}}, but it reported {{state}}', { command: p.command, item, state: p.reported }))
  }
  if (pending.size === 0) {
    idleTimer ??= setTimeout(() => {
      idleTimer = null
      if (pending.size === 0) reports.close()
    }, LINGER_MS)
  }
}

/** a state arrived, so whatever was waiting on these items is answered - rightly or wrongly */
export function clearUnconfirmed(items: string[]): void {
  const asked = useUnconfirmedStore.getState().asked
  if (!items.some((name) => name in asked)) return
  const drop = new Set(items)
  const next = emptyMap<string>()
  for (const [name, value] of Object.entries(asked)) {
    if (!drop.has(name)) next[name] = value
  }
  useUnconfirmedStore.setState({ asked: next })
}

export function useUnconfirmed(item: string | undefined): string | undefined {
  return useUnconfirmedStore((s) => (item === undefined ? undefined : s.asked[item]))
}
