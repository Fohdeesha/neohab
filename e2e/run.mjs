// Runs the full safe-additive battery in sequence and summarizes.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE } from './lib/target.mjs'

const here = dirname(fileURLToPath(import.meta.url))

const WIPE_CYCLE = ['e2e-history', 'e2e', 'e2e-editor', 'e2e-widgets', 'e2e-settings', 'e2e-importer']

const SAFE_SUITES = [
  'e2e-button',
  'e2e-corners',
  'e2e-launch',
  'e2e-https',
  'e2e-editfix',
  'e2e-copypaste',
  'e2e-lassoarea',
  'e2e-dashmgmt',
  'e2e-place',
  'e2e-breakpoints',
  'e2e-generate',
  'e2e-newfeat',
  'e2e-sidebar',
  'e2e-lock',
  'e2e-i18n',
  'e2e-backgrounds',
  'e2e-partial',
  'e2e-gallery',
  'e2e-templates',
  'e2e-icons',
  'e2e-iconpacks',
  'e2e-hue',
  'e2e-colorpower',
  'e2e-fade',
  'e2e-stepper',
  'e2e-battery',
  'e2e-slider',
  'e2e-thermostat',
  'e2e-log',
  'e2e-clocktime',
  'e2e-cmdfail',
  'e2e-charts',
  'e2e-chartagg',
  'e2e-gauge',
  'e2e-camera',
  'e2e-resizefix',
  'e2e-responsive',
  'e2e-portrait',
  'e2e-textscale',
  'e2e-textsize',
  'e2e-labelalign',
  'e2e-themecss',
  'e2e-themerules',
  'e2e-ember',
  'e2e-lcd',
  'e2e-ops',
  'e2e-weather',
  'e2e-assembly',
  'e2e-floorplan',
  'e2e-panels',
  'e2e-runfit',
  'e2e-detail',
  'e2e-kiosk',
  'e2e-audit2',
  'e2e-audit3',
  'e2e-voiceaudio',
  'e2e-timeclock',
  'e2e-stateicons',
  'e2e-signin',
  'e2e-proxyauth',
  'e2e-multitab',
]

const onDisk = readdirSync(here)
  .filter((f) => /^e2e.*\.mjs$/.test(f))
  .map((f) => f.replace(/\.mjs$/, ''))
const unclassified = onDisk.filter((s) => !SAFE_SUITES.includes(s) && !WIPE_CYCLE.includes(s))
const missing = [...SAFE_SUITES, ...WIPE_CYCLE].filter((s) => !onDisk.includes(s))
if (unclassified.length > 0 || missing.length > 0) {
  if (unclassified.length > 0) {
    console.error(`run.mjs: these suites are in neither list - add them to SAFE_SUITES or WIPE_CYCLE:`)
    for (const s of unclassified) console.error('  ' + s)
  }
  if (missing.length > 0) console.error(`run.mjs: listed but not on disk: ${missing.join(', ')}`)
  process.exit(2)
}
const overlap = SAFE_SUITES.filter((s) => WIPE_CYCLE.includes(s))
if (overlap.length > 0) {
  console.error(`run.mjs: a wipe-cycle suite must never be in the battery: ${overlap.join(', ')}`)
  process.exit(2)
}

const version = await fetch(BASE + '/rest/')
  .then((r) => r.json())
  .then((j) => j.runtimeInfo?.version ?? '?')
  .catch(() => '?')
const bundle = await fetch(BASE + '/neohab/index.html')
  .then((r) => r.text())
  .then((t) => t.match(/assets[/]index-[A-Za-z0-9_-]+[.]js/)?.[0] ?? '(no bundle named in index.html)')
  .catch((e) => '(index.html unreadable: ' + e.message + ')')
const banner = `target: ${BASE}  |  openHAB ${version}  |  ${bundle}`
console.log(banner)

const only = process.argv.slice(2)
const suites = only.length > 0 ? only.map((s) => s.replace(/\.mjs$/, '')) : SAFE_SUITES

const results = []
for (const suite of suites) {
  const file = resolve(here, suite + '.mjs')
  console.log(`\n========== ${suite} ==========`)
  const started = Date.now()
  const res = spawnSync(process.execPath, [file], { stdio: 'inherit', cwd: here })
  results.push({ suite, code: res.status ?? 1, secs: Math.round((Date.now() - started) / 1000) })
}

console.log('\n================ battery summary ================')
let failed = 0
for (const r of results) {
  if (r.code !== 0) failed++
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.suite}  (${r.secs}s)`)
}
console.log(banner)
console.log(failed === 0 ? `\nALL ${results.length} SUITES PASS` : `\n${failed} of ${results.length} suites FAILED`)
process.exitCode = failed === 0 ? 0 : 1
