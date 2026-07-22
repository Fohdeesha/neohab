/**
 * Shown when edit mode is requested without credentials. Two paths:
 *  - the standard openHAB login (OAuth2 code + PKCE redirect), or
 *  - pasting an API token (kiosks / headless setups), stored locally.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { authorize, setApiToken } from '../api/auth'
import { refreshAuthStatus } from '../store/auth'

export function SignInSheet({ onClose, onToken }: { onClose: () => void; onToken: () => void }) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  return (
    <Sheet title={t('Sign in to edit')} onClose={onClose}>
      <div className="nh-signin">
        <p className="nh-signin__text">
          {t('Editing dashboards requires an openHAB administrator account.')}
        </p>
        <button type="button" className="nh-btn nh-btn--primary" onClick={() => void authorize()}>
          {t('Log in with openHAB')}
        </button>

        {showToken ? (
          <div className="nh-form">
            <label className="nh-field" htmlFor="nh-token">
              <span className="nh-field__label">{t('API token')}</span>
              <input
                id="nh-token"
                type="password"
                value={token}
                placeholder="oh.…"
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="nh-btn"
              disabled={!token.trim()}
              onClick={() => {
                setApiToken(token)
                // Establish whether the new token is an admin one (the PKCE path re-probes on
                // the post-redirect boot instead).
                void refreshAuthStatus()
                onToken()
              }}
            >
              {t('Use token')}
            </button>
          </div>
        ) : (
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setShowToken(true)}>
            {t('Use an API token instead')}
          </button>
        )}
      </div>
    </Sheet>
  )
}
