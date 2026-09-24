import { api, ApiError } from './client'
import type { RuleSummary, SceneRule } from '../model/presets'

export function listRuleSummaries(tag?: string): Promise<RuleSummary[]> {
  const filter = tag ? `tags=${encodeURIComponent(tag)}&` : ''
  return api.get<RuleSummary[]>(`/rest/rules?${filter}summary=true`)
}

export function listRulesFull(tag: string): Promise<SceneRule[]> {
  return api.get<SceneRule[]>(`/rest/rules?tags=${encodeURIComponent(tag)}`)
}

export function getRule(uid: string): Promise<SceneRule> {
  return api.get<SceneRule>(`/rest/rules/${encodeURIComponent(uid)}`)
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

export async function upsertRule(rule: SceneRule): Promise<void> {
  try {
    await updateRule(rule)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) await createRule(rule)
    else throw err
  }
}

export async function createOrUpdateRule(rule: SceneRule): Promise<void> {
  try {
    await createRule(rule)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 500)) await updateRule(rule)
    else throw err
  }
}

export function runRule(uid: string): Promise<void> {
  return api.post(`/rest/rules/${encodeURIComponent(uid)}/runnow`, '', { text: true })
}
