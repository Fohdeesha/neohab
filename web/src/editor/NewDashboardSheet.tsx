import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { errorText } from '../api/errors'
import { createDashboard, slugifyDashboardId } from '../model/dashboard'
import { saveDashboard, useConfigStore } from '../store/config'
import { navigate } from '../app/router'

export function NewDashboardSheet({ onClose, onGenerate }: { onClose: () => void; onGenerate?: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'widgets' | 'page'>('widgets')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    const existing = new Set(useConfigStore.getState().dashboards.map((d) => d.id))
    const dashboard = createDashboard(slugifyDashboardId(trimmed, existing), trimmed, kind === 'page' ? { url: url.trim() } : undefined)
    try {
      await saveDashboard(dashboard)
      onClose()
      navigate({ name: 'dashboard', id: dashboard.id })
    } catch (err) {
      setBusy(false)
      setError(errorText(err))
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void create()
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
            onKeyDown={onEnter}
          />
        </label>
        <div className="nh-field">
          <span className="nh-field__label">{t('Shows')}</span>
          <div className="nh-chips" role="radiogroup" aria-label={t('Shows')}>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'widgets'}
              className={'nh-chip' + (kind === 'widgets' ? ' nh-chip--on' : '')}
              onClick={() => setKind('widgets')}>
              {t('Widgets')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'page'}
              className={'nh-chip' + (kind === 'page' ? ' nh-chip--on' : '')}
              onClick={() => setKind('page')}>
              {t('A web page')}
            </button>
          </div>
          {kind === 'page' ? (
            <span className="nh-field__hint">
              {t('One page fills the screen under the bar. Set or change its address with the edit button.')}
            </span>
          ) : null}
        </div>
        {kind === 'page' ? (
          <label className="nh-field" htmlFor="nh-newdash-url">
            <span className="nh-field__label">{t('Page URL')}</span>
            <input
              id="nh-newdash-url"
              value={url}
              placeholder="https://…"
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onEnter}
            />
          </label>
        ) : null}
        {error ? <p className="nh-form__error">{t('Could not create: {{error}}', { error })}</p> : null}
        <button type="button" className="nh-btn nh-btn--primary" disabled={!name.trim() || busy} onClick={() => void create()}>
          {busy ? t('Creating…') : t('Create dashboard')}
        </button>
        {onGenerate && kind === 'widgets' ? (
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
