import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'

interface LabelConfig {
  text: string
  fontSize?: number
  color?: string
}

function LabelWidget({ config }: WidgetProps<LabelConfig>) {
  return (
    <WidgetFrame bare center>
      <span
        className="nh-label"
        style={{
          // Authored against a desktop-width dashboard, like iconSize: scale it with the cell
          // so a label tracks the rest of the widget text instead of staying fixed.
          fontSize: config.fontSize
            ? `calc(${config.fontSize}px * var(--nh-textscale, 1) * var(--nh-devicescale, 1) * var(--nh-widgetscale, 1))`
            : undefined,
          color: config.color,
        }}
      >
        {config.text}
      </span>
    </WidgetFrame>
  )
}

export const labelWidget: WidgetDefinition<LabelConfig> = {
  type: 'label',
  name: 'Label',
  description: 'Static text',
  defaultSize: { w: 3, h: 2 },
  defaultConfig: () => ({ text: 'Label', fontSize: 20 }),
  settings: [
    { key: 'text', type: 'text', label: 'Text' },
    { key: 'fontSize', type: 'number', label: 'Font size', min: 8, max: 96 },
    { key: 'color', type: 'color', label: 'Color' },
  ],
  Component: LabelWidget,
}
