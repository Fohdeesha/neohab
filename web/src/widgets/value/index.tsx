import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { displayValue } from '../common/format'

interface ValueConfig {
  item: string
  label?: string
  unit?: string
}

function ValueWidget({ config, ctx }: WidgetProps<ValueConfig>) {
  const state = ctx.getItem(config.item)
  const text = displayValue(state)
  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-value">
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
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'unit', type: 'text', label: 'Unit suffix' },
  ],
  itemKeys: (c) => [c.item],
  Component: ValueWidget,
}
