/**
 * Registers all built-in widgets. Import this once at app startup.
 * Adding a widget: create a folder exporting a WidgetDefinition, then register it here.
 */
import { registerWidget } from './registry'
import { switchWidget } from './switch'
import { buttonWidget } from './button'
import { sliderWidget } from './slider'
import { valueWidget } from './value'
import { statWidget } from './stat'
import { compassWidget } from './compass'
import { weatherWidget } from './weather'
import { labelWidget } from './label'
import { clockWidget } from './clock'
import { imageWidget } from './image'
import { colorWidget } from './color'
import { selectionWidget } from './selection'
import { dialWidget } from './dial'
import { chartWidget } from './chart'
import { timelineWidget } from './timeline'
import { floorplanWidget } from './floorplan'
import { frameWidget } from './frame'
import { cameraWidget } from './camera'
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
  registerWidget(statWidget)
  registerWidget(compassWidget)
  registerWidget(weatherWidget)
  registerWidget(labelWidget)
  registerWidget(clockWidget)
  registerWidget(imageWidget)
  registerWidget(chartWidget)
  registerWidget(timelineWidget)
  registerWidget(floorplanWidget)
  registerWidget(cameraWidget)
  registerWidget(frameWidget)
  registerWidget(templateWidget)
}

export {
  getWidgetDefinition,
  listWidgetDefinitions,
  itemsForInstance,
  instanceCommands,
  instanceControl,
  instanceHasDetail,
  widgetDetailView,
} from './registry'
