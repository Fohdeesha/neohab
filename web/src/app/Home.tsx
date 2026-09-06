import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadConfig, useConfigStore } from '../store/config'
import { useKioskMode } from '../store/kiosk'
import { appExitToApp, appPinToHome, canExitToApp, canPinToHome } from './ohapp'
import { editingAllowed, useEditingAllowed } from '../store/auth'
import { navigate } from './router'
import { Wordmark } from './Wordmark'
import { SidebarTrigger } from './Sidebar'
import { Icon } from '../components/Icon'
import { IncompatibleNotice } from '../components/IncompatibleNotice'
import { NewDashboardSheet } from '../editor/NewDashboardSheet'
import { GenerateSheet } from '../editor/GenerateSheet'
import { SignInSheet } from '../editor/SignInSheet'
import { useBackgroundStyle } from '../components/useBackground'

export function Home({ ohVersion }: { ohVersion?: string }) {
  const { t } = useTranslation()
  // Selectors, not the whole store: Home re-rendered on every settings change otherwise.
  const dashboards = useConfigStore((s) => s.dashboards)
  const error = useConfigStore((s) => s.error)
  const loading = useConfigStore((s) => s.loading)
  const authRequired = useConfigStore((s) => s.authRequired)
  const kiosk = useKioskMode()
  const canEdit = useEditingAllowed()
  const [newOpen, setNewOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  /** Which sheet the sign-in prompt was standing in for, so signing in resumes what was asked. */
  const [afterSignIn, setAfterSignIn] = useState<'new' | 'generate' | 'none'>('none')

  const start = (what: 'new' | 'generate') => {
    // The same test the dashboard's edit pencil makes: an administrator (or anyone, when
    // anonymous editing is allowed) goes straight in; otherwise ask for credentials up front
    // rather than after the work.
    if (!editingAllowed()) {
      setAfterSignIn(what)
      setSignInOpen(true)
    } else if (what === 'new') setNewOpen(true)
    else setGenerateOpen(true)
  }
  const openSignIn = () => {
    // A plain sign-in, standing in for nothing: finishing it should not pop a sheet nobody asked for.
    setAfterSignIn('none')
    setSignInOpen(true)
  }
  const createFirst = () => start('new')
  const generateFirst = () => start('generate')
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

      {/* Before the tiles: a dashboard missing from this list because it needs a newer neohab
          looks exactly like one that was deleted, and that is the moment to say otherwise. */}
      <IncompatibleNotice />

      {dashboards.length === 0 ? (
        <div className="nh-welcome">
          <h2 className="nh-welcome__title">{t('Welcome to neohab')}</h2>
          {authRequired ? (
            <>
              {/* This server does not let signed-out visitors read anything, which is the normal
                  posture once openHAB's implicit user role is turned off. Saying "401" here left
                  people looking at a REST call for a problem whose answer is simply to sign in. */}
              <p className="nh-welcome__text">{t('This openHAB server needs you to sign in before it will show anything.')}</p>
              <div className="nh-welcome__actions">
                <button type="button" className="nh-btn nh-btn--primary" onClick={openSignIn}>
                  {t('Sign in')}
                </button>
              </div>
            </>
          ) : error ? (
            // A wall panel that booted while openHAB was restarting used to stay broken until
            // someone found a keyboard: the message was accurate and there was nothing to press.
            <>
              <p className="nh-welcome__text">{t('The configuration could not be loaded: {{error}}', { error })}</p>
              <div className="nh-welcome__actions">
                <button type="button" className="nh-btn nh-btn--primary" disabled={loading} onClick={() => void loadConfig()}>
                  {loading ? t('Trying again…') : t('Try again')}
                </button>
              </div>
            </>
          ) : canEdit ? (
            <p className="nh-welcome__text">
              {t('There are no dashboards yet. Create your first one, bring your HABPanel setup along, or restore a neohab backup.')}
            </p>
          ) : (
            <p className="nh-welcome__text">{t('There are no dashboards yet. Sign in as an openHAB administrator to set neohab up.')}</p>
          )}
          {canEdit && !authRequired ? (
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
          {!canEdit && !authRequired && !error ? (
            <div className="nh-welcome__actions">
              <button type="button" className="nh-btn nh-btn--primary" onClick={openSignIn}>
                {t('Sign in')}
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
        <button type="button" className="nh-btn nh-btn--ghost nh-home__settings" onClick={() => navigate({ name: 'settings' })}>
          ⚙ {t('Settings')}
        </button>
      )}

      {/* Only inside the openHAB phone app, which is what provides these. */}
      {!kiosk && (canPinToHome() || canExitToApp()) ? (
        <div className="nh-home__app">
          {canPinToHome() ? (
            <button type="button" className="nh-btn nh-btn--ghost" onClick={appPinToHome}>
              {t('Add to the home screen')}
            </button>
          ) : null}
          {canExitToApp() ? (
            <button type="button" className="nh-btn nh-btn--ghost" onClick={appExitToApp}>
              {t('Back to the openHAB app')}
            </button>
          ) : null}
        </div>
      ) : null}

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
          reason={authRequired ? 'view' : 'edit'}
          onClose={() => setSignInOpen(false)}
          onToken={() => {
            setSignInOpen(false)
            if (afterSignIn === 'generate') setGenerateOpen(true)
            else if (afterSignIn === 'new') setNewOpen(true)
          }}
        />
      ) : null}
    </div>
  )
}
