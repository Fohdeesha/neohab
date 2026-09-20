import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { navigate } from '../../app/router'
import { openExternal, safeUrl } from '../../model/url'
import { Icon } from '../../components/Icon'
import { resolveStateIcon, STATE_ICON_SETTINGS, type StateIconConfig } from '../common/stateIcon'
import {
  buttonFloor,
  commandFor,
  drawsFace,
  finishOf,
  isActive,
  styleOf,
  toggleCommands,
  type ButtonFinish,
  type ButtonStyle
} from './model'

interface ButtonConfig extends StateIconConfig {
  item?: string
  label: string
  command: string
  commandAlt?: string
  toggle?: boolean
  nonZeroIsOn?: boolean
  style?: ButtonStyle
  finish?: ButtonFinish
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
  const style = styleOf(config.style)
  const finish = finishOf(config.finish)
  const asSwitch = style === 'switch'

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
  const art = media ? <img className="nh-button__media" src={media} alt="" /> : iconEl
  const className =
    `nh-button nh-button--${finish}` +
    (style === 'card' ? ' nh-button--card' : '') +
    (finish === 'plain' ? '' : ' nh-button--fill') +
    (active ? ' nh-button--active' : '')

  if (style === 'card') {
    return (
      <WidgetFrame center>
        <button type="button" className={className} aria-label={config.label} onClick={press}>
          {art ? <span className="nh-button__chip">{art}</span> : null}
          {config.toggle ? <span className="nh-button__pip" /> : null}
          <span className="nh-button__text">
            {showLabel ? <span className="nh-button__label">{config.label}</span> : null}
            {config.caption ? <span className="nh-button__caption">{config.caption}</span> : null}
          </span>
        </button>
      </WidgetFrame>
    )
  }

  return (
    <WidgetFrame center>
      <button type="button" className={className} aria-label={config.label} onClick={press}>
        {art}
        {showLabel ? <span className="nh-button__label">{config.label}</span> : null}
        {config.caption ? <span className="nh-button__caption">{config.caption}</span> : null}
      </button>
    </WidgetFrame>
  )
}

// only the fields the button's own face draws are hidden in switch style; everything about behaviour is
// offered either way, because the style is the look and nothing else
const hasFace = (c: Record<string, unknown>) => drawsFace(c.style)
const isNavigate = (c: Record<string, unknown>) => c.action === 'navigate'
const isCommand = (c: Record<string, unknown>) => c.action !== 'navigate'

export const buttonWidget: WidgetDefinition<ButtonConfig> = {
  type: 'button',
  name: 'Button',
  description: 'A pressable tile, a card or a sliding switch: send a command, toggle an item, or navigate',
  defaultSize: { w: 2, h: 2 },
  minPixelHeight: buttonFloor,
  hasHeader: (c) => styleOf(c.style) === 'switch',
  defaultConfig: () => ({
    // empty like every other widget, or binding an item cannot fill the name from the item's label
    label: '',
    command: 'ON',
    commandAlt: 'OFF',
    toggle: true,
    nonZeroIsOn: false,
    style: 'button',
    finish: 'plain',
    action: 'command',
    iconSize: 32
  }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', optional: isNavigate },
    {
      key: 'action',
      type: 'select',
      label: 'Action',
      options: [
        { value: 'command', label: 'Send command' },
        { value: 'navigate', label: 'Navigate (neohab)' }
      ]
    },
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
    { key: 'navigateUrl', type: 'text', label: 'Open URL', showIf: isNavigate, subresource: false },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'appearance', type: 'section', label: 'Appearance' },
    {
      key: 'style',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'button', label: 'Button' },
        { value: 'card', label: 'Card' },
        { value: 'switch', label: 'Switch' }
      ],
      hint: 'Where the parts sit: centred on a tile you press, in the corners of a card, or a sliding toggle.'
    },
    {
      key: 'finish',
      type: 'select',
      label: 'Finish',
      options: [
        { value: 'plain', label: 'Plain' },
        { value: 'solid', label: 'Solid' },
        { value: 'glass', label: 'Glass' },
        { value: 'glow', label: 'Glow' },
        { value: 'edge', label: 'Edge' },
        { value: 'outline', label: 'Outline' },
        { value: 'sheen', label: 'Sheen' },
        { value: 'bare', label: 'Bare' }
      ],
      showIf: hasFace,
      hint: 'What the face is made of. Plain follows the theme; the rest fill the tile and use the accent color.'
    },
    { key: 'caption', type: 'text', label: 'Caption', showIf: hasFace },
    { key: 'imageUrl', type: 'text', label: 'Image URL', placeholder: 'https://…', subresource: true, showIf: hasFace },
    ...STATE_ICON_SETTINGS,
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    { key: 'hideLabel', type: 'boolean', label: 'Icon only (hide the name)', showIf: hasFace }
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
