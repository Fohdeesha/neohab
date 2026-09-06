import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { displayValue } from '../common/format'
import type { ItemChoice } from '../common/itemControl'

interface RollershutterConfig {
  item: string
  label?: string
}

/** Rollershutter - UP / STOP / DOWN controls with the current position. */
function RollershutterWidget({ config, ctx }: WidgetProps<RollershutterConfig>) {
  const { t } = useTranslation()
  const state = ctx.getItem(config.item)
  const send = (command: string) => {
    if (!ctx.editing && config.item) ctx.sendCommand(config.item, command)
  }

  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-roller">
        <button type="button" className="nh-roller__btn" aria-label={t('Up')} onClick={() => send('UP')}>
          ▲
        </button>
        <button type="button" className="nh-roller__btn" aria-label={t('Stop')} onClick={() => send('STOP')}>
          ■
        </button>
        <button type="button" className="nh-roller__btn" aria-label={t('Down')} onClick={() => send('DOWN')}>
          ▼
        </button>
        <span className="nh-roller__pos">{displayValue(state)}</span>
      </div>
    </WidgetFrame>
  )
}

/**
 * The three commands this widget exists to send. A rollershutter's state is a percentage, so a
 * popup that guessed from the state offered a position slider instead - which on a garage door is
 * a real door moving to wherever the track was pressed.
 */
const ROLLER_COMMANDS: ItemChoice[] = [
  { command: 'UP', labelKey: 'Up' },
  { command: 'STOP', labelKey: 'Stop' },
  { command: 'DOWN', labelKey: 'Down' }
]

export const rollershutterWidget: WidgetDefinition<RollershutterConfig> = {
  type: 'rollershutter',
  name: 'Rollershutter',
  description: 'Up / stop / down control',
  defaultSize: { w: 3, h: 4 },
  hasHeader: true,
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Rollershutter'] },
    { key: 'label', type: 'text', label: 'Name' }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  controlFor: (c, item) => (item === c.item ? { kind: 'choices', choices: ROLLER_COMMANDS } : undefined),
  Component: RollershutterWidget
}
