export type StateKind = 'color' | 'level' | 'onoff' | 'other' | 'none'

export function stateKind(state: string | undefined): StateKind {
  if (state === undefined || state === '' || state === 'NULL' || state === 'UNDEF') return 'none'
  const parts = state.split(',')
  if (parts.length === 3 && parts.every((p) => p.trim() !== '' && Number.isFinite(Number(p)))) return 'color'
  if (state === 'ON' || state === 'OFF') return 'onoff'
  if (Number.isFinite(Number(state)) && state.trim() !== '') return 'level'
  return 'other'
}
