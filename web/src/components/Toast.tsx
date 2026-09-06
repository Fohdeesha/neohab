import { useTranslation } from 'react-i18next'
import { dismissNotice, useNotifyStore } from '../store/notify'

export function Toast() {
  const { t } = useTranslation()
  const notices = useNotifyStore((s) => s.notices)
  if (notices.length === 0) return null

  return (
    <div className="nh-toasts" role="status" aria-live="polite">
      {notices.map((n) => (
        <div className="nh-toast" key={n.id}>
          <span className="nh-toast__text">{n.text}</span>
          <button type="button" className="nh-toast__close" aria-label={t('Dismiss')} onClick={() => dismissNotice(n.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
