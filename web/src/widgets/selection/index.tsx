import { useEffect } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { ensureCatalog, useCatalogStore } from '../../store/catalog'

interface SelectionConfig {
  item: string
  label?: string
  /** Manual choices, one per line: `COMMAND=Label` or just `COMMAND`. */
  choices?: string
  /** Header icon, any Icon source ("mdi:", "fluent:", "custom:", "oh:", …). */
  icon?: string
  iconSize?: number
  /** Explicit tint for monochrome (mdi) header icons. */
  iconColor?: string
}

interface Choice {
  command: string
  label: string
}

function parseChoices(text: string | undefined): Choice[] {
  if (!text) return []
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const eq = line.indexOf('=')
      if (eq === -1) return { command: line, label: line }
      return { command: line.slice(0, eq).trim(), label: line.slice(eq + 1).trim() }
    })
}

/**
 * Selection - a grid of command buttons. Choices come from the manual list when given,
 * otherwise from the item's command options (as defined by its channel/state description).
 */
function SelectionWidget({ config, ctx }: WidgetProps<SelectionConfig>) {
  const manual = parseChoices(config.choices)
  const catalogItem = useCatalogStore((s) => s.items.find((i) => i.name === config.item))

  // The live state stream doesn't carry command metadata; fetch the catalog only when needed.
  useEffect(() => {
    if (manual.length === 0 && config.item) ensureCatalog()
  }, [manual.length, config.item])

  const choices: Choice[] =
    manual.length > 0
      ? manual
      : (catalogItem?.commandDescription?.commandOptions ?? []).map((o) => ({
          command: o.command,
          label: o.label ?? o.command,
        }))

  const state = ctx.getItem(config.item)

  return (
    <WidgetFrame
      label={config.label}
      icon={config.icon}
      iconSize={config.iconSize}
      iconState={state?.state}
      iconColor={config.iconColor}
    >
      {choices.length === 0 ? (
        <div className="nh-selection__empty">No choices — set them in the widget settings</div>
      ) : (
        <div className="nh-selection">
          {choices.map((choice) => (
            <button
              key={choice.command}
              type="button"
              className={
                'nh-selection__btn' + (state?.state === choice.command ? ' nh-selection__btn--active' : '')
              }
              onClick={() => {
                if (!ctx.editing && config.item) ctx.sendCommand(config.item, choice.command)
              }}
            >
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
  defaultConfig: () => ({ item: '', choices: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size (px)', min: 16, max: 64 },
    {
      key: 'choices',
      type: 'multiline',
      label: 'Choices (one per line, COMMAND=Label)',
      placeholder: 'ON=On\nOFF=Off',
    },
  ],
  itemKeys: (c) => [c.item],
  Component: SelectionWidget,
}
