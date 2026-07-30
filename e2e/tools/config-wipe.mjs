/**
 * Deletes EVERY component in every neohab namespace (`neohab:config`, and the version history in
 * `neohab:history` and `neohab:historydata`), to prepare for the wipe-cycle suites. Refuses to
 * run without --yes, and
 * refuses a non-empty namespace unless a snapshot file is named that actually covers what is
 * live, so there is always a way back:
 *
 *   node tools/config-wipe.mjs --yes --snapshot snapshot.json
 */
import { readFileSync } from 'node:fs'
import { ALL_NS, AUTH } from '../lib/target.mjs'

const args = process.argv.slice(2)
if (!args.includes('--yes')) {
  console.error('this deletes every neohab namespace - re-run with --yes')
  process.exit(2)
}

async function list(url, label) {
  const res = await fetch(url, { headers: AUTH })
  if (!res.ok) {
    console.error(`listing ${label} failed:`, res.status)
    process.exit(1)
  }
  return res.json()
}

const live = {}
let total = 0
for (const [kind, url] of ALL_NS) {
  live[kind] = await list(url, 'neohab:' + kind)
  total += live[kind].length
}
if (total === 0) {
  console.log('every namespace already empty')
  process.exit(0)
}

const snapIdx = args.indexOf('--snapshot')
const snapFile = snapIdx >= 0 ? args[snapIdx + 1] : null
if (!snapFile) {
  console.error(`namespaces hold ${total} components - name the snapshot you took first:`)
  console.error('  node tools/config-snapshot.mjs snapshot.json')
  console.error('  node tools/config-wipe.mjs --yes --snapshot snapshot.json')
  process.exit(2)
}
let raw
try {
  raw = JSON.parse(readFileSync(snapFile, 'utf8'))
} catch {
  console.error(`snapshot file not readable: ${snapFile}`)
  process.exit(2)
}
// A snapshot taken before the version history existed is a bare array of config components.
const snapshot = Array.isArray(raw) ? { config: raw } : raw

for (const [kind] of ALL_NS) {
  const known = new Set((snapshot[kind] ?? []).map((c) => c.uid))
  const missing = live[kind].filter((c) => !known.has(c.uid))
  if (missing.length > 0) {
    console.error(`REFUSING: these live ${kind} components are not in the snapshot (it is stale):`)
    for (const c of missing) console.error('  ' + c.uid)
    process.exit(2)
  }
}

let failed = 0
for (const [kind, url] of ALL_NS) {
  for (const c of live[kind]) {
    const del = await fetch(url + '/' + encodeURIComponent(c.uid), { method: 'DELETE', headers: AUTH })
    if (!del.ok) {
      console.error('DELETE failed for', kind, c.uid, del.status)
      failed++
    }
  }
}

let left = 0
for (const [kind, url] of ALL_NS) left += (await list(url, 'neohab:' + kind)).length
console.log(`wipe: deleted ${total - failed}/${total}, ${left} left`)
process.exitCode = failed === 0 && left === 0 ? 0 : 1
