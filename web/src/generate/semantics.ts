import type { SemanticTag } from '../api/tags'
import type { Item } from '../api/types'

export type TagRoot = 'Location' | 'Equipment' | 'Point' | 'Property'

export interface TagInfo {
  name: string
  root: TagRoot
  label: string
}

export type TagIndex = Map<string, TagInfo>

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

export function labelFromTagName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

export function buildTagIndex(tags?: SemanticTag[]): TagIndex {
  const index: TagIndex = new Map()
  const add = (uid: string, name: string, label?: string) => {
    const root = uid.split('_')[0] as TagRoot
    if (!ROOTS.includes(root)) return
    const info: TagInfo = { name, root, label: label?.trim() || labelFromTagName(name) }
    index.set(uid, info)
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

export interface Semantics {
  kind: 'location' | 'equipment' | 'point' | null
  tag?: TagInfo
  point?: TagInfo
  property?: TagInfo
}

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
