import { registerWidget } from './registry'
import { buttonWidget } from './button'
import { sliderWidget } from './slider'
import { valueWidget } from './value'
import { compassWidget } from './compass'
import { batteryWidget } from './battery'
import { weatherWidget } from './weather'
import { labelWidget } from './label'
import { clockWidget } from './clock'
import { imageWidget } from './image'
import { colorWidget } from './color'
import { selectionWidget } from './selection'
import { stepperWidget } from './stepper'
import { thermostatWidget } from './thermostat'
import { dialWidget } from './dial'
import { chartWidget } from './chart'
import { timelineWidget } from './timeline'
import { floorplanWidget } from './floorplan'
import { frameWidget } from './frame'
import { cameraWidget } from './camera'
import { rollershutterWidget } from './rollershutter'
import { playerWidget } from './player'
import { templateWidget } from './template'
import { logWidget } from './log'

let registered = false

export function registerBuiltinWidgets(): void {
  if (registered) return
  registered = true
  registerWidget(buttonWidget)
  registerWidget(sliderWidget)
  registerWidget(dialWidget)
  registerWidget(colorWidget)
  registerWidget(selectionWidget)
  registerWidget(stepperWidget)
  registerWidget(thermostatWidget)
  registerWidget(rollershutterWidget)
  registerWidget(playerWidget)
  registerWidget(valueWidget)
  registerWidget(compassWidget)
  registerWidget(batteryWidget)
  registerWidget(weatherWidget)
  registerWidget(labelWidget)
  registerWidget(clockWidget)
  registerWidget(imageWidget)
  registerWidget(chartWidget)
  registerWidget(timelineWidget)
  registerWidget(floorplanWidget)
  registerWidget(cameraWidget)
  registerWidget(frameWidget)
  registerWidget(logWidget)
  registerWidget(templateWidget)
}

export {
  getWidgetDefinition,
  hasHeaderFor,
  instanceHasHeader,
  listWidgetDefinitions,
  itemsForInstance,
  instanceCommands,
  instanceControl,
  instanceDetailRoute,
  instanceHasDetail,
  instanceNeedsItem,
  widgetDetailView
} from './registry'
