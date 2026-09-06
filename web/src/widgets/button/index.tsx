import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { navigate } from '../../app/router'
import { openExternal, safeUrl } from '../../model/url'
import { Icon } from '../../components/Icon'
import { resolveStateIcon, stateMatches, STATE_ICON_SETTINGS, type StateIconConfig } from '../common/stateIcon'

interface ButtonConfig extends StateIconConfig {
  item?: string
  label: string
  command: string
  commandAlt?: string
  toggle?: boolean
  action?: 'command' | 'navigate'
  navigateDashboard?: string
  navigateUrl?: string
  iconSize?: number
  hideLabel?: boolean
  imageUrl?: string
  caption?: string
}

function ButtonWidget({ config, ctx }: WidgetProps<ButtonConfig>) {
  const state = config.item ? ctx.getItem(config.item) : undefined
  const active = !!config.toggle && stateMatches(config.command, state?.state)

  const press = () => {
    if (ctx.editing) return
    if (config.action === 'navigate') {
      if (config.navigateDashboard) navigate({ name: 'dashboard', id: config.navigateDashboard })
      else if (config.navigateUrl) openExternal(config.navigateUrl)
      return
    }
    if (!config.item) return
    const cmd = config.toggle && config.commandAlt && active ? config.commandAlt : config.command
    ctx.sendCommand(config.item, cmd)
  }

  const showLabel = !config.hideLabel && config.label
  const { icon, color } = resolveStateIcon(config, active, state?.state)
  const media = safeUrl(config.imageUrl)

  return (
    <WidgetFrame center>
      <button type="button" className={'nh-button' + (active ? ' nh-button--active' : '')} aria-label={config.label} onClick={press}>
        {media ? (
          <img className="nh-button__media" src={media} alt="" />
        ) : icon ? (
          <Icon icon={icon} size={config.iconSize ?? 32} state={state?.state} color={color} className="nh-button__icon" />
        ) : null}
        {showLabel ? <span className="nh-button__label">{config.label}</span> : null}
        {config.caption ? <span className="nh-button__caption">{config.caption}</span> : null}
      </button>
    </WidgetFrame>
  )
}

const isNavigate = (c: Record<string, unknown>) => c.action === 'navigate'
const isCommand = (c: Record<string, unknown>) => c.action !== 'navigate'

export const buttonWidget: WidgetDefinition<ButtonConfig> = {
  type: 'button',
  name: 'Button',
  description: 'Send a command or navigate',
  defaultSize: { w: 2, h: 2 },
  defaultConfig: () => ({ label: 'Button', command: 'ON', commandAlt: 'OFF', toggle: false, action: 'command', iconSize: 32 }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'caption', type: 'text', label: 'Caption' },
    { key: 'imageUrl', type: 'text', label: 'Image URL', placeholder: 'https://…', subresource: true },
    ...STATE_ICON_SETTINGS,
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    { key: 'hideLabel', type: 'boolean', label: 'Icon only (hide the name)' },
    {
      key: 'action',
      type: 'select',
      label: 'Action',
      options: [
        { value: 'command', label: 'Send command' },
        { value: 'navigate', label: 'Navigate (neohab)' }
      ]
    },
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'command', type: 'text', label: 'Command' },
    { key: 'commandAlt', type: 'text', label: 'Alternate command', showIf: isCommand },
    { key: 'toggle', type: 'boolean', label: 'Toggle with state' },
    { key: 'navigateDashboard', type: 'dashboard', label: 'Go to dashboard', showIf: isNavigate },
    { key: 'navigateUrl', type: 'text', label: 'Open URL', showIf: isNavigate, subresource: false }
  ],
  itemKeys: (c) => (c.item ? [c.item] : []),
  canCommand: (c) => c.action !== 'navigate',
  controlFor: (c, item) => {
    if (c.action === 'navigate' || item !== c.item) return undefined
    const both = [c.command, ...(c.toggle ? [c.commandAlt] : [])]
    const commands = [...new Set(both.filter((s): s is string => typeof s === 'string' && s !== ''))]
    return commands.length ? { kind: 'choices', choices: commands.map((command) => ({ command, label: command })) } : undefined
  },
  Component: ButtonWidget
}
