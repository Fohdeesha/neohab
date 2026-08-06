/**
 * A numeric field that can be typed into.
 *
 * The naive version — parse every keystroke, reject anything outside the range, and drive the
 * input from the stored value — cannot be typed into at all when the range starts above a single
 * digit. Typing "12" into a field whose minimum is 8 offers "1" first, which is rejected, so the
 * controlled input snaps back and the second keystroke lands somewhere unexpected. Row heights,
 * text sizes and retention counts were all unreachable that way, by every value whose first digit
 * was too small; only the spinner arrows worked. (Automated tests never saw it: they set the whole
 * value in one event, which is exactly the case that always worked.)
 *
 * So what is typed is held as text and only turned into a number when it is one. Two commit modes:
 *
 *   - `blur` (default) writes on blur or Enter, for a setting stored on the server. openHAB
 *     rewrites a whole namespace file per component write, and each write also takes a restore
 *     point, so typing "300" must not be three saves.
 *   - `live` writes as soon as the text parses inside the range, for a field editing the local
 *     draft, where a live preview costs nothing and is the point.
 *
 * Either way the value is clamped when the field is left: the min/max attributes only advise the
 * browser, and an out-of-range value that reaches storage is one every reader then has to guard.
 */
import { useState, type ReactNode } from 'react'

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
}: {
  id: string
  /** Plain text, or the caller's own markup where the surrounding form expects it. */
  label: ReactNode
  className: string
  value: number
  min: number
  max: number
  step?: number
  hint?: ReactNode
  mode?: 'blur' | 'live'
  onCommit: (value: number) => void
}) {
  /** Null while not being edited, so the field shows whatever is stored. */
  const [draft, setDraft] = useState<string | null>(null)

  const parse = (raw: string): number | null => {
    if (raw.trim() === '') return null
    const n = Math.round(Number(raw))
    return Number.isFinite(n) ? n : null
  }

  const onChange = (raw: string) => {
    setDraft(raw)
    if (mode !== 'live') return
    // Live mode previews as soon as the text is a number IN range. A half-typed "1" on its way to
    // "12" is left alone rather than clamped up to the minimum, which would fight the typing.
    const n = parse(raw)
    if (n !== null && n >= min && n <= max && n !== value) onCommit(n)
  }

  const commit = () => {
    const raw = draft
    setDraft(null)
    // Nothing typed, an emptied field, or something that is not a number: leave the setting alone
    // and let the field snap back to it. Emptying a retention field must not read as "0".
    if (raw === null) return
    const n = parse(raw)
    if (n === null) return
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
