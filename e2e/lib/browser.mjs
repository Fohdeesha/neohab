/**
 * One place the suites get a browser from.
 *
 * Every suite launched its own with a literal option object, in about ten slightly different
 * shapes, which was fine while there was nothing to say to all of them at once. Testing against an
 * HTTPS target is exactly that: the certificate has to be accepted at launch, and a rule applied
 * in sixty-two places by hand is wrong in some of them.
 *
 * A drop-in for `chromium.launch`: same argument, same promise, with the target's own launch
 * arguments merged in. A suite that passes `args` of its own (the kiosk suite's insecure-origin
 * flag) keeps them.
 *
 * Every context a launched browser makes keeps the app's version-history writes in the browser
 * (lib/sandbox.mjs), so an ordinary save in a suite mints no restore point on the server; the one
 * suite whose subject is the history calls realHistory() first.
 *
 * It is also where an interrupted run is handled. A Ctrl-C, a SIGTERM, the runner's abort file or
 * a closed stdout closes the browser and lets the suite carry on into its own cleanup, since that
 * is the part that takes its components and items off the server; the process only exits by itself
 * if that cleanup has not finished two minutes later, or on a second interrupt. `tempclean` clears
 * what a hard kill still manages to leave.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { keepHistoryLocal } from './sandbox.mjs'
import { LAUNCH_ARGS } from './target.mjs'
import { sweepBrowserTemp, sweepSummary } from './tempclean.mjs'

const summary = sweepSummary(sweepBrowserTemp())
if (summary) console.log(summary)

const live = new Set()

function closeLive() {
  const all = [...live]
  live.clear()
  return Promise.race([
    Promise.allSettled(all.map((b) => b.close().catch(() => {}))),
    new Promise((r) => setTimeout(r, 4000)),
  ])
}

const CLEANUP_BACKSTOP_MS = 120_000
// the console hands a Ctrl-C to the runner and the suite alike, and the runner passes it on too
const SAME_INTERRUPT_MS = 3000

let interrupted = null

function hardExit(code) {
  const done = () => process.exit(code)
  closeLive().then(done, done)
}

function interrupt(reason, code, { fromSignal = false } = {}) {
  const now = Date.now()
  if (interrupted) {
    if (!fromSignal || now - interrupted.at < SAME_INTERRUPT_MS) return
    console.error(`e2e: ${reason} again - exiting now, without waiting for cleanup`)
    return hardExit(code)
  }
  interrupted = { reason, code, at: now }
  process.exitCode = code
  console.error(`\ne2e: ${reason} - closing the browser so the suite goes straight to its cleanup (interrupt again to exit at once)`)
  void closeLive()
  setTimeout(() => {
    console.error(`e2e: cleanup had not finished ${CLEANUP_BACKSTOP_MS / 1000}s after the interrupt - exiting`)
    process.exit(code)
  }, CLEANUP_BACKSTOP_MS).unref()
}

process.on('SIGINT', () => interrupt('interrupted (SIGINT)', 130, { fromSignal: true }))
process.on('SIGTERM', () => interrupt('terminated (SIGTERM)', 143, { fromSignal: true }))

// a suite whose reporter prints ALL PASS after being cut short has not passed anything
process.on('exit', () => {
  if (interrupted && !process.exitCode) process.exitCode = interrupted.code
})

// node would print these and exit 1 by itself, which skips the suite's cleanup; the browser is
// shut instead and the suite's own finally still runs. Once interrupted, the closed browser's
// pending calls reject by the dozen, and none of that is news.
process.on('uncaughtException', (err) => {
  if (interrupted) return console.error('e2e: after the interrupt:', String(err?.message ?? err).split('\n')[0])
  console.error(err)
  interrupt('uncaught exception', 1)
})
process.on('unhandledRejection', (err) => {
  if (interrupted) return console.error('e2e: after the interrupt:', String(err?.message ?? err).split('\n')[0])
  console.error('Unhandled rejection:', err)
  interrupt('unhandled rejection', 1)
})

// `| head` closing the pipe used to kill a suite mid-seed at its next write (EPIPE); nobody is
// reading, so any failure to write is treated as an interrupt and the suite cleans up in silence
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', () => interrupt('output closed', 1))
}

// run.mjs cannot deliver a catchable signal to a child on Windows, so it asks by creating a file
const ABORT_FILE = process.env.NEOHAB_E2E_ABORT_FILE
if (ABORT_FILE) {
  setInterval(() => {
    if (!interrupted && existsSync(ABORT_FILE)) interrupt('stopped by run.mjs', 1)
  }, 1000).unref()
}

let realHistoryWanted = false

// for the suites whose subject IS the version history
export function realHistory() {
  realHistoryWanted = true
}

function prepare(browser) {
  live.add(browser)
  browser.on('disconnected', () => live.delete(browser))
  // Browser.newPage goes through newContext on the instance, so this covers both
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (opts = {}) => {
    const ctx = await newContext(opts)
    if (!realHistoryWanted) await keepHistoryLocal(ctx)
    return ctx
  }
  return browser
}

export async function launchChromium(opts = {}) {
  if (interrupted) throw new Error('e2e: not launching a browser after an interrupt')
  const args = [...(opts.args ?? []), ...LAUNCH_ARGS]
  return prepare(await chromium.launch(args.length ? { ...opts, args } : opts))
}

// Chrome first: Playwright gives each launch a fresh user-data-dir, and Edge derives a new
// AppUserModelID from it and writes a jump list under %APPDATA%\...\Recent\CustomDestinations - one
// permanent file per suite, per run, for ever. Chrome writes none. Measured on Windows over a full
// 63-suite battery: 155 files before, 155 after.
const CHANNELS = ['chrome', 'msedge']

export async function launchBrowser(opts = {}) {
  for (const channel of CHANNELS) {
    try {
      return await launchChromium({ headless: true, ...opts, channel })
    } catch (err) {
      if (interrupted) throw err
    }
  }
  return launchChromium({ headless: true, ...opts })
}
