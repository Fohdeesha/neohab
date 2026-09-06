import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { isOn } from '../common/format'
import { commandOr } from '../common/itemControl'
import { Icon } from '../../components/Icon'
import { resolveStateIcon, STATE_ICON_SETTINGS, type StateIconConfig } from '../common/stateIcon'

interface SwitchConfig extends StateIconConfig {
  item: string
  label?: string
  onCommand?: string
  offCommand?: string
  iconSize?: number
}

function SwitchWidget({ config, ctx }: WidgetProps<SwitchConfig>) {
  const state = ctx.getItem(config.item)
  const on = isOn(state)
  const onCmd = config.onCommand ?? 'ON'
  const offCmd = config.offCommand ?? 'OFF'
  const { icon, color } = resolveStateIcon(config, on, state?.state)

  const toggle = () => {
    if (ctx.editing) return
    ctx.sendCommand(config.item, on ? offCmd : onCmd)
  }

  return (
    <WidgetFrame label={config.label} center>
      <button
        type="button"
        className={'nh-switch' + (on ? ' nh-switch--on' : '')}
        role="switch"
        aria-checked={on}
        aria-label={config.label ?? config.item}
        onClick={toggle}>
        {icon ? <Icon icon={icon} size={config.iconSize ?? 32} state={state?.state} color={color} className="nh-switch__icon" /> : null}
        <span className="nh-switch__track">
          <span className="nh-switch__thumb" />
        </span>
        <span className="nh-switch__state">{on ? 'ON' : 'OFF'}</span>
      </button>
    </WidgetFrame>
  )
}

export const switchWidget: WidgetDefinition<SwitchConfig> = {
  type: 'switch',
  name: 'Switch',
  description: 'Toggle an on/off item',
  defaultSize: { w: 2, h: 2 },
  hasHeader: true,
  defaultConfig: () => ({ item: '', onCommand: 'ON', offCommand: 'OFF' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Switch', 'Dimmer', 'Color'] },
    { key: 'label', type: 'text', label: 'Name' },
    ...STATE_ICON_SETTINGS,
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    { key: 'onCommand', type: 'text', label: 'On command' },
    { key: 'offCommand', type: 'text', label: 'Off command' }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  controlFor: (c, item) =>
    item === c.item ? { kind: 'onoff', on: commandOr(c.onCommand, 'ON'), off: commandOr(c.offCommand, 'OFF') } : undefined,
  Component: SwitchWidget
}
