export interface Choice {
  command: string
  label: string
}

export function parseChoices(text: unknown): Choice[] {
  if (typeof text !== 'string' || text === '') return []
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const eq = line.indexOf('=')
      if (eq === -1) return { command: line, label: line }
      return { command: line.slice(0, eq).trim(), label: line.slice(eq + 1).trim() }
    })
}
