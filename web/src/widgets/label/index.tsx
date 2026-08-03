import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'

interface LabelConfig {
  text: string
  fontSize?: number
  color?: string
  /**
   * How the text is set on the tile: as plain text, or as a chip that hugs it - a rounded
   * pill or a square box. A chip is what a callout ("809 Drop Offs") looks like, and it wants
   * its own fill rather than the tile's.
   */
  shape?: 'plain' | 'pill' | 'box'
  /** Chip fill; empty follows the theme accent. */
  fill?: string
  /** Where the text sits in its tile. Centered by default, as a caption normally is. */
  align?: 'left' | 'center' | 'right'
}

function LabelWidget({ config }: WidgetProps<LabelConfig>) {
  const chip = config.shape === 'pill' || config.shape === 'box'
  const align = config.align === 'left' || config.align === 'right' ? config.align : undefined
  return (
    <WidgetFrame bare center>
      <span
        className={
          'nh-label' +
          (chip ? ' nh-label--chip nh-label--' + config.shape : '') +
          (align ? ' nh-label--' + align : '')
        }
        style={{
          // Authored against a desktop-width dashboard, like iconSize: scale it with the cell
          // so a label tracks the rest of the widget text instead of staying fixed.
          fontSize: config.fontSize
            ? `calc(${config.fontSize}px * var(--nh-textscale, 1) * var(--nh-devicescale, 1) * var(--nh-widgetscale, 1))`
            : undefined,
          color: config.color,
          background: chip ? config.fill : undefined,
        }}
      >
        {config.text}
      </span>
    </WidgetFrame>
  )
}

const isChip = (c: Record<string, unknown>) => c.shape === 'pill' || c.shape === 'box'

export const labelWidget: WidgetDefinition<LabelConfig> = {
  type: 'label',
  name: 'Label',
  description: 'Static text',
  defaultSize: { w: 3, h: 2 },
  defaultConfig: () => ({ text: 'Label', fontSize: 20, shape: 'plain', align: 'center' }),
  settings: [
    { key: 'text', type: 'text', label: 'Text' },
    { key: 'fontSize', type: 'number', label: 'Font size', min: 8, max: 96 },
    { key: 'color', type: 'color', label: 'Color' },
    {
      key: 'align',
      type: 'select',
      label: 'Alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
      ],
    },
    {
      key: 'shape',
      type: 'select',
      label: 'Shape',
      options: [
        { value: 'plain', label: 'Plain text' },
        { value: 'pill', label: 'Pill' },
        { value: 'box', label: 'Box' },
      ],
      hint: 'A pill or box makes the text a filled chip that hugs it, for callouts and badges.',
    },
    { key: 'fill', type: 'color', label: 'Chip fill', showIf: isChip },
  ],
  Component: LabelWidget,
}
