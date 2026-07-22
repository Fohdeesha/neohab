/**
 * Restores a namespace snapshot taken with config-snapshot.mjs and verifies the result
 * content-matches it: `node tools/config-restore.mjs snapshot.json`.
 *
 * Numbers are normalized before comparing (the server's JSON round-trip echoes 1 as 1.0)
 * and the server-managed timestamp is ignored.
 */
import { readFileSync } from 'node:fs'
import { AUTH, NS } from '../lib/target.mjs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node tools/config-restore.mjs <file.json>')
  process.exit(2)
}
const snapshot = JSON.parse(readFileSync(file, 'utf8'))

const existing = (await (await fetch(NS, { headers: AUTH })).json()).map((c) => c.uid)
const existingSet = new Set(existing)

let failed = 0
for (const c of snapshot) {
  const { timestamp, ...body } = c
  const url = existingSet.has(c.uid) ? NS + '/' + encodeURIComponent(c.uid) : NS
  const method = existingSet.has(c.uid) ? 'PUT' : 'POST'
  const res = await fetch(url, {
    method,
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(method, 'failed for', c.uid, res.status)
    failed++
  }
}

// verify: every snapshot component exists with identical content (timestamp excluded,
// numbers normalized so 1 == 1.0)
const normalize = (v) => {
  if (Array.isArray(v)) return v.map(normalize)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) {
      if (k === 'timestamp') continue
      out[k] = normalize(v[k])
    }
    return out
  }
  if (typeof v === 'number') return Number(v)
  return v
}
const live = await (await fetch(NS, { headers: AUTH })).json()
const liveByUid = new Map(live.map((c) => [c.uid, c]))
let mismatches = 0
for (const c of snapshot) {
  const found = liveByUid.get(c.uid)
  const same = found && JSON.stringify(normalize(found)) === JSON.stringify(normalize(c))
  if (!same) {
    console.error('MISMATCH after restore:', c.uid)
    mismatches++
  }
}
const extras = live.filter((c) => !snapshot.some((s) => s.uid === c.uid))
for (const c of extras) console.error('EXTRA component not in snapshot:', c.uid)

console.log(
  `restore: ${snapshot.length - failed}/${snapshot.length} written, ` +
    `${snapshot.length - mismatches}/${snapshot.length} verified identical, ${extras.length} extras`
)
process.exitCode = failed === 0 && mismatches === 0 && extras.length === 0 ? 0 : 1
