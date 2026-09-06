import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { deletePreset, savePreset, usePresetsStore } from '../../store/presets'
import { commandKind, type Preset } from '../../model/presets'
import { hsbToCss, parseHsb } from '../../model/color'
import { PresetEdit } from './PresetEdit'
import type { FloorplanLight } from './model'
import { errorText } from '../../api/errors'

const MAX_DOTS = 8

export function PresetManageDialog({ lights, onClose }: { lights: FloorplanLight[]; onClose: () => void }) {
  const { t } = useTranslation()
  const { summaries, full, bridged } = usePresetsStore()
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editingPreset = editing ? full[editing] : undefined

  const run = async (work: Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work
      return true
    } catch (err) {
      setError(t('Saving failed: {{error}}', { error: errorText(err) }))
      return false
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="nh-pmgr" role="dialog" aria-label={t('Manage presets')}>
      <header className="nh-pmgr__bar">
        <h2>{editingPreset ? editingPreset.name : t('Manage presets')}</h2>
        <button type="button" className="nh-iconbtn" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="nh-pmgr__body">
        {error ? <p className="nh-pmgr__error">{error}</p> : null}
        {editingPreset ? (
          <PresetEdit
            key={editingPreset.uid}
            preset={editingPreset}
            bridged={bridged.includes(editingPreset.uid)}
            planLights={lights}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={(next, bridge) => {
              void run(savePreset(next, { bridge })).then((okay) => okay && setEditing(null))
            }}
          />
        ) : (
          <>
            {summaries.length === 0 ? <p className="nh-pmgr__none">{t('No presets yet.')}</p> : null}
            {summaries.map((s) => {
              const preset = full[s.uid]
              const manageable = s.managed && s.editable && !!preset
              return (
                <div key={s.uid} className="nh-pmgr__row">
                  <span className="nh-pmgr__name" title={s.name}>
                    {s.name}
                  </span>
                  <Dots preset={preset} />
                  <span className="nh-pmgr__meta">
                    {preset
                      ? t('{{count}} light', { count: preset.lights.length }) +
                        (bridged.includes(s.uid) ? ' · ' + t('wall switch linked') : '')
                      : // Values still loading for one of ours: say nothing rather than call it
                        s.managed
                        ? ''
                        : t('created outside neohab')}
                  </span>
                  {manageable ? (
                    <button
                      type="button"
                      className="nh-btn nh-btn--ghost"
                      onClick={() => {
                        setConfirming(null)
                        setEditing(s.uid)
                      }}>
                      {t('Edit')}
                    </button>
                  ) : null}
                  {manageable ? (
                    confirming === s.uid ? (
                      <>
                        <button
                          type="button"
                          className="nh-btn nh-btn--danger"
                          disabled={busy}
                          onClick={() => void run(deletePreset(s.uid)).then(() => setConfirming(null))}>
                          {t('Really delete')}
                        </button>
                        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setConfirming(null)}>
                          {t('Keep')}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="nh-btn nh-btn--danger" onClick={() => setConfirming(s.uid)}>
                        {t('Delete')}
                      </button>
                    )
                  ) : null}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

function Dots({ preset }: { preset: Preset | undefined }) {
  const colors = (preset?.lights ?? []).filter((l) => commandKind(l.command) === 'color').slice(0, MAX_DOTS)
  if (colors.length === 0) return null
  return (
    <span className="nh-pmgr__dots">
      {colors.map((l, i) => (
        <span key={i} className="nh-fplan__savedot" style={{ background: hsbToCss(parseHsb(l.command)) }} />
      ))}
    </span>
  )
}
