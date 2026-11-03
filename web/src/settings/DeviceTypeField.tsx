import { useTranslation } from 'react-i18next'
import { deviceTypeFrom, setDeviceType, useDeviceTypeStore } from '../store/deviceType'

export function DeviceTypeField() {
  const { t } = useTranslation()
  const type = useDeviceTypeStore((s) => s.type)
  return (
    <label className="nh-field" htmlFor="nh-set-devicetype">
      <span className="nh-field__label">{t('Device type')}</span>
      <select id="nh-set-devicetype" value={type ?? ''} onChange={(e) => setDeviceType(deviceTypeFrom(e.target.value))}>
        <option value="">{t('Automatic, by screen width (default)')}</option>
        <option value="phone">{t('Phone')}</option>
        <option value="tablet">{t('Tablet')}</option>
        <option value="desktop">{t('Desktop')}</option>
      </select>
      <span className="nh-field__hint">
        {type === null
          ? t('Which layout this device gets. Set it if a tablet keeps getting the desktop layout, or the other way round.')
          : t('This device always gets that layout, whatever its width. Others are unchanged.')}
      </span>
    </label>
  )
}
