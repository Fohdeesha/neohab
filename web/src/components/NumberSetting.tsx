// hold what is typed as text and parse it only when it is a number: validating every keystroke makes 12
// impossible to type into a field whose minimum is 8
import { useState, type ReactNode } from 'react'

// whole numbers unless the field says otherwise - a dial bound to a colour temperature steps by 0.5, and
// rounding would make half its range untypeable
export function parseNumberInput(raw: string, step?: number): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const fractional = typeof step === 'number' && Number.isFinite(step) && !Number.isInteger(step)
  return fractional ? n : Math.round(n)
}

export function NumberSetting({
  id,
  label,
  className,
  value,
  min,
  max,
  step,
  hint,
  mode = 'blur',
  onCommit,
  onClear
}: {
  id: string
  label: ReactNode
  className: string
  value: number | ''
  min: number
  max: number
  step?: number
  hint?: ReactNode
  mode?: 'blur' | 'live'
  onCommit: (value: number) => void
  onClear?: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const parse = (raw: string): number | null => parseNumberInput(raw, step)

  const onChange = (raw: string) => {
    setDraft(raw)
    if (mode !== 'live') return
    if (raw.trim() === '' && onClear) {
      onClear()
      return
    }
    const n = parse(raw)
    if (n !== null && n >= min && n <= max && n !== value) onCommit(n)
  }

  const commit = () => {
    const raw = draft
    setDraft(null)
    if (raw === null) return
    const n = parse(raw)
    if (n === null) {
      if (raw.trim() === '' && onClear) onClear()
      return
    }
    const clamped = Math.min(max, Math.max(min, n))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <label className={className} htmlFor={id}>
      {label}
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {hint}
    </label>
  )
}
