import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetContext } from '../types'
import { useBoxSize } from '../../components/useBoxSize'
import { activatePreset, deactivatePreset, loadPresets, usePresetsStore } from '../../store/presets'
import { subscribeItems, useItemsStore } from '../../store/items'
import { useSettledState } from '../../store/settling'
import { presetActive, type PresetSummary } from '../../model/presets'
import { useIsAdmin } from '../../store/auth'
import { PresetSaveDialog } from './PresetSave'
import { PresetManageDialog } from './PresetManage'
import type { FloorplanLight } from './model'

const ONE_CHIP_ROW = 55

export function PresetBar({
  ctx,
  lights,
  spaceBelow = 0,
  toggleOff = false
}: {
  ctx: WidgetContext
  lights: FloorplanLight[]
  spaceBelow?: number
  toggleOff?: boolean
}) {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  const { loaded, summaries, full } = usePresetsStore()
  const [saving, setSaving] = useState(false)
  const [managing, setManaging] = useState(false)

  const barRef = useRef<HTMLDivElement>(null)
  const { height: barHeight } = useBoxSize(barRef)
  const bottom = Math.max(8, Math.round(spaceBelow - (barHeight || ONE_CHIP_ROW)))

  useEffect(() => {
    void loadPresets()
  }, [admin])

  const statusItems = useMemo(() => [...new Set(summaries.map((s) => s.statusItem).filter((i): i is string => !!i))], [summaries])
  useEffect(() => subscribeItems(statusItems), [statusItems])
  const states = useItemsStore((s) => s.states)
  const settled = useSettledState()

  if (!loaded || (summaries.length === 0 && !admin)) return null

  const stateOf = (item: string) => settled(item, states[item]?.state)

  const isActive = (p: PresetSummary): boolean => {
    if (p.statusItem) return stateOf(p.statusItem) === (p.statusState === 'OFF' ? 'OFF' : 'ON')
    const fullPreset = full[p.uid]
    return fullPreset ? presetActive(fullPreset.lights, stateOf) : false
  }

  const tap = async (p: PresetSummary) => {
    if (toggleOff && isActive(p) && (await deactivatePreset(p))) return
    await activatePreset(p)
  }

  return (
    <>
      <div className="nh-fplan__bar" ref={barRef} style={{ bottom }}>
        {summaries.map((p) => (
          <button
            key={p.uid}
            type="button"
            className={'nh-chip' + (isActive(p) ? ' nh-chip--on' : '')}
            disabled={ctx.editing}
            onClick={() => void tap(p)}>
            {p.name}
          </button>
        ))}
        {admin ? (
          <button
            type="button"
            className="nh-chip nh-chip--action"
            disabled={ctx.editing || lights.length === 0}
            title={lights.length === 0 ? t('Add lights to the plan first') : undefined}
            onClick={() => setSaving(true)}>
            {t('＋ Save preset')}
          </button>
        ) : null}
        {admin && summaries.length > 0 ? (
          <button type="button" className="nh-chip nh-chip--action" disabled={ctx.editing} onClick={() => setManaging(true)}>
            {t('⚙ Manage presets')}
          </button>
        ) : null}
      </div>
      {saving ? <PresetSaveDialog ctx={ctx} lights={lights} onClose={() => setSaving(false)} /> : null}
      {managing ? <PresetManageDialog lights={lights} onClose={() => setManaging(false)} /> : null}
    </>
  )
}
