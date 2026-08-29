import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { ColorControl } from './ColorControl'

interface ColorConfig {
  item: string
  label?: string
  powerButtons?: boolean
}

/**
 * Color widget - hue/saturation/brightness sliders with a live swatch, sending "H,S,B" commands.
 * The interactive body lives in {@link ColorControl}, shared with the floor plan's tap popup.
 */
function ColorWidget({ config, ctx }: WidgetProps<ColorConfig>) {
  return (
    <WidgetFrame label={config.label}>
      <ColorControl item={config.item} ctx={ctx} power={config.powerButtons === true} />
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
    {
      key: 'powerButtons',
      type: 'boolean',
      label: 'On and off buttons',
      hint: 'Off switches the light off and keeps its colour. On brings back the brightness it was last seen at.',
    },
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  // The same picker, even when the item is NULL and has no colour to read a shape from yet. The
  // buttons follow the widget's own setting, so the sheet a long press opens matches the tile it
  // came from - `true` only when stored as such, since anything at all can be in a stored config.
  controlFor: (c, item) => (item === c.item ? { kind: 'color', ...(c.powerButtons === true ? { power: true } : {}) } : undefined),
  Component: ColorWidget,
}
