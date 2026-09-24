// Runs the full safe-additive battery in sequence and summarizes. `node run.mjs --list` prints the two
// suite lists and touches nothing else.
import { spawn } from 'node:child_process'
import { readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXIT_SKIPPED, SAFE_SUITES, WIPE_CYCLE } from './lib/suites.mjs'
import { sweepBrowserTemp, sweepSummary } from './lib/tempclean.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// importing this file must never start a battery: its work is all below, behind this check
function isMain() {
  if (!process.argv[1]) return false
  try {
    const norm = (p) => {
      const real = realpathSync(p)
      return process.platform === 'win32' ? real.toLowerCase() : real
    }
    return norm(fileURLToPath(import.meta.url)) === norm(resolve(process.argv[1]))
  } catch {
    return false
  }
}

const SUITE_TIMEOUT_MS = Number(process.env.NEOHAB_E2E_SUITE_TIMEOUT_MIN || 30) * 60_000
// how long an asked-to-stop suite gets to finish its own cleanup before it is killed
const STOP_GRACE_MS = 150_000
const SAME_INTERRUPT_MS = 3000

function printLists() {
  console.log(`SAFE_SUITES (${SAFE_SUITES.length}) - what \`node run.mjs\` runs:`)
  for (const s of SAFE_SUITES) console.log('  ' + s)
  console.log(`\nWIPE_CYCLE (${WIPE_CYCLE.length}) - never in the battery, and refused on a production target:`)
  for (const s of WIPE_CYCLE) console.log('  ' + s)
}

function checkClassified() {
  const onDisk = readdirSync(here)
    .filter((f) => /^e2e.*\.mjs$/.test(f))
    .map((f) => f.replace(/\.mjs$/, ''))
  const unclassified = onDisk.filter((s) => !SAFE_SUITES.includes(s) && !WIPE_CYCLE.includes(s))
  const missing = [...SAFE_SUITES, ...WIPE_CYCLE].filter((s) => !onDisk.includes(s))
  if (unclassified.length > 0 || missing.length > 0) {
    if (unclassified.length > 0) {
      console.error(`run.mjs: these suites are in neither list - add them to SAFE_SUITES or WIPE_CYCLE in lib/suites.mjs:`)
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
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--list')) return printLists()
  checkClassified()

  const suites = args.length > 0 ? args.map((s) => basename(s).replace(/\.mjs$/, '')) : SAFE_SUITES
  const unknown = suites.filter((s) => !SAFE_SUITES.includes(s) && !WIPE_CYCLE.includes(s))
  if (unknown.length > 0) {
    console.error(`run.mjs: not a suite in either list: ${unknown.join(', ')} (see node run.mjs --list)`)
    process.exit(2)
  }

  // only now: this is where a missing NEOHAB_E2E_TARGET stops everything
  const { BASE, PRODUCTION, TARGET_FILE } = await import('./lib/target.mjs')
  const wipe = suites.filter((s) => WIPE_CYCLE.includes(s))
  if (PRODUCTION && wipe.length > 0) {
    console.error(`run.mjs: REFUSED - ${wipe.join(', ')} ${wipe.length === 1 ? 'is a wipe-cycle suite' : 'are wipe-cycle suites'}, and ${TARGET_FILE} is marked "production": true`)
    process.exit(2)
  }

  // a killed battery leaves one browser profile per suite it had reached, and nothing else ever
  // clears them; the next run is the only thing that can. Each suite sweeps too, this is so a
  // battery says out loud what it found.
  const startupSweep = sweepSummary(sweepBrowserTemp())
  if (startupSweep) console.log(startupSweep)

  const version = await fetch(BASE + '/rest/')
    .then((r) => r.json())
    .then((j) => j.runtimeInfo?.version ?? '?')
    .catch(() => '?')
  const bundle = await fetch(BASE + '/neohab/index.html')
    .then((r) => r.text())
    .then((t) => t.match(/assets[/]index-[A-Za-z0-9_-]+[.]js/)?.[0] ?? '(no bundle named in index.html)')
    .catch((e) => '(index.html unreadable: ' + e.message + ')')
  const banner = `target: ${BASE}${PRODUCTION ? ' (production)' : ''}  |  openHAB ${version}  |  ${bundle}`
  console.log(banner)

  let stopping = null
  let current = null

  // only a signal escalates: a second Ctrl-C is somebody meaning it, a second write error is not
  const stop = (reason, fromSignal = false) => {
    const now = Date.now()
    if (stopping) {
      if (!fromSignal || now - stopping.at < SAME_INTERRUPT_MS || !current) return
      console.error(`\nrun.mjs: ${reason} again - killing ${current.suite} without waiting for its cleanup`)
      current.child.kill('SIGKILL')
      return
    }
    stopping = { reason, at: now }
    console.error(`\nrun.mjs: ${reason} - no further suites will start${current ? `; ${current.suite} is cleaning up` : ''}`)
    if (current) current.askToStop()
  }
  process.on('SIGINT', () => stop('interrupted', true))
  process.on('SIGTERM', () => stop('terminated', true))
  // a closed pipe means nobody is reading: finish the suite that is running, cleanup and all, and stop
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', () => stop('output closed'))
  }

  const results = []
  for (const suite of suites) {
    if (stopping) break
    const file = resolve(here, suite + '.mjs')
    console.log(`\n========== ${suite} ==========`)
    const started = Date.now()
    const abortFile = join(tmpdir(), `nh-e2e-stop-${process.pid}-${suite}`)
    rmSync(abortFile, { force: true })
    const res = await new Promise((done) => {
      const child = spawn(process.execPath, [file], {
        stdio: 'inherit',
        cwd: here,
        env: { ...process.env, NEOHAB_E2E_ABORT_FILE: abortFile },
      })
      let timedOut = false
      let killTimer = null
      // the suite polls for this file, which is the one way to ask on Windows too; the kill after the
      // grace period is the backstop for a suite that is stuck rather than slow
      const askToStop = () => {
        try {
          writeFileSync(abortFile, 'stop')
        } catch {}
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS)
      }
      current = { suite, child, askToStop }
      const timer = setTimeout(() => {
        timedOut = true
        console.error(`\nrun.mjs: ${suite} has run for ${SUITE_TIMEOUT_MS / 60_000} minutes - asking it to stop`)
        askToStop()
      }, SUITE_TIMEOUT_MS)
      child.on('exit', (code, signal) => {
        clearTimeout(timer)
        if (killTimer) clearTimeout(killTimer)
        done({ code: code ?? 1, signal, timedOut })
      })
      child.on('error', (err) => {
        clearTimeout(timer)
        if (killTimer) clearTimeout(killTimer)
        console.error(`run.mjs: could not start ${suite}: ${err.message}`)
        done({ code: 1, signal: null, timedOut: false })
      })
    })
    current = null
    rmSync(abortFile, { force: true })
    results.push({ suite, ...res, secs: Math.round((Date.now() - started) / 1000) })
  }

  console.log('\n================ battery summary ================')
  let failed = 0
  let skipped = 0
  for (const r of results) {
    const verdict = r.code === 0 ? 'PASS' : r.code === EXIT_SKIPPED ? 'SKIP' : 'FAIL'
    if (verdict === 'FAIL') failed++
    if (verdict === 'SKIP') skipped++
    const why = r.timedOut ? ', timed out' : r.signal ? `, killed by ${r.signal}` : ''
    console.log(`${verdict}  ${r.suite}  (${r.secs}s${why})`)
  }
  const notRun = suites.length - results.length
  console.log(banner)
  if (stopping) console.log(`\nSTOPPED (${stopping.reason}): ${notRun} of ${suites.length} suites never started`)
  const skipNote = skipped > 0 ? `, ${skipped} skipped on this target` : ''
  console.log(
    failed === 0 && !stopping
      ? `\nALL ${results.length} SUITES PASS${skipNote}`
      : `\n${failed} of ${results.length} suites FAILED${skipNote}`
  )
  process.exitCode = failed === 0 && !stopping ? 0 : 1
}

if (isMain()) {
  await main()
} else if (process.argv[1] && basename(process.argv[1]) === 'run.mjs') {
  // started as the entry point but the paths did not compare equal: say so rather than do nothing
  console.error('run.mjs: could not confirm this file is the entry point, so nothing was run')
  process.exitCode = 2
}
