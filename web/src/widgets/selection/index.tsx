import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { parseChoices } from '../common/choices'
import type { Choice } from '../common/choices'
import { Icon } from '../../components/Icon'
import { ensureCatalog, useCatalogStore } from '../../store/catalog'
import { stateMatches } from '../common/stateIcon'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { lookup } from '../../model/lookup'
import { SelectionDropdown } from './SelectionDropdown'

type Display = 'buttons' | 'dropdown' | 'segmented' | 'list'
type Finish = 'plain' | 'solid' | 'outline' | 'glass' | 'bare'

interface SelectionConfig {
  item: string
  label?: string
  choices?: string
  display?: Display
  finish?: Finish
  icon?: string
  iconSize?: number
  iconColor?: string
  labelMode?: string
}

const DISPLAYS: Record<Display, true> = { buttons: true, dropdown: true, segmented: true, list: true }
const FINISHES: Record<Finish, true> = { plain: true, solid: true, outline: true, glass: true, bare: true }

// stored config is untrusted, so anything but a known word draws the default
const displayOf = (v: unknown): Display => (typeof v === 'string' && lookup(DISPLAYS, v) ? (v as Display) : 'buttons')
const finishOf = (v: unknown): Finish => (typeof v === 'string' && lookup(FINISHES, v) ? (v as Finish) : 'plain')

function SelectionWidget({ config, ctx }: WidgetProps<SelectionConfig>) {
  const { t } = useTranslation()
  const manual = parseChoices(config.choices)
  // with choices of its own, or no item to ask about, there is nothing to wait for
  const wantsCatalog = manual.length === 0 && typeof config.item === 'string' && config.item !== ''
  const catalogItem = useCatalogStore((s) => (wantsCatalog ? s.items.find((i) => i.name === config.item) : undefined))
  const catalog = useCatalogStore((s) => (s.loaded ? 'ready' : s.failed ? 'failed' : 'loading'))

  useEffect(() => {
    if (wantsCatalog) ensureCatalog()
  }, [wantsCatalog])

  const choices: Choice[] =
    manual.length > 0
      ? manual
      : (catalogItem?.commandDescription?.commandOptions ?? []).map((o) => ({
          command: o.command,
          label: o.label ?? o.command
        }))

  const raw = ctx.getItem(config.item)
  const optimistic = useOptimisticValue<string | undefined>(
    raw?.state,
    raw?.state ?? '',
    (live, sent) => live !== undefined && sent !== undefined && stateMatches(sent, live),
    { item: config.item || undefined }
  )
  const current = optimistic.display
  const isCurrent = (choice: Choice) => stateMatches(choice.command, current)
  const chosen = choices.find(isCurrent)
  const choose = (command: string) => {
    if (ctx.editing || !config.item) return
    optimistic.commit(command)
    void ctx.sendCommand(config.item, command).then((accepted) => {
      if (!accepted) optimistic.cancel(command)
    })
  }

  // the item's own options are still on their way, or never arrived: neither is a widget nobody set up
  const empty =
    !wantsCatalog || catalog === 'ready'
      ? t('No choices - set them in the widget settings')
      : catalog === 'failed'
        ? t('The item list could not be read.')
        : t('Loading…')

  const display = displayOf(config.display)
  const finish = finishOf(config.finish)
  const label = typeof config.label === 'string' && config.label.trim() ? config.label : undefined
  // the title bar unless the name was put in the column; 'none' never gets here, WidgetHost drops the label
  const inColumn = config.labelMode === 'column' ? label : undefined
  // stored config is untrusted, and this one goes into a calc()
  const iconSize = typeof config.iconSize === 'number' && Number.isFinite(config.iconSize) && config.iconSize > 0 ? config.iconSize : 32
  // a live state that is none of the choices still shows, rather than the control claiming another choice
  const shown = chosen?.label ?? (current && current !== 'NULL' && current !== 'UNDEF' ? current : '-')

  // Keyed by position as well as command: a hand-written or imported choices list can name the same command
  // twice, and two children under one key is a React error. `ChoiceControl` in widgets/common/QuickControls.tsx
  // does the same.
  const control =
    choices.length === 0 ? (
      <div className="nh-selection__empty">{empty}</div>
    ) : display === 'dropdown' ? (
      <SelectionDropdown choices={choices} isCurrent={isCurrent} shown={shown} disabled={ctx.editing} onChoose={choose} />
    ) : (
      <div className={'nh-selection nh-selection--' + display}>
        {choices.map((choice, i) => (
          <button
            key={i + '|' + choice.command}
            type="button"
            className={'nh-selection__btn' + (isCurrent(choice) ? ' nh-selection__btn--active' : '')}
            aria-pressed={isCurrent(choice)}
            onClick={() => choose(choice.command)}>
            <span className="nh-selection__btnlabel">{choice.label}</span>
          </button>
        ))}
      </div>
    )

  // the icon and the choices are one centred column, with the name at the top of it or in the title bar
  return (
    <WidgetFrame label={inColumn ? undefined : label} className={'nh-selw nh-selw--' + display + (inColumn ? ' nh-selw--named' : '')}>
      <div
        className={
          'nh-selection__face nh-selection__face--' +
          display +
          (finish === 'plain' ? '' : ' nh-selection__face--' + finish) +
          (inColumn ? ' nh-selection__face--named' : '')
        }>
        {inColumn ? <div className="nh-selection__name">{inColumn}</div> : null}
        {config.icon ? (
          <div
            className="nh-selection__icon"
            style={{ '--sl-icon': `calc(${iconSize}px * var(--nh-iconscale, 1))` } as React.CSSProperties}>
            <Icon icon={config.icon} size={iconSize} state={current} color={config.iconColor} />
          </div>
        ) : null}
        {control}
      </div>
    </WidgetFrame>
  )
}

export const selectionWidget: WidgetDefinition<SelectionConfig> = {
  type: 'selection',
  name: 'Selection',
  description: 'Buttons for a set of commands or item options',
  defaultSize: { w: 4, h: 3 },
  hasHeader: true,
  labelModes: {
    options: [{ value: 'column', label: 'Above the choices' }],
    hint: 'Above the choices puts the name in the centred column with the icon and the choices. Name alignment and Name position are for the title bar.'
  },
  defaultConfig: () => ({ item: '', choices: '', display: 'buttons', finish: 'plain' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'choices',
      type: 'multiline',
      label: 'Choices (one per line, COMMAND=Label)',
      placeholder: 'ON=On\nOFF=Off'
    },
    { key: 'appearance', type: 'section', label: 'Appearance' },
    {
      key: 'display',
      type: 'select',
      label: 'Display',
      options: [
        { value: 'buttons', label: 'Buttons' },
        { value: 'dropdown', label: 'Dropdown' },
        { value: 'segmented', label: 'Segmented bar' },
        { value: 'list', label: 'List' }
      ]
    },
    {
      key: 'finish',
      type: 'select',
      label: 'Finish',
      options: [
        { value: 'plain', label: 'Plain' },
        { value: 'solid', label: 'Solid' },
        { value: 'outline', label: 'Outline' },
        { value: 'glass', label: 'Glass' },
        { value: 'bare', label: 'Bare' }
      ],
      hint: 'What the choices are drawn with. Plain follows the theme; the rest use the accent color.'
    },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 64 }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  controlFor: (c, item) => {
    if (item !== c.item) return undefined
    const manual = parseChoices(c.choices)
    return manual.length ? { kind: 'choices', choices: manual } : { kind: 'auto' }
  },
  Component: SelectionWidget
}
