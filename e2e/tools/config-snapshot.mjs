/**
 * Saves the entire neohab:config namespace to a JSON file, for restoring after a wipe-cycle
 * run: `node tools/config-snapshot.mjs snapshot.json`.
 *
 * Take the snapshot while nothing else is running - a snapshot taken mid-suite captures that
 * suite's temporary components and a later restore would resurrect them.
 */
import { writeFileSync } from 'node:fs'
import { AUTH, NS } from '../lib/target.mjs'

const out = process.argv[2]
if (!out) {
  console.error('usage: node tools/config-snapshot.mjs <file.json>')
  process.exit(2)
}

const res = await fetch(NS, { headers: AUTH })
if (!res.ok) {
  console.error('listing the namespace failed:', res.status)
  process.exit(1)
}
const components = await res.json()
writeFileSync(out, JSON.stringify(components, null, 2))
console.log(`snapshot: ${components.length} components -> ${out}`)
for (const c of components) console.log('  ' + c.uid)
