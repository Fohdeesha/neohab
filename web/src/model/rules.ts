import { BRIDGE_UID_PREFIX, SCENE_TAG, type RuleSummary } from './presets'

export const SCRIPT_TAG = 'Script'

export type RuleKind = 'scene' | 'script' | 'rule'

// Main UI's own split: a scene and a script are rules carrying its tag, everything else is a rule
export function ruleKind(rule: RuleSummary): RuleKind {
  const tags = Array.isArray(rule.tags) ? rule.tags : []
  if (tags.includes(SCENE_TAG)) return 'scene'
  if (tags.includes(SCRIPT_TAG)) return 'script'
  return 'rule'
}

export function ruleName(rule: RuleSummary): string {
  const name = typeof rule.name === 'string' ? rule.name.trim() : ''
  return name || rule.uid
}

// the list is the server's answer, so anything without a usable uid is dropped where it is read
export function ruleSummaries(value: unknown): RuleSummary[] {
  if (!Array.isArray(value)) throw new Error('The server answered with something that is not a rule list')
  return value.filter(
    (r): r is RuleSummary =>
      r !== null && typeof r === 'object' && typeof (r as RuleSummary).uid === 'string' && (r as RuleSummary).uid !== ''
  )
}

// a preset's bridge is plumbing neohab made, and HIDDEN is openHAB saying the same about its own
export function pickable(rule: RuleSummary): boolean {
  return !rule.uid.startsWith(BRIDGE_UID_PREFIX) && rule.visibility !== 'HIDDEN'
}

export function findRule(rules: readonly RuleSummary[], uid: string): RuleSummary | undefined {
  return rules.find((r) => r.uid === uid)
}

/**
 * Why openHAB would not run this rule, or null when it would. runnow answers 200 either way and only
 * logs the refusal, so this is the one place the tile can learn it from. UNINITIALIZED is the only
 * status that refuses for good: RUNNING clears when the run ends, INITIALIZING when startup does.
 */
export type RuleBlock = 'disabled' | 'broken'

export function ruleBlock(rule: RuleSummary | undefined): RuleBlock | null {
  if (rule?.status?.status !== 'UNINITIALIZED') return null
  return rule.status.statusDetail === 'DISABLED' ? 'disabled' : 'broken'
}

export interface RuleGroups {
  scenes: RuleSummary[]
  scripts: RuleSummary[]
  rules: RuleSummary[]
  // plain rules that exist but are not listed, so the picker can offer them on request
  hiddenRules: number
}

/**
 * What the picker lists. Scenes and scripts are what a button is usually for, so they are always shown;
 * the plain rules are folded behind one row until asked for, searched, or holding the current pick.
 */
export function groupRules(rules: readonly RuleSummary[], query: string, showAll: boolean, current = ''): RuleGroups {
  const q = query.trim().toLowerCase()
  const matching = rules.filter(pickable).filter((r) => !q || ruleName(r).toLowerCase().includes(q) || r.uid.toLowerCase().includes(q))
  const sorted = [...matching].sort((a, b) => ruleName(a).localeCompare(ruleName(b)))
  const scenes = sorted.filter((r) => ruleKind(r) === 'scene')
  const scripts = sorted.filter((r) => ruleKind(r) === 'script')
  const plain = sorted.filter((r) => ruleKind(r) === 'rule')
  const unfold = showAll || q !== '' || plain.some((r) => r.uid === current)
  return { scenes, scripts, rules: unfold ? plain : [], hiddenRules: unfold ? 0 : plain.length }
}
