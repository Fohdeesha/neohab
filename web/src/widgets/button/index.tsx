import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { navigate } from '../../app/router'
import { openExternal, safeUrl } from '../../model/url'
import { Icon } from '../../components/Icon'
import { resolveStateIcon, STATE_ICON_SETTINGS, type StateIconConfig } from '../common/stateIcon'
import { commandFor, isActive, styleOf, toggleCommands, type ButtonStyle } from './model'

interface ButtonConfig extends StateIconConfig {
  item?: string
  label: string
  command: string
  commandAlt?: string
  toggle?: boolean
  nonZeroIsOn?: boolean
  style?: ButtonStyle
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
  const active = isActive(config, state)
  const { icon, color } = resolveStateIcon(config, active, state?.state)
  const asSwitch = styleOf(config.style) === 'switch'

  const press = () => {
    if (ctx.editing) return
    if (config.action === 'navigate') {
      if (config.navigateDashboard) navigate({ name: 'dashboard', id: config.navigateDashboard })
      else if (config.navigateUrl) openExternal(config.navigateUrl)
      return
    }
    if (!config.item) return
    ctx.sendCommand(config.item, commandFor(config, active))
  }

  const iconEl = icon ? (
    <Icon
      icon={icon}
      size={config.iconSize ?? 32}
      state={state?.state}
      color={color}
      className={asSwitch ? 'nh-switch__icon' : 'nh-button__icon'}
    />
  ) : null

  if (asSwitch) {
    return (
      <WidgetFrame label={config.label} center>
        <button
          type="button"
          className={'nh-switch' + (active ? ' nh-switch--on' : '')}
          role="switch"
          aria-checked={active}
          aria-label={config.label || config.item}
          onClick={press}>
          {iconEl}
          <span className="nh-switch__track">
            <span className="nh-switch__thumb" />
          </span>
          <span className="nh-switch__state">{active ? 'ON' : 'OFF'}</span>
        </button>
      </WidgetFrame>
    )
  }

  const showLabel = !config.hideLabel && config.label
  const media = safeUrl(config.imageUrl)

  return (
    <WidgetFrame center>
      <button type="button" className={'nh-button' + (active ? ' nh-button--active' : '')} aria-label={config.label} onClick={press}>
        {media ? <img className="nh-button__media" src={media} alt="" /> : iconEl}
        {showLabel ? <span className="nh-button__label">{config.label}</span> : null}
        {config.caption ? <span className="nh-button__caption">{config.caption}</span> : null}
      </button>
    </WidgetFrame>
  )
}

// only the fields the button's own face draws are hidden in switch style; everything about behaviour is
// offered either way, because the style is the look and nothing else
const drawsFace = (c: Record<string, unknown>) => styleOf(c.style) === 'button'
const isNavigate = (c: Record<string, unknown>) => c.action === 'navigate'
const isCommand = (c: Record<string, unknown>) => c.action !== 'navigate'

export const buttonWidget: WidgetDefinition<ButtonConfig> = {
  type: 'button',
  name: 'Button',
  description: 'A pressable tile or a sliding switch: send a command, toggle an item, or navigate',
  defaultSize: { w: 2, h: 2 },
  hasHeader: (c) => styleOf(c.style) === 'switch',
  defaultConfig: () => ({
    label: 'Button',
    command: 'ON',
    commandAlt: 'OFF',
    toggle: true,
    nonZeroIsOn: false,
    style: 'button',
    action: 'command',
    iconSize: 32
  }),
  settings: [
    {
      key: 'style',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'button', label: 'Button' },
        { value: 'switch', label: 'Switch' }
      ],
      hint: 'Just the look: a tile you press, or a sliding toggle.'
    },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'caption', type: 'text', label: 'Caption', showIf: drawsFace },
    { key: 'imageUrl', type: 'text', label: 'Image URL', placeholder: 'https://…', subresource: true, showIf: drawsFace },
    ...STATE_ICON_SETTINGS,
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    { key: 'hideLabel', type: 'boolean', label: 'Icon only (hide the name)', showIf: drawsFace },
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
    { key: 'command', type: 'text', label: 'Command', hint: 'Sent when you press it, or to switch on.' },
    {
      key: 'commandAlt',
      type: 'text',
      label: 'Alternate command',
      showIf: isCommand,
      hint: 'Sent to switch off, when the tile is already showing as on.'
    },
    {
      key: 'toggle',
      type: 'boolean',
      label: 'Toggle with state',
      hint: 'The tile shows whether the item is on, and a press then sends Alternate command instead.'
    },
    {
      key: 'nonZeroIsOn',
      type: 'boolean',
      label: 'Count any value above 0 as on',
      hint: 'For a dimmer or a color light: 50% counts as on. Without this, only a state exactly equal to Command counts.'
    },
    { key: 'navigateDashboard', type: 'dashboard', label: 'Go to dashboard', showIf: isNavigate },
    { key: 'navigateUrl', type: 'text', label: 'Open URL', showIf: isNavigate, subresource: false }
  ],
  itemKeys: (c) => (c.item ? [c.item] : []),
  canCommand: (c) => c.action !== 'navigate',
  // driven by what it does, not by how it looks: a tile with two commands is an on/off pair whichever
  // style is drawing it
  controlFor: (c, item) => {
    if (c.action === 'navigate' || item !== c.item) return undefined
    const { on, off } = toggleCommands(c)
    if (off) return { kind: 'onoff', on, off }
    return on ? { kind: 'choices', choices: [{ command: on, label: on }] } : undefined
  },
  Component: ButtonWidget
}
