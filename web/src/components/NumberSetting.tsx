/**
 * A numeric field for a setting that is stored on the server, committed on blur or Enter rather
 * than on every keystroke.
 *
 * openHAB rewrites a whole namespace file on every component write, and each write also passes
 * through the version history's capture hook, so typing "300" into a field that saved per
 * keystroke was three server writes for one decision. The displayed value follows the stored
 * setting except while the field is actually being edited, and the committed value is clamped to
 * the field's own range - the min/max attributes only advise the browser.
 */
import { useState } from 'react'

export function NumberSetting({
  id,
  label,
  className,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  id: string
  label: string
  className: string
  value: number
  min: number
  max: number
  step?: number
  onCommit: (value: number) => void
}) {
  /** Null while not being edited, so the field shows whatever is stored. */
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    const raw = draft
    setDraft(null)
    // Nothing typed, an emptied field, or something that is not a number: leave the setting alone
    // and let the field snap back to it. Emptying a retention field must not read as "0".
    if (raw === null || raw.trim() === '') return
    const n = Math.round(Number(raw))
    if (!Number.isFinite(n)) return
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}
