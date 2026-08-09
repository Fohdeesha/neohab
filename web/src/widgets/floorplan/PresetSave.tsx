/**
 * "Save preset" dialog: captures the plan's lights AS THEY ARE NOW into a scene - a new one,
 * or overwriting one of the neohab-managed presets. Per-light checkboxes let a preset cover a
 * subset (movie night touches the living room and leaves the bedroom alone); lights whose
 * state is unknown cannot be captured and say so instead of silently storing garbage.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetContext } from '../types'
import { commandForState, type Preset } from '../../model/presets'
import { freeSceneUid, savePreset, usePresetsStore } from '../../store/presets'
import { notify } from '../../store/notify'
import { hsbToCss, parseHsb } from '../../model/color'
import type { FloorplanLight } from './model'

export function PresetSaveDialog({
  ctx,
  lights,
  onClose,
}: {
  ctx: WidgetContext
  lights: FloorplanLight[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { summaries, full } = usePresetsStore()
  const managed = summaries.filter((s) => s.managed && s.editable)
  const [target, setTarget] = useState('') // '' = new preset
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(lights.map((l) => [l.id, true]))
  )

  const captures = lights.map((l) => {
    const state = ctx.getItem(l.item)
    return { light: l, command: commandForState(state?.type, state?.state), state }
  })

  const save = async () => {
    const chosen = captures.filter((c) => included[c.light.id] && c.command !== null)
    if (chosen.length === 0) return
    const existing = target ? full[target] : undefined
    const presetName = target ? (existing?.name ?? target) : name.trim()
    if (!presetName) return
    setBusy(true)
    try {
      // Overwriting keeps the preset's identity (uid, status item, bridge) and replaces the
      // lights this plan covers; lights of the preset NOT on this plan are kept as they are.
      const keptLights = existing
        ? existing.lights.filter((pl) => !chosen.some((c) => c.light.item === pl.item))
        : []
      const preset: Preset = existing
        ? { ...existing, lights: [...keptLights, ...chosen.map((c) => ({ item: c.light.item, command: c.command! }))] }
        : {
            uid: freeSceneUid(presetName),
            name: presetName,
            editable: true,
            managed: true,
            lights: chosen.map((c) => ({ item: c.light.item, command: c.command! })),
          }
      await savePreset(preset, { create: !existing })
      onClose()
    } catch (err) {
      notify(t('Saving the preset failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
      setBusy(false)
    }
  }

  return (
    <div className="nh-fplan__scrim" onClick={onClose}>
      <div className="nh-fplan__popup nh-fplan__popup--save" role="dialog" aria-label={t('Save preset')} onClick={(e) => e.stopPropagation()}>
        <div className="nh-fplan__popuphead">
          <span className="nh-fplan__popupname">{t('Save preset')}</span>
          <button type="button" className="nh-iconbtn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="nh-field">
          <span className="nh-field__label">{t('Save to')}</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t('New preset…')}</option>
            {managed.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {target === '' ? (
          <label className="nh-field">
            <span className="nh-field__label">{t('Name')}</span>
            <input type="text" value={name} placeholder={t('Evening, Movie night, …')} onChange={(e) => setName(e.target.value)} />
          </label>
        ) : null}

        <div className="nh-fplan__savelights">
          {captures.map(({ light, command, state }) => (
            <label key={light.id} className="nh-fplan__savelight">
              <input
                type="checkbox"
                checked={command !== null && included[light.id] === true}
                disabled={command === null}
                onChange={(e) => setIncluded((m) => ({ ...m, [light.id]: e.target.checked }))}
              />
              {command !== null && command.includes(',') ? (
                <span className="nh-fplan__savedot" style={{ background: hsbToCss(parseHsb(command)) }} />
              ) : null}
              <span className="nh-fplan__savename">{light.label ?? light.item}</span>
              <span className="nh-fplan__saveval">
                {command === null ? t('no state — cannot capture') : (state?.displayState ?? command)}
              </span>
            </label>
          ))}
        </div>

        <div className="nh-form__footer">
          <button
            type="button"
            className="nh-btn nh-btn--primary"
            disabled={
              busy ||
              (target === '' && name.trim() === '') ||
              !captures.some((c) => included[c.light.id] && c.command !== null)
            }
            onClick={() => void save()}
          >
            {busy ? t('Saving…') : t('Save preset')}
          </button>
        </div>
      </div>
    </div>
  )
}
