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
  // the items the scene commands, readable without the full rule (which is admin-only)
  lightItems?: string[]
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
// and the scene's items ride in a tag too, so a signed-out wall panel can switch a preset off
const LIGHTS_TAG_PREFIX = 'neohab:lights:'
const ITEM_NAME = /^[A-Za-z0-9_]+$/

export function statusTagFor(item: string, state: StatusState): string {
  return `${STATUS_TAG_PREFIX}${item}:${state}`
}

function lightsTagFor(lights: PresetLight[]): string | null {
  const names = [...new Set(lights.map((l) => l.item).filter((n) => ITEM_NAME.test(n)))]
  return names.length > 0 ? LIGHTS_TAG_PREFIX + names.join(',') : null
}

function lightItemsFromTags(tags: unknown): string[] | undefined {
  if (!Array.isArray(tags)) return undefined
  const tag = tags.find((t): t is string => typeof t === 'string' && t.startsWith(LIGHTS_TAG_PREFIX))
  if (!tag) return undefined
  const names = tag
    .slice(LIGHTS_TAG_PREFIX.length)
    .split(',')
    .filter((n) => ITEM_NAME.test(n))
  return names.length > 0 ? names : undefined
}

const isOwnTag = (t: unknown): boolean =>
  t === SCENE_TAG || t === NEOHAB_TAG || (typeof t === 'string' && (t.startsWith(STATUS_TAG_PREFIX) || t.startsWith(LIGHTS_TAG_PREFIX)))

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
  const summary: PresetSummary = {
    uid: rule.uid,
    name: typeof rule.name === 'string' && rule.name !== '' ? rule.name : rule.uid,
    editable: rule.editable === true,
    managed: isNeohabRule(rule),
    statusItem,
    statusState
  }
  const lightItems = lightItemsFromTags(rule.tags)
  if (lightItems) summary.lightItems = lightItems
  return summary
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
  const summary = presetSummaryFromRule(rule)
  const preset: Preset = { ...summary, lights: presetLightsFromRule(rule) }
  delete preset.lightItems
  return preset
}

const COMMAND_ACTION = 'core.ItemCommandAction'

const plainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const modulesOf = (list: unknown): RuleModule[] =>
  Array.isArray(list) ? list.filter((m): m is RuleModule => plainObject(m) && typeof m.id === 'string' && typeof m.type === 'string') : []

/**
 * The rule a preset is stored as. `existing` is the rule already on the server, if there is one:
 * whatever somebody added to it in Main UI (a trigger, a condition, a script action, a description)
 * is kept, and only the item commands and neohab's own tags and settings are replaced. Pass it only
 * when it came from the server - a rule read out of a file is never trusted this way.
 */
export function ruleFromPreset(preset: Preset, existing?: SceneRule): SceneRule {
  const configuration: Record<string, unknown> = plainObject(existing?.configuration) ? { ...existing.configuration } : {}
  delete configuration.statusItem
  delete configuration.statusState
  const tags = [SCENE_TAG, NEOHAB_TAG]
  if (preset.statusItem) {
    const state: StatusState = preset.statusState === 'OFF' ? 'OFF' : 'ON'
    configuration.statusItem = preset.statusItem
    configuration.statusState = state
    tags.push(statusTagFor(preset.statusItem, state))
  }
  const lightsTag = lightsTagFor(preset.lights)
  if (lightsTag) tags.push(lightsTag)
  if (Array.isArray(existing?.tags)) {
    for (const t of existing.tags) if (typeof t === 'string' && !isOwnTag(t) && !tags.includes(t)) tags.push(t)
  }

  const triggers = modulesOf(existing?.triggers)
  const conditions = modulesOf(existing?.conditions)
  const previous = modulesOf(existing?.actions)
  const others = previous.filter((a) => a.type !== COMMAND_ACTION)
  // openHAB resolves module handlers by id across the whole rule, so a new id must not reuse one
  const used = new Set([...triggers, ...conditions, ...others].map((m) => m.id))
  let next = 1
  const freshId = (): string => {
    while (used.has(String(next))) next++
    used.add(String(next))
    return String(next)
  }
  const commands: RuleModule[] = preset.lights.map((l) => ({
    id: freshId(),
    type: COMMAND_ACTION,
    configuration: { itemName: l.item, command: l.command }
  }))
  // the commands go back where they were, so a script action that ran after them still does
  const at = previous.findIndex((a) => a.type === COMMAND_ACTION)
  const before = at < 0 ? [] : previous.slice(0, at)
  const after = at < 0 ? others : previous.slice(at).filter((a) => a.type !== COMMAND_ACTION)

  const rule: SceneRule = {
    uid: preset.uid,
    name: preset.name,
    tags,
    configuration,
    triggers,
    conditions,
    actions: [...before, ...commands, ...after]
  }
  if (typeof existing?.description === 'string' && existing.description !== '') rule.description = existing.description
  return rule
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

const OWN_RULE_UID = /^nh-(scene|bridge)-[A-Za-z0-9_-]+$/

export function isImportableSceneRule(rule: unknown): rule is SceneRule {
  if (rule === null || typeof rule !== 'object') return false
  const r = rule as SceneRule
  if (typeof r.uid !== 'string' || !OWN_RULE_UID.test(r.uid)) return false
  return isNeohabRule(r)
}

/**
 * What a backup's presets are allowed to write. A rule out of a file is never written as it stands:
 * it is read as a preset and rebuilt, and a bridge is rebuilt from the scene it runs, so only the
 * shapes neohab itself makes can reach the server. A cron trigger, a script action or a rule run in
 * the file is dropped. `serverRules` are the rules already there, whose own additions are kept.
 */
export function rulesFromBackup(fileRules: unknown, serverRules: SceneRule[] = []): SceneRule[] {
  if (!Array.isArray(fileRules)) return []
  const server = new Map(rulesOf(serverRules).map((r) => [r.uid, r]))
  const scenes = new Map<string, Preset>()
  for (const r of fileRules) {
    if (!isImportableSceneRule(r) || !r.uid.startsWith(SCENE_UID_PREFIX) || !isScene(r)) continue
    scenes.set(r.uid, presetFromRule(r))
  }
  const out = [...scenes.values()].map((p) => ruleFromPreset(p, server.get(p.uid)))
  for (const r of fileRules) {
    if (!isImportableSceneRule(r) || !r.uid.startsWith(BRIDGE_UID_PREFIX)) continue
    const scene = scenes.get(r.uid.slice(BRIDGE_UID_PREFIX.length))
    const bridge = scene ? bridgeRuleFor(scene) : null
    if (bridge) out.push(bridge)
  }
  return out
}

const rulesOf = (list: unknown): SceneRule[] =>
  Array.isArray(list) ? list.filter((r): r is SceneRule => plainObject(r) && typeof r.uid === 'string') : []

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

const SWITCHABLE = new Set(['Switch', 'Dimmer', 'Color'])

// "turn the lights off" reaches lights and nothing else: a blind in the same scene would read 0 as
// fully open, and a player or a number has no off at all. Switch, Dimmer and Color all take OFF.
export function switchesOff(type: string | undefined, groupType?: string): boolean {
  const base = (type ?? '').split(':')[0]
  if (base === 'Group') return SWITCHABLE.has((groupType ?? '').split(':')[0])
  return SWITCHABLE.has(base)
}

export function presetOffCommands(
  items: string[],
  typeOf: (item: string) => { type?: string; groupType?: string } | undefined
): PresetLight[] {
  if (!Array.isArray(items)) return []
  return [...new Set(items)]
    .filter((item) => {
      const t = typeOf(item)
      return t !== undefined && switchesOff(t.type, t.groupType)
    })
    .map((item) => ({ item, command: 'OFF' }))
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
