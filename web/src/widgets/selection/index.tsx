import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { parseChoices } from '../common/choices'
import type { Choice } from '../common/choices'
import { ensureCatalog, useCatalogStore } from '../../store/catalog'

interface SelectionConfig {
  item: string
  label?: string
  choices?: string
  display?: 'buttons' | 'dropdown'
  icon?: string
  iconSize?: number
  iconColor?: string
}

function SelectionWidget({ config, ctx }: WidgetProps<SelectionConfig>) {
  const { t } = useTranslation()
  const manual = parseChoices(config.choices)
  const catalogItem = useCatalogStore((s) => s.items.find((i) => i.name === config.item))

  useEffect(() => {
    if (manual.length === 0 && config.item) ensureCatalog()
  }, [manual.length, config.item])

  const choices: Choice[] =
    manual.length > 0
      ? manual
      : (catalogItem?.commandDescription?.commandOptions ?? []).map((o) => ({
          command: o.command,
          label: o.label ?? o.command
        }))

  const state = ctx.getItem(config.item)

  return (
    <WidgetFrame label={config.label} icon={config.icon} iconSize={config.iconSize} iconState={state?.state} iconColor={config.iconColor}>
      {choices.length === 0 ? (
        <div className="nh-selection__empty">{t('No choices - set them in the widget settings')}</div>
      ) : config.display === 'dropdown' ? (
        <select
          className="nh-selection__select"
          value={state?.state ?? ''}
          disabled={ctx.editing}
          onChange={(e) => {
            if (!ctx.editing && config.item) ctx.sendCommand(config.item, e.target.value)
          }}>
          {/* a live state that is not one of the choices still shows, rather than the list
              silently displaying some other choice as if it were current */}
          {choices.some((c) => c.command === state?.state) ? null : <option value={state?.state ?? ''}>{state?.state ?? ''}</option>}
          {/* Keyed by position as well as command: a hand-written or imported choices list can
              name the same command twice, and two children under one key is a React error.
              `ChoiceControl` in widgets/common/QuickControls.tsx already does this. */}
          {choices.map((choice, i) => (
            <option key={i + '|' + choice.command} value={choice.command}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="nh-selection">
          {choices.map((choice, i) => (
            <button
              key={i + '|' + choice.command}
              type="button"
              className={'nh-selection__btn' + (state?.state === choice.command ? ' nh-selection__btn--active' : '')}
              onClick={() => {
                if (!ctx.editing && config.item) ctx.sendCommand(config.item, choice.command)
              }}>
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </WidgetFrame>
  )
}

export const selectionWidget: WidgetDefinition<SelectionConfig> = {
  type: 'selection',
  name: 'Selection',
  description: 'Buttons for a set of commands or item options',
  defaultSize: { w: 4, h: 3 },
  hasHeader: true,
  defaultConfig: () => ({ item: '', choices: '', display: 'buttons' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'display',
      type: 'select',
      label: 'Display',
      options: [
        { value: 'buttons', label: 'Buttons' },
        { value: 'dropdown', label: 'Dropdown' }
      ]
    },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 64 },
    {
      key: 'choices',
      type: 'multiline',
      label: 'Choices (one per line, COMMAND=Label)',
      placeholder: 'ON=On\nOFF=Off'
    }
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
