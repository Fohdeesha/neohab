import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { isOn } from '../common/format'
import { Icon } from '../../components/Icon'

interface SwitchConfig {
  item: string
  label?: string
  onCommand?: string
  offCommand?: string
  /** "mdi:<name>" or "oh:<name>[@iconset]" (state-aware server icons). */
  icon?: string
  iconSize?: number
}

function SwitchWidget({ config, ctx }: WidgetProps<SwitchConfig>) {
  const state = ctx.getItem(config.item)
  const on = isOn(state)
  const onCmd = config.onCommand ?? 'ON'
  const offCmd = config.offCommand ?? 'OFF'

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
        onClick={toggle}
      >
        {config.icon ? (
          <Icon icon={config.icon} size={config.iconSize ?? 32} state={state?.state} className="nh-switch__icon" />
        ) : null}
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
  defaultSize: { w: 3, h: 3 },
  defaultConfig: () => ({ item: '', onCommand: 'ON', offCommand: 'OFF' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Switch', 'Dimmer', 'Color'] },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconSize', type: 'number', label: 'Icon size (px)', min: 16, max: 128 },
    { key: 'onCommand', type: 'text', label: 'On command' },
    { key: 'offCommand', type: 'text', label: 'Off command' },
  ],
  itemKeys: (c) => [c.item],
  Component: SwitchWidget,
}
