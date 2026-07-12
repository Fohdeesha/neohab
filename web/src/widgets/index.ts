/**
 * Registers all built-in widgets. Import this once at app startup.
 * Adding a widget: create a folder exporting a WidgetDefinition, then register it here.
 */
import { registerWidget } from './registry'
import { switchWidget } from './switch'
import { buttonWidget } from './button'
import { sliderWidget } from './slider'
import { valueWidget } from './value'
import { labelWidget } from './label'
import { clockWidget } from './clock'
import { imageWidget } from './image'
import { colorWidget } from './color'

let registered = false

export function registerBuiltinWidgets(): void {
  if (registered) return
  registered = true
  registerWidget(switchWidget)
  registerWidget(buttonWidget)
  registerWidget(sliderWidget)
  registerWidget(valueWidget)
  registerWidget(labelWidget)
  registerWidget(clockWidget)
  registerWidget(imageWidget)
  registerWidget(colorWidget)
}

export { getWidgetDefinition, listWidgetDefinitions, itemsForInstance } from './registry'
