/**
 * The slice of openHAB's rules REST API that lighting presets need.
 *
 * Role boundaries, verified live against 4.3.7 and in the 5.x core source:
 *   - `GET /rest/rules?summary=true` and `POST .../runnow` work for the USER role (including
 *     the anonymous implicit user), so any wall panel can list and activate presets.
 *   - The full listing (which carries every rule's actions, i.e. the stored light values) and
 *     all writes are administrator-only.
 */
import { api, ApiError } from './client'
import type { RuleSummary, SceneRule } from '../model/presets'

/** Summary of every rule carrying the given tag (or every rule at all). Works for every role. */
export function listRuleSummaries(tag?: string): Promise<RuleSummary[]> {
  const filter = tag ? `tags=${encodeURIComponent(tag)}&` : ''
  return api.get<RuleSummary[]>(`/rest/rules?${filter}summary=true`)
}

/** Full rules (with actions) carrying the given tag. Administrator only - 401 otherwise. */
export function listRulesFull(tag: string): Promise<SceneRule[]> {
  return api.get<SceneRule[]>(`/rest/rules?tags=${encodeURIComponent(tag)}`)
}

export function createRule(rule: SceneRule): Promise<void> {
  return api.post('/rest/rules', rule)
}

export function updateRule(rule: SceneRule): Promise<void> {
  return api.put(`/rest/rules/${encodeURIComponent(rule.uid)}`, rule)
}

export function deleteRule(uid: string): Promise<void> {
  return api.delete(`/rest/rules/${encodeURIComponent(uid)}`)
}

/**
 * Create-or-update for a rule believed to EXIST: update first (idempotent), fall back to
 * create on 404. Same reasoning as the configuration store's upsert - another tab or Main UI
 * may have added or removed the rule since this tab last listed them.
 */
export async function upsertRule(rule: SceneRule): Promise<void> {
  try {
    await updateRule(rule)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) await createRule(rule)
    else throw err
  }
}

/**
 * The mirror image, for a rule believed to be NEW: create first, falling back to update when
 * the uid exists after all (the server answers a duplicate POST with 409/500). Callers pick
 * by what they know so the COMMON path never produces the browser's logged 404/500 - the
 * same console-noise class the component store's serverUids bookkeeping exists for.
 */
export async function createOrUpdateRule(rule: SceneRule): Promise<void> {
  try {
    await createRule(rule)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 500)) await updateRule(rule)
    else throw err
  }
}

/** Run a rule/scene now. Works for every role. */
export function runRule(uid: string): Promise<void> {
  return api.post(`/rest/rules/${encodeURIComponent(uid)}/runnow`, '', { text: true })
}
