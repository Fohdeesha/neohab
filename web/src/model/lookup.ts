// guard the map where it is built rather than at fourteen reads, including the ones written later
export function emptyMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

// Object.assign, not spread: spread copies onto a normal object and puts the prototype back
export function mergeMap<T>(...parts: (Record<string, T> | undefined)[]): Record<string, T> {
  const out = emptyMap<T>()
  for (const part of parts) if (part) Object.assign(out, part)
  return out
}

// TABLE[key] walks the prototype chain, so `constructor` finds a function - and being a function
// it is not nullish, so no `?? fallback` catches it
export function lookup<T>(table: Record<string, T>, key: string | undefined | null): T | undefined {
  if (typeof key !== 'string') return undefined
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}
