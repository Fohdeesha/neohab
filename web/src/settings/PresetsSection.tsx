/**
 * Lighting presets manager. The presets themselves are openHAB scenes on the server (created
 * from a floor plan widget's "Save preset", or in Main UI - both show here); this section
 * renames and deletes them, links the status item that mirrors "this preset is active", and
 * keeps the wall-switch bridge rule in step.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemPicker } from '../components/ItemPicker'
import { useIsAdmin } from '../store/auth'
import { activatePreset, deletePreset, loadPresets, savePreset, usePresetsStore } from '../store/presets'
import type { Preset, StatusState } from '../model/presets'

export function PresetsSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const admin = useIsAdmin()
  const { loaded, summaries, full, bridged, error } = usePresetsStore()

  useEffect(() => {
    void loadPresets()
  }, [admin])

  const report = async (work: Promise<unknown>) => {
    onNotice(null)
    try {
      await work
    } catch (err) {
      onNotice(t('Saving failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Lighting presets')}</h2>
      <p className="nh-settings__text">
        {t(
          'A preset is an openHAB scene: it lives in your openHAB configuration, other rules can run it, and Main UI shows it too. Create one from a floor plan widget’s “Save preset”, then manage it here. Linking a status item makes your existing wall-switch items both trigger the preset and light up the active chip on every panel.'
        )}
      </p>
      {error ? <p className="nh-settings__text">{t('Presets could not be loaded: {{error}}', { error })}</p> : null}
      {loaded && !error && summaries.length === 0 ? (
        <p className="nh-settings__text">{t('No presets yet.')}</p>
      ) : null}
      <div className="nh-presetlist">
        {summaries.map((s) => {
          const p = full[s.uid]
          return (
            <PresetRow
              key={s.uid}
              name={s.name}
              uid={s.uid}
              preset={p}
              bridged={bridged.includes(s.uid)}
              manageable={s.managed && s.editable && admin && !!p}
              onActivate={() => void activatePreset(s)}
              onSave={(next, bridge) => void report(savePreset(next, { bridge }))}
              onDelete={() => void report(deletePreset(s.uid))}
            />
          )
        })}
      </div>
    </section>
  )
}

function PresetRow({
  name,
  uid,
  preset,
  bridged,
  manageable,
  onActivate,
  onSave,
  onDelete,
}: {
  name: string
  uid: string
  preset: Preset | undefined
  bridged: boolean
  manageable: boolean
  onActivate: () => void
  onSave: (next: Preset, bridge: boolean) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="nh-presetrow">
      <div className="nh-presetrow__head">
        {manageable && preset ? (
          <input
            type="text"
            className="nh-presetrow__name"
            defaultValue={name}
            aria-label={t('Preset name')}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== name) onSave({ ...preset, name: v }, bridged)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        ) : (
          <span className="nh-presetrow__name nh-presetrow__name--ro">{name}</span>
        )}
        <span className="nh-presetrow__meta">
          {preset
            ? t('{{count}} light', { count: preset.lights.length }) + (bridged ? ' · ' + t('wall switch linked') : '')
            : t('created outside neohab')}
        </span>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={onActivate}>
          {t('Activate')}
        </button>
        {manageable && preset ? (
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setOpen(!open)}>
            {open ? t('Close') : t('Wall switch…')}
          </button>
        ) : null}
        {manageable ? (
          confirming ? (
            <>
              <button type="button" className="nh-btn nh-btn--danger" onClick={onDelete}>
                {t('Really delete')}
              </button>
              <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setConfirming(false)}>
                {t('Keep')}
              </button>
            </>
          ) : (
            <button type="button" className="nh-btn nh-btn--danger" onClick={() => setConfirming(true)}>
              {t('Delete')}
            </button>
          )
        ) : null}
      </div>
      {open && manageable && preset ? (
        <BridgeEditor preset={preset} bridged={bridged} onSave={onSave} uid={uid} />
      ) : null}
    </div>
  )
}

/**
 * The status-item link. The item goes into the scene's own configuration block (readable by
 * every role, so signed-out panels can highlight the active preset); the bridge checkbox
 * creates or removes the managed rule that lets the item trigger the scene.
 */
function BridgeEditor({
  preset,
  bridged,
  uid,
  onSave,
}: {
  preset: Preset
  bridged: boolean
  uid: string
  onSave: (next: Preset, bridge: boolean) => void
}) {
  const { t } = useTranslation()
  const [item, setItem] = useState(preset.statusItem ?? '')
  const [state, setState] = useState<StatusState>(preset.statusState ?? 'ON')
  const [bridge, setBridge] = useState(bridged)

  return (
    <div className="nh-presetrow__bridge">
      <div className="nh-field">
        <label className="nh-field__label" htmlFor={'preset-status-' + uid}>
          {t('Status item (a Switch your wall switches already use)')}
        </label>
        <ItemPicker
          id={'preset-status-' + uid}
          value={item}
          itemTypes={['Switch']}
          onChange={(v) => setItem(typeof v === 'string' ? v : '')}
        />
      </div>
      <label className="nh-field" htmlFor={'preset-state-' + uid}>
        <span className="nh-field__label">{t('Active when the item is')}</span>
        <select id={'preset-state-' + uid} value={state} onChange={(e) => setState(e.target.value === 'OFF' ? 'OFF' : 'ON')}>
          <option value="ON">ON</option>
          <option value="OFF">OFF</option>
        </select>
      </label>
      <label className="nh-field nh-field--row" htmlFor={'preset-bridge-' + uid}>
        <span className="nh-field__label">{t('Run this preset when the item reaches that state')}</span>
        <input
          id={'preset-bridge-' + uid}
          type="checkbox"
          checked={bridge}
          disabled={item === ''}
          onChange={(e) => setBridge(e.target.checked)}
        />
      </label>
      <p className="nh-field__hint">
        {t(
          'Leave this off while another system still reacts to the item, or the lights would be set twice. With it on, neohab adds a small rule so the wall switch drives this preset directly.'
        )}
      </p>
      <button
        type="button"
        className="nh-btn nh-btn--primary"
        onClick={() =>
          onSave(
            {
              ...preset,
              statusItem: item || undefined,
              statusState: item ? state : undefined,
            },
            item !== '' && bridge
          )
        }
      >
        {t('Save link')}
      </button>
    </div>
  )
}
