/**
 * Lighting presets - openHAB scenes, read through the role-shaped windows the rules API
 * offers. Every device gets the summaries (names, status items) and can activate; an
 * administrator additionally holds the full presets (per-light values) for editing and for
 * value-matched active detection. The scene on the server is the single source of truth:
 * nothing here caches values across sessions or mirrors them anywhere.
 */
import { create } from 'zustand'
import { createOrUpdateRule, createRule, deleteRule, listRuleSummaries, listRulesFull, runRule, upsertRule } from '../api/rules'
import { ApiError } from '../api/client'
import { notify } from './notify'
import i18n from '../i18n'
import {
  BRIDGE_UID_PREFIX,
  bridgeRuleFor,
  bridgeUidFor,
  isScene,
  newSceneUid,
  presetFromRule,
  presetOffCommands,
  presetSummaryFromRule,
  ruleFromPreset,
  SCENE_TAG,
  type Preset,
  type PresetSummary,
  type StatusState,
} from '../model/presets'
import { commandItem } from '../widgets/common/command'
import { useAuthStore } from './auth'
import { clearSettling, markSettling } from './settling'

interface PresetsState {
  /** A load has completed at least once (successfully or not). */
  loaded: boolean
  /** Every scene on the server, in the shape all roles may see. */
  summaries: PresetSummary[]
  /** uid -> full preset. Populated only on administrator devices. */
  full: Record<string, Preset>
  /** Scene uids that currently have a wall-switch bridge rule. */
  bridged: string[]
  /** EVERY rule uid on the server, scenes or not - what a fresh scene uid must not collide with. */
  allRuleUids: string[]
  /** The last load failed with this (server unreachable, ...). Summaries may be stale. */
  error?: string
}

export const usePresetsStore = create<PresetsState>(() => ({
  loaded: false,
  summaries: [],
  full: {},
  bridged: [],
  allRuleUids: [],
}))

let inflight: Promise<void> | null = null
let inflightAdmin = false

/**
 * Load the scene list. Safe for any role. Concurrent calls in the same auth mode share one
 * request (mount-time callers pile up); a call in a DIFFERENT mode starts a fresh load after
 * the running one - the section mounts before the auth probe answers, and the admin re-load
 * must never be swallowed by coalescing with the anonymous load already in flight.
 */
export function loadPresets(): Promise<void> {
  const admin = useAuthStore.getState().status === 'admin'
  if (inflight && inflightAdmin === admin) return inflight
  return startLoad(admin)
}

/**
 * A load that STARTS now, after any in-flight one. What a mutation's refresh needs: a load
 * already running began before the write and would hand back the world as it was.
 */
function reloadPresets(): Promise<void> {
  return startLoad(useAuthStore.getState().status === 'admin')
}

function startLoad(admin: boolean): Promise<void> {
  const prev = inflight ?? Promise.resolve()
  const run = prev.then(() => doLoad(admin))
  inflightAdmin = admin
  inflight = run
  void run.finally(() => {
    if (inflight === run) inflight = null
  })
  return run
}

async function doLoad(admin: boolean): Promise<void> {
  try {
    // The Scene tag covers every scene on the server, whoever made it; the unfiltered list
    // supplies every uid a new scene must avoid (a POST onto a taken uid is refused, but the
    // uid we offer should not collide in the first place). Summary lists work for every role;
    // the full read (values) is the admin extra.
    const [sceneSummaries, allSummaries] = await Promise.all([listRuleSummaries(SCENE_TAG), listRuleSummaries()])
    const summaries = sceneSummaries.map(presetSummaryFromRule)
    const allRuleUids = allSummaries.map((r) => r.uid).filter((u) => typeof u === 'string')
    const bridged = allRuleUids
      .filter((u) => u.startsWith(BRIDGE_UID_PREFIX))
      .map((u) => u.slice(BRIDGE_UID_PREFIX.length))

    let full: Record<string, Preset> = {}
    if (admin) {
      try {
        const rules = await listRulesFull(SCENE_TAG)
        full = Object.fromEntries(rules.filter(isScene).map((r) => [r.uid, presetFromRule(r)]))
      } catch (err) {
        // A user-role token reaches here when the admin probe was wrong; the summaries are
        // still good, so degrade to the every-role view rather than failing the load.
        if (!(err instanceof ApiError && (err.status === 401 || err.status === 403))) throw err
      }
    }
    usePresetsStore.setState({ loaded: true, summaries, full, bridged, allRuleUids, error: undefined })
  } catch (err) {
    usePresetsStore.setState({ loaded: true, error: err instanceof Error ? err.message : String(err) })
  }
}

/** A fresh scene uid for a new preset, colliding with no rule this device can see. */
export function freeSceneUid(name: string): string {
  return newSceneUid(name, new Set(usePresetsStore.getState().allRuleUids))
}

/**
 * Create or update a preset (administrator). Also keeps the bridge rule consistent: when the
 * preset has a status item and the bridge is wanted, the bridge rule is (re)written to match;
 * otherwise any existing bridge is removed.
 *
 * `create` uses POST, which the server refuses on a taken uid - a new preset must never be
 * able to overwrite a rule this device could not see.
 */
export async function savePreset(preset: Preset, opts?: { bridge?: boolean; create?: boolean }): Promise<void> {
  const rule = ruleFromPreset(preset)
  if (opts?.create) await createRule(rule)
  else await upsertRule(rule)
  const hasBridge = usePresetsStore.getState().bridged.includes(preset.uid)
  const wantBridge = opts?.bridge ?? hasBridge
  const bridge = wantBridge ? bridgeRuleFor(preset) : null
  if (bridge) {
    // verb picked by what we know, so the common path logs no 404/500 console noise
    if (hasBridge) await upsertRule(bridge)
    else await createOrUpdateRule(bridge)
  } else if (hasBridge) {
    await deleteBridgeRule(preset.uid)
  }
  await reloadPresets()
}

/**
 * Switch a preset off: command each of ITS lights off, leaving anything else on the plan alone.
 *
 * Needs the per-light values, which only an administrator can read, so it reports false when it
 * cannot act and the caller falls back to activating - the same behaviour as before the setting
 * existed, rather than a tap that silently does nothing.
 */
export async function deactivatePreset(preset: PresetSummary): Promise<boolean> {
  const offs = presetOffCommands(usePresetsStore.getState().full[preset.uid]?.lights ?? [])
  if (offs.length === 0) return false
  markSettling(offs)
  const accepted = await Promise.all(offs.map((o) => commandItem(o.item, o.command)))
  const refused = offs.filter((_, i) => !accepted[i]).map((o) => o.item)
  if (refused.length > 0) clearSettling(refused)
  return accepted.some(Boolean)
}

/** Delete a preset and its bridge rule, if any (administrator). */
export async function deletePreset(uid: string): Promise<void> {
  await deleteBridgeRule(uid)
  try {
    await deleteRule(uid)
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err
  }
  await reloadPresets()
}

async function deleteBridgeRule(sceneUid: string): Promise<void> {
  try {
    await deleteRule(bridgeUidFor(sceneUid))
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err
  }
}

/**
 * Activate a preset - any role.
 *
 * A preset whose status item is bridged is activated by commanding the item: the bridge then
 * runs the scene, exactly as the wall switch would, and every consumer of that item (other
 * rules, the highlight on every panel) sees the same truth. Without a bridge the scene runs
 * directly, and the status item - which some OTHER system may be consuming - is left alone.
 */
export async function activatePreset(preset: PresetSummary): Promise<boolean> {
  const { bridged, full } = usePresetsStore.getState()
  if (preset.statusItem && bridged.includes(preset.uid)) {
    const command: StatusState = preset.statusState === 'OFF' ? 'OFF' : 'ON'
    markSettling([{ item: preset.statusItem, command }])
    const accepted = await commandItem(preset.statusItem, command)
    if (!accepted) clearSettling([preset.statusItem])
    return accepted
  }
  // Hold the preset's own values on screen while the lights fade to them, or the first thing
  // the plan draws is the device echoing the scene we just left. Only an administrator holds
  // the values, so elsewhere this is empty and the display follows the lights as it always did.
  const lights = full[preset.uid]?.lights ?? []
  markSettling(lights)
  try {
    await runRule(preset.uid)
    return true
  } catch (err) {
    clearSettling(lights.map((l) => l.item))
    // Same contract as commandItem: activation failures must be visible, not console noise.
    notify(
      i18n.t('“{{name}}” could not be activated ({{error}})', {
        name: preset.name,
        error: err instanceof ApiError ? err.status : String(err),
      })
    )
    return false
  }
}
