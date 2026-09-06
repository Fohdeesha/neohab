/**
 * The status-item link for a lighting preset: the item whose state mirrors "this preset is
 * active", which state means active, and whether neohab should add the rule that lets the item
 * trigger the preset.
 *
 * Controlled and save-less, because its two callers commit differently: the Settings manager
 * saves the link on its own, the floor plan's preset editor saves it with everything else. The
 * fields and their wording live here so the two cannot drift apart.
 */
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
  /** Unique per preset: several of these can be on screen at once. */
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
          'Leave this off while another system still reacts to the item, or the lights would be set twice. With it on, neohab adds a small rule so the wall switch drives this preset directly.'
        )}
      </p>
    </>
  )
}
