/**
 * "Manage presets": rename, edit and delete the presets the plan's chips activate, from the
 * plan itself. Administrators only - every write here is a rule write, which the server allows
 * nobody else, and the values a preset holds cannot even be read without that role.
 *
 * A full-screen sheet rather than a popup inside the widget, because a preset's editor holds a
 * colour picker per light and a floor plan can be a small tile on a dashboard.
 *
 * Presets made elsewhere (Main UI, a hand-written rule) are listed and left alone: neohab's own
 * scenes are the ones it knows the shape of.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { deletePreset, savePreset, usePresetsStore } from '../../store/presets'
import { commandKind, type Preset } from '../../model/presets'
import { hsbToCss, parseHsb } from '../../model/color'
import { PresetEdit } from './PresetEdit'
import type { FloorplanLight } from './model'

/** Enough of a preview to tell two scenes apart at a glance, without becoming a row of confetti. */
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
      setError(t('Saving failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
      return false
    } finally {
      setBusy(false)
    }
  }

  // Rendered into the body, not where it sits in the tree: every grid cell is a size container,
  // which makes it the containing block for fixed descendants, so a sheet rendered inside a
  // widget would be laid out and clipped to that widget's tile rather than the screen.
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
                        // somebody else's for the second it takes.
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
                      }}
                    >
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
                          onClick={() => void run(deletePreset(s.uid)).then(() => setConfirming(null))}
                        >
                          {t('Really delete')}
                        </button>
                        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setConfirming(null)}>
                          {t('Keep')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="nh-btn nh-btn--danger"
                        onClick={() => setConfirming(s.uid)}
                      >
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

/** The colours a preset sets, as dots. Nothing for a preset of dimmers and switches. */
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
