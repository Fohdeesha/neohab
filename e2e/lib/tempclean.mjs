/**
 * Clears the browser temp directories an earlier run left behind.
 *
 * Playwright removes its own user-data-dir on `browser.close()`, so a leftover means a run that
 * never got there. Measured on Windows: a close leaves nothing, an uncaught exception with no
 * close leaves the whole profile (~170 files), and a battery is ~63 launches. That is how %TEMP%
 * reached six figures and Jon's logon 145 seconds - Windows walks the whole of it at every
 * sign-in.
 *
 * It runs at STARTUP, not teardown, because a killed run never reaches teardown. The next run is
 * the thing that can still clear what the last one left.
 *
 * A run in another window has to survive the sweep, and a plain delete does not manage that:
 * `rmSync` on a live profile is refused with EPERM only AFTER it has deleted the files that were
 * not locked (measured: 2 of 130 on a live Chrome). A rename is atomic and refused outright on a
 * directory anything holds open, so that is the probe - rename first, delete only what moved.
 */
import { readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// what one launch can leave: playwright's user-data-dir and artifact scratch, the skeleton
// profile the browser writes for itself beside it, and a half-finished sweep of our own
const OURS = [
  /^playwright_[a-z]+dev_profile-/,
  /^playwright-artifacts-/,
  /^Headless(Chrome|Edge)\d+$/,
  /\.nh-sweep$/,
]

// chrome's own scratch. It is not only ours - Jon browses on this machine - so take one only
// when it is empty and a day old, where there is nothing to lose and nothing still using it.
const EMPTY_ONLY = /^scoped_dir\d+_\d+$/

const MIN_AGE_MS = 5 * 60 * 1000
const EMPTY_AGE_MS = 12 * 60 * 60 * 1000

function countFiles(dir) {
  let n = 0
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    if (e.isDirectory()) n += countFiles(join(dir, e.name))
    else n++
  }
  return n
}

export function sweepBrowserTemp({ dir = tmpdir(), minAgeMs = MIN_AGE_MS, emptyAgeMs = EMPTY_AGE_MS } = {}) {
  const out = { dirs: 0, files: 0, busy: 0 }
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  const now = Date.now()
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const ours = OURS.some((re) => re.test(e.name))
    const empties = !ours && EMPTY_ONLY.test(e.name)
    if (!ours && !empties) continue
    const full = join(dir, e.name)
    let age
    try {
      age = now - statSync(full).mtimeMs
    } catch {
      continue
    }
    if (age < (ours ? minAgeMs : emptyAgeMs)) continue
    if (empties && countFiles(full) > 0) continue
    const moved = full + '.nh-sweep'
    try {
      renameSync(full, moved)
    } catch {
      out.busy++
      continue
    }
    out.files += countFiles(moved)
    try {
      rmSync(moved, { recursive: true, force: true })
      out.dirs++
    } catch {
      // still there under .nh-sweep, and OURS matches that, so the next run has another go
    }
  }
  return out
}

export function sweepSummary(swept) {
  if (swept.dirs === 0) return ''
  return `e2e: cleared ${swept.dirs} stale browser temp ${swept.dirs === 1 ? 'directory' : 'directories'} (${swept.files} files) from an earlier run`
}
