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
import { selectionWidget } from './selection'
import { dialWidget } from './dial'
import { chartWidget } from './chart'
import { frameWidget } from './frame'
import { rollershutterWidget } from './rollershutter'
import { playerWidget } from './player'
import { templateWidget } from './template'

let registered = false

export function registerBuiltinWidgets(): void {
  if (registered) return
  registered = true
  registerWidget(switchWidget)
  registerWidget(buttonWidget)
  registerWidget(sliderWidget)
  registerWidget(dialWidget)
  registerWidget(colorWidget)
  registerWidget(selectionWidget)
  registerWidget(rollershutterWidget)
  registerWidget(playerWidget)
  registerWidget(valueWidget)
  registerWidget(labelWidget)
  registerWidget(clockWidget)
  registerWidget(imageWidget)
  registerWidget(chartWidget)
  registerWidget(frameWidget)
  registerWidget(templateWidget)
}

export { getWidgetDefinition, listWidgetDefinitions, itemsForInstance } from './registry'
