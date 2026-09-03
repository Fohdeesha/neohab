/**
 * A hand-written list of commands with labels, one per line: `COMMAND=Label`, or just `COMMAND`.
 *
 * The selection widget has read its choices this way since Phase 5, and the stepper cycles
 * through the same kind of list, so the parser lives here rather than in either widget.
 */
export interface Choice {
  command: string
  label: string
}

export function parseChoices(text: unknown): Choice[] {
  // Not `if (!text)`: a hand-edited or imported `choices: 42` reaches `.split` and throws during
  // render, which is a whole tile replaced by an error where an empty list would do.
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
