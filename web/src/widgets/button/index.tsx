import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { isOn } from '../common/format'
import { navigate } from '../../app/router'
import { Icon } from '../../components/Icon'

interface ButtonConfig {
  item?: string
  label: string
  command: string
  commandAlt?: string
  /** When true and bound to an item, alternate between command/commandAlt based on state. */
  toggle?: boolean
  /** 'command' (default) sends to the item; 'navigate' opens a dashboard or URL. */
  action?: 'command' | 'navigate'
  navigateDashboard?: string
  navigateUrl?: string
  /** "mdi:<name>" or "oh:<name>[@iconset]" (state-aware server icons). */
  icon?: string
  iconSize?: number
  hideLabel?: boolean
}

function ButtonWidget({ config, ctx }: WidgetProps<ButtonConfig>) {
  const state = config.item ? ctx.getItem(config.item) : undefined
  const on = isOn(state)

  const press = () => {
    if (ctx.editing) return
    if (config.action === 'navigate') {
      if (config.navigateDashboard) navigate({ name: 'dashboard', id: config.navigateDashboard })
      else if (config.navigateUrl) window.open(config.navigateUrl, '_blank', 'noopener')
      return
    }
    if (!config.item) return
    const cmd = config.toggle && config.commandAlt && on ? config.commandAlt : config.command
    ctx.sendCommand(config.item, cmd)
  }

  const showLabel = !config.hideLabel && config.label

  return (
    <WidgetFrame center>
      <button
        type="button"
        className={'nh-button' + (config.toggle && on ? ' nh-button--active' : '')}
        aria-label={config.label}
        onClick={press}
      >
        {config.icon ? (
          <Icon icon={config.icon} size={config.iconSize ?? 32} state={state?.state} className="nh-button__icon" />
        ) : null}
        {showLabel ? <span className="nh-button__label">{config.label}</span> : null}
      </button>
    </WidgetFrame>
  )
}

export const buttonWidget: WidgetDefinition<ButtonConfig> = {
  type: 'button',
  name: 'Button',
  description: 'Send a command or navigate',
  defaultSize: { w: 3, h: 2 },
  defaultConfig: () => ({ label: 'Button', command: 'ON', commandAlt: 'OFF', toggle: false, action: 'command', iconSize: 32 }),
  settings: [
    { key: 'label', type: 'text', label: 'Label' },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconSize', type: 'number', label: 'Icon size (px)', min: 16, max: 128 },
    { key: 'hideLabel', type: 'boolean', label: 'Icon only (hide label)' },
    {
      key: 'action',
      type: 'select',
      label: 'Action',
      options: [
        { value: 'command', label: 'Send command' },
        { value: 'navigate', label: 'Navigate' },
      ],
    },
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'command', type: 'text', label: 'Command' },
    { key: 'commandAlt', type: 'text', label: 'Alternate command' },
    { key: 'toggle', type: 'boolean', label: 'Toggle with state' },
    { key: 'navigateDashboard', type: 'text', label: 'Go to dashboard (id)' },
    { key: 'navigateUrl', type: 'text', label: 'Open URL' },
  ],
  itemKeys: (c) => (c.item ? [c.item] : []),
  Component: ButtonWidget,
}
