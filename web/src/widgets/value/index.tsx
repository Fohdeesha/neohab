import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { displayValue, ghostFor, isSegmentable, segParts, splitValueUnit } from '../common/format'
import { Icon } from '../../components/Icon'
import { resolveStateIcon, type StateIconRule } from '../common/stateIcon'

interface ValueConfig {
  item: string
  label?: string
  unit?: string
  icon?: string
  iconColor?: string
  iconSize?: number
  stateIcons?: StateIconRule[]
}

function ValueWidget({ config, ctx }: WidgetProps<ValueConfig>) {
  const state = ctx.getItem(config.item)
  const { num, unit } = splitValueUnit(displayValue(state))
  const suffix = config.unit || unit
  const { icon, color } = resolveStateIcon(config, false, state?.state)
  const { int, frac } = segParts(num)
  const seg = isSegmentable(num)
  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-value">
        {icon ? <Icon icon={icon} size={config.iconSize ?? 32} state={state?.state} color={color} className="nh-value__icon" /> : null}
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
  defaultSize: { w: 2, h: 2 },
  hasHeader: true,
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'unit', type: 'text', label: 'Unit suffix' },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    { key: 'stateIcons', type: 'stateicons', label: 'Per-state icons' }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => false,
  Component: ValueWidget
}
