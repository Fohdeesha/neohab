/**
 * Built-in demo dashboard shown when the server has no saved dashboards. It exercises all
 * built-in widgets and binds the three known test items so controls work out of the box.
 * Not persisted - replaced as soon as a real dashboard is saved.
 */
import { MODEL_VERSION, type Dashboard } from '../model/dashboard'

const SWITCH_ITEM = 'Guest_Bedroom_Lighting_Preset_1'
const SLIDER_ITEM = 'main_lights_level'
const COLOR_ITEM = 'TL21C_Colour'

export function demoDashboard(): Dashboard {
  return {
    version: MODEL_VERSION,
    id: 'demo',
    name: 'Demo',
    columns: 12,
    rowHeight: 40,
    widgets: [
      {
        id: 'w-switch',
        type: 'switch',
        config: { item: SWITCH_ITEM, label: 'Guest Bedroom' },
        layout: { lg: { x: 0, y: 0, w: 3, h: 3 } },
      },
      {
        id: 'w-button',
        type: 'button',
        config: { item: SWITCH_ITEM, label: 'Toggle', command: 'ON', commandAlt: 'OFF', toggle: true },
        layout: { lg: { x: 3, y: 0, w: 3, h: 3 } },
      },
      {
        id: 'w-slider',
        type: 'slider',
        config: { item: SLIDER_ITEM, label: 'Main Lights', min: 0, max: 100, step: 1 },
        layout: { lg: { x: 6, y: 0, w: 6, h: 3 } },
      },
      {
        id: 'w-value',
        type: 'value',
        config: { item: SLIDER_ITEM, label: 'Level' },
        layout: { lg: { x: 0, y: 3, w: 3, h: 2 } },
      },
      {
        id: 'w-label',
        type: 'label',
        config: { text: 'neohab', fontSize: 28 },
        layout: { lg: { x: 3, y: 3, w: 3, h: 2 } },
      },
      {
        id: 'w-clock',
        type: 'clock',
        config: { showDate: true },
        layout: { lg: { x: 6, y: 3, w: 3, h: 3 } },
      },
      {
        id: 'w-color',
        type: 'color',
        config: { item: COLOR_ITEM, label: 'TL21C Colour' },
        layout: { lg: { x: 9, y: 3, w: 3, h: 5 } },
      },
      {
        id: 'w-image',
        type: 'image',
        config: { url: '', label: 'Image', refresh: 0 },
        layout: { lg: { x: 0, y: 5, w: 6, h: 4 } },
      },
    ],
  }
}
