import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  saveSettings,
  useConfigStore
} from '../store/config'
import { navigate } from '../app/router'
import { setKioskSettings, useKioskStore, type ScreensaverMode } from '../store/kiosk'
import { useWakeLockStore, wakeLockSupported } from '../kiosk/wakeLock'
import { ItemPicker } from '../components/ItemPicker'
import { NumberSetting } from '../components/NumberSetting'
import { useEditingAllowed } from '../store/auth'
import { appGoFullscreen } from '../app/ohapp'

/**
 * Kiosk / wall-panel settings. Everything here is per-device (localStorage) except the
 * dashboard-control item, which is part of the server configuration.
 */
export function KioskSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const kioskSettings = useKioskStore((s) => s.settings)
  const sessionKiosk = useKioskStore((s) => s.sessionKiosk)
  const dashboards = useConfigStore((s) => s.dashboards)
  const controlItem = useConfigStore((s) => s.settings.controlItem) ?? ''
  // The control item is server configuration, so it follows the editing lock like the rest.
  const canEdit = useEditingAllowed()
  const wakeActive = useWakeLockStore((s) => s.active)
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement)

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const kioskOn = sessionKiosk ?? kioskSettings.kiosk

  const setKioskMode = (on: boolean) => {
    setKioskSettings({ kiosk: on })
    if (on) {
      // All chrome (including the way back from this screen) is gone now - land somewhere useful.
      const pinned = kioskSettings.pinnedDashboard
      if (pinned && dashboards.some((d) => d.id === pinned)) navigate({ name: 'dashboard', id: pinned })
      else navigate({ name: 'home' })
    }
  }

  const setControlItem = async (name: string) => {
    onNotice(null)
    const err = await saveSettings({ controlItem: name || undefined })
    if (err) onNotice(t('Applied on this device, but saving failed: {{error}} — sign in as an administrator.', { error: err }))
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    // Inside the openHAB phone app the webview's own fullscreen does not hide the native chrome;
    // asking the app does. In a browser this is a no-op and the standard API takes over.
    if (appGoFullscreen()) return
    document.documentElement.requestFullscreen().catch(() => onNotice(t('Fullscreen was blocked by the browser.')))
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Kiosk & wall panel')}</h2>
      <p className="nh-settings__text">
        {t(
          'These settings apply to this device only, so a wall panel and a phone can each have their own. The dashboard-control item at the bottom is the exception — it is shared.'
        )}
      </p>

      <label className="nh-field" htmlFor="kiosk-pinned">
        <span className="nh-field__label">{t('Open this dashboard at start')}</span>
        <select
          id="kiosk-pinned"
          value={kioskSettings.pinnedDashboard ?? ''}
          onChange={(e) => setKioskSettings({ pinnedDashboard: e.target.value || undefined })}
        >
          <option value="">{t('Home screen (default)')}</option>
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <label className="nh-field nh-field--row" htmlFor="kiosk-wake">
        <span className="nh-field__label">{t('Keep the screen awake')}</span>
        <input
          id="kiosk-wake"
          type="checkbox"
          checked={kioskSettings.wakeLock}
          disabled={!wakeLockSupported()}
          onChange={(e) => setKioskSettings({ wakeLock: e.target.checked })}
        />
      </label>
      {!wakeLockSupported() ? (
        <p className="nh-settings__text">
          {t(
            'Not available here: browsers only offer the wake lock over HTTPS (or on localhost). Kiosk-browser apps usually keep the screen on themselves instead.'
          )}
        </p>
      ) : kioskSettings.wakeLock ? (
        <p className="nh-settings__text">
          {wakeActive ? t('The screen is being kept awake.') : t('Waiting for the browser to grant the wake lock…')}
        </p>
      ) : null}

      <label className="nh-field" htmlFor="kiosk-saver">
        <span className="nh-field__label">{t('Screensaver')}</span>
        <select
          id="kiosk-saver"
          value={kioskSettings.screensaver}
          onChange={(e) => setKioskSettings({ screensaver: e.target.value as ScreensaverMode })}
        >
          <option value="off">{t('Off')}</option>
          <option value="blank">{t('Blank screen')}</option>
          <option value="clock">{t('Clock')}</option>
        </select>
      </label>
      {kioskSettings.screensaver !== 'off' ? (
        <NumberSetting
          id="kiosk-saver-min"
          className="nh-field nh-field--row"
          label={<span className="nh-field__label">{t('Start after (minutes)')}</span>}
          mode="live"
          value={kioskSettings.screensaverMinutes}
          min={1}
          max={720}
          onCommit={(v) => setKioskSettings({ screensaverMinutes: v })}
        />
      ) : null}

      <div className="nh-settings__row">
        <button type="button" className="nh-btn nh-btn--ghost" onClick={toggleFullscreen}>
          {fullscreen ? t('Exit fullscreen') : t('Enter fullscreen')}
        </button>
      </div>

      <label className="nh-field nh-field--row" htmlFor="kiosk-mode">
        <span className="nh-field__label">{t('Kiosk mode')}</span>
        <input id="kiosk-mode" type="checkbox" checked={kioskOn} onChange={(e) => setKioskMode(e.target.checked)} />
      </label>
      <p className="nh-settings__text">
        {t(
          'Hides all navigation and editing controls so the dashboard fills the screen. To exit, tap any screen corner five times in a row, or open the app with {{off}} in the address. {{on}} turns it on for one session — handy as the pinned address in a kiosk-browser app.',
          { off: '?kiosk=off', on: '?kiosk=on' }
        )}
      </p>

      <label className="nh-field nh-field--row" htmlFor="kiosk-follow">
        <span className="nh-field__label">{t('Follow the dashboard-control item')}</span>
        <input
          id="kiosk-follow"
          type="checkbox"
          checked={kioskSettings.followControl ?? kioskOn}
          onChange={(e) => setKioskSettings({ followControl: e.target.checked })}
        />
      </label>

      {canEdit ? (
        <>
          <label className="nh-field" htmlFor="kiosk-controlitem">
            <span className="nh-field__label">{t('Dashboard-control item (all devices)')}</span>
            <ItemPicker
              id="kiosk-controlitem"
              value={controlItem}
              onChange={(n) => void setControlItem(n)}
              itemTypes={['String']}
              placeholder={t('No control item')}
            />
          </label>
          {controlItem ? (
            <div className="nh-settings__row">
              <button type="button" className="nh-btn nh-btn--ghost" onClick={() => void setControlItem('')}>
                {t('Clear control item')}
              </button>
            </div>
          ) : null}
          <p className="nh-settings__text">
            {t(
              'A String item whose state names a dashboard (by id, or by name). When a rule changes it, every device that follows it switches to that dashboard — the classic way to drive wall panels remotely. Saving it needs an administrator sign-in; whether a device follows it is that device\'s own choice above (kiosk-mode devices follow by default).'
            )}
          </p>
        </>
      ) : null}
    </section>
  )
}
