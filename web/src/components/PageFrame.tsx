import { useTranslation } from 'react-i18next'
import { pageOf, type Dashboard } from '../model/dashboard'
import { mixedContent, safeUrl } from '../model/url'
import { sandboxFor } from '../widgets/frame/model'

/** a web page dashboard: one page filling everything under the bar */
export function PageFrame({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const page = pageOf(dashboard)
  const raw = page?.url.trim() ?? ''
  const url = safeUrl(raw)

  const message = (text: string) => (
    <div className="nh-pageframe nh-pageframe--empty">
      <p>{text}</p>
    </div>
  )

  if (!url) return message(raw ? t('That page address cannot be embedded.') : t('No page address yet.'))
  if (mixedContent(url)) return message(t('This page is served over HTTPS, so it cannot embed an insecure http:// address.'))

  const sandboxed = sandboxFor({ sandbox: page?.sandbox }, url)
  return (
    // a new frame for a new address or sandbox, as the frame widget does: the sandbox only takes effect on load
    <iframe
      key={`${sandboxed}|${url}`}
      className="nh-pageframe"
      src={url}
      title={dashboard.name || t('Embedded page')}
      sandbox={sandboxed ? 'allow-scripts' : undefined}
      allow="fullscreen"
      allowFullScreen
    />
  )
}
