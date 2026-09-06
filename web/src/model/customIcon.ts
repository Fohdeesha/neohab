export interface CustomIcon {
  version: number
  id: string
  name: string
  dataUri: string
  bytes: number
}

import { slugify } from './components'

export function slugifyIconId(name: string, existing: Set<string>): string {
  return slugify(name, 'icon', existing)
}
