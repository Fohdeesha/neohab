/**
 * Shown when edit mode is requested without credentials. Two paths:
 *  - the standard openHAB login (OAuth2 code + PKCE redirect), or
 *  - pasting an API token (kiosks / headless setups), stored locally.
 */
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { authorize, setApiToken } from '../api/auth'

export function SignInSheet({ onClose, onToken }: { onClose: () => void; onToken: () => void }) {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  return (
    <Sheet title="Sign in to edit" onClose={onClose}>
      <div className="nh-signin">
        <p className="nh-signin__text">
          Editing dashboards requires an openHAB administrator account.
        </p>
        <button type="button" className="nh-btn nh-btn--primary" onClick={() => void authorize()}>
          Log in with openHAB
        </button>

        {showToken ? (
          <div className="nh-form">
            <label className="nh-field" htmlFor="nh-token">
              <span className="nh-field__label">API token</span>
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
                onToken()
              }}
            >
              Use token
            </button>
          </div>
        ) : (
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setShowToken(true)}>
            Use an API token instead
          </button>
        )}
      </div>
    </Sheet>
  )
}
