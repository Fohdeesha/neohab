/**
 * Runs the full safe-additive battery in sequence and summarizes.
 *
 * Deliberately does NOT include the wipe-cycle suites (e2e, e2e-editor, e2e-widgets,
 * e2e-settings, e2e-importer) - those need the snapshot/wipe/restore dance described in
 * README.md and each aborts on its own if the namespace is not empty.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const SAFE_SUITES = [
  'e2e-corners',
  'e2e-editfix',
  'e2e-copypaste',
  'e2e-lassoarea',
  'e2e-dashmgmt',
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
  'e2e-cmdfail',
  'e2e-charts',
  'e2e-chartagg',
  'e2e-camera',
  'e2e-resizefix',
  'e2e-responsive',
  'e2e-portrait',
  'e2e-textscale',
  'e2e-textsize',
  'e2e-labelalign',
  'e2e-themecss',
  'e2e-kiosk',
  'e2e-audit2',
  'e2e-audit3',
  'e2e-voiceaudio',
  'e2e-timeclock',
  'e2e-stateicons',
  'e2e-signin',
  'e2e-multitab',
]

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
console.log(failed === 0 ? `\nALL ${results.length} SUITES PASS` : `\n${failed} of ${results.length} suites FAILED`)
process.exitCode = failed === 0 ? 0 : 1
