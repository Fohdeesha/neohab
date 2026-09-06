/**
 * openHAB's semantic model, as much of it as a dashboard generator needs.
 *
 * Items carry semantic tags as plain strings - either a tag's short name (`Kitchen`) or its
 * fully qualified id (`Location_Indoor_Room_Kitchen`), both of which openHAB accepts. The tag's
 * root segment says what it means: a Location, a piece of Equipment, a Point (a controllable or
 * readable value) or a Property (what that value is about).
 *
 * The hierarchy is read from the server so user-defined tags classify correctly; the bundled
 * default hierarchy is the fallback for servers with no `/rest/tags` endpoint.
 */
import type { SemanticTag } from '../api/tags'
import type { Item } from '../api/types'

export type TagRoot = 'Location' | 'Equipment' | 'Point' | 'Property'

export interface TagInfo {
  /** Short name, e.g. `Kitchen`. */
  name: string
  root: TagRoot
  /** Display label, e.g. `Living Room`. */
  label: string
}

/** Tag lookup by short name and by fully qualified uid. */
export type TagIndex = Map<string, TagInfo>

/**
 * openHAB's default semantic tags. Only used when the server has no `/rest/tags` endpoint,
 * where it does, its answer is authoritative and includes user-defined tags as well.
 */
const DEFAULT_TAG_UIDS = [
  'Equipment',
  'Equipment_AlarmSystem',
  'Equipment_Battery',
  'Equipment_Blinds',
  'Equipment_Boiler',
  'Equipment_Camera',
  'Equipment_Car',
  'Equipment_CleaningRobot',
  'Equipment_Door',
  'Equipment_Door_BackDoor',
  'Equipment_Door_CellarDoor',
  'Equipment_Door_FrontDoor',
  'Equipment_Door_GarageDoor',
  'Equipment_Door_Gate',
  'Equipment_Door_InnerDoor',
  'Equipment_Door_SideDoor',
  'Equipment_Doorbell',
  'Equipment_Fan',
  'Equipment_Fan_CeilingFan',
  'Equipment_Fan_KitchenHood',
  'Equipment_HVAC',
  'Equipment_Inverter',
  'Equipment_LawnMower',
  'Equipment_Lightbulb',
  'Equipment_Lightbulb_LightStripe',
  'Equipment_Lock',
  'Equipment_NetworkAppliance',
  'Equipment_PowerOutlet',
  'Equipment_Projector',
  'Equipment_Pump',
  'Equipment_RadiatorControl',
  'Equipment_Receiver',
  'Equipment_RemoteControl',
  'Equipment_Screen',
  'Equipment_Screen_Television',
  'Equipment_Sensor',
  'Equipment_Sensor_MotionDetector',
  'Equipment_Sensor_SmokeDetector',
  'Equipment_Siren',
  'Equipment_Smartphone',
  'Equipment_Speaker',
  'Equipment_Valve',
  'Equipment_VoiceAssistant',
  'Equipment_WallSwitch',
  'Equipment_WebService',
  'Equipment_WebService_WeatherService',
  'Equipment_WhiteGood',
  'Equipment_WhiteGood_Dishwasher',
  'Equipment_WhiteGood_Dryer',
  'Equipment_WhiteGood_Freezer',
  'Equipment_WhiteGood_Oven',
  'Equipment_WhiteGood_Refrigerator',
  'Equipment_WhiteGood_WashingMachine',
  'Equipment_Window',
  'Location',
  'Location_Indoor',
  'Location_Indoor_Apartment',
  'Location_Indoor_Building',
  'Location_Indoor_Building_Garage',
  'Location_Indoor_Building_House',
  'Location_Indoor_Building_Shed',
  'Location_Indoor_Building_SummerHouse',
  'Location_Indoor_Corridor',
  'Location_Indoor_Floor',
  'Location_Indoor_Floor_Attic',
  'Location_Indoor_Floor_Basement',
  'Location_Indoor_Floor_FirstFloor',
  'Location_Indoor_Floor_GroundFloor',
  'Location_Indoor_Floor_SecondFloor',
  'Location_Indoor_Floor_ThirdFloor',
  'Location_Indoor_Room',
  'Location_Indoor_Room_Bathroom',
  'Location_Indoor_Room_Bedroom',
  'Location_Indoor_Room_BoilerRoom',
  'Location_Indoor_Room_Cellar',
  'Location_Indoor_Room_DiningRoom',
  'Location_Indoor_Room_Entry',
  'Location_Indoor_Room_FamilyRoom',
  'Location_Indoor_Room_GuestRoom',
  'Location_Indoor_Room_Kitchen',
  'Location_Indoor_Room_LaundryRoom',
  'Location_Indoor_Room_LivingRoom',
  'Location_Indoor_Room_Office',
  'Location_Indoor_Room_Veranda',
  'Location_Outdoor',
  'Location_Outdoor_Carport',
  'Location_Outdoor_Driveway',
  'Location_Outdoor_Garden',
  'Location_Outdoor_Patio',
  'Location_Outdoor_Porch',
  'Location_Outdoor_Terrace',
  'Point',
  'Point_Alarm',
  'Point_Control',
  'Point_Control_Switch',
  'Point_Measurement',
  'Point_Setpoint',
  'Point_Status',
  'Point_Status_LowBattery',
  'Point_Status_OpenLevel',
  'Point_Status_OpenState',
  'Point_Status_Tampered',
  'Point_Status_Tilt',
  'Property',
  'Property_CO',
  'Property_CO2',
  'Property_ColorTemperature',
  'Property_Current',
  'Property_Duration',
  'Property_Energy',
  'Property_Frequency',
  'Property_Gas',
  'Property_Humidity',
  'Property_Level',
  'Property_Light',
  'Property_Noise',
  'Property_Oil',
  'Property_Opening',
  'Property_Power',
  'Property_Presence',
  'Property_Pressure',
  'Property_Rain',
  'Property_Smoke',
  'Property_SoundVolume',
  'Property_Temperature',
  'Property_Timestamp',
  'Property_Ultraviolet',
  'Property_Vibration',
  'Property_Voltage',
  'Property_Water',
  'Property_Wind'
]

const ROOTS: TagRoot[] = ['Location', 'Equipment', 'Point', 'Property']

/** `LivingRoom` -> `Living Room`, so a tag reads as a title when the server gives no label. */
export function labelFromTagName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

/**
 * Build the lookup used to classify an item's tags. Pass the server's tag list when it has one;
 * without it the bundled defaults are used, which covers every stock tag but no custom ones.
 */
export function buildTagIndex(tags?: SemanticTag[]): TagIndex {
  const index: TagIndex = new Map()
  const add = (uid: string, name: string, label?: string) => {
    const root = uid.split('_')[0] as TagRoot
    if (!ROOTS.includes(root)) return
    const info: TagInfo = { name, root, label: label?.trim() || labelFromTagName(name) }
    index.set(uid, info)
    // Short names are unique across the default hierarchy; a custom tag that reuses one keeps
    // the first definition rather than silently redefining a stock tag.
    if (!index.has(name)) index.set(name, info)
  }
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (typeof tag?.uid === 'string') add(tag.uid, tag.name || tag.uid.split('_').pop() || tag.uid, tag.label)
    }
  } else {
    for (const uid of DEFAULT_TAG_UIDS) add(uid, uid.split('_').pop() as string)
  }
  return index
}

/** What the semantic model says an item is. */
export interface Semantics {
  /** Location / Equipment / Point, mirroring core's `SemanticTags.getSemanticType`. */
  kind: 'location' | 'equipment' | 'point' | null
  /** The Location or Equipment tag, when the item is one. */
  tag?: TagInfo
  /** The Point tag (Measurement, Control, Setpoint, Status...), when the item is a point. */
  point?: TagInfo
  /** The Property tag (Temperature, Light, Power...), when the item carries one. */
  property?: TagInfo
}

/**
 * Classify one item.
 *
 * Mirrors openHAB's own rule: the first non-Property tag decides what the item is, and an item
 * carrying only a Property tag is still a point - a measurement when its state is read-only,
 * a control otherwise.
 */
export function classify(item: Item, index: TagIndex): Semantics {
  let property: TagInfo | undefined
  let point: TagInfo | undefined
  let structural: TagInfo | undefined
  for (const raw of item.tags ?? []) {
    const info = index.get(raw)
    if (!info) continue
    if (info.root === 'Property') property ??= info
    else if (info.root === 'Point') point ??= info
    else structural ??= info
  }
  if (structural) {
    return {
      kind: structural.root === 'Location' ? 'location' : 'equipment',
      tag: structural,
      point,
      property
    }
  }
  if (point) return { kind: 'point', point, property }
  if (property) {
    const readOnly = item.stateDescription?.readOnly === true
    return {
      kind: 'point',
      point: { name: readOnly ? 'Measurement' : 'Control', root: 'Point', label: readOnly ? 'Measurement' : 'Control' },
      property
    }
  }
  return { kind: null }
}

/** True when this server's items carry any semantic tags at all. */
export function hasSemanticModel(items: Item[], index: TagIndex): boolean {
  return items.some((item) => {
    const kind = classify(item, index).kind
    return kind === 'location' || kind === 'equipment'
  })
}
