/**
 * Preset chips over the floor plan: one per scene on the server, tap to activate, the active
 * one highlighted. Administrators also get "Save preset" - capture the lights as they are now
 * into a new or existing scene, which is exactly the manual workflow (set the room right,
 * then keep it) without ever typing a value.
 *
 * Highlight sources, in order of trust: a preset with a status item follows that item's live
 * state (works signed-out - the summary carries it); otherwise, on administrator devices, the
 * stored values are matched against the live states. A signed-out panel cannot read values,
 * so status-item-less presets simply do not highlight there.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetContext } from '../types'
import { activatePreset, deactivatePreset, loadPresets, usePresetsStore } from '../../store/presets'
import { subscribeItems, useItemsStore } from '../../store/items'
import { useSettledState } from '../../store/settling'
import { presetActive, type PresetSummary } from '../../model/presets'
import { useIsAdmin } from '../../store/auth'
import { PresetSaveDialog } from './PresetSave'
import type { FloorplanLight } from './model'

export function PresetBar({
  ctx,
  lights,
  bottom = 8,
  toggleOff = false,
}: {
  ctx: WidgetContext
  lights: FloorplanLight[]
  bottom?: number
  /** Tapping the highlighted preset switches its lights off instead of running it again. */
  toggleOff?: boolean
}) {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  const { loaded, summaries, full } = usePresetsStore()
  const [saving, setSaving] = useState(false)

  // Admin status changes what a load returns (the full values), so it re-runs on the flip.
  useEffect(() => {
    void loadPresets()
  }, [admin])

  // The chips need the status items' live states; the plan's own lights are already tracked
  // through the widget's itemKeys. Ref-counted, so overlap costs nothing.
  const statusItems = useMemo(
    () => [...new Set(summaries.map((s) => s.statusItem).filter((i): i is string => !!i))],
    [summaries]
  )
  useEffect(() => subscribeItems(statusItems), [statusItems])
  const states = useItemsStore((s) => s.states)
  const settled = useSettledState()

  if (!loaded || (summaries.length === 0 && !admin)) return null

  // Through the settling layer, so activating a preset lights its chip at once and leaves it
  // lit: matched against the raw states, a chip blinks off again the moment a device echoes
  // the value it is fading away from.
  const stateOf = (item: string) => settled(item, states[item]?.state)

  const isActive = (p: PresetSummary): boolean => {
    if (p.statusItem) return stateOf(p.statusItem) === (p.statusState === 'OFF' ? 'OFF' : 'ON')
    const fullPreset = full[p.uid]
    return fullPreset ? presetActive(fullPreset.lights, stateOf) : false
  }

  /** Tapping the highlighted preset switches it off, when the plan asks for that; otherwise,
   *  and whenever the values cannot be read to switch off with, the tap runs the preset. */
  const tap = async (p: PresetSummary) => {
    if (toggleOff && isActive(p) && (await deactivatePreset(p))) return
    await activatePreset(p)
  }

  return (
    <>
      <div className="nh-fplan__bar" style={{ bottom }}>
        {summaries.map((p) => (
          <button
            key={p.uid}
            type="button"
            className={'nh-chip' + (isActive(p) ? ' nh-chip--on' : '')}
            disabled={ctx.editing}
            onClick={() => void tap(p)}
          >
            {p.name}
          </button>
        ))}
        {admin ? (
          <button
            type="button"
            className="nh-chip nh-chip--action"
            disabled={ctx.editing || lights.length === 0}
            title={lights.length === 0 ? t('Add lights to the plan first') : undefined}
            onClick={() => setSaving(true)}
          >
            {t('＋ Save preset')}
          </button>
        ) : null}
      </div>
      {saving ? <PresetSaveDialog ctx={ctx} lights={lights} onClose={() => setSaving(false)} /> : null}
    </>
  )
}
