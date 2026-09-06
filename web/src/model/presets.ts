import { slugify } from './components'
import { parseHsb, sameColor } from './color'

export const SCENE_TAG = 'Scene'
export const NEOHAB_TAG = 'neohab'
export const SCENE_UID_PREFIX = 'nh-scene-'
export const BRIDGE_UID_PREFIX = 'nh-bridge-'

export interface RuleStatus {
  status?: string
  statusDetail?: string
}

export interface RuleModule {
  id: string
  type: string
  configuration?: Record<string, unknown>
}

export interface RuleSummary {
  uid: string
  name?: string
  description?: string
  tags?: string[]
  configuration?: Record<string, unknown>
  status?: RuleStatus
  editable?: boolean
}

export interface SceneRule extends RuleSummary {
  triggers?: RuleModule[]
  conditions?: RuleModule[]
  actions?: RuleModule[]
}

export interface PresetLight {
  item: string
  command: string
}

export type StatusState = 'ON' | 'OFF'

export interface PresetSummary {
  uid: string
  name: string
  editable: boolean
  managed: boolean
  statusItem?: string
  statusState?: StatusState
}

export interface Preset extends PresetSummary {
  lights: PresetLight[]
}

export function isScene(rule: RuleSummary): boolean {
  return Array.isArray(rule.tags) && rule.tags.includes(SCENE_TAG)
}

export function isNeohabRule(rule: RuleSummary): boolean {
  return Array.isArray(rule.tags) && rule.tags.includes(NEOHAB_TAG)
}

// the status item rides in BOTH places of the rule, because 4.x drops `configuration` from the USER-role
// summary
const STATUS_TAG_PREFIX = 'neohab:status:'

export function statusTagFor(item: string, state: StatusState): string {
  return `${STATUS_TAG_PREFIX}${item}:${state}`
}

function statusFromTags(tags: unknown): { statusItem: string; statusState: StatusState } | null {
  if (!Array.isArray(tags)) return null
  for (const t of tags) {
    if (typeof t !== 'string' || !t.startsWith(STATUS_TAG_PREFIX)) continue
    const m = /^(.+):(ON|OFF)$/.exec(t.slice(STATUS_TAG_PREFIX.length))
    if (m && m[1] !== '') return { statusItem: m[1], statusState: m[2] as StatusState }
  }
  return null
}

export function presetSummaryFromRule(rule: RuleSummary): PresetSummary {
  const cfg = rule.configuration
  let statusItem = cfg && typeof cfg.statusItem === 'string' && cfg.statusItem.trim() !== '' ? cfg.statusItem.trim() : undefined
  let statusState: StatusState | undefined = statusItem === undefined ? undefined : cfg?.statusState === 'OFF' ? 'OFF' : 'ON'
  if (statusItem === undefined) {
    const fromTag = statusFromTags(rule.tags)
    if (fromTag) ({ statusItem, statusState } = fromTag)
  }
  return {
    uid: rule.uid,
    name: typeof rule.name === 'string' && rule.name !== '' ? rule.name : rule.uid,
    editable: rule.editable === true,
    managed: isNeohabRule(rule),
    statusItem,
    statusState
  }
}

export function presetLightsFromRule(rule: SceneRule): PresetLight[] {
  if (!Array.isArray(rule.actions)) return []
  const lights: PresetLight[] = []
  for (const a of rule.actions) {
    if (!a || a.type !== 'core.ItemCommandAction') continue
    const cfg = a.configuration
    if (!cfg || typeof cfg.itemName !== 'string' || cfg.itemName === '') continue
    if (cfg.command === undefined || cfg.command === null) continue
    lights.push({ item: cfg.itemName, command: String(cfg.command) })
  }
  return lights
}

export function presetFromRule(rule: SceneRule): Preset {
  return { ...presetSummaryFromRule(rule), lights: presetLightsFromRule(rule) }
}

export function ruleFromPreset(preset: Preset): SceneRule {
  const configuration: Record<string, unknown> = {}
  const tags = [SCENE_TAG, NEOHAB_TAG]
  if (preset.statusItem) {
    const state: StatusState = preset.statusState === 'OFF' ? 'OFF' : 'ON'
    configuration.statusItem = preset.statusItem
    configuration.statusState = state
    tags.push(statusTagFor(preset.statusItem, state))
  }
  return {
    uid: preset.uid,
    name: preset.name,
    tags,
    configuration,
    triggers: [],
    conditions: [],
    actions: preset.lights.map((l, i) => ({
      id: String(i + 1),
      type: 'core.ItemCommandAction',
      configuration: { itemName: l.item, command: l.command }
    }))
  }
}

export function newSceneUid(name: string, takenRuleUids: Set<string>): string {
  const taken = new Set([...takenRuleUids].filter((u) => u.startsWith(SCENE_UID_PREFIX)).map((u) => u.slice(SCENE_UID_PREFIX.length)))
  return SCENE_UID_PREFIX + slugify(name, 'preset', taken)
}

export function bridgeUidFor(sceneUid: string): string {
  return BRIDGE_UID_PREFIX + sceneUid
}

export function bridgeRuleFor(preset: PresetSummary): SceneRule | null {
  if (!preset.statusItem) return null
  const state: StatusState = preset.statusState === 'OFF' ? 'OFF' : 'ON'
  return {
    uid: bridgeUidFor(preset.uid),
    name: `${preset.name}: run when ${preset.statusItem} turns ${state}`,
    description: 'Wall-switch bridge for a neohab lighting preset.',
    tags: [NEOHAB_TAG],
    configuration: {},
    triggers: [
      {
        id: '1',
        type: 'core.ItemStateChangeTrigger',
        configuration: { itemName: preset.statusItem, state }
      }
    ],
    conditions: [],
    actions: [
      {
        id: '2',
        type: 'core.RunRuleAction',
        configuration: { ruleUIDs: [preset.uid], considerConditions: true }
      }
    ]
  }
}

export function exportableRule(rule: SceneRule): SceneRule {
  const out: SceneRule = {
    uid: rule.uid,
    name: rule.name,
    tags: Array.isArray(rule.tags) ? rule.tags : [],
    configuration: rule.configuration ?? {},
    triggers: Array.isArray(rule.triggers) ? rule.triggers : [],
    conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
    actions: Array.isArray(rule.actions) ? rule.actions : []
  }
  if (typeof rule.description === 'string' && rule.description !== '') out.description = rule.description
  return out
}

export function isImportableSceneRule(rule: unknown): rule is SceneRule {
  if (rule === null || typeof rule !== 'object') return false
  const r = rule as SceneRule
  if (typeof r.uid !== 'string') return false
  if (!r.uid.startsWith(SCENE_UID_PREFIX) && !r.uid.startsWith(BRIDGE_UID_PREFIX)) return false
  return isNeohabRule(r)
}

const looksHsb = (s: string) => {
  const parts = s.split(',')
  return parts.length === 3 && parts.every((p) => p.trim() !== '' && Number.isFinite(Number(p)))
}

export function commandMatchesState(command: string, state: string | undefined): boolean {
  if (state === undefined || state === 'NULL' || state === 'UNDEF') return false
  if (command === state) return true
  if (looksHsb(command) && looksHsb(state)) return sameColor(parseHsb(command), parseHsb(state))
  const cn = Number(command)
  const sn = Number(state)
  if (Number.isFinite(cn) && Number.isFinite(sn) && command.trim() !== '' && state.trim() !== '') {
    return Math.abs(cn - sn) <= 1
  }
  return false
}

export function presetActive(lights: PresetLight[], getState: (item: string) => string | undefined): boolean {
  if (!Array.isArray(lights) || lights.length === 0) return false
  return lights.every((l) => commandMatchesState(l.command, getState(l.item)))
}

export function offCommandFor(command: string): string {
  if (typeof command !== 'string') return 'OFF'
  if (looksHsb(command)) return 'OFF'
  const n = Number(command)
  return Number.isFinite(n) && command.trim() !== '' ? '0' : 'OFF'
}

export function presetOffCommands(lights: PresetLight[]): PresetLight[] {
  if (!Array.isArray(lights)) return []
  return lights.map((l) => ({ item: l.item, command: offCommandFor(l.command) }))
}

export type CommandKind = 'color' | 'level' | 'onoff' | 'text'

export function commandKind(command: string): CommandKind {
  if (typeof command !== 'string') return 'text'
  if (looksHsb(command)) return 'color'
  if (command === 'ON' || command === 'OFF') return 'onoff'
  const n = Number(command)
  if (Number.isFinite(n) && command.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 100) return 'level'
  return 'text'
}

export function commandForState(type: string | undefined, state: string | undefined): string | null {
  if (state === undefined || state === '' || state === 'NULL' || state === 'UNDEF') return null
  const base = (type ?? '').split(':')[0]
  if (base === 'Color' || looksHsb(state)) {
    const { h, s, b } = parseHsb(state)
    return `${Math.round(h) % 360},${Math.round(s)},${Math.round(b)}`
  }
  const n = Number(state)
  if (Number.isFinite(n) && state.trim() !== '') {
    return String(Math.round(n * 100) / 100)
  }
  return state
}
