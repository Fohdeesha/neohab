import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { ColorControl } from './ColorControl'

interface ColorConfig {
  item: string
  label?: string
  powerButtons?: boolean
  liveDrag?: string
}

function ColorWidget({ config, ctx }: WidgetProps<ColorConfig>) {
  return (
    <WidgetFrame label={config.label}>
      <ColorControl item={config.item} ctx={ctx} power={config.powerButtons === true} config={config} />
    </WidgetFrame>
  )
}

export const colorWidget: WidgetDefinition<ColorConfig> = {
  type: 'color',
  name: 'Color',
  description: 'Pick a color for a Color item',
  defaultSize: { w: 3, h: 5 },
  minPixelHeight: (c) => (c.powerButtons === true ? 176 : 150),
  hasHeader: true,
  liveDrag: true,
  defaultConfig: () => ({ item: '', powerButtons: true }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Color'] },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'powerButtons',
      type: 'boolean',
      label: 'On and off buttons',
      hint: 'Off switches the light off and keeps its color. On brings back the brightness it was last seen at.'
    }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  controlFor: (c, item) => (item === c.item ? { kind: 'color', ...(c.powerButtons === true ? { power: true } : {}) } : undefined),
  Component: ColorWidget
}
