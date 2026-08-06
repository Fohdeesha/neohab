import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SignInSheet } from '../editor/SignInSheet'
import { clearApiToken, getBasicCredentials, isLoggedIn, logout, onBasicCredentialsChange } from '../api/auth'
import { refreshAuthStatus, useAuthStore } from '../store/auth'

export function AccountSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  // Subscribing to the auth status keeps this section current after a sign-in or sign-out
  // (refreshAuthStatus updates the store, which re-renders us and re-evaluates isLoggedIn).
  const status = useAuthStore((s) => s.status)
  const [signInOpen, setSignInOpen] = useState(false)
  const [proxyOpen, setProxyOpen] = useState(false)
  // Proxy credentials live in memory, so this has to be told when they change.
  const [proxy, setProxy] = useState(() => getBasicCredentials())
  useEffect(() => onBasicCredentialsChange(() => setProxy(getBasicCredentials())), [])

  const signedIn = isLoggedIn()
  const statusText = !signedIn
    ? t('This device is not signed in. Viewing works without an account; editing needs an openHAB administrator sign-in.')
    : status === 'admin'
      ? t('This device is signed in as an administrator.')
      : status === 'user'
        ? t('This device is signed in, but the account has no administrator rights, so it cannot save changes.')
        : t('This device is signed in for editing (openHAB login or a stored API token).')

  return (
    <section>
      <h2 className="nh-settings__h">{t('Account')}</h2>
      <p className="nh-settings__text">{statusText}</p>
      {proxy ? (
        <p className="nh-settings__text">
          {t('Signed in to a reverse proxy as “{{user}}” for this session.', { user: proxy.id })}
        </p>
      ) : null}
      {signedIn || proxy ? (
        <button
          type="button"
          className="nh-btn nh-btn--ghost"
          onClick={() => {
            logout()
            clearApiToken()
            void refreshAuthStatus()
            onNotice(t('Signed out on this device.'))
          }}
        >
          {t('Sign out on this device')}
        </button>
      ) : (
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setSignInOpen(true)}>
          {t('Sign in')}
        </button>
      )}
      {/* A proxy sign-in is a different thing from an openHAB one, and is needed just as much on a
          device that already holds a token - so it is reachable either way. */}
      {proxy ? null : (
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setProxyOpen(true)}>
          {t('Sign in to a reverse proxy')}
        </button>
      )}
      {proxyOpen ? (
        <SignInSheet
          initialProxy
          onClose={() => setProxyOpen(false)}
          onToken={() => setProxyOpen(false)}
        />
      ) : null}
      {signInOpen ? (
        <SignInSheet
          onClose={() => setSignInOpen(false)}
          onToken={() => {
            setSignInOpen(false)
            onNotice(t('Signed in on this device.'))
          }}
        />
      ) : null}
    </section>
  )
}
