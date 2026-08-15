/**
 * Create a new empty dashboard: display name → URL-safe id, persisted to the server
 * immediately (creation is gated on being signed in, like entering edit mode).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { createDashboard, slugifyDashboardId } from '../model/dashboard'
import { saveDashboard, useConfigStore } from '../store/config'
import { navigate } from '../app/router'

export function NewDashboardSheet({ onClose, onGenerate }: { onClose: () => void; onGenerate?: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    const existing = new Set(useConfigStore.getState().dashboards.map((d) => d.id))
    const dashboard = createDashboard(slugifyDashboardId(trimmed, existing), trimmed)
    try {
      await saveDashboard(dashboard)
      onClose()
      navigate({ name: 'dashboard', id: dashboard.id })
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Sheet title={t('New dashboard')} onClose={onClose}>
      <div className="nh-form">
        <label className="nh-field" htmlFor="nh-newdash-name">
          <span className="nh-field__label">{t('Name')}</span>
          <input
            id="nh-newdash-name"
            value={name}
            placeholder={t('Living room')}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create()
            }}
          />
        </label>
        {error ? (
          <p className="nh-form__error">{t('Could not create: {{error}} - are you signed in as an administrator?', { error })}</p>
        ) : null}
        <button
          type="button"
          className="nh-btn nh-btn--primary"
          disabled={!name.trim() || busy}
          onClick={() => void create()}
        >
          {busy ? t('Creating…') : t('Create dashboard')}
        </button>
        {onGenerate ? (
          <>
            <p className="nh-form__hint">{t('Or let neohab lay one out from the items this server already has.')}</p>
            <button type="button" className="nh-btn" disabled={busy} onClick={onGenerate}>
              {t('Generate from my items…')}
            </button>
          </>
        ) : null}
      </div>
    </Sheet>
  )
}
