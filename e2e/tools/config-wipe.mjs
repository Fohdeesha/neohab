/**
 * Deletes EVERY component in the neohab:config namespace, to prepare for the wipe-cycle
 * suites. Refuses to run without --yes, and refuses a non-trivial namespace unless a
 * snapshot file is named so there is always a way back:
 *
 *   node tools/config-wipe.mjs --yes --snapshot snapshot.json
 */
import { readFileSync } from 'node:fs'
import { AUTH, NS } from '../lib/target.mjs'

const args = process.argv.slice(2)
if (!args.includes('--yes')) {
  console.error('this deletes the whole neohab:config namespace - re-run with --yes')
  process.exit(2)
}

const res = await fetch(NS, { headers: AUTH })
if (!res.ok) {
  console.error('listing the namespace failed:', res.status)
  process.exit(1)
}
const components = await res.json()
if (components.length === 0) {
  console.log('namespace already empty')
  process.exit(0)
}

const snapIdx = args.indexOf('--snapshot')
const snapFile = snapIdx >= 0 ? args[snapIdx + 1] : null
if (!snapFile) {
  console.error(`namespace holds ${components.length} components - name the snapshot you took first:`)
  console.error('  node tools/config-snapshot.mjs snapshot.json')
  console.error('  node tools/config-wipe.mjs --yes --snapshot snapshot.json')
  process.exit(2)
}
let snapshot
try {
  snapshot = JSON.parse(readFileSync(snapFile, 'utf8'))
} catch {
  console.error(`snapshot file not readable: ${snapFile}`)
  process.exit(2)
}
const snapUids = new Set(snapshot.map((c) => c.uid))
const missing = components.filter((c) => !snapUids.has(c.uid))
if (missing.length > 0) {
  console.error('REFUSING: these live components are not in the snapshot (it is stale):')
  for (const c of missing) console.error('  ' + c.uid)
  process.exit(2)
}

let failed = 0
for (const c of components) {
  const del = await fetch(NS + '/' + encodeURIComponent(c.uid), { method: 'DELETE', headers: AUTH })
  if (!del.ok) {
    console.error('DELETE failed for', c.uid, del.status)
    failed++
  }
}
const left = (await (await fetch(NS, { headers: AUTH })).json()).length
console.log(`wipe: deleted ${components.length - failed}/${components.length}, ${left} left`)
process.exitCode = failed === 0 && left === 0 ? 0 : 1
