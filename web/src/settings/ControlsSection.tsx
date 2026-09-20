import { useTranslation } from 'react-i18next'
import { saveSettings, useConfigStore } from '../store/config'
import type { NoticeFn } from '../store/notify'

export function ControlsSection({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation()
  const liveDrag = useConfigStore((s) => s.settings.liveDrag !== false)

  // on is the absence of the key, so an install that never touched this keeps a settings component nobody rewrote
  const setLiveDrag = async (on: boolean) => {
    onNotice(null)
    const err = await saveSettings({ liveDrag: on ? undefined : false })
    if (err) onNotice(t('Applied on this device, but saving failed: {{error}}', { error: err }))
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Controls')}</h2>
      <label className="nh-field nh-field--row" htmlFor="nh-set-livedrag">
        <span className="nh-field__label">{t('Command devices while dragging')}</span>
        <input id="nh-set-livedrag" type="checkbox" checked={liveDrag} onChange={(e) => void setLiveDrag(e.target.checked)} />
      </label>
      <p className="nh-settings__text">
        {t(
          'Sliders, color pickers and dials command the device as you drag, up to five times a second. Shared with every device. Turn it off if your devices, rules or persistence cannot take that many commands; any widget can override it in its own settings.'
        )}
      </p>
    </section>
  )
}
