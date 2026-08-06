import { useTranslation } from 'react-i18next'
import { useConfigStore } from '../store/config'
import { listThemes } from '../themes/themes'
import { setDeviceTheme, useDeviceThemeStore } from '../store/deviceTheme'

/**
 * Per-device theme override. The cards above set the SHARED theme; this select pins a
 * different one on this device only (a light desk browser next to a dark wall panel).
 */
export function DeviceThemeField() {
  const { t } = useTranslation()
  const customThemes = useConfigStore((s) => s.customThemes)
  const override = useDeviceThemeStore((s) => s.themeId)
  const all = listThemes(customThemes)
  const unknown = override !== null && !all.some((th) => th.id === override)
  return (
    <label className="nh-field" htmlFor="nh-set-devicetheme">
      <span className="nh-field__label">{t('Theme on this device')}</span>
      <select
        id="nh-set-devicetheme"
        value={override ?? ''}
        onChange={(e) => setDeviceTheme(e.target.value || null)}
      >
        <option value="">{t('Follow the shared theme (default)')}</option>
        {unknown ? <option value={override}>{override}</option> : null}
        {all.map((th) => (
          <option key={th.id} value={th.id}>
            {th.name}
          </option>
        ))}
      </select>
      {override !== null ? (
        <span className="nh-field__hint">
          {t('This device keeps its own theme; the cards above change the theme every other device shares.')}
        </span>
      ) : null}
    </label>
  )
}
