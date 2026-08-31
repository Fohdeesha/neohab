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
  // A stacked row is 150px of picker whatever the dashboard says, which leaves a 27px swatch:
  // enough for the three sliders and a colour to look at, and not enough to stand two buttons on.
  // A picker showing them asks for the height they need instead, since the alternative is taking
  // it from the sliders. Measured: at 176px the swatch is 67px and the pair is 50px of it.
  minPixelHeight: (c) => (c.powerButtons === true ? 176 : 150),
  hasHeader: true,
  // The buttons are part of the widget, not an extra: a colour picker that cannot switch the
  // light off is the odd one out. So they are on unless a config turns them off, which means a
  // picker somebody made before the setting existed gains them too - no data is rewritten, and
  // unticking the box stores the `false` that keeps them away.
  defaultConfig: () => ({ item: '', powerButtons: true }),
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
  // came from. Read against `true` rather than against `false`, so a stored value that is neither
  // - and anything at all can be in a stored config - lands on the plain picker.
  controlFor: (c, item) => (item === c.item ? { kind: 'color', ...(c.powerButtons === true ? { power: true } : {}) } : undefined),
  Component: ColorWidget,
}
