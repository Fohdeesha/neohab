import type { SettingField } from '../widgets/types'

export interface FieldGroup {
  label: string | null
  fields: SettingField[]
}

/**
 * Splits a widget's settings into the run before the first group marker - its essentials, drawn
 * with no heading and never folded away - and one group per marker after it.
 *
 * A group whose every field is hidden by showIf disappears rather than leaving an empty heading
 * behind, and so does the leading run when a widget's very first entry is a marker.
 */
export function groupFields(fields: SettingField[]): FieldGroup[] {
  const groups: FieldGroup[] = [{ label: null, fields: [] }]
  for (const field of fields) {
    if (field.type === 'section') groups.push({ label: field.label, fields: [] })
    else groups[groups.length - 1].fields.push(field)
  }
  return groups.filter((g) => g.fields.length > 0)
}
