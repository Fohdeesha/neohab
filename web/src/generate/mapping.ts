/**
 * Choosing a widget for an item.
 *
 * Everything here is pure and free of React, so the generator's decisions can be exercised
 * directly. The item's type decides the shape of the control; the semantic model, where there
 * is one, refines it — a Switch tagged as a Status point is an indicator, not a control — and
 * supplies an icon.
 */
import type { Item } from '../api/types'
import type { Semantics } from './semantics'

/**
 * Why the obvious widget was not used. Surfaced in the preview so a fallback is never silent;
 * the wording lives in the UI, keeping this module free of copy.
 */
export type SuggestNote = 'readonly' | 'norange'

export interface Suggestion {
  type: string
  config: Record<string, unknown>
  note?: SuggestNote
}

/**
 * Grid sizes for generated widgets, in cells of a 12-column dashboard with square cells.
 *
 * Deliberately more compact than the palette's `defaultSize`: those are tuned for placing one
 * widget by hand, while a generated dashboard puts twenty on the grid at once and has to stay
 * readable without a page of scrolling. Square cells make every extra row as tall as a column is
 * wide, so anything that is really just text gets one row; only the genuinely two-dimensional
 * widgets (a dial, a colour picker, a chart) are given the height they need.
 */
export const GENERATED_SIZES: Record<string, { w: number; h: number }> = {
  switch: { w: 2, h: 2 },
  button: { w: 2, h: 2 },
  value: { w: 2, h: 1 },
  slider: { w: 3, h: 1 },
  dial: { w: 2, h: 2 },
  color: { w: 3, h: 2 },
  selection: { w: 3, h: 2 },
  rollershutter: { w: 2, h: 2 },
  player: { w: 3, h: 1 },
  chart: { w: 6, h: 3 },
  timeline: { w: 6, h: 2 },
  label: { w: 12, h: 1 },
}

export function sizeFor(type: string): { w: number; h: number } {
  return GENERATED_SIZES[type] ?? { w: 2, h: 2 }
}

/** Icons for the common semantic properties, so a generated dashboard is not a wall of text. */
const PROPERTY_ICONS: Record<string, string> = {
  Temperature: 'thermometer',
  Humidity: 'water-percent',
  Light: 'lightbulb',
  Power: 'flash',
  Energy: 'lightning-bolt',
  Voltage: 'sine-wave',
  Current: 'current-ac',
  Frequency: 'sine-wave',
  Presence: 'motion-sensor',
  CO2: 'molecule-co2',
  CO: 'molecule-co',
  Smoke: 'smoke-detector',
  Noise: 'volume-high',
  SoundVolume: 'volume-high',
  Rain: 'weather-rainy',
  Wind: 'weather-windy',
  Water: 'water',
  Gas: 'gas-cylinder',
  Oil: 'oil',
  Duration: 'timer-outline',
  Level: 'gauge',
  Opening: 'door-open',
  Timestamp: 'clock-outline',
  Ultraviolet: 'weather-sunny-alert',
  Vibration: 'vibrate',
  ColorTemperature: 'temperature-kelvin',
  Pressure: 'gauge',
}

/** Icons for equipment, used when a point carries no property of its own. */
const EQUIPMENT_ICONS: Record<string, string> = {
  AlarmSystem: 'shield-home',
  Battery: 'battery',
  Blinds: 'blinds',
  Boiler: 'water-boiler',
  Camera: 'cctv',
  Car: 'car',
  CleaningRobot: 'robot-vacuum',
  Door: 'door',
  BackDoor: 'door',
  CellarDoor: 'door',
  FrontDoor: 'door',
  InnerDoor: 'door',
  SideDoor: 'door',
  GarageDoor: 'garage',
  Gate: 'gate',
  Doorbell: 'doorbell',
  Fan: 'fan',
  CeilingFan: 'ceiling-fan',
  KitchenHood: 'stove',
  HVAC: 'air-conditioner',
  Inverter: 'solar-power',
  LawnMower: 'robot-mower',
  Lightbulb: 'lightbulb',
  LightStripe: 'led-strip',
  Lock: 'lock',
  NetworkAppliance: 'router-network',
  PowerOutlet: 'power-socket',
  Projector: 'projector',
  Pump: 'pump',
  RadiatorControl: 'radiator',
  Receiver: 'audio-video',
  RemoteControl: 'remote',
  Screen: 'monitor',
  Television: 'television',
  Sensor: 'access-point',
  MotionDetector: 'motion-sensor',
  SmokeDetector: 'smoke-detector',
  Siren: 'bullhorn',
  Smartphone: 'cellphone',
  Speaker: 'speaker',
  Valve: 'valve',
  VoiceAssistant: 'microphone',
  WallSwitch: 'light-switch',
  WebService: 'web',
  WeatherService: 'weather-partly-cloudy',
  WhiteGood: 'washing-machine',
  Dishwasher: 'dishwasher',
  Dryer: 'tumble-dryer',
  Freezer: 'snowflake',
  Oven: 'toaster-oven',
  Refrigerator: 'fridge',
  WashingMachine: 'washing-machine',
  Window: 'window-closed',
}

/** Icons for locations, used for the generated dashboard's Home tile. */
const LOCATION_ICONS: Record<string, string> = {
  Apartment: 'home-city',
  Building: 'office-building',
  Garage: 'garage',
  House: 'home',
  Shed: 'home-outline',
  SummerHouse: 'home-variant',
  Corridor: 'door-sliding',
  Floor: 'layers',
  Attic: 'home-roof',
  Basement: 'stairs-down',
  FirstFloor: 'stairs',
  GroundFloor: 'stairs',
  SecondFloor: 'stairs',
  ThirdFloor: 'stairs',
  Room: 'door',
  Bathroom: 'shower',
  Bedroom: 'bed',
  BoilerRoom: 'water-boiler',
  Cellar: 'stairs-down',
  DiningRoom: 'silverware-fork-knife',
  Entry: 'door-open',
  FamilyRoom: 'sofa',
  GuestRoom: 'bed-outline',
  Kitchen: 'countertop',
  LaundryRoom: 'washing-machine',
  LivingRoom: 'sofa',
  Office: 'desk',
  Veranda: 'flower-outline',
  Indoor: 'home',
  Outdoor: 'tree',
  Carport: 'car-side',
  Driveway: 'road',
  Garden: 'flower',
  Patio: 'table-chair',
  Porch: 'home-roof',
  Terrace: 'umbrella-beach',
}

const mdi = (name: string | undefined): string | undefined => (name ? 'mdi:' + name : undefined)

export function locationIcon(tagName: string | undefined): string | undefined {
  return mdi(tagName ? LOCATION_ICONS[tagName] : undefined)
}

export function equipmentIcon(tagName: string | undefined): string | undefined {
  return mdi(tagName ? EQUIPMENT_ICONS[tagName] : undefined)
}

/** The icon for one point: its property first, falling back to the equipment it belongs to. */
export function pointIcon(sem: Semantics, equipmentTag?: string): string | undefined {
  return mdi(sem.property ? PROPERTY_ICONS[sem.property.name] : undefined) ?? equipmentIcon(equipmentTag)
}

/** Base type of an item: `Number:Temperature` -> `Number`, a typed Group -> its member type. */
export function baseType(item: Item): string {
  const type = item.type === 'Group' ? (item.groupType ?? '') : item.type
  return type.split(':')[0]
}

/** Command/state options an item declares, as the selection widget's `CMD=Label` lines. */
function optionLines(item: Item): string | null {
  const options =
    item.commandDescription?.commandOptions?.map((o) => ({ value: o.command, label: o.label })) ??
    item.stateDescription?.options ??
    []
  if (options.length < 2) return null
  return options.map((o) => `${o.value}=${o.label ?? o.value}`).join('\n')
}

/** A numeric range the item itself declares — never invented, so a slider can't send nonsense. */
function declaredRange(item: Item): { min: number; max: number; step: number } | null {
  const sd = item.stateDescription
  if (!sd || typeof sd.minimum !== 'number' || typeof sd.maximum !== 'number') return null
  if (!(sd.maximum > sd.minimum)) return null
  return { min: sd.minimum, max: sd.maximum, step: typeof sd.step === 'number' && sd.step > 0 ? sd.step : 1 }
}

/** True when the model says this point is read-only: a measurement or a status. */
export function isReadOnlyPoint(item: Item, sem: Semantics): boolean {
  if (item.stateDescription?.readOnly === true) return true
  const point = sem.point?.name
  return point === 'Measurement' || point === 'Status' || point === 'Alarm'
}

/**
 * The widget types offered for an item in the preview, best first. Only types that can actually
 * drive the item are listed, so an override can't produce a widget that does nothing.
 */
export function widgetChoices(item: Item, suggested: string): string[] {
  const type = baseType(item)
  const byType: Record<string, string[]> = {
    Switch: ['switch', 'button', 'value', 'timeline', 'chart'],
    Dimmer: ['slider', 'dial', 'switch', 'value', 'chart'],
    Color: ['color', 'switch', 'value'],
    Number: ['value', 'slider', 'dial', 'chart', 'timeline'],
    String: ['value', 'selection', 'timeline'],
    Rollershutter: ['rollershutter', 'slider', 'value'],
    Player: ['player', 'value'],
    Contact: ['value', 'timeline'],
    DateTime: ['value'],
    Location: ['value'],
  }
  const list = byType[type] ?? ['value']
  return [suggested, ...list.filter((t) => t !== suggested)]
}

/**
 * Build the config for one widget type bound to an item. Used both for the initial suggestion
 * and when the preview's type override changes it, so an override is configured as fully as the
 * suggestion was.
 */
export function configFor(
  type: string,
  item: Item,
  opts: { label: string; icon?: string; readOnly?: boolean } = { label: '' }
): Record<string, unknown> {
  const { label, icon, readOnly } = opts
  const base: Record<string, unknown> = { label }
  switch (type) {
    case 'switch':
      return { ...base, item: item.name, ...(icon ? { icon } : {}) }
    case 'button':
      return { ...base, item: item.name, ...(icon ? { icon } : {}), command: 'ON', commandAlt: 'OFF', toggle: true }
    case 'slider':
    case 'dial': {
      // A range is only ever taken from the item; percentage types are the one safe assumption.
      const pct = { min: 0, max: 100, step: 1 }
      const bounds = declaredRange(item) ?? pct
      return {
        ...base,
        item: item.name,
        ...bounds,
        ...(type === 'dial' && readOnly ? { readOnly: true } : {}),
      }
    }
    case 'selection':
      return { ...base, item: item.name, choices: optionLines(item) ?? '', ...(icon ? { icon } : {}) }
    case 'chart':
      return { ...base, series: [{ item: item.name }], period: '24h', legend: true, picker: true, live: true }
    case 'timeline':
      return { ...base, series: [{ item: item.name }], period: '24h', picker: true }
    case 'value':
      return { ...base, item: item.name, ...(icon ? { icon } : {}) }
    default:
      // color, rollershutter, player: bound and named, but they take no icon setting.
      return { ...base, item: item.name }
  }
}

/**
 * Pick a widget for an item, or null when there is nothing sensible to show — a plain Group is a
 * container rather than a value, and an Image item's state is raw image data no widget renders.
 */
export function suggestWidget(item: Item, sem: Semantics, label: string, equipmentTag?: string): Suggestion | null {
  const type = baseType(item)
  if (item.type === 'Group' && !item.groupType) return null
  if (type === 'Image') return null

  const icon = pointIcon(sem, equipmentTag)
  const readOnly = isReadOnlyPoint(item, sem)
  const make = (widget: string, note?: SuggestNote): Suggestion => ({
    type: widget,
    config: configFor(widget, item, { label, icon, readOnly }),
    note,
  })
  const control = (widget: string): Suggestion => (readOnly ? make('value', 'readonly') : make(widget))

  switch (type) {
    case 'Switch':
      return control('switch')
    case 'Color':
      return control('color')
    case 'Dimmer':
      return control('slider')
    case 'Rollershutter':
      return control('rollershutter')
    case 'Player':
      return control('player')
    case 'String':
      return !readOnly && optionLines(item) ? make('selection') : make('value')
    case 'Number': {
      if (readOnly) return make('value')
      if (declaredRange(item)) return make('slider')
      // A settable number with no declared range: a slider would have to invent one, so show the
      // value and let the preview's type override put a slider there deliberately.
      return make('value', 'norange')
    }
    default:
      return make('value')
  }
}

/**
 * A readable widget name for an item: its label when it has one, otherwise its item name made
 * presentable — with the cluster's own prefix removed, so a "Kitchen" dashboard reads
 * "Main Lights Level" instead of repeating "kitchen" on every widget.
 */
export function prettyLabel(item: Item, stripPrefix?: string): string {
  if (item.label && item.label.trim()) return item.label.trim()
  let name = item.name
  if (stripPrefix) {
    const prefix = new RegExp('^' + stripPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[_\\-\\s]+', 'i')
    const stripped = name.replace(prefix, '')
    if (stripped) name = stripped
  }
  return titleCase(name)
}

export function titleCase(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => (/^[A-Z0-9]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}
