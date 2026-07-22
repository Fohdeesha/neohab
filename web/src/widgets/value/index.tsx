import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { displayValue } from '../common/format'
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
  const text = displayValue(state)
  // no "active" notion here - the base slot and the per-state rules are the whole story
  const { icon, color } = resolveStateIcon(config, false, state?.state)
  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-value">
        {icon ? (
          <Icon icon={icon} size={config.iconSize ?? 32} state={state?.state} color={color} className="nh-value__icon" />
        ) : null}
        <span className="nh-value__text">{text}</span>
        {config.unit ? <span className="nh-value__unit">{config.unit}</span> : null}
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
