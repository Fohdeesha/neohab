import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { ColorControl } from './ColorControl'

interface ColorConfig {
  item: string
  label?: string
}

/**
 * Color widget - hue/saturation/brightness sliders with a live swatch, sending "H,S,B" commands.
 * The interactive body lives in {@link ColorControl}, shared with the floor plan's tap popup.
 */
function ColorWidget({ config, ctx }: WidgetProps<ColorConfig>) {
  return (
    <WidgetFrame label={config.label}>
      <ColorControl item={config.item} ctx={ctx} />
    </WidgetFrame>
  )
}

export const colorWidget: WidgetDefinition<ColorConfig> = {
  type: 'color',
  name: 'Color',
  description: 'Pick a color for a Color item',
  defaultSize: { w: 3, h: 5 },
  minPixelHeight: 150,
  hasHeader: true,
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Color'] },
    { key: 'label', type: 'text', label: 'Name' },
  ],
  itemKeys: (c) => [c.item],
  Component: ColorWidget,
}
