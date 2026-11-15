import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { navigate } from '../../app/router'
import { openExternal, safeUrl } from '../../model/url'
import { Icon } from '../../components/Icon'
import { useUnconfirmed } from '../../store/unconfirmed'
import i18n from '../../i18n'
import { resolveStateIcon, STATE_ICON_SETTINGS, type StateIconConfig } from '../common/stateIcon'
import {
  actionOf,
  boundItem,
  buttonFloor,
  commandFor,
  drawsFace,
  finishOf,
  isActive,
  ruleFor,
  styleOf,
  tileActive,
  toggleCommands,
  type ButtonAction,
  type ButtonFinish,
  type ButtonStyle
} from './model'
import { useRuleRun } from './useRuleRun'

interface ButtonConfig extends StateIconConfig {
  item?: string
  label: string
  command: string
  commandAlt?: string
  toggle?: boolean
  nonZeroIsOn?: boolean
  style?: ButtonStyle
  finish?: ButtonFinish
  action?: ButtonAction
  navigateDashboard?: string
  navigateUrl?: string
  rule?: string
  ruleAlt?: string
  statusItem?: string
  statusState?: string
  iconSize?: number
  hideLabel?: boolean
  imageUrl?: string
  caption?: string
}

// the tile shows what was asked for, so it has to say that is what it is showing
const unconfirmedHint = (command: string): string =>
  i18n.t('Sent {{command}}. This item does not report back, so nothing has confirmed it.', { command })

function ButtonWidget({ config, ctx }: WidgetProps<ButtonConfig>) {
  const action = actionOf(config.action)
  const item = boundItem(config)
  const state = item ? ctx.getItem(item) : undefined
  // An item with `autoupdate` vetoed posts no state when it is commanded, so reading the state
  // alone leaves a toggle stuck on whatever the device last reported - it sends the same command
  // for ever. Show what was asked for instead, marked as unconfirmed so the tile is not claiming
  // it as fact, and let a real state update win the moment one arrives.
  const asked = useUnconfirmed(action === 'command' ? config.item : undefined)
  const active = asked === undefined ? tileActive(config, state) : isActive(config, { state: asked, type: 'String' })
  const { icon, color } = resolveStateIcon(config, active, state?.state)
  const style = styleOf(config.style)
  const finish = finishOf(config.finish)
  const asSwitch = style === 'switch'

  const isRule = action === 'rule'
  const ruleNow = isRule ? ruleFor(config, active) : undefined
  const rule = useRuleRun(isRule ? [config.rule, item ? config.ruleAlt : undefined] : [], ruleNow, config.label)

  if (isRule && !config.rule) {
    return (
      <WidgetFrame label={config.label} center>
        <span className="nh-widget__unset">{i18n.t('No scene, script or rule yet - pick one in this widget’s settings.')}</span>
      </WidgetFrame>
    )
  }
  // inside the frame, so the tile keeps the name that says which one it is
  if (rule.missing) {
    return (
      <WidgetFrame label={config.label} center className="nh-widget--notice nh-widget--error">
        <span className="nh-widget__errtitle">{rule.missing}</span>
        <span className="nh-widget__errhint">{i18n.t('Not on this openHAB server. It may have been renamed or removed.')}</span>
      </WidgetFrame>
    )
  }

  const press = () => {
    if (ctx.editing) return
    if (action === 'navigate') {
      if (config.navigateDashboard) navigate({ name: 'dashboard', id: config.navigateDashboard })
      else if (config.navigateUrl) openExternal(config.navigateUrl)
      return
    }
    if (isRule) {
      // with a status item the item itself shows the outcome, so the tile adds nothing of its own
      if (ruleNow) void rule.run(ruleNow, item !== undefined)
      return
    }
    if (!config.item) return
    ctx.sendCommand(config.item, commandFor(config, active))
  }

  // a disabled rule keeps its tile and says why it will not do anything
  const blockNote =
    rule.block === 'disabled' ? i18n.t('Disabled in openHAB') : rule.block === 'broken' ? i18n.t('Not ready in openHAB') : null
  const caption = blockNote ?? config.caption
  const phaseClass = (base: string): string =>
    (rule.phase === 'running' ? ` ${base}--running` : '') +
    (rule.phase === 'done' ? ` ${base}--done` : '') +
    (rule.block ? ` ${base}--blocked` : '')
  const busy = rule.phase === 'running' ? true : undefined
  const tick =
    rule.phase === 'done' ? (
      <span className="nh-button__tick" aria-hidden="true">
        ✓
      </span>
    ) : null

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
          className={
            'nh-switch' + (active ? ' nh-switch--on' : '') + (asked === undefined ? '' : ' nh-switch--asking') + phaseClass('nh-switch')
          }
          role="switch"
          aria-checked={active}
          aria-busy={busy}
          title={blockNote ?? (asked === undefined ? undefined : unconfirmedHint(asked))}
          aria-label={config.label || item || undefined}
          onClick={press}>
          {iconEl}
          <span className="nh-switch__track">
            <span className="nh-switch__thumb" />
          </span>
          <span className="nh-switch__state">{active ? i18n.t('ON') : i18n.t('OFF')}</span>
          {tick}
        </button>
      </WidgetFrame>
    )
  }

  // a face showing an item's state is a toggle to a screen reader; one that only navigates is not
  const pressed = action !== 'navigate' && item ? active : undefined
  const showLabel = !config.hideLabel && config.label
  const media = safeUrl(config.imageUrl)
  const art = media ? <img className="nh-button__media" src={media} alt="" /> : iconEl
  const follows = action === 'command' ? config.toggle === true : item !== undefined
  const className =
    `nh-button nh-button--${finish}` +
    (style === 'card' ? ' nh-button--card' : '') +
    (finish === 'plain' ? '' : ' nh-button--fill') +
    (active ? ' nh-button--active' : '') +
    (asked === undefined ? '' : ' nh-button--asking') +
    phaseClass('nh-button')
  const title = blockNote ?? (asked === undefined ? undefined : unconfirmedHint(asked))

  if (style === 'card') {
    return (
      <WidgetFrame center>
        <button
          type="button"
          className={className}
          aria-label={config.label}
          aria-pressed={pressed}
          aria-busy={busy}
          title={title}
          onClick={press}>
          {art ? <span className="nh-button__chip">{art}</span> : null}
          {follows ? <span className="nh-button__pip" /> : null}
          <span className="nh-button__text">
            {showLabel ? <span className="nh-button__label">{config.label}</span> : null}
            {caption ? <span className="nh-button__caption">{caption}</span> : null}
          </span>
          {tick}
        </button>
      </WidgetFrame>
    )
  }

  return (
    <WidgetFrame center>
      <button
        type="button"
        className={className}
        aria-label={config.label}
        aria-pressed={pressed}
        aria-busy={busy}
        title={title}
        onClick={press}>
        {art}
        {showLabel ? <span className="nh-button__label">{config.label}</span> : null}
        {caption ? <span className="nh-button__caption">{caption}</span> : null}
        {tick}
      </button>
    </WidgetFrame>
  )
}

// only the fields the button's own face draws are hidden in switch style; everything about behaviour is
// offered either way, because the style is the look and nothing else
const hasFace = (c: Record<string, unknown>) => drawsFace(c.style)
const isCommand = (c: Record<string, unknown>) => actionOf(c.action) === 'command'
const isNavigate = (c: Record<string, unknown>) => actionOf(c.action) === 'navigate'
const isRule = (c: Record<string, unknown>) => actionOf(c.action) === 'rule'
const readsStatus = (c: Record<string, unknown>) => !isCommand(c)
const hasStatus = (c: Record<string, unknown>) => readsStatus(c) && typeof c.statusItem === 'string' && c.statusItem !== ''

export const buttonWidget: WidgetDefinition<ButtonConfig> = {
  type: 'button',
  name: 'Button',
  description: 'A pressable tile, a card or a sliding switch: send a command, toggle an item, navigate, or run a scene or script',
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
  // what a press does comes first: what it needs next depends on it
  settings: [
    {
      key: 'action',
      type: 'select',
      label: 'Action',
      options: [
        { value: 'command', label: 'Send command' },
        { value: 'navigate', label: 'Navigate (neohab)' },
        { value: 'rule', label: 'Run a scene, script or rule' }
      ]
    },
    { key: 'item', type: 'item', label: 'openHAB Item', showIf: isCommand },
    { key: 'command', type: 'text', label: 'Command', showIf: isCommand, hint: 'Sent when you press it, or to switch on.' },
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
      showIf: isCommand,
      hint: 'The tile shows whether the item is on, and a press then sends Alternate command instead.'
    },
    {
      key: 'nonZeroIsOn',
      type: 'boolean',
      label: 'Count any value above 0 as on',
      showIf: isCommand,
      hint: 'For a dimmer or a color light: 50% counts as on. Without this, only a state exactly equal to Command counts.'
    },
    { key: 'navigateDashboard', type: 'dashboard', label: 'Go to dashboard', showIf: isNavigate },
    { key: 'navigateUrl', type: 'text', label: 'Open URL', showIf: isNavigate, subresource: false },
    { key: 'rule', type: 'rule', label: 'Scene, script or rule', showIf: isRule },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'status', type: 'section', label: 'Status' },
    {
      key: 'statusItem',
      type: 'item',
      label: 'Status item',
      readOnly: true,
      optional: () => true,
      showIf: readsStatus,
      hint: 'Optional. The tile lights up while this item is on.'
    },
    {
      key: 'statusState',
      type: 'text',
      label: 'On when it reads',
      placeholder: 'ON or any level above 0',
      showIf: hasStatus,
      hint: 'Leave it empty for ON or any level above 0, or type the exact state, like OPEN or PLAY.'
    },
    {
      key: 'ruleAlt',
      type: 'rule',
      label: 'When on, run instead',
      showIf: (c) => isRule(c) && hasStatus(c),
      hint: 'Leave it empty to run the same one every time.'
    },
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
  itemKeys: (c) => {
    const item = boundItem(c)
    return item ? [item] : []
  },
  canCommand: (c) => actionOf(c.action) === 'command',
  // driven by what it does, not by how it looks: a tile with two commands is an on/off pair whichever
  // style is drawing it. A status item is only read, so the hold sheet offers nothing for it.
  controlFor: (c, item) => {
    if (actionOf(c.action) !== 'command' || item !== c.item) return undefined
    const { on, off } = toggleCommands(c)
    if (off) return { kind: 'onoff', on, off, nonZeroIsOn: c.nonZeroIsOn === true }
    return on ? { kind: 'choices', choices: [{ command: on, label: on }] } : undefined
  },
  Component: ButtonWidget
}
