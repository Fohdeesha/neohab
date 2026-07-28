import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '../store/config'
import { useKioskMode } from '../store/kiosk'
import { isLoggedIn } from '../api/auth'
import { useEditingAllowed } from '../store/auth'
import { navigate } from './router'
import { Wordmark } from './Wordmark'
import { SidebarTrigger } from './Sidebar'
import { Icon } from '../components/Icon'
import { NewDashboardSheet } from '../editor/NewDashboardSheet'
import { GenerateSheet } from '../editor/GenerateSheet'
import { SignInSheet } from '../editor/SignInSheet'
import { useBackgroundStyle } from '../components/useBackground'

export function Home({ ohVersion }: { ohVersion?: string }) {
  const { t } = useTranslation()
  const { dashboards, error } = useConfigStore()
  const kiosk = useKioskMode()
  const canEdit = useEditingAllowed()
  const [newOpen, setNewOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)

  const createFirst = () => (isLoggedIn() ? setNewOpen(true) : setSignInOpen(true))
  const generateFirst = () => (isLoggedIn() ? setGenerateOpen(true) : setSignInOpen(true))
  const backgroundStyle = useBackgroundStyle()

  return (
    <div className="nh-home" style={backgroundStyle}>
      <SidebarTrigger className="nh-iconbtn nh-home__menu" />
      <Wordmark />
      <p className="nh-home__status">
        {ohVersion ? (
          <>
            {t('connected to openHAB')} <strong>{ohVersion}</strong>
          </>
        ) : (
          t('connecting to openHAB…')
        )}
      </p>

      {dashboards.length === 0 ? (
        <div className="nh-welcome">
          <h2 className="nh-welcome__title">{t('Welcome to neohab')}</h2>
          {error ? (
            <p className="nh-welcome__text">{t('The configuration could not be loaded: {{error}}', { error })}</p>
          ) : (
            <p className="nh-welcome__text">
              {t(
                'There are no dashboards yet. Create your first one, bring your HABPanel setup along, or restore a neohab backup.'
              )}
            </p>
          )}
          {canEdit ? (
            <div className="nh-welcome__actions">
              <button type="button" className="nh-btn nh-btn--primary" onClick={createFirst}>
                {t('Create your first dashboard')}
              </button>
              <button type="button" className="nh-btn" onClick={generateFirst}>
                {t('Generate from my items')}
              </button>
              <button type="button" className="nh-btn" onClick={() => navigate({ name: 'settings' })}>
                {t('Import from HABPanel')}
              </button>
              <button type="button" className="nh-btn" onClick={() => navigate({ name: 'settings' })}>
                {t('Restore a backup')}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="nh-tiles">
          {dashboards.map((d) => (
            <button key={d.id} className="nh-tile" onClick={() => navigate({ name: 'dashboard', id: d.id })}>
              {d.icon ? <Icon icon={d.icon} size={28} className="nh-tile__icon" /> : null}
              <span className="nh-tile__name">{d.name}</span>
              <span className="nh-tile__meta">{t('{{count}} widgets', { count: d.widgets.length })}</span>
            </button>
          ))}
          {kiosk || !canEdit ? null : (
            <button type="button" className="nh-tile nh-tile--new" onClick={createFirst}>
              <span className="nh-tile__plus" aria-hidden="true">
                +
              </span>
              <span className="nh-tile__name">{t('New dashboard')}</span>
            </button>
          )}
        </div>
      )}

      {kiosk ? null : (
        <button
          type="button"
          className="nh-btn nh-btn--ghost nh-home__settings"
          onClick={() => navigate({ name: 'settings' })}
        >
          ⚙ {t('Settings')}
        </button>
      )}

      {newOpen ? (
        <NewDashboardSheet
          onClose={() => setNewOpen(false)}
          onGenerate={() => {
            setNewOpen(false)
            setGenerateOpen(true)
          }}
        />
      ) : null}
      {generateOpen ? <GenerateSheet onClose={() => setGenerateOpen(false)} /> : null}
      {signInOpen ? (
        <SignInSheet
          onClose={() => setSignInOpen(false)}
          onToken={() => {
            setSignInOpen(false)
            setNewOpen(true)
          }}
        />
      ) : null}
    </div>
  )
}
