/** A user-uploaded icon, stored whole (as a data URI) in one `icon:<id>` component. */
export interface CustomIcon {
  version: number
  id: string
  /** Display name shown in the picker and the Settings manager. */
  name: string
  /** Complete data URI (e.g. data:image/png;base64,...). */
  dataUri: string
  /** Encoded size in bytes - the approximate storage cost in the openHAB config store. */
  bytes: number
}

import { slugify } from './components'

/** URL-safe icon id derived from a file name, de-duped against existing ids. */
export function slugifyIconId(name: string, existing: Set<string>): string {
  return slugify(name, 'icon', existing)
}
