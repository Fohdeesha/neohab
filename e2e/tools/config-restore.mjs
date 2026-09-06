import { readFileSync } from 'node:fs'
import { ALL_NS, AUTH } from '../lib/target.mjs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node tools/config-restore.mjs <file.json>')
  process.exit(2)
}
const raw = JSON.parse(readFileSync(file, 'utf8'))
const snapshot = Array.isArray(raw) ? { config: raw } : raw

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

let failed = 0
let mismatches = 0
let extras = 0
let written = 0
let expected = 0

for (const [kind, url] of ALL_NS) {
  const want = snapshot[kind] ?? []
  expected += want.length
  const existingSet = new Set((await (await fetch(url, { headers: AUTH })).json()).map((c) => c.uid))

  for (const c of want) {
    const { timestamp, ...body } = c
    const exists = existingSet.has(c.uid)
    const res = await fetch(exists ? url + '/' + encodeURIComponent(c.uid) : url, {
      method: exists ? 'PUT' : 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) written++
    else {
      console.error(kind, exists ? 'PUT' : 'POST', 'failed for', c.uid, res.status)
      failed++
    }
  }

  const live = await (await fetch(url, { headers: AUTH })).json()
  const liveByUid = new Map(live.map((c) => [c.uid, c]))
  for (const c of want) {
    const found = liveByUid.get(c.uid)
    if (!(found && JSON.stringify(normalize(found)) === JSON.stringify(normalize(c)))) {
      console.error(`MISMATCH after restore (${kind}):`, c.uid)
      mismatches++
    }
  }
  for (const c of live) {
    if (!want.some((s) => s.uid === c.uid)) {
      console.error(`EXTRA ${kind} component not in snapshot:`, c.uid)
      extras++
    }
  }
}

console.log(
  `restore: ${written}/${expected} written, ${expected - mismatches}/${expected} verified identical, ${extras} extras`
)
process.exitCode = failed === 0 && mismatches === 0 && extras === 0 ? 0 : 1
