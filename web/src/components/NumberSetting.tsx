/**
 * A numeric field that can be typed into.
 *
 * The naive version (parse every keystroke, reject anything outside the range, and drive the
 * input from the stored value) cannot be typed into at all when the range starts above a single
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
 *
 * A caller that has a meaningful "unset" - a widget setting that falls back to the widget's own
 * default - passes `onClear`, and may pass `''` as the value. Without it an emptied field is left
 * alone and snaps back, which is what a retention count wants: emptying it must not read as 0.
 */
import { useState, type ReactNode } from 'react'

/**
 * What a typed string means for a field with this step, or null when it is not a number yet.
 *
 * Whole numbers unless the field's own step says otherwise. Every setting that predates the
 * widget panel is an integer - a column count, a pixel height, a retention limit - and rounding
 * kept a stray "12.7" out of storage. A widget's own scale is not: a dial bound to a colour
 * temperature has a step of 0.5, and rounding would make half of its range untypeable.
 *
 * Exported so the rule can be tested. The component around it cannot be: the unit suite runs in
 * node with no DOM, which is also why an e2e check drives the typing.
 */
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
  /** Plain text, or the caller's own markup where the surrounding form expects it. */
  label: ReactNode
  className: string
  value: number | ''
  min: number
  max: number
  step?: number
  hint?: ReactNode
  mode?: 'blur' | 'live'
  onCommit: (value: number) => void
  /** Given, an emptied field clears the setting instead of snapping back to what was stored. */
  onClear?: () => void
}) {
  /** Null while not being edited, so the field shows whatever is stored. */
  const [draft, setDraft] = useState<string | null>(null)

  const parse = (raw: string): number | null => parseNumberInput(raw, step)

  const onChange = (raw: string) => {
    setDraft(raw)
    if (mode !== 'live') return
    // Emptying a live field clears it there and then, which is what live means and what the
    // field this control replaced did. Waiting for the blur made "clear it back to the widget's
    // default" look like it had done nothing.
    if (raw.trim() === '' && onClear) {
      onClear()
      return
    }
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
    if (n === null) {
      // Emptied on purpose, where the caller has an "unset" to go back to.
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
