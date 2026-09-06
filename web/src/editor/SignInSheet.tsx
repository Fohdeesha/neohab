/**
 * Shown when edit mode is requested without credentials. Three paths:
 *  - the standard openHAB login (OAuth2 code + PKCE redirect),
 *  - pasting an API token (kiosks / headless setups), stored locally, or
 *  - signing in to a reverse proxy in front of openHAB (openHAB Cloud, an nginx with basic auth),
 *    which is not an openHAB login at all: it only gets the requests through to the server.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { authorize, rememberBasicCredentials, setApiToken, setBasicCredentials } from '../api/auth'
import { refreshAuthStatus } from '../store/auth'
import { loadConfig } from '../store/config'
import { errorText } from '../api/errors'
import { notify } from '../store/notify'

/**
 * Credentials have arrived by a path that does not reload the page (a pasted API token, proxy
 * credentials). Both the role and the configuration have to be re-established: on a server with
 * openHAB's implicit user role off, the boot-time load answered 401 and the app is sitting on an
 * empty configuration that only a fresh read can fill. The PKCE path needs none of this because
 * it comes back through a full page load.
 */
function credentialsChanged(): void {
  void refreshAuthStatus()
  void loadConfig()
}

export function SignInSheet({
  onClose,
  onToken,
  initialProxy = false,
  reason = 'edit'
}: {
  onClose: () => void
  onToken: () => void
  /** Open with the reverse-proxy form already expanded (reached from Settings > Account). */
  initialProxy?: boolean
  /**
   * Why the sheet is open. 'view' is a server whose implicit user role is off, where signing in
   * is what makes anything visible at all - telling that person "editing needs an administrator"
   * describes a problem they do not have.
   */
  reason?: 'edit' | 'view'
}) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showProxy, setShowProxy] = useState(initialProxy)
  const [proxyUser, setProxyUser] = useState('')
  const [proxyPass, setProxyPass] = useState('')
  const [remember, setRemember] = useState(true)

  return (
    <Sheet title={reason === 'view' ? t('Sign in to openHAB') : t('Sign in to edit')} onClose={onClose}>
      <div className="nh-signin">
        <p className="nh-signin__text">
          {reason === 'view'
            ? t('This server shows nothing to signed-out visitors. Sign in with your openHAB account to see your dashboards.')
            : t('Editing dashboards requires an openHAB administrator account.')}
        </p>
        <button
          type="button"
          className="nh-btn nh-btn--primary"
          onClick={() =>
            // never let this fail silently - a dead login button gives the user nothing to act on
            authorize().catch((err) => notify(t('Sign-in failed: {{error}}', { error: errorText(err) })))
          }>
          {t('Log in with openHAB')}
        </button>

        {showToken ? (
          <div className="nh-form">
            <label className="nh-field" htmlFor="nh-token">
              <span className="nh-field__label">{t('API token')}</span>
              <input id="nh-token" type="password" value={token} placeholder="oh.…" onChange={(e) => setToken(e.target.value)} />
            </label>
            <button
              type="button"
              className="nh-btn"
              disabled={!token.trim()}
              onClick={() => {
                setApiToken(token)
                credentialsChanged()
                onToken()
              }}>
              {t('Use token')}
            </button>
          </div>
        ) : (
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setShowToken(true)}>
            {t('Use an API token instead')}
          </button>
        )}

        {showProxy ? (
          <div className="nh-form">
            <p className="nh-signin__text">
              {t(
                'Only for a proxy in front of openHAB (openHAB Cloud, or a web server asking for a password). Kept for this session only; the browser can remember it for you.'
              )}
            </p>
            <label className="nh-field" htmlFor="nh-proxy-user">
              <span className="nh-field__label">{t('Proxy username')}</span>
              <input id="nh-proxy-user" autoComplete="username" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} />
            </label>
            <label className="nh-field" htmlFor="nh-proxy-pass">
              <span className="nh-field__label">{t('Proxy password')}</span>
              <input
                id="nh-proxy-pass"
                type="password"
                autoComplete="current-password"
                value={proxyPass}
                onChange={(e) => setProxyPass(e.target.value)}
              />
            </label>
            <label className="nh-field nh-field--row" htmlFor="nh-proxy-remember">
              <span className="nh-field__label">{t('Let the browser remember it')}</span>
              <input id="nh-proxy-remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            </label>
            <button
              type="button"
              className="nh-btn"
              disabled={!proxyUser.trim()}
              onClick={() => {
                setBasicCredentials(proxyUser.trim(), proxyPass)
                if (remember) void rememberBasicCredentials()
                credentialsChanged()
                notify(t('Proxy sign-in applied for this session.'))
                onClose()
              }}>
              {t('Use proxy credentials')}
            </button>
          </div>
        ) : (
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setShowProxy(true)}>
            {t('Sign in to a reverse proxy')}
          </button>
        )}
      </div>
    </Sheet>
  )
}
