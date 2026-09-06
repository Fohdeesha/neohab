type FilterFn = (value: unknown, ...args: unknown[]) => unknown

export const FILTERS: Record<string, FilterFn> = {
  lowercase: (v) => String(v ?? '').toLowerCase(),
  uppercase: (v) => String(v ?? '').toUpperCase(),
  json: (v) => JSON.stringify(v, null, 2),
  number: (v, digits) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return ''
    return typeof digits === 'number' ? n.toFixed(digits) : String(n)
  },
  limitTo: (v, n) => {
    const limit = Number(n)
    if (!Number.isFinite(limit)) return v
    if (typeof v === 'string') return limit >= 0 ? v.slice(0, limit) : v.slice(limit)
    if (Array.isArray(v)) return limit >= 0 ? v.slice(0, limit) : v.slice(limit)
    return v
  },
  sprintf: (fmt, ...args) => sprintf(String(fmt ?? ''), args)
}

function sprintf(fmt: string, args: unknown[]): string {
  let i = 0
  return fmt.replace(/%(?:%|(?:\.(\d+))?([sdif]))/g, (match, precision: string | undefined, kind: string | undefined) => {
    if (match === '%%') return '%'
    const arg = args[i++]
    switch (kind) {
      case 's':
        return String(arg ?? '')
      case 'd':
      case 'i': {
        const n = Number(arg)
        return Number.isFinite(n) ? String(Math.trunc(n)) : 'NaN'
      }
      case 'f': {
        const n = Number(arg)
        if (!Number.isFinite(n)) return 'NaN'
        return precision !== undefined ? n.toFixed(Number(precision)) : String(n)
      }
      default:
        return match
    }
  })
}

export function splitTopLevel(src: string, delimiter: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (depth === 0 && ch === delimiter) {
      // '||' is the or-operator, not two pipes
      if (delimiter === '|' && (src[i + 1] === '|' || src[i - 1] === '|')) continue
      parts.push(src.slice(start, i))
      start = i + 1
    }
  }
  parts.push(src.slice(start))
  return parts
}
