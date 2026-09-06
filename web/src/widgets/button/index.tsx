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
  /** When true and bound to an item, alternate between command/commandAlt based on state. */
  toggle?: boolean
  /** 'command' (default) sends to the item; 'navigate' opens a dashboard or URL. */
  action?: 'command' | 'navigate'
  navigateDashboard?: string
  navigateUrl?: string
  iconSize?: number
  hideLabel?: boolean
  /** An illustration filling the card above the label; when set it replaces the icon. */
  imageUrl?: string
  /** Small dim line under the label - the zone-card layout. */
  caption?: string
}

function ButtonWidget({ config, ctx }: WidgetProps<ButtonConfig>) {
  const state = config.item ? ctx.getItem(config.item) : undefined
  const active = !!config.toggle && stateMatches(config.command, state?.state)

  const press = () => {
    if (ctx.editing) return
    if (config.action === 'navigate') {
      if (config.navigateDashboard) navigate({ name: 'dashboard', id: config.navigateDashboard })
      // openExternal, not window.open: a stored `javascript:` URL opened this way would run with
      // this page's origin behind it.
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
    // Item/Command/Toggle stay visible in navigate mode: they still decide the active icon,
    // so a navigation button can light up with the state of what it navigates to. Only the
    // alternate command is dead there - press() navigates and returns before ever reading it.
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'command', type: 'text', label: 'Command' },
    { key: 'commandAlt', type: 'text', label: 'Alternate command', showIf: isCommand },
    { key: 'toggle', type: 'boolean', label: 'Toggle with state' },
    { key: 'navigateDashboard', type: 'dashboard', label: 'Go to dashboard', showIf: isNavigate },
    { key: 'navigateUrl', type: 'text', label: 'Open URL', showIf: isNavigate, subresource: false }
  ],
  itemKeys: (c) => (c.item ? [c.item] : []),
  // In navigate mode the item only lights the tile up; nothing is ever sent to it.
  canCommand: (c) => c.action !== 'navigate',
  // The commands this button was configured to send, and nothing else: a button bound to a
  // dimmer means "this value", not "any value", so inventing a slider would offer something its
  // author deliberately did not.
  controlFor: (c, item) => {
    if (c.action === 'navigate' || item !== c.item) return undefined
    // The alternate is dead unless this button toggles - `press()` only ever reaches it through
    // `toggle` - so offering it here would hand out a command the tile itself never sends.
    const both = [c.command, ...(c.toggle ? [c.commandAlt] : [])]
    const commands = [...new Set(both.filter((s): s is string => typeof s === 'string' && s !== ''))]
    // The command IS the label here - it is the author's own text, so it is never translated.
    return commands.length ? { kind: 'choices', choices: commands.map((command) => ({ command, label: command })) } : undefined
  },
  Component: ButtonWidget
}
