import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { navigate } from '../../app/router'
import { Icon } from '../../components/Icon'
import { resolveStateIcon, STATE_ICON_SETTINGS, type StateIconConfig } from '../common/stateIcon'

interface ButtonConfig extends StateIconConfig {
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
  iconSize?: number
  hideLabel?: boolean
}

/**
 * HABPanel toggle semantics: a toggle button is "active" exactly when the raw item
 * state equals the command, and only then sends the alternate command. isOn()-style
 * heuristics must NOT be used here — for a Rollershutter at an intermediate position
 * (e.g. a half-stopped garage door at 50) they invert the imported button's behavior.
 * Numeric-tolerant so a stored '100' still matches a server '100.0'.
 */
function stateMatches(command: string | number | undefined, raw: string | undefined): boolean {
  if (command == null || raw == null) return false
  const cmd = String(command)
  if (raw === cmd) return true
  if (cmd.trim() === '' || raw.trim() === '') return false
  const a = Number(raw)
  const b = Number(cmd)
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b
}

function ButtonWidget({ config, ctx }: WidgetProps<ButtonConfig>) {
  const state = config.item ? ctx.getItem(config.item) : undefined
  const active = !!config.toggle && stateMatches(config.command, state?.state)

  const press = () => {
    if (ctx.editing) return
    if (config.action === 'navigate') {
      if (config.navigateDashboard) navigate({ name: 'dashboard', id: config.navigateDashboard })
      else if (config.navigateUrl) window.open(config.navigateUrl, '_blank', 'noopener')
      return
    }
    if (!config.item) return
    const cmd = config.toggle && config.commandAlt && active ? config.commandAlt : config.command
    ctx.sendCommand(config.item, cmd)
  }

  const showLabel = !config.hideLabel && config.label
  const { icon, color } = resolveStateIcon(config, active)

  return (
    <WidgetFrame center>
      <button
        type="button"
        className={'nh-button' + (active ? ' nh-button--active' : '')}
        aria-label={config.label}
        onClick={press}
      >
        {icon ? (
          <Icon icon={icon} size={config.iconSize ?? 32} state={state?.state} color={color} className="nh-button__icon" />
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
    ...STATE_ICON_SETTINGS,
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
