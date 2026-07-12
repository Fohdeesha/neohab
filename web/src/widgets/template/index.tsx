import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'

/**
 * Placeholder for HABPanel-style template / custom widgets. Imported configurations are
 * preserved in full (template markup, custom widget reference, instance settings) so they
 * will render once template support lands; until then this shows a friendly notice.
 */
interface TemplateConfig {
  label?: string
  template?: string
  customwidget?: string
  config?: Record<string, unknown>
}

function TemplateWidget({ config }: WidgetProps<TemplateConfig>) {
  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-template">
        <span className="nh-template__badge">template</span>
        <span className="nh-template__text">
          {config.customwidget ? `Custom widget “${config.customwidget}”` : 'Template widget'} — support
          coming soon. Its configuration has been kept.
        </span>
      </div>
    </WidgetFrame>
  )
}

export const templateWidget: WidgetDefinition<TemplateConfig> = {
  type: 'template',
  name: 'Template',
  description: 'Custom HTML widget (support in progress)',
  defaultSize: { w: 4, h: 3 },
  defaultConfig: () => ({}),
  settings: [{ key: 'label', type: 'text', label: 'Name' }],
  Component: TemplateWidget,
}
