import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { displayValue, ghostFor, isSegmentable, segParts, splitValueUnit } from '../common/format'
import { Icon } from '../../components/Icon'
import { resolveStateIcon, type StateIconRule } from '../common/stateIcon'

interface ValueConfig {
  item: string
  label?: string
  unit?: string
  /** Icon beside the readout (the HABPanel dummy-widget look). State-aware like everywhere. */
  icon?: string
  iconColor?: string
  iconSize?: number
  stateIcons?: StateIconRule[]
}

function ValueWidget({ config, ctx }: WidgetProps<ValueConfig>) {
  const state = ctx.getItem(config.item)
  // A server-formatted "11.5 °F" splits so the number and unit typeset separately; an
  // explicit Unit suffix setting replaces the parsed one rather than doubling it.
  const { num, unit } = splitValueUnit(displayValue(state))
  const suffix = config.unit || unit
  // no "active" notion here - the base slot and the per-state rules are the whole story
  const { icon, color } = resolveStateIcon(config, false, state?.state)
  // Segment-display metadata, inert until a theme styles it: a lone tenths digit splits into
  // its own span, and digit-only values carry ghost text ("888.8") that the LCD theme draws
  // as unlit segments behind the reading. No other theme renders any of it.
  const { int, frac } = segParts(num)
  const seg = isSegmentable(num)
  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-value">
        {icon ? (
          <Icon icon={icon} size={config.iconSize ?? 32} state={state?.state} color={color} className="nh-value__icon" />
        ) : null}
        <span className="nh-value__text" data-ghost={seg ? ghostFor(int) : undefined}>
          {int}
          {frac !== undefined ? (
            <span className="nh-value__frac" data-ghost={seg ? ghostFor(frac) : undefined}>
              {frac}
            </span>
          ) : null}
        </span>
        {suffix ? <span className="nh-value__unit">{suffix}</span> : null}
      </div>
    </WidgetFrame>
  )
}

export const valueWidget: WidgetDefinition<ValueConfig> = {
  type: 'value',
  name: 'Value',
  description: 'Display an item value as text',
  defaultSize: { w: 3, h: 2 },
  hasHeader: true,
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'unit', type: 'text', label: 'Unit suffix' },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    { key: 'stateIcons', type: 'stateicons', label: 'Per-state icons' },
  ],
  itemKeys: (c) => [c.item],
  Component: ValueWidget,
}
