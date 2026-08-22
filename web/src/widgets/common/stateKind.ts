/**
 * What kind of control fits an item, worked out from the state it is holding.
 *
 * One home, because more than one surface asks the question: the floor plan's tap popup and the
 * widget detail sheet both have to turn "whatever this item currently is" into a control, and a
 * second copy of the rule is how the two drift apart.
 */

export type StateKind = 'color' | 'level' | 'onoff' | 'other' | 'none'

/**
 * Decided from the STATE'S SHAPE, deliberately not from a type name: the SSE tracker's `type`
 * field is the state class ("HSB", "Percent", "OnOff"), not the item type, and an item can
 * legitimately hold different state classes over its life. The shape is the truth the popup
 * has to operate on either way.
 */
export function stateKind(state: string | undefined): StateKind {
  if (state === undefined || state === '' || state === 'NULL' || state === 'UNDEF') return 'none'
  const parts = state.split(',')
  if (parts.length === 3 && parts.every((p) => p.trim() !== '' && Number.isFinite(Number(p)))) return 'color'
  if (state === 'ON' || state === 'OFF') return 'onoff'
  if (Number.isFinite(Number(state)) && state.trim() !== '') return 'level'
  return 'other'
}
