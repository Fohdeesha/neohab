import { create } from 'zustand'
import { ApiError } from '../api/client'
import { listRuleSummaries } from '../api/rules'
import type { RuleSummary } from '../model/presets'
import { findRule, ruleSummaries } from '../model/rules'

/**
 * The rule list a button needs to name its rule, to tell a deleted one from a running one, and to see
 * that openHAB has it disabled, which runnow never reports. The summary is readable by a viewer on 4.0+;
 * on 3.x a signed-out read is refused, and then nothing is known rather than everything missing.
 */
export type RulesStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'failed'

interface RulesState {
  rules: RuleSummary[]
  status: RulesStatus
}

export const useRulesStore = create<RulesState>(() => ({ rules: [], status: 'idle' }))

// a script made in Main UI after this page loaded has to be pickable without a reload
const STALE_MS = 30_000

let generation = 0
let loadedAt = 0
let inflight: Promise<void> | null = null

function load(): Promise<void> {
  const gen = generation
  if (useRulesStore.getState().status !== 'ready') useRulesStore.setState({ status: 'loading' })
  const run = listRuleSummaries()
    .then((value) => {
      if (gen !== generation) return
      loadedAt = Date.now()
      useRulesStore.setState({ rules: ruleSummaries(value), status: 'ready' })
    })
    .catch((err: unknown) => {
      if (gen !== generation) return
      // a refused read is an answer, and a different one from "the server did not respond"
      const denied = err instanceof ApiError && (err.status === 401 || err.status === 403)
      // a refresh that fails keeps the list it had
      if (useRulesStore.getState().status !== 'ready' || denied) useRulesStore.setState({ status: denied ? 'denied' : 'failed' })
    })
  inflight = run
  void run.finally(() => {
    if (inflight === run) inflight = null
  })
  return run
}

export function ensureRules(opts?: { refresh?: boolean }): void {
  const { status } = useRulesStore.getState()
  if (inflight) return
  if (status === 'ready' && !(opts?.refresh && Date.now() - loadedAt > STALE_MS)) return
  if (status === 'denied' && !opts?.refresh) return
  void load()
}

/**
 * After a run: what openHAB says about the rule NOW. A load already in flight began before the run, so
 * this one starts after it rather than sharing it.
 */
export async function rereadRule(uid: string): Promise<RuleSummary | undefined> {
  if (inflight) await inflight.catch(() => undefined)
  await load()
  return findRule(useRulesStore.getState().rules, uid)
}

/** After a sign-in or sign-out: what this device may read has changed. */
export function forgetRules(): void {
  const before = useRulesStore.getState().status
  generation++
  loadedAt = 0
  inflight = null
  useRulesStore.setState({ rules: [], status: 'idle' })
  if (before !== 'idle') void load()
}

/** The rule, once the answer is known; undefined while loading or when the list could not be read. */
export function knownRule(state: RulesState, uid: string): RuleSummary | 'missing' | undefined {
  if (state.status !== 'ready') return undefined
  return findRule(state.rules, uid) ?? 'missing'
}
