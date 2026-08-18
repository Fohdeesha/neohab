import { useTranslation } from 'react-i18next'
import {
  saveSettings,
  useConfigStore
} from '../store/config'
import { useIsAdmin } from '../store/auth'

/**
 * The anonymous-editing switch. Admin-only: a visitor should not even learn the switch exists,
 * and on a standard server only an administrator's write to it would stick anyway.
 */
export function AnonymousEditingSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const open = useConfigStore((s) => s.settings.allowAnonymousEditing === true)

  if (!isAdmin) return null

  const toggle = async (on: boolean) => {
    onNotice(null)
    const err = await saveSettings({ allowAnonymousEditing: on || undefined })
    if (err) onNotice(t('Saving failed: {{error}}', { error: err }))
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Anonymous editing')}</h2>
      <label className="nh-field nh-field--row" htmlFor="nh-set-anonedit">
        <span className="nh-field__label">{t('Allow anonymous visitors to edit neohab')}</span>
        <input id="nh-set-anonedit" type="checkbox" checked={open} onChange={(e) => void toggle(e.target.checked)} />
      </label>
      <p className="nh-settings__text">
        {t(
          'Off (the default): dashboards, themes, presets and these settings can only be changed from a device signed in as an administrator, like openHAB’s own UIs. Everyone else gets a view-only panel whose widgets still work, and can sign in under Account below. On: every device shows the editing controls. Either way the openHAB server checks who may actually save, so on a standard server an editor still needs an administrator sign-in for its changes to stick.'
        )}
      </p>
    </section>
  )
}
