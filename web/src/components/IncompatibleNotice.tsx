import { useTranslation } from 'react-i18next'
import { useConfigStore } from '../store/config'

export function IncompatibleNotice() {
  const { t } = useTranslation()
  const incompatible = useConfigStore((s) => s.incompatible)
  if (incompatible.length === 0) return null

  return (
    <div className="nh-incompat" role="status">
      <strong>{t('{{count}} part of your configuration needs a newer neohab', { count: incompatible.length })}</strong>
      <p>
        {t(
          'It was saved by a newer version than the one running here, so this version has left it completely alone rather than guess at it - nothing has been lost, and it will not be overwritten or deleted. Upgrade the add-on to use it again.'
        )}
      </p>
      <p className="nh-incompat__list">{incompatible.map((c) => c.uid).join(', ')}</p>
    </div>
  )
}
