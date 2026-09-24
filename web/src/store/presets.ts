import { create } from 'zustand'
import { createOrUpdateRule, createRule, deleteRule, getRule, listRuleSummaries, listRulesFull, runRule, upsertRule } from '../api/rules'
import { getItem } from '../api/items'
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
  type PresetLight,
  type PresetSummary,
  type StatusState
} from '../model/presets'
import { commandItem } from '../widgets/common/command'
import { useAuthStore } from './auth'
import { useCatalogStore } from './catalog'
import { useItemsStore } from './items'
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
  // read back first: a trigger or a script action somebody added in Main UI survives the save
  const existing = opts?.create
    ? undefined
    : await getRule(preset.uid).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return undefined
        throw err
      })
  const rule = ruleFromPreset(preset, existing)
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

type ItemKind = { type?: string; groupType?: string }

async function itemKinds(names: string[]): Promise<Map<string, ItemKind>> {
  const out = new Map<string, ItemKind>()
  const catalog = useCatalogStore.getState()
  const unknown: string[] = []
  for (const n of names) {
    const found = catalog.loaded ? catalog.items.find((i) => i.name === n) : undefined
    if (found) out.set(n, found)
    else unknown.push(n)
  }
  // an item the server cannot describe is left alone rather than guessed at
  await Promise.all(
    unknown.map((n) =>
      getItem(n).then(
        (it) => void out.set(n, it),
        () => undefined
      )
    )
  )
  return out
}

const opposite = (s: StatusState | undefined): StatusState => (s === 'OFF' ? 'ON' : 'OFF')

/**
 * Switches a preset's lights off. False when this device cannot tell which items the preset
 * commands (a signed-out viewer, and a preset saved before its items were tagged), so the caller
 * can fall back to running it.
 */
export async function deactivatePreset(preset: PresetSummary): Promise<boolean> {
  const items = usePresetsStore.getState().full[preset.uid]?.lights.map((l) => l.item) ?? preset.lightItems ?? []
  if (items.length === 0) return false
  const kinds = await itemKinds(items)
  const offs = presetOffCommands(items, (item) => kinds.get(item))
  // a wall switch left at its "on" state would keep the chip lit and make the next tap a no-op
  const bridged = preset.statusItem && usePresetsStore.getState().bridged.includes(preset.uid)
  const sends: PresetLight[] =
    bridged && preset.statusItem ? [...offs, { item: preset.statusItem, command: opposite(preset.statusState) }] : offs
  if (sends.length === 0) {
    notify(i18n.t('Nothing in “{{name}}” can be switched off', { name: preset.name }))
    return true
  }
  markSettling(sends)
  const accepted = await Promise.all(sends.map((o) => commandItem(o.item, o.command)))
  const refused = sends.filter((_, i) => !accepted[i]).map((o) => o.item)
  if (refused.length > 0) clearSettling(refused)
  return true
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
  const command: StatusState = preset.statusState === 'OFF' ? 'OFF' : 'ON'
  // the bridge fires on a CHANGE, so a switch already at that state would take the command and run
  // nothing - then the scene is run directly instead
  const already = preset.statusItem !== undefined && useItemsStore.getState().states[preset.statusItem]?.state === command
  if (preset.statusItem && bridged.includes(preset.uid) && !already) {
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
    notify(i18n.t('“{{name}}” could not be activated: {{error}}', { name: preset.name, error: errorText(err) }))
    return false
  }
}
