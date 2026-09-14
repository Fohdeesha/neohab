import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SignInSheet } from '../editor/SignInSheet'
import { clearApiToken, getBasicCredentials, isLoggedIn, logout, onBasicCredentialsChange } from '../api/auth'
import { refreshAuthStatus, useAuthStore } from '../store/auth'
import { useConfigStore } from '../store/config'
import type { NoticeFn } from '../store/notify'

export function AccountSection({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const authRequired = useConfigStore((s) => s.authRequired)
  const [signInOpen, setSignInOpen] = useState(false)
  const [proxyOpen, setProxyOpen] = useState(false)
  const [proxy, setProxy] = useState(() => getBasicCredentials())
  useEffect(() => onBasicCredentialsChange(() => setProxy(getBasicCredentials())), [])

  const signedIn = isLoggedIn()
  const statusText = !signedIn
    ? // Whether viewing works without an account is the SERVER's choice, and on one with
      authRequired
      ? t('This device is not signed in, and this server shows nothing to signed-out visitors.')
      : t('This device is not signed in. Viewing works without an account; editing needs an openHAB administrator sign-in.')
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
        <p className="nh-settings__text">{t('Signed in to a reverse proxy as “{{user}}” for this session.', { user: proxy.id })}</p>
      ) : null}
      {signedIn || proxy ? (
        <button
          type="button"
          className="nh-btn nh-btn--ghost"
          onClick={() => {
            void logout()
            clearApiToken()
            void refreshAuthStatus()
            onNotice(t('Signed out on this device.'), 'done')
          }}>
          {t('Sign out on this device')}
        </button>
      ) : (
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setSignInOpen(true)}>
          {t('Sign in')}
        </button>
      )}
      {/* Says which of the settings above travel and which do not. Nothing in the app said it,
          and "I restored my backup and my wall panel went back to the wrong theme" is the
          question that follows. */}
      <p className="nh-settings__text">
        {t(
          'Settings marked “on this device” are kept in this browser: the theme override, language, text size, kiosk and audio choices, and whether the sidebar is pinned. They are not part of a backup, and every device sets its own.'
        )}
      </p>
      {/* A proxy sign-in is a different thing from an openHAB one, and is needed just as much on a
          device that already holds a token - so it is reachable either way. */}
      {proxy ? null : (
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setProxyOpen(true)}>
          {t('Sign in to a reverse proxy')}
        </button>
      )}
      {proxyOpen ? <SignInSheet initialProxy onClose={() => setProxyOpen(false)} onToken={() => setProxyOpen(false)} /> : null}
      {signInOpen ? (
        <SignInSheet
          onClose={() => setSignInOpen(false)}
          onToken={() => {
            setSignInOpen(false)
            onNotice(t('Signed in on this device.'), 'done')
          }}
        />
      ) : null}
    </section>
  )
}
