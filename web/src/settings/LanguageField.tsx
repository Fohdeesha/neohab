import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, storedLanguage } from '../i18n'

/**
 * Per-device language choice. 'auto' follows the browser; a concrete pick is stored in
 * localStorage, like the text size - a wall panel and a phone can disagree.
 */
export function LanguageField() {
  const { t, i18n } = useTranslation()
  const value = storedLanguage() ?? 'auto'
  return (
    <label className="nh-field" htmlFor="nh-set-lang">
      <span className="nh-field__label">{t('Language')}</span>
      <select id="nh-set-lang" value={value} onChange={(e) => void setLanguage(e.target.value)}>
        <option value="auto">
          {t('Auto (browser language)')}
          {value === 'auto' ? ` — ${LANGUAGES.find((l) => l.code === i18n.language)?.name ?? i18n.language}` : ''}
        </option>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <span className="nh-field__hint">
        {t('Applies to this device only. Dashboard content is your own text and stays as you wrote it.')}
      </span>
    </label>
  )
}
