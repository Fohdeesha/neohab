import { useTranslation } from 'react-i18next'
import {
  saveSettings,
  useConfigStore
} from '../store/config'
import { useIsAdmin } from '../store/auth'

/**
 * The editing lock. Admin-only: a non-admin device could never flip it back, and a locked-out
 * viewer should not even learn the switch exists.
 */
export function EditingLockSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const locked = useConfigStore((s) => s.settings.lockEditing === true)

  if (!isAdmin) return null

  const toggle = async (on: boolean) => {
    onNotice(null)
    const err = await saveSettings({ lockEditing: on || undefined })
    if (err) onNotice(t('Saving failed: {{error}}', { error: err }))
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Editing lock')}</h2>
      <label className="nh-field nh-field--row" htmlFor="nh-set-lock">
        <span className="nh-field__label">{t('Lock editing for non-administrators')}</span>
        <input id="nh-set-lock" type="checkbox" checked={locked} onChange={(e) => void toggle(e.target.checked)} />
      </label>
      <p className="nh-settings__text">
        {t(
          'Hides the edit pencil, dashboard creation and the configuration sections of this screen on every device that is not signed in as an administrator - wall panels and guests get a clean, view-only dashboard. Administrator devices (like this one) are never affected, and a locked device can still sign in under Account below.'
        )}
      </p>
    </section>
  )
}
