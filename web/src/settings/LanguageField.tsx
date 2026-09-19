import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, storedLanguage } from '../i18n'

export function LanguageField() {
  const { t, i18n } = useTranslation()
  const value = storedLanguage() ?? 'auto'
  return (
    <label className="nh-field" htmlFor="nh-set-lang">
      <span className="nh-field__label">{t('Language')}</span>
      <select id="nh-set-lang" value={value} onChange={(e) => void setLanguage(e.target.value)}>
        <option value="auto">
          {t('Auto (browser language)')}
          {value === 'auto' ? ` - ${LANGUAGES.find((l) => l.code === i18n.language)?.name ?? i18n.language}` : ''}
        </option>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <span className="nh-field__hint">{t('This device only. Your own dashboard text is untouched.')}</span>
    </label>
  )
}
