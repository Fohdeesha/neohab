import { useTranslation } from 'react-i18next'
import { ItemPicker } from './ItemPicker'
import type { StatusState } from '../model/presets'

export function PresetBridgeFields({
  idPrefix,
  item,
  state,
  bridge,
  onItem,
  onState,
  onBridge
}: {
  idPrefix: string
  item: string
  state: StatusState
  bridge: boolean
  onItem: (v: string) => void
  onState: (v: StatusState) => void
  onBridge: (v: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="nh-field">
        <label className="nh-field__label" htmlFor={idPrefix + '-status'}>
          {t('Status item (a Switch your wall switches already use)')}
        </label>
        <ItemPicker
          id={idPrefix + '-status'}
          value={item}
          itemTypes={['Switch']}
          onChange={(v) => onItem(typeof v === 'string' ? v : '')}
        />
      </div>
      <label className="nh-field" htmlFor={idPrefix + '-state'}>
        <span className="nh-field__label">{t('Active when the item is')}</span>
        <select id={idPrefix + '-state'} value={state} onChange={(e) => onState(e.target.value === 'OFF' ? 'OFF' : 'ON')}>
          <option value="ON">ON</option>
          <option value="OFF">OFF</option>
        </select>
      </label>
      <label className="nh-field nh-field--row" htmlFor={idPrefix + '-bridge'}>
        <span className="nh-field__label">{t('Run this preset when the item reaches that state')}</span>
        <input
          id={idPrefix + '-bridge'}
          type="checkbox"
          checked={bridge}
          disabled={item === ''}
          onChange={(e) => onBridge(e.target.checked)}
        />
      </label>
      <p className="nh-field__hint">
        {t(
          'With this on, neohab adds a rule so the wall switch runs the preset. Leave it off if something else already reacts to that item.'
        )}
      </p>
    </>
  )
}
