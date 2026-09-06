import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetContext } from '../types'
import { clearSettling, markSettling } from '../../store/settling'
import { ColorControl } from '../color/ColorControl'
import { RangeControl, SwitchControl } from '../common/QuickControls'
import { stateKind, type FloorplanLight } from './model'

export function LightPopup({ light, ctx: outer, onClose }: { light: FloorplanLight; ctx: WidgetContext; onClose: () => void }) {
  const { t } = useTranslation()
  const ctx = useMemo<WidgetContext>(
    () => ({
      ...outer,
      sendCommand: (item, command) => {
        markSettling([{ item, command }])
        return outer.sendCommand(item, command).then((accepted) => {
          if (!accepted) clearSettling([item])
          return accepted
        })
      }
    }),
    [outer]
  )
  const state = ctx.getItem(light.item)
  const kind = stateKind(state?.state)

  return (
    <div className="nh-fplan__scrim" onClick={onClose}>
      <div className="nh-fplan__popup" role="dialog" aria-label={light.label ?? light.item} onClick={(e) => e.stopPropagation()}>
        <div className="nh-fplan__popuphead">
          <span className="nh-fplan__popupname">{light.label ?? light.item}</span>
          <button type="button" className="nh-iconbtn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </div>
        {kind === 'color' ? (
          <ColorControl item={light.item} ctx={ctx} />
        ) : kind === 'level' ? (
          <RangeControl item={light.item} ctx={ctx} />
        ) : kind === 'onoff' ? (
          <SwitchControl item={light.item} ctx={ctx} />
        ) : (
          <p className="nh-fplan__popupstate">{state?.displayState ?? state?.state ?? t('No state yet')}</p>
        )}
      </div>
    </div>
  )
}
