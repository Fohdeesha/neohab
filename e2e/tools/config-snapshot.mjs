import { writeFileSync } from 'node:fs'
import { ALL_NS, AUTH } from '../lib/target.mjs'

const out = process.argv[2]
if (!out) {
  console.error('usage: node tools/config-snapshot.mjs <file.json>')
  process.exit(2)
}

async function listAll(url, label) {
  const res = await fetch(url, { headers: AUTH })
  if (!res.ok) {
    console.error(`listing ${label} failed:`, res.status)
    process.exit(1)
  }
  return res.json()
}

const snapshot = {}
const counts = []
for (const [kind, url] of ALL_NS) {
  snapshot[kind] = await listAll(url, 'neohab:' + kind)
  counts.push(`${snapshot[kind].length} ${kind}`)
}

writeFileSync(out, JSON.stringify(snapshot, null, 2))
console.log(`snapshot: ${counts.join(' + ')} components -> ${out}`)
for (const [kind] of ALL_NS) {
  for (const c of snapshot[kind]) console.log(kind === 'config' ? '  ' + c.uid : `  [${kind}] ${c.uid}`)
}
