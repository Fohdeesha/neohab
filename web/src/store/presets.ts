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
  type StatusState
} from '../model/presets'
import { commandItem } from '../widgets/common/command'
import { useAuthStore } from './auth'
import { clearSettling, markSettling } from './settling'
import { emptyMap, mergeMap } from '../model/lookup'
import { errorText } from '../api/errors'

interface PresetsState {
  loaded: boolean
  summaries: PresetSummary[]
  full: Record<string, Preset>
  bridged: string[]
  allRuleUids: string[]
  error?: string
}

export const usePresetsStore = create<PresetsState>(() => ({
  loaded: false,
  summaries: [],
  // keyed by rule uid, so prototype-free before the load as well as after it
  full: emptyMap(),
  bridged: [],
  allRuleUids: []
}))

let inflight: Promise<void> | null = null
let inflightAdmin = false

export function loadPresets(): Promise<void> {
  const admin = useAuthStore.getState().status === 'admin'
  if (inflight && inflightAdmin === admin) return inflight
  return startLoad(admin)
}

// a load already in flight began BEFORE the write, so a mutation needs one that starts after it
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
    const [sceneSummaries, allSummaries] = await Promise.all([listRuleSummaries(SCENE_TAG), listRuleSummaries()])
    const summaries = sceneSummaries.map(presetSummaryFromRule)
    const allRuleUids = allSummaries.map((r) => r.uid).filter((u) => typeof u === 'string')
    const bridged = allRuleUids.filter((u) => u.startsWith(BRIDGE_UID_PREFIX)).map((u) => u.slice(BRIDGE_UID_PREFIX.length))

    let full: Record<string, Preset> = emptyMap()
    if (admin) {
      try {
        const rules = await listRulesFull(SCENE_TAG)
        // keyed by rule uids the server chose, so prototype-free (see model/lookup)
        full = mergeMap(...rules.filter(isScene).map((r) => ({ [r.uid]: presetFromRule(r) })))
      } catch (err) {
        if (!(err instanceof ApiError && (err.status === 401 || err.status === 403))) throw err
      }
    }
    usePresetsStore.setState({ loaded: true, summaries, full, bridged, allRuleUids, error: undefined })
  } catch (err) {
    usePresetsStore.setState({ loaded: true, error: errorText(err) })
  }
}

export function freeSceneUid(name: string): string {
  return newSceneUid(name, new Set(usePresetsStore.getState().allRuleUids))
}

export async function savePreset(preset: Preset, opts?: { bridge?: boolean; create?: boolean }): Promise<void> {
  const rule = ruleFromPreset(preset)
  if (opts?.create) await createRule(rule)
  else await upsertRule(rule)
  const hasBridge = usePresetsStore.getState().bridged.includes(preset.uid)
  const wantBridge = opts?.bridge ?? hasBridge
  const bridge = wantBridge ? bridgeRuleFor(preset) : null
  if (bridge) {
    if (hasBridge) await upsertRule(bridge)
    else await createOrUpdateRule(bridge)
  } else if (hasBridge) {
    await deleteBridgeRule(preset.uid)
  }
  await reloadPresets()
}

export async function deactivatePreset(preset: PresetSummary): Promise<boolean> {
  const offs = presetOffCommands(usePresetsStore.getState().full[preset.uid]?.lights ?? [])
  if (offs.length === 0) return false
  markSettling(offs)
  const accepted = await Promise.all(offs.map((o) => commandItem(o.item, o.command)))
  const refused = offs.filter((_, i) => !accepted[i]).map((o) => o.item)
  if (refused.length > 0) clearSettling(refused)
  return accepted.some(Boolean)
}

export async function deletePreset(uid: string): Promise<void> {
  const bridgeUid = bridgeUidFor(uid)
  const rules = await listRuleSummaries().catch(() => null)
  if (rules === null || rules.some((r) => r.uid === bridgeUid)) await deleteBridgeRule(uid)
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

export async function activatePreset(preset: PresetSummary): Promise<boolean> {
  const { bridged, full } = usePresetsStore.getState()
  if (preset.statusItem && bridged.includes(preset.uid)) {
    const command: StatusState = preset.statusState === 'OFF' ? 'OFF' : 'ON'
    markSettling([{ item: preset.statusItem, command }])
    const accepted = await commandItem(preset.statusItem, command)
    if (!accepted) clearSettling([preset.statusItem])
    return accepted
  }
  const lights = full[preset.uid]?.lights ?? []
  markSettling(lights)
  try {
    await runRule(preset.uid)
    return true
  } catch (err) {
    clearSettling(lights.map((l) => l.item))
    notify(
      i18n.t('“{{name}}” could not be activated ({{error}})', {
        name: preset.name,
        error: err instanceof ApiError ? err.status : String(err)
      })
    )
    return false
  }
}
