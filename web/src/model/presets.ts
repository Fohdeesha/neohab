/**
 * Lighting presets, stored as openHAB scenes.
 *
 * A preset is a managed rule in the server's rule registry: tagged "Scene" (so Main UI shows
 * it in its own scene editor), carrying one `core.ItemCommandAction` per light, and activated
 * with `runnow`. The values live in the scene and nowhere else - neohab keeps no copy.
 *
 * Role boundaries this module is designed around (verified against openHAB 4.3.7 and the 5.x
 * source): every device can LIST scenes (summary: uid, name, tags, top-level configuration)
 * and ACTIVATE them; reading the per-light values inside, and any write, is administrator
 * territory. That is why a preset's optional status item lives in the scene's top-level
 * `configuration` block - it is the one content field a signed-out wall panel can read, so
 * active-preset highlighting works everywhere without mirroring the values.
 *
 * A scene can come from Main UI or a hand edit too, so every field read here is untrusted.
 */
import { slugify } from './components'
import { parseHsb, sameColor } from './color'

export const SCENE_TAG = 'Scene'
export const NEOHAB_TAG = 'neohab'
export const SCENE_UID_PREFIX = 'nh-scene-'
export const BRIDGE_UID_PREFIX = 'nh-bridge-'

/* ---------- rule DTO shapes (subset of openHAB's RuleDTO) ---------- */

export interface RuleStatus {
  status?: string
  statusDetail?: string
}

export interface RuleModule {
  id: string
  type: string
  configuration?: Record<string, unknown>
}

/** What the USER-role summary listing returns. */
export interface RuleSummary {
  uid: string
  name?: string
  description?: string
  tags?: string[]
  configuration?: Record<string, unknown>
  status?: RuleStatus
  editable?: boolean
}

/** The full rule, as admins read and write it. */
export interface SceneRule extends RuleSummary {
  triggers?: RuleModule[]
  conditions?: RuleModule[]
  actions?: RuleModule[]
}

/* ---------- preset model ---------- */

export interface PresetLight {
  item: string
  command: string
}

export type StatusState = 'ON' | 'OFF'

/** What every role knows about a preset. */
export interface PresetSummary {
  uid: string
  name: string
  /** False for scenes from a non-managed provider - offered for activation, never for editing. */
  editable: boolean
  /** Carries the neohab tag, i.e. was created here (drives export and the manager list). */
  managed: boolean
  /** Proxy Switch whose state mirrors "this preset is active" (and can trigger it). */
  statusItem?: string
  /** Which state of the status item means active. */
  statusState?: StatusState
}

/** The full preset - summary plus the per-light values (admin reads only). */
export interface Preset extends PresetSummary {
  lights: PresetLight[]
}

export function isScene(rule: RuleSummary): boolean {
  return Array.isArray(rule.tags) && rule.tags.includes(SCENE_TAG)
}

export function isNeohabRule(rule: RuleSummary): boolean {
  return Array.isArray(rule.tags) && rule.tags.includes(NEOHAB_TAG)
}

/**
 * The status item rides in TWO places of the same rule, written together and so unable to
 * drift: the `configuration` block (self-documenting for anyone reading the rule) and a
 * `neohab:status:<item>:<state>` tag. The tag is load-bearing: openHAB 4.x omits
 * `configuration` from the USER-role summary listing (verified live on 4.3.7; 5.x includes
 * it), and the summary is all a signed-out wall panel can read - without the tag, the
 * active-preset highlight would silently not exist there.
 */
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
  let statusItem =
    cfg && typeof cfg.statusItem === 'string' && cfg.statusItem.trim() !== '' ? cfg.statusItem.trim() : undefined
  let statusState: StatusState | undefined =
    statusItem === undefined ? undefined : cfg?.statusState === 'OFF' ? 'OFF' : 'ON'
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
    statusState,
  }
}

/** The per-light values out of a scene's actions. Every read guarded: scenes are stored input. */
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

/** Build the scene rule a preset is stored as. */
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
      configuration: { itemName: l.item, command: l.command },
    })),
  }
}

/** A fresh scene uid from a display name, de-duped against every existing rule uid. */
export function newSceneUid(name: string, takenRuleUids: Set<string>): string {
  const taken = new Set(
    [...takenRuleUids].filter((u) => u.startsWith(SCENE_UID_PREFIX)).map((u) => u.slice(SCENE_UID_PREFIX.length))
  )
  return SCENE_UID_PREFIX + slugify(name, 'preset', taken)
}

/* ---------- the wall-switch bridge ---------- */

export function bridgeUidFor(sceneUid: string): string {
  return BRIDGE_UID_PREFIX + sceneUid
}

/**
 * The rule that lets an existing wall switch drive a preset: when the status item changes to
 * the chosen state, run the scene. Kept as its own rule (not a trigger on the scene) so the
 * scene stays a plain scene in every editor that knows the convention.
 *
 * Module ids are unique across the WHOLE rule, not per section: openHAB resolves module
 * handlers by id, and a trigger sharing an id with an action is handed the action's handler
 * and never initializes (HANDLER_INITIALIZING_ERROR - found live, not in any documentation).
 */
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
        configuration: { itemName: preset.statusItem, state },
      },
    ],
    conditions: [],
    actions: [
      {
        id: '2',
        type: 'core.RunRuleAction',
        configuration: { ruleUIDs: [preset.uid], considerConditions: true },
      },
    ],
  }
}

/* ---------- backup / restore ---------- */

/** A rule as a backup carries it: the authored fields, none of the server-derived state. */
export function exportableRule(rule: SceneRule): SceneRule {
  const out: SceneRule = {
    uid: rule.uid,
    name: rule.name,
    tags: Array.isArray(rule.tags) ? rule.tags : [],
    configuration: rule.configuration ?? {},
    triggers: Array.isArray(rule.triggers) ? rule.triggers : [],
    conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
    actions: Array.isArray(rule.actions) ? rule.actions : [],
  }
  if (typeof rule.description === 'string' && rule.description !== '') out.description = rule.description
  return out
}

/**
 * May this rule be written by a backup import? Only neohab's own preset rules qualify - a
 * backup must never be a way to overwrite an arbitrary rule on the server (the same lesson the
 * partial-export validator learned about the `settings` component: restrict WHICH uids may
 * appear, not just their shape).
 */
export function isImportableSceneRule(rule: unknown): rule is SceneRule {
  if (rule === null || typeof rule !== 'object') return false
  const r = rule as SceneRule
  if (typeof r.uid !== 'string') return false
  if (!r.uid.startsWith(SCENE_UID_PREFIX) && !r.uid.startsWith(BRIDGE_UID_PREFIX)) return false
  return isNeohabRule(r)
}

/* ---------- state matching ---------- */

const looksHsb = (s: string) => {
  const parts = s.split(',')
  return parts.length === 3 && parts.every((p) => p.trim() !== '' && Number.isFinite(Number(p)))
}

/**
 * Does a live item state satisfy a preset command? Tolerant the way devices are imprecise:
 * numbers may come back a point off (dimmer rounding), colors are compared in RGB space the
 * way the color widget does, everything else is compared as the exact string.
 */
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

/** True when every light of the preset currently holds its stored value. */
export function presetActive(lights: PresetLight[], getState: (item: string) => string | undefined): boolean {
  if (!Array.isArray(lights) || lights.length === 0) return false
  return lights.every((l) => commandMatchesState(l.command, getState(l.item)))
}

/**
 * The command that switches a light off, decided from the SHAPE of the value the preset sets it
 * to - not from the item's type, which a scene does not record.
 *
 * A colour is switched off with OFF rather than "0,0,0": openHAB takes the brightness to zero
 * and keeps the hue, so turning it back on returns the colour it had. A numeric light goes to 0,
 * which is right for a Dimmer and for a plain Number an OFF would be refused on.
 */
export function offCommandFor(command: string): string {
  if (typeof command !== 'string') return 'OFF'
  if (looksHsb(command)) return 'OFF'
  const n = Number(command)
  return Number.isFinite(n) && command.trim() !== '' ? '0' : 'OFF'
}

/** Every light of a preset, with the command that switches it off. */
export function presetOffCommands(lights: PresetLight[]): PresetLight[] {
  if (!Array.isArray(lights)) return []
  return lights.map((l) => ({ item: l.item, command: offCommandFor(l.command) }))
}

/* ---------- editing a stored value ---------- */

export type CommandKind = 'color' | 'level' | 'onoff' | 'text'

/**
 * Which control fits a stored command, decided from the command's SHAPE - a scene records no
 * item type, and the item may not even be on the plan being edited.
 *
 * Only a whole number in 0-100 gets a slider. That is a dimmer; anything else numeric (a 22.5
 * setpoint, a value past 100) keeps a text box, because a slider would round it to something
 * the user never asked for the moment it was touched.
 */
export function commandKind(command: string): CommandKind {
  if (typeof command !== 'string') return 'text'
  if (looksHsb(command)) return 'color'
  if (command === 'ON' || command === 'OFF') return 'onoff'
  const n = Number(command)
  if (Number.isFinite(n) && command.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 100) return 'level'
  return 'text'
}

/* ---------- capturing current state ---------- */

/**
 * The command that would reproduce an item's current state, or null when the state cannot be
 * captured (unknown, NULL, UNDEF). Colors are normalised to integer "H,S,B" with the hue
 * wrapped below 360, since HSBType rejects 360 itself with a 400.
 */
export function commandForState(type: string | undefined, state: string | undefined): string | null {
  if (state === undefined || state === '' || state === 'NULL' || state === 'UNDEF') return null
  const base = (type ?? '').split(':')[0]
  if (base === 'Color' || looksHsb(state)) {
    const { h, s, b } = parseHsb(state)
    return `${Math.round(h) % 360},${Math.round(s)},${Math.round(b)}`
  }
  const n = Number(state)
  if (Number.isFinite(n) && state.trim() !== '') {
    // Round away float noise but keep genuine decimals (a 22.5 setpoint survives).
    return String(Math.round(n * 100) / 100)
  }
  return state
}
